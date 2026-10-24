// Game configuration. All rule code reads from this object (§5). No magic numbers elsewhere.
export const CONFIG_V1 = {
  // The largest ring of any mode (MODES[mode].boards). Rooms are read assuming this many boards,
  // and a smaller room drops the extra (empty) ones (room-repo). Players: up to one per board.
  seats: 7,
  cooldownMs: 20_000, // multiplayer only; single player has no cooldown
  rotationWarningMs: 3_000,
  seatingFlashMs: 2_000,
  masterIdleTimeoutMs: 90_000,
  inactiveAfterMs: 60_000,
  lockedRevealRatio: 0.5,
  metaGuessesPerPlayer: 1, // multiplayer: one guess each, and a wrong one knocks you out
  metaTotalPoints: 35, // split evenly across the game's meta words (5x: 7 each, 6x: 5.8 each)
  metaDecayPerRotation: 0.1, // a word loses 10% of its points per rotation made before it is obtained
  metaMinFraction: 0.1, // … down to 10%
  cooldownStepMs: 1_000, // multiplayer: each rotation shortens the next cooldown by 1 s
  cooldownMinMs: 0,
  pollIntervalMs: 1_000,
  hostPollIntervalMs: 1_500,
  roomTtlSeconds: 86_400,
  refPlayers: 1,
  timeLimitScale: 1, // the end-to-end test shortens time limits with an override
} as const;

/**
 * Game modes. Board size, number of meta words (lengths 3 to metaWords + 2) and par scale
 * together; the mode of a game is read from its boardSize. `boards` is the ring size, which is
 * also the most players a room of that mode seats (one per board). A mode with a time limit ends
 * when it runs out, and the score is then the number of meta words obtained. Answers of
 * `repeatLength` letters may appear on more than one board of a game (never twice on one board):
 * seven 7×7 boards need 126 three-letter answers, more than the word list can give without repeats.
 */
export const MODES = {
  "5x": {
    boardSize: 5,
    metaWords: 5,
    parMinutes: 5,
    boards: 5,
    timeLimitMinutes: null,
    repeatLength: null,
  },
  "6x": {
    boardSize: 6,
    metaWords: 6,
    parMinutes: 6,
    boards: 6,
    timeLimitMinutes: null,
    repeatLength: null,
  },
  "7x": {
    boardSize: 7,
    metaWords: 7,
    parMinutes: 7,
    boards: 7,
    timeLimitMinutes: 7,
    repeatLength: 3,
  },
} as const;
export type Mode = keyof typeof MODES;

export function modeForSize(boardSize: number): Mode | null {
  const hit = (Object.keys(MODES) as Mode[]).find((m) => MODES[m].boardSize === boardSize);
  return hit ?? null;
}

/** Mutable, widened copy of the config shape (allows test overrides of individual values). */
export type GameConfig = { [K in keyof typeof CONFIG_V1]: number };

/** Room codes: 4 characters, no ambiguous glyphs (§7.4). */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 4;
export const NAME_MAX_LENGTH = 16;
export const LOCK_TTL_MS = 2_000;
export const LOCK_RETRIES = 3;
export const LOCK_BACKOFF_MS = 100;
