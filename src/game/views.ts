import { modeForSize, type Mode } from "@/config";
import type { GameCtx } from "./context";
import { maskClue } from "./mask";
import { hasGuessLeft, metaWords, type MetaWordState } from "./meta";
import { metaPoints } from "./score";
import { boardReceived } from "./ring";
import {
  allCellsFilled,
  boardLockedCount,
  boardPercent,
  isSinglePlayer,
  lockedCellKeys,
  seatedInGame,
} from "./state";
import type {
  Cell,
  Dir,
  GameResult,
  PublicClue,
  RoomState,
  RoomStatus,
  RotationDir,
} from "./types";

// §7.5 view payloads. View builders read the solution only for meta letters that are already
// locked, and never copy answers or unrevealed clue text into the payload.

export type ClueView = {
  id: string;
  num: number;
  dir: Dir;
  cells: Cell[];
  length: number;
  state: "pending" | "locked";
  unlocked: boolean;
  text: string;
  condition?: string;
};

export type BoardView = {
  index: number;
  emoji: string;
  color: string;
  layout: string[];
  entries: Record<string, string>;
  lockedCells: string[];
  suspects: Record<string, string>;
  /** Cells that belong to a meta word: `meta` is the word's 1-based number, `slot` its position. */
  metaCells: Array<{ r: number; c: number; meta: number; slot: number }>;
  clues: ClueView[];
  percent: number;
  lockedCount: number;
  totalCount: number;
};

export type BoardRef = { emoji: string; boardIndex: number };

export type SeatingView = {
  seats: Array<{
    seat: number;
    /** Null once the board that sat here has left the ring and no other took its place. */
    boardIndex: number | null;
    emoji: string;
    color: string;
    playerName: string | null;
    isYou: boolean;
    isMaster: boolean;
    /** Knocked out by a wrong guess. */
    out: boolean;
    percent: number;
  }>;
  /** Every board, by index. `done`: every word locked, so it has left the ring. */
  boards: Array<{
    boardIndex: number;
    emoji: string;
    color: string;
    percent: number;
    done: boolean;
  }>;
  /** Null when the rotation would leave you without a board. */
  nextIfLeft: BoardRef | null;
  nextIfRight: BoardRef | null;
  /** Seats whose player tapped Ready. Seats, not player ids: a pid is a credential (DECISIONS.md). */
  readySeats: number[];
  timerStarted: boolean;
};

export type RotationView = {
  count: number;
  cooldownUntil: number;
  pending?: { dir: RotationDir; at: number; youReceive: BoardRef | null };
  /** Every cell on every board is filled and you are Capt. The client also waits for cooldown. */
  canFinalCheck: boolean;
};

export type MetaWordView = Omit<MetaWordState, "slots"> & {
  number: number;
  slots: Array<{ emoji: string; letter: string | null }>;
};

export type MetaView = {
  words: MetaWordView[];
  solvedCount: number;
  /** One player: guesses until one is wrong. Otherwise one guess each; wrong knocks you out. */
  solo: boolean;
  /** Seats of players who may still guess. */
  guessesLeftBySeat: number[];
  /** Points a correct guess would earn now (each word), given the current rotation count. */
  pointsNow: number;
  maxPointsPerWord: number;
};

export type PlayerView = {
  version: number;
  status: RoomStatus;
  now: number;
  rid: string;
  puzzleTitle: string;
  mode: Mode;
  you: {
    pid: string;
    name: string;
    seat: number;
    isMaster: boolean;
    ready: boolean;
    /** False once this player may not guess any more (see MetaView.solo), or the game is over. */
    canGuess: boolean;
    guesses: Array<{ text: string; correct: boolean; metaNumber: number | null }>;
    /** Knocked out by a wrong guess: watching, no longer playing. */
    out: boolean;
  };
  /** The board at your seat; null when your seat has none this rotation. */
  board: BoardView | null;
  seating: SeatingView;
  rotation: RotationView;
  meta: MetaView;
  timer: { startedAt: number | null; endedAt: number | null };
  result?: GameResult;
};

export type HostView = Omit<PlayerView, "you" | "board"> & {
  joinUrl: string;
  masterName: string | null;
  players: Array<{
    name: string;
    seat: number;
    ready: boolean;
    isMaster: boolean;
    hasGuess: boolean;
    out: boolean;
  }>;
};

function boardRef(state: RoomState, boardIndex: number | null): BoardRef | null {
  return boardIndex === null ? null : { emoji: state.boardEmojis[boardIndex]?.e ?? "", boardIndex };
}

/** Human-readable unlock condition for a clue that is not unlocked yet (§3.5.6). */
export function conditionText(state: RoomState, clue: PublicClue): string | undefined {
  const u = clue.unlock;
  switch (u.type) {
    case "base":
      return undefined;
    case "crossLetter":
      return `Needs ${state.boardEmojis[u.board]?.e ?? `board ${u.board + 1}`} r${u.cell[0] + 1}c${u.cell[1] + 1}`;
    case "rotations":
      return `Unlocks at ${u.atLeast} rotations (now ${state.rotations})`;
    case "solvedCount":
      return `Unlocks at ${u.atLeast} solved (now ${state.locked.length})`;
  }
}

export function buildBoardView(state: RoomState, ctx: GameCtx, boardIndex: number): BoardView {
  const pb = ctx.puzzle.boards[boardIndex];
  const b = state.boards[boardIndex];
  const style = state.boardEmojis[boardIndex];
  const suspects: Record<string, string> = {};
  for (const [k, pid] of Object.entries(b.suspects)) {
    suspects[k] = state.players[pid]?.initials ?? "?";
  }
  const clues: ClueView[] = pb.clues.map((clue) => {
    const locked = state.locked.includes(clue.id);
    const unlocked = state.unlocked.includes(clue.id);
    const reveal = locked || unlocked;
    const view: ClueView = {
      id: clue.id,
      num: clue.num,
      dir: clue.dir,
      cells: clue.cells,
      length: clue.cells.length,
      state: locked ? "locked" : "pending",
      unlocked,
      text: reveal ? clue.text : maskClue(clue.text, clue.id, ctx.cfg.lockedRevealRatio),
    };
    if (!reveal) view.condition = conditionText(state, clue);
    return view;
  });
  return {
    index: boardIndex,
    emoji: style?.e ?? "",
    color: style?.color ?? "#555555",
    layout: pb.layout,
    entries: { ...b.entries },
    lockedCells: [...lockedCellKeys(state, ctx, boardIndex)].sort(),
    suspects,
    metaCells: ctx.puzzle.metas.flatMap((m, mi) =>
      m.cells
        .map(([b, r, c], slot) => ({ b, r, c, meta: mi + 1, slot: slot + 1 }))
        .filter((x) => x.b === boardIndex)
        .map(({ r, c, meta, slot }) => ({ r, c, meta, slot })),
    ),
    clues,
    percent: boardPercent(state, ctx, boardIndex),
    lockedCount: boardLockedCount(state, ctx, boardIndex),
    totalCount: pb.clues.length,
  };
}

function buildSeating(
  state: RoomState,
  ctx: GameCtx,
  viewerSeat: number,
  viewerPid: string | null,
): SeatingView {
  const seated = seatedInGame(state);
  const inRing = new Set(state.boardAtSeat);
  return {
    seats: state.boardAtSeat.map((boardIndex, seat) => {
      const pid = state.seats[seat];
      const style = boardIndex === null ? undefined : state.boardEmojis[boardIndex];
      return {
        seat,
        boardIndex,
        emoji: style?.e ?? "",
        color: style?.color ?? "#555555",
        playerName: pid ? (state.players[pid]?.name ?? null) : null,
        isYou: pid !== null && pid === viewerPid,
        isMaster: pid !== null && pid === state.masterPid,
        out: pid !== null && state.knockedOut[pid] !== undefined,
        percent: boardIndex === null ? 0 : boardPercent(state, ctx, boardIndex),
      };
    }),
    boards: ctx.puzzle.boards.map((_, bi) => ({
      boardIndex: bi,
      emoji: state.boardEmojis[bi]?.e ?? "",
      color: state.boardEmojis[bi]?.color ?? "#555555",
      percent: boardPercent(state, ctx, bi),
      done: !inRing.has(bi),
    })),
    nextIfLeft: boardRef(state, boardReceived(state.boardAtSeat, viewerSeat, "L", seated)),
    nextIfRight: boardRef(state, boardReceived(state.boardAtSeat, viewerSeat, "R", seated)),
    readySeats: state.ready
      .map((id) => state.players[id]?.seat)
      .filter((seat): seat is number => seat !== undefined)
      .sort((a, b) => a - b),
    timerStarted: state.timerStartedAt !== null,
  };
}

function buildShared(
  state: RoomState,
  ctx: GameCtx,
  now: number,
  viewerSeat: number,
  viewerPid: string | null,
) {
  // An answer is included only once its word is obtained, or once the game is over.
  const words = metaWords(state, ctx).map((w, i) => ({
    ...w,
    number: i + 1,
    slots: w.slots.map((x) => ({ emoji: x.emoji, letter: x.letter })),
  }));
  const count = ctx.puzzle.metas.length;
  const meta: MetaView = {
    words,
    solvedCount: words.filter((w) => w.solved).length,
    solo: isSinglePlayer(state),
    guessesLeftBySeat: Object.entries(state.players)
      .filter(([id]) => hasGuessLeft(state, id, ctx.cfg))
      .map(([, p]) => p.seat)
      .sort((a, b) => a - b),
    pointsNow: metaPoints(state.rotations, ctx.cfg, count),
    maxPointsPerWord: metaPoints(0, ctx.cfg, count),
  };
  const filled = state.status === "playing" && allCellsFilled(state, ctx);
  const rotation: RotationView = {
    count: state.rotations,
    cooldownUntil: state.cooldownUntil,
    canFinalCheck: filled && (viewerPid === null || viewerPid === state.masterPid),
  };
  if (state.pendingRotation) {
    rotation.pending = {
      dir: state.pendingRotation.dir,
      at: state.pendingRotation.at,
      youReceive: boardRef(
        state,
        boardReceived(
          state.boardAtSeat,
          viewerSeat,
          state.pendingRotation.dir,
          seatedInGame(state),
        ),
      ),
    };
  }
  const view = {
    version: state.version,
    status: state.status,
    now,
    rid: state.rid,
    puzzleTitle: ctx.puzzle.title,
    mode: modeForSize(ctx.puzzle.boardSize) ?? "5x",
    seating: buildSeating(state, ctx, viewerSeat, viewerPid),
    rotation,
    meta,
    timer: { startedAt: state.timerStartedAt, endedAt: state.endedAt },
  } satisfies Omit<PlayerView, "you" | "board">;
  return state.result ? { ...view, result: state.result } : view;
}

function yourGuesses(state: RoomState, ctx: GameCtx, pid: string): PlayerView["you"]["guesses"] {
  return (state.playerStats[pid]?.guesses ?? []).map((g) => {
    const i = g.metaId ? ctx.puzzle.metas.findIndex((m) => m.id === g.metaId) : -1;
    return { text: g.text, correct: g.metaId !== null, metaNumber: i >= 0 ? i + 1 : null };
  });
}

export function buildPlayerView(
  state: RoomState,
  ctx: GameCtx,
  pid: string,
  now: number,
): PlayerView {
  const p = state.players[pid];
  if (!p) throw new Error("player not in room");
  const boardIndex = state.boardAtSeat[p.seat];
  return {
    ...buildShared(state, ctx, now, p.seat, pid),
    you: {
      pid,
      name: p.name,
      seat: p.seat,
      isMaster: state.masterPid === pid,
      ready: state.ready.includes(pid),
      canGuess: state.status === "playing" && hasGuessLeft(state, pid, ctx.cfg),
      guesses: yourGuesses(state, ctx, pid),
      out: state.knockedOut[pid] !== undefined,
    },
    board: boardIndex === null ? null : buildBoardView(state, ctx, boardIndex),
  };
}

/** Host view: no letters from any board, except locked meta letters (§7.5). */
export function buildHostView(
  state: RoomState,
  ctx: GameCtx,
  now: number,
  joinUrl: string,
): HostView {
  const masterSeat = state.masterPid ? (state.players[state.masterPid]?.seat ?? 0) : 0;
  return {
    ...buildShared(state, ctx, now, masterSeat, null),
    joinUrl,
    masterName: state.masterPid ? (state.players[state.masterPid]?.name ?? null) : null,
    players: Object.entries(state.players)
      .map(([id, p]) => ({
        name: p.name,
        seat: p.seat,
        ready: state.ready.includes(id),
        isMaster: id === state.masterPid,
        hasGuess: hasGuessLeft(state, id, ctx.cfg),
        out: state.knockedOut[id] !== undefined,
      }))
      .sort((a, b) => a.seat - b.seat),
  };
}
