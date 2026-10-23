import type { RotationDir } from "./types";

/**
 * Global ring shift (§3.6.2).
 * ⟳ Right: the board at seat i moves to seat (i + 1) mod n.
 * ⟲ Left:  the board at seat i moves to seat (i − 1 + n) mod n.
 */
export function shiftRing(boardAtSeat: readonly number[], dir: RotationDir): number[] {
  const n = boardAtSeat.length;
  const next = new Array<number>(n);
  for (let i = 0; i < n; i++) {
    const to = dir === "R" ? (i + 1) % n : (i - 1 + n) % n;
    next[to] = boardAtSeat[i];
  }
  return next;
}

/** Board index that `seat` will hold after a rotation in `dir`. */
export function boardReceived(
  boardAtSeat: readonly number[],
  seat: number,
  dir: RotationDir,
): number {
  return shiftRing(boardAtSeat, dir)[seat];
}
