import { hashString, mulberry32 } from "./rng";

const ALNUM = /[\p{L}\p{N}]/u;

/**
 * Masks a locked clue (§3.5.4): hides ceil(alnumCount × (1 − revealRatio)) letters/digits with "_".
 * Deterministic per clue id. Spaces and punctuation stay visible.
 */
export function maskClue(text: string, clueId: string, revealRatio: number): string {
  const chars = Array.from(text);
  const positions: number[] = [];
  chars.forEach((ch, i) => {
    if (ALNUM.test(ch)) positions.push(i);
  });
  // The epsilon absorbs float noise such as 10 × (1 − 0.7) = 3.0000000000000004.
  const hide = Math.min(positions.length, Math.ceil(positions.length * (1 - revealRatio) - 1e-9));
  const rng = mulberry32(hashString(clueId));
  // Partial Fisher–Yates: the first `hide` slots become the hidden positions.
  for (let i = 0; i < hide; i++) {
    const j = i + Math.floor(rng() * (positions.length - i));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  for (let i = 0; i < hide; i++) chars[positions[i]] = "_";
  return chars.join("");
}
