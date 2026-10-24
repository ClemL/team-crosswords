// Shared game types. Nothing in src/game/ performs I/O.

export type Dir = "A" | "D";
/** [row, col], 0-based. */
export type Cell = [number, number];
export type RotationDir = "L" | "R";
export type RoomStatus = "lobby" | "playing" | "ended";

export type UnlockRule =
  | { type: "base" }
  | { type: "crossLetter"; board: number; cell: Cell }
  | { type: "rotations"; atLeast: number }
  | { type: "solvedCount"; atLeast: number };

// ---- Puzzle file (server only: contains answers) -------------------------------------------

export type PuzzleClue = {
  id: string;
  num: number;
  dir: Dir;
  cells: Cell[];
  answer: string;
  text: string;
  unlock: UnlockRule;
};

export type PuzzleBoard = {
  index: number;
  layout: string[];
  solution: string[];
  clues: PuzzleClue[];
};

/** [board, row, col], 0-based. */
export type BoardCell = [number, number, number];

/** A meta word, spelled by `cells` in order. Each game has several of differing lengths. */
export type PuzzleMetaWord = {
  id: string;
  answer: string;
  enumeration: string;
  cells: BoardCell[];
};

export type PuzzleGame = {
  id: string;
  title: string;
  version: 1;
  boardSize: number;
  parMinutes: number;
  metas: PuzzleMetaWord[];
  boards: PuzzleBoard[];
};

// ---- Split forms stored in Redis ----------------------------------------------------------

export type PublicClue = Omit<PuzzleClue, "answer">;
export type PublicBoard = Omit<PuzzleBoard, "solution" | "clues"> & { clues: PublicClue[] };
export type PublicMetaWord = Omit<PuzzleMetaWord, "answer">;
/** Puzzle without any solution, answer or meta answer. */
export type PublicPuzzle = Omit<PuzzleGame, "boards" | "metas"> & {
  metas: PublicMetaWord[];
  boards: PublicBoard[];
};
/**
 * Never returned to a client. `boards[n]` is the solution grid of board n, one string per row;
 * `metaAnswers` maps meta word id to its answer.
 */
export type PuzzleSolution = { boards: string[][]; metaAnswers: Record<string, string> };

// ---- Room state ---------------------------------------------------------------------------

export type BoardStyle = { e: string; color: string };

export type PlayerRecord = {
  name: string;
  initials: string;
  seat: number;
  joinedAt: number;
  lastSeen: number;
  activeSeconds: number;
};

export type BoardState = {
  /** "r,c" -> letter */
  entries: Record<string, string>;
  /** "r,c" -> playerId who typed the current letter (tile credit once the cell locks) */
  authors: Record<string, string>;
  /** "r,c" -> playerId */
  suspects: Record<string, string>;
};

export type RoomStats = {
  falseSuspects: number;
  accurateSuspects: number;
  metaWrong: number;
};

/**
 * A player's meta guess. Alone, a player may keep guessing until one is wrong; with others, each
 * player gets one guess and a wrong one knocks them out.
 */
export type PlayerGuess = {
  text: string;
  /** The meta word it matched, or null when wrong. */
  metaId: string | null;
  at: number;
  rotations: number;
};

/** Per-player game stats. Written only under the room lock (unlike PlayerRecord, see DECISIONS.md). */
export type PlayerStats = {
  lettersTyped: number;
  /** Rotations this player made as Capt. */
  rotations: number;
  falseSuspects: number;
  accurateSuspects: number;
  /** In the order they were made. */
  guesses: PlayerGuess[];
  /** Wrong letters this player had typed on the board at their seat when it rotated away. */
  wrongLeft: number;
};

/** How and when a meta word was obtained. */
export type MetaObtained = {
  at: number;
  /** Rotations made before it was obtained (drives its points). */
  rotations: number;
  by: "guess" | "tiles";
  /** Seat of the player whose guess obtained it. */
  seat?: number;
};

export type Grade = "S*" | "S" | "A" | "B" | "C" | "D" | "F";

export type ScoreBreakdown = { time: number; metas: number; suspects: number };

export type MetaResult = {
  id: string;
  answer: string;
  by: "guess" | "tiles" | null;
  rotations: number | null;
  points: number;
  /** Name of the player whose guess obtained it. */
  guessedBy?: string;
};

/** A player's scorecard. Players are identified by seat and name, never by player id. */
export type PlayerCard = {
  seat: number;
  name: string;
  initials: string;
  /** Locked cells whose letter this player typed. */
  tiles: number;
  /** Same, per board index. */
  tilesByBoard: number[];
  lettersTyped: number;
  rotations: number;
  falseSuspects: number;
  accurateSuspects: number;
  activeSeconds: number;
  guesses: Array<{ text: string; correct: boolean; metaNumber: number | null; points: number }>;
  /** Knocked out by a wrong guess in multiplayer. */
  knockedOut: boolean;
  /** Wrong letters of theirs on the board they passed on, summed over every rotation. */
  wrongLeft: number;
};

export type BoardMvp = {
  boardIndex: number;
  emoji: string;
  /** Seats of the players with the most tiles on this board (ties share it); empty if none. */
  seats: number[];
  names: string[];
  tiles: number;
};

export type GameResult = {
  /**
   * How the game ended: every meta word obtained, the time limit ran out, or everyone was knocked
   * out. When time ran out, `total` is the number of meta words obtained and there is no grade.
   */
  endedBy: "metas" | "time" | "knockout";
  /** Meta words obtained, out of details.metas.length. */
  metasObtained: number;
  total: number;
  grade: Grade | null;
  breakdown: ScoreBreakdown;
  details: {
    gameSeconds: number;
    parSeconds: number;
    effPlayers: number;
    falseSuspects: number;
    /** Wrong letters passed on at rotations, all players together. */
    wrongLeft: number;
    metas: MetaResult[];
  };
  players: PlayerCard[];
  mvps: BoardMvp[];
  /** Tiles filled per player, most first. */
  leaderboard: Array<{ seat: number; name: string; tiles: number }>;
};

export type RoomState = {
  rid: string;
  puzzleId: string;
  status: RoomStatus;
  version: number;
  createdAt: number;
  rotations: number;
  cooldownUntil: number;
  masterPid: string | null;
  pendingRotation: { dir: RotationDir; at: number } | null;
  timerStartedAt: number | null;
  /** When the time limit runs out (modes with one), set as the timer starts. */
  timeUpAt: number | null;
  endedAt: number | null;
  /** Meta word id -> how it was obtained. The game ends when every word is obtained. */
  metaSolved: Record<string, MetaObtained>;
  boardEmojis: BoardStyle[];
  finalCheckAt: number | null;
  /** Frozen at the moment the game ends. */
  result: GameResult | null;
  /** seat index -> playerId, or null when the seat is empty. */
  seats: (string | null)[];
  /**
   * seat index -> board index, or null for a seat without a board: a board whose every word is
   * locked leaves the ring at the next rotation.
   */
  boardAtSeat: (number | null)[];
  players: Record<string, PlayerRecord>;
  /** playerId -> game stats (separate from PlayerRecord, which polls rewrite). */
  playerStats: Record<string, PlayerStats>;
  /** playerId -> when a wrong multiplayer guess knocked them out. */
  knockedOut: Record<string, number>;
  masterCounts: Record<string, number>;
  ready: string[];
  boards: BoardState[];
  /** Clue ids whose word is locked green. */
  locked: string[];
  /** Clue ids whose clue text is unlocked. */
  unlocked: string[];
  stats: RoomStats;
};
