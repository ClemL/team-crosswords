import "server-only";
import { NextResponse } from "next/server";
import { ERROR_STATUS, type ErrorCode, type GameError } from "@/game/errors";

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const NO_STORE = { "Cache-Control": "no-store" };

export function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export function notModified(): Response {
  return new Response(null, { status: 304, headers: NO_STORE });
}

export function errorResponse(err: GameError): NextResponse {
  return json({ error: err }, ERROR_STATUS[err.code]);
}

/** Wraps a route body: ApiErrors become `{ error: { code, message } }`; anything else is a 500. */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ApiError) return errorResponse({ code: e.code, message: e.message });
    // Never echo internals (they could include puzzle data) — log server-side only.
    console.error("[api] unexpected error", e);
    return errorResponse({ code: "SERVER_ERROR", message: "Something went wrong." });
  }
}

export async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await req.json();
    if (body && typeof body === "object" && !Array.isArray(body))
      return body as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new ApiError("BAD_REQUEST", "Expected a JSON object body.");
}

export function str(body: Record<string, unknown>, key: string, max = 128): string {
  const v = body[key];
  if (typeof v !== "string" || v.length > max)
    throw new ApiError("BAD_REQUEST", `"${key}" must be a string.`);
  return v;
}

export function int(body: Record<string, unknown>, key: string): number {
  const v = body[key];
  if (typeof v !== "number" || !Number.isInteger(v))
    throw new ApiError("BAD_REQUEST", `"${key}" must be an integer.`);
  return v;
}

export function bool(body: Record<string, unknown>, key: string): boolean {
  const v = body[key];
  if (typeof v !== "boolean") throw new ApiError("BAD_REQUEST", `"${key}" must be a boolean.`);
  return v;
}
