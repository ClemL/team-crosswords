// npm run validate:puzzles [path…] — fails (exit 1) on any rule in spec §6.1. Without paths it
// checks every mode's file together, so a game id used in both is caught.
import { readFileSync } from "node:fs";
import path from "node:path";
import { validatePuzzleSet } from "../src/game/validate";
import type { PuzzleGame } from "../src/game/types";

const files = (
  process.argv.length > 2
    ? process.argv.slice(2)
    : ["data/puzzles-v1.json", "data/puzzles-6x.json", "data/puzzles-7x.json"]
).map((f) => path.resolve(f));
const games: PuzzleGame[] = [];
for (const file of files) {
  const list = JSON.parse(readFileSync(file, "utf8")) as PuzzleGame[];
  if (!Array.isArray(list) || list.length === 0) {
    console.error(`${file}: expected a non-empty array of games`);
    process.exit(1);
  }
  games.push(...list);
}
const file = files.map((f) => path.relative(".", f)).join(", ");

let failed = 0;
for (const report of validatePuzzleSet(games)) {
  const status = report.errors.length === 0 ? "OK  " : "FAIL";
  const solve =
    report.solvedAtRotation === null ? "" : ` (solvable in ${report.solvedAtRotation} rotations)`;
  console.log(`${status} ${report.id}${solve}`);
  for (const e of report.errors) console.log(`     error: ${e}`);
  for (const w of report.warnings) console.log(`     warning: ${w}`);
  if (report.errors.length > 0) failed++;
}
console.log(`\n${games.length - failed}/${games.length} games valid (${file})`);
process.exit(failed === 0 ? 0 : 1);
