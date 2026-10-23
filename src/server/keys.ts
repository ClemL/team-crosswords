import "server-only";

// §7.1 Redis key layout.
export const puzzleKeys = {
  index: "puzzles:index",
  public: (id: string) => `puzzle:${id}:public`,
  solution: (id: string) => `puzzle:${id}:solution`,
};

export function roomKeys(rid: string, boards: number) {
  const p = `room:${rid}`;
  const perBoard = Array.from({ length: boards }, (_, n) => ({
    entries: `${p}:b:${n}:entries`,
    suspects: `${p}:b:${n}:suspects`,
    authors: `${p}:b:${n}:authors`,
  }));
  return {
    meta: `${p}:meta`,
    version: `${p}:version`,
    seats: `${p}:seats`,
    boardAtSeat: `${p}:boardAtSeat`,
    players: `${p}:players`,
    masterCounts: `${p}:masterCounts`,
    playerStats: `${p}:pstats`,
    ready: `${p}:ready`,
    boards: perBoard,
    locked: `${p}:locked`,
    unlocked: `${p}:unlocked`,
    stats: `${p}:stats`,
    lock: `${p}:lock`,
  };
}

export type RoomKeys = ReturnType<typeof roomKeys>;

/** Every key that carries room state (the lock is excluded: it has its own PX). */
export function allRoomStateKeys(k: RoomKeys): string[] {
  return [
    k.meta,
    k.version,
    k.seats,
    k.boardAtSeat,
    k.players,
    k.masterCounts,
    k.playerStats,
    k.ready,
    ...k.boards.flatMap((b) => [b.entries, b.authors, b.suspects]),
    k.locked,
    k.unlocked,
    k.stats,
  ];
}
