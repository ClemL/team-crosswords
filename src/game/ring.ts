import type { RotationDir } from "./types";

/** seat -> board index, or null for a seat without a board. */
export type Ring = readonly (number | null)[];

/**
 * Global ring shift (§3.6.2).
 * ⟳ Right: the board at seat i moves to seat (i + 1) mod n.
 * ⟲ Left:  the board at seat i moves to seat (i − 1 + n) mod n.
 */
export function shiftRing(boardAtSeat: Ring, dir: RotationDir): (number | null)[] {
  const n = boardAtSeat.length;
  const next = new Array<number | null>(n);
  for (let i = 0; i < n; i++) {
    const to = dir === "R" ? (i + 1) % n : (i - 1 + n) % n;
    next[to] = boardAtSeat[i];
  }
  return next;
}

/**
 * Shift, then hand a board to every seated player left without one: once completed boards have
 * left the ring, fewer boards than seats circulate. Each such player takes the nearest board at a
 * seat nobody plays, looking the way boards arrive from (so it is the board the next rotation
 * would have brought). `seated[s]` is true when seat s has a player still in the game.
 */
export function rotateRing(boardAtSeat: Ring, dir: RotationDir, seated: readonly boolean[]) {
  const n = boardAtSeat.length;
  const next = shiftRing(boardAtSeat, dir);
  const from = dir === "R" ? -1 : 1;
  for (let s = 0; s < n; s++) {
    if (!seated[s] || next[s] !== null) continue;
    for (let k = 1; k < n; k++) {
      const t = (((s + from * k) % n) + n) % n;
      if (seated[t] || next[t] === null) continue;
      next[s] = next[t];
      next[t] = null;
      break;
    }
  }
  return next;
}

/** Board index that `seat` will hold after a rotation in `dir`, or null for none. */
export function boardReceived(
  boardAtSeat: Ring,
  seat: number,
  dir: RotationDir,
  seated: readonly boolean[],
): number | null {
  return rotateRing(boardAtSeat, dir, seated)[seat];
}
