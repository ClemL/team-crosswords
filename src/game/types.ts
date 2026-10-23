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
  /** "r,c" -> playerId */
  suspects: Record<string, string>;
  /** "r,c" cells marked wrong by Check Cells */
  red: string[];
};

export type RoomStats = {
  tokensSpent: number;
  falseSuspects: number;
  accurateSuspects: number;
  metaWrong: number;
};

export type Grade = "S*" | "S" | "A" | "B" | "C" | "D" | "F";

export type ScoreBreakdown = { time: number; metas: number; suspects: number };

export type MetaResult = {
  id: string;
  answer: string;
  /** Rotations made before the correct guess; null when auto-completed at the end. */
  rotations: number | null;
  points: number;
};

export type GameResult = {
  total: number;
  grade: Grade;
  breakdown: ScoreBreakdown;
  details: {
    gameSeconds: number;
    parSeconds: number;
    effPlayers: number;
    /** Reported for information only: Check tokens are not scored. */
    tokensSpent: number;
    tokensIssued: number;
    falseSuspects: number;
    metas: MetaResult[];
  };
};

/** A meta word solved by a correct guess. */
export type MetaSolve = { at: number; rotations: number };

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
  tokensIssued: number;
  tokensLeft: number;
  timerStartedAt: number | null;
  endedAt: number | null;
  /** Meta word id -> when it was guessed. Auto-completed words at the end are not recorded. */
  metaSolved: Record<string, MetaSolve>;
  /** Wrong guesses left, shared by all meta words. */
  metaGuessesLeft: number;
  boardEmojis: BoardStyle[];
  finalCheckAt: number | null;
  /** Frozen at the moment the game ends. */
  result: GameResult | null;
  /** seat index -> playerId, or null when the seat is empty. */
  seats: (string | null)[];
  /** seat index -> board index. */
  boardAtSeat: number[];
  players: Record<string, PlayerRecord>;
  masterCounts: Record<string, number>;
  ready: string[];
  boards: BoardState[];
  /** Clue ids whose word is locked green. */
  locked: string[];
  /** Clue ids whose clue text is unlocked. */
  unlocked: string[];
  stats: RoomStats;
};
