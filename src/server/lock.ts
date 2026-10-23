import "server-only";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { LOCK_BACKOFF_MS, LOCK_RETRIES, LOCK_TTL_MS } from "@/config";
import type { Store } from "./store";

/** Room mutex: SET NX PX, retried LOCK_RETRIES times with backoff (§7.2). */
export async function acquireLock(store: Store, key: string): Promise<string | null> {
  const token = randomUUID();
  for (let attempt = 0; attempt <= LOCK_RETRIES; attempt++) {
    const [ok] = await store.exec([{ op: "set", key, value: token, nx: true, px: LOCK_TTL_MS }]);
    if (ok) return token;
    if (attempt < LOCK_RETRIES) await sleep(LOCK_BACKOFF_MS * (attempt + 1));
  }
  return null;
}

export async function releaseLock(store: Store, key: string, token: string): Promise<void> {
  await store.releaseLock(key, token);
}
