// Game configuration. All rule code reads from this object (§5). No magic numbers elsewhere.
export const CONFIG_V1 = {
  seats: 3,
  boardSize: 5,
  maxPlayers: 3, // one per board
  cooldownMs: 20_000, // multiplayer only; single player has no cooldown
  rotationWarningMs: 3_000,
  seatingFlashMs: 2_000,
  masterIdleTimeoutMs: 90_000,
  inactiveAfterMs: 60_000,
  lockedRevealRatio: 0.5,
  metaWords: 5,
  metaGuessesPerPlayer: 1, // one guess per player per game, right or wrong
  metaWordPoints: 7, // 5 words × 7 = 35 points, whether obtained by guess or by tiles
  metaDecayPerRotation: 0.1, // a word loses 10% of its points per rotation made before it is obtained
  metaMinFraction: 0.1, // … down to 10%
  cooldownStepMs: 1_000, // multiplayer: each rotation shortens the next cooldown by 1 s
  cooldownMinMs: 0,
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
