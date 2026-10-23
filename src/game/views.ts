import type { GameCtx } from "./context";
import { maskClue } from "./mask";
import { metaSlots } from "./meta";
import { boardReceived } from "./ring";
import { allCellsFilled, boardLockedCount, boardPercent, lockedCellKeys } from "./state";
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
  red: string[];
  suspects: Record<string, string>;
  shaded: Cell[];
  clues: ClueView[];
  percent: number;
  lockedCount: number;
  totalCount: number;
};

export type BoardRef = { emoji: string; boardIndex: number };

export type SeatingView = {
  seats: Array<{
    seat: number;
    boardIndex: number;
    emoji: string;
    color: string;
    playerName: string | null;
    isYou: boolean;
    isMaster: boolean;
    percent: number;
  }>;
  nextIfLeft: BoardRef;
  nextIfRight: BoardRef;
  /** Seats whose player tapped Ready. Seats, not player ids: a pid is a credential (DECISIONS.md). */
  readySeats: number[];
  timerStarted: boolean;
};

export type RotationView = {
  count: number;
  cooldownUntil: number;
  pending?: { dir: RotationDir; at: number; youReceive: BoardRef };
  /** Every cell on every board is filled and you are master. The client also waits for cooldown. */
  canFinalCheck: boolean;
};

export type MetaView = {
  slots: Array<{ emoji: string; letter: string | null }>;
  enumeration: string;
  guessesLeft: number;
  solved: boolean;
  answer?: string;
};

export type PlayerView = {
  version: number;
  status: RoomStatus;
  now: number;
  rid: string;
  puzzleTitle: string;
  you: { pid: string; name: string; seat: number; isMaster: boolean; ready: boolean };
  board: BoardView;
  seating: SeatingView;
  rotation: RotationView;
  tokens: { left: number; issued: number };
  meta: MetaView;
  timer: { startedAt: number | null; endedAt: number | null };
  result?: GameResult;
};

export type HostView = Omit<PlayerView, "you" | "board"> & {
  joinUrl: string;
  masterName: string | null;
  players: Array<{ name: string; seat: number; ready: boolean; isMaster: boolean }>;
};

function boardRef(state: RoomState, boardIndex: number): BoardRef {
  return { emoji: state.boardEmojis[boardIndex]?.e ?? "", boardIndex };
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
    red: [...b.red],
    suspects,
    shaded: pb.shaded,
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
  return {
    seats: state.boardAtSeat.map((boardIndex, seat) => {
      const pid = state.seats[seat];
      const style = state.boardEmojis[boardIndex];
      return {
        seat,
        boardIndex,
        emoji: style?.e ?? "",
        color: style?.color ?? "#555555",
        playerName: pid ? (state.players[pid]?.name ?? null) : null,
        isYou: pid !== null && pid === viewerPid,
        isMaster: pid !== null && pid === state.masterPid,
        percent: boardPercent(state, ctx, boardIndex),
      };
    }),
    nextIfLeft: boardRef(state, boardReceived(state.boardAtSeat, viewerSeat, "L")),
    nextIfRight: boardRef(state, boardReceived(state.boardAtSeat, viewerSeat, "R")),
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
  const slots = metaSlots(state, ctx);
  const solved = state.metaSolvedAt !== null;
  const meta: MetaView = {
    slots: slots.map((s) => ({ emoji: s.emoji, letter: s.letter })),
    enumeration: ctx.puzzle.meta.enumeration,
    guessesLeft: state.metaGuessesLeft,
    solved,
  };
  // The meta answer is revealed once solved, or at the end (all slots are visible by then anyway).
  if (solved || state.status === "ended") meta.answer = ctx.solution.metaAnswer;
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
        boardReceived(state.boardAtSeat, viewerSeat, state.pendingRotation.dir),
      ),
    };
  }
  const view = {
    version: state.version,
    status: state.status,
    now,
    rid: state.rid,
    puzzleTitle: ctx.puzzle.title,
    seating: buildSeating(state, ctx, viewerSeat, viewerPid),
    rotation,
    tokens: { left: state.tokensLeft, issued: state.tokensIssued },
    meta,
    timer: { startedAt: state.timerStartedAt, endedAt: state.endedAt },
  } satisfies Omit<PlayerView, "you" | "board">;
  return state.result ? { ...view, result: state.result } : view;
}

export function buildPlayerView(
  state: RoomState,
  ctx: GameCtx,
  pid: string,
  now: number,
): PlayerView {
  const p = state.players[pid];
  if (!p) throw new Error("player not in room");
  return {
    ...buildShared(state, ctx, now, p.seat, pid),
    you: {
      pid,
      name: p.name,
      seat: p.seat,
      isMaster: state.masterPid === pid,
      ready: state.ready.includes(pid),
    },
    board: buildBoardView(state, ctx, state.boardAtSeat[p.seat]),
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
      }))
      .sort((a, b) => a.seat - b.seat),
  };
}
