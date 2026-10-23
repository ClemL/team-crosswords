import type { ErrorCode } from "@/game/errors";

export type ApiFailure = {
  ok: false;
  status: number;
  code: ErrorCode | "NETWORK";
  message: string;
};
export type ApiSuccess<T> = { ok: true; status: number; data: T };
export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", ...init });
  } catch {
    return { ok: false, status: 0, code: "NETWORK", message: "Network error. Retrying…" };
  }
  if (res.status === 304) return { ok: true, status: 304, data: null as T };
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // empty body
  }
  if (!res.ok) {
    const err = (body as { error?: { code: ErrorCode; message: string } } | null)?.error;
    return {
      ok: false,
      status: res.status,
      code: err?.code ?? "SERVER_ERROR",
      message: err?.message ?? res.statusText,
    };
  }
  return { ok: true, status: res.status, data: body as T };
}

export function post<T>(url: string, body: unknown): Promise<ApiResult<T>> {
  return apiFetch<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Runs mutations one at a time, in order, to keep lock contention low. */
export function createQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = tail.then(task, task);
    tail = run.catch(() => undefined);
    return run;
  };
}
