import type { BoardStyle } from "./types";

// §8.1 — each room picks 3 distinct entries at random; they never change during a game.
export const BOARD_EMOJI_POOL = [
  { e: "🦊", color: "#E8743B" },
  { e: "🐙", color: "#B05FA3" },
  { e: "🌵", color: "#4E9A52" },
  { e: "🚀", color: "#3F6FD8" },
  { e: "🍉", color: "#D94A5C" },
  { e: "⚓", color: "#2F5D7C" },
  { e: "🎈", color: "#E0475B" },
  { e: "🦉", color: "#8A6A4A" },
  { e: "🍄", color: "#C0392B" },
  { e: "🐢", color: "#3A8F6E" },
  { e: "🎲", color: "#5A5A5A" },
  { e: "🌙", color: "#C9A227" },
  { e: "🔔", color: "#D4A017" },
  { e: "🐝", color: "#E3B505" },
  { e: "🍋", color: "#CFC12B" },
  { e: "🪐", color: "#7C5CC4" },
  { e: "🐳", color: "#2E86C1" },
  { e: "🌻", color: "#E1A100" },
] as const;

export function pickBoardEmojis(count: number, rng: () => number): BoardStyle[] {
  const pool: BoardStyle[] = BOARD_EMOJI_POOL.map((p) => ({ e: p.e, color: p.color }));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}
