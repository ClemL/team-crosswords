// Game configuration. All rule code reads from this object (§5). No magic numbers elsewhere.
export const CONFIG_V1 = {
  seats: 3,
  boardSize: 5,
  maxPlayers: 1, // V1.5: 3
  tokensPerPlayer: 2,
  cooldownMs: 20_000,
  rotationWarningMs: 3_000,
  seatingFlashMs: 2_000,
  masterIdleTimeoutMs: 90_000,
  inactiveAfterMs: 60_000,
  lockedRevealRatio: 0.5,
  metaGuesses: 3,
  pollIntervalMs: 1_000,
  hostPollIntervalMs: 1_500,
  roomTtlSeconds: 86_400,
  refPlayers: 1,
} as const;

/** Mutable, widened copy of the config shape (allows test overrides of individual values). */
export type GameConfig = { [K in keyof typeof CONFIG_V1]: number };

/** Room codes: 4 characters, no ambiguous glyphs (§7.4). */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 4;
export const NAME_MAX_LENGTH = 16;
export const LOCK_TTL_MS = 2_000;
export const LOCK_RETRIES = 3;
export const LOCK_BACKOFF_MS = 100;
