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
  shaded: Cell[];
  clues: PuzzleClue[];
};

export type PuzzleGame = {
  id: string;
  title: string;
  version: 1;
  boardSize: number;
  parMinutes: number;
  meta: { answer: string; enumeration: string };
  boards: PuzzleBoard[];
};

// ---- Split forms stored in Redis ----------------------------------------------------------

export type PublicClue = Omit<PuzzleClue, "answer">;
export type PublicBoard = Omit<PuzzleBoard, "solution" | "clues"> & { clues: PublicClue[] };
/** Puzzle without any solution, answer or meta answer. */
export type PublicPuzzle = Omit<PuzzleGame, "boards" | "meta"> & {
  meta: { enumeration: string };
  boards: PublicBoard[];
};
/** Never returned to a client. `boards[n]` is the solution grid of board n, one string per row. */
export type PuzzleSolution = { boards: string[][]; metaAnswer: string };

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

export type ScoreBreakdown = { time: number; tokens: number; suspects: number; meta: number };

export type GameResult = {
  total: number;
  grade: Grade;
  breakdown: ScoreBreakdown;
  details: {
    gameSeconds: number;
    parSeconds: number;
    effPlayers: number;
    tokensSpent: number;
    tokensIssued: number;
    falseSuspects: number;
    metaSolved: boolean;
  };
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
  tokensIssued: number;
  tokensLeft: number;
  timerStartedAt: number | null;
  endedAt: number | null;
  metaSolvedAt: number | null;
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
