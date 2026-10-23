export const ERROR_STATUS = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_IN_ROOM: 403,
  NOT_MASTER: 403,
  NOT_FOUND: 404,
  NOT_YOUR_BOARD: 409,
  LOCKED_CELL: 409,
  COOLDOWN: 409,
  NOT_FILLED: 409,
  NO_GUESSES: 409,
  KNOCKED_OUT: 409,
  GAME_NOT_STARTED: 409,
  GAME_ENDED: 409,
  ROOM_FULL: 409,
  BUSY: 503,
  STORE_NOT_CONFIGURED: 503,
  STORE_UNAVAILABLE: 503,
  SERVER_ERROR: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export type GameError = { code: ErrorCode; message: string };

export type Result<T> = ({ ok: true } & T) | { ok: false; error: GameError };

export function fail(code: ErrorCode, message: string): { ok: false; error: GameError } {
  return { ok: false, error: { code, message } };
}
