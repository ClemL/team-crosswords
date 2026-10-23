import "server-only";
import { CONFIG_V1, type GameConfig } from "@/config";

let cached: GameConfig | null = null;

/**
 * Server-side configuration: CONFIG_V1, optionally merged with numeric overrides from
 * XW_CONFIG_OVERRIDES (JSON). Used by the end-to-end test to shorten the cooldown.
 */
export function serverConfig(): GameConfig {
  if (cached) return cached;
  const base: GameConfig = { ...CONFIG_V1 };
  const raw = process.env.XW_CONFIG_OVERRIDES;
  if (raw) {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      for (const [k, v] of Object.entries(parsed)) {
        if (k in base && typeof v === "number" && Number.isFinite(v)) {
          (base as Record<string, number>)[k] = v;
        }
      }
    }
  }
  cached = base;
  return cached;
}
