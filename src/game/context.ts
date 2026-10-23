import type { GameConfig } from "@/config";
import type { PublicPuzzle, PuzzleSolution } from "./types";

/** Everything a rule function needs besides the room state itself. */
export type GameCtx = {
  puzzle: PublicPuzzle;
  /** Server-only. Rule functions may read it; view builders never copy it into a payload. */
  solution: PuzzleSolution;
  cfg: GameConfig;
};
