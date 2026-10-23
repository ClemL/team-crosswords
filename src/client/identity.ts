// Player identity (§9.2). All storage access is wrapped: private modes can throw.

const PID_KEY = "xw:pid";
const NAME_KEY = "xw:name";

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return window.localStorage.getItem(key) === value;
  } catch {
    return false;
  }
}

function newPid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

/** Returns the player id, preferring ?pid= in the URL, then localStorage, else a new one. */
export function getOrCreatePid(): string {
  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get("pid");
  if (fromUrl) {
    safeSet(PID_KEY, fromUrl);
    return fromUrl;
  }
  const stored = safeGet(PID_KEY);
  if (stored) return stored;
  const pid = newPid();
  if (!safeSet(PID_KEY, pid)) {
    // Storage unavailable: keep the id in the URL so a reload reclaims the seat.
    url.searchParams.set("pid", pid);
    window.history.replaceState(null, "", url.toString());
  }
  return pid;
}

export function getStoredName(): string {
  return safeGet(NAME_KEY) ?? "";
}

export function storeName(name: string): void {
  safeSet(NAME_KEY, name);
}

/** Rooms this browser has joined, so a reload can rejoin without the name form. */
export function rememberJoined(rid: string): void {
  safeSet(`xw:joined:${rid}`, "1");
}

export function hasJoined(rid: string): boolean {
  return safeGet(`xw:joined:${rid}`) === "1";
}
