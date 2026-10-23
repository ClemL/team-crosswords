// npm run validate:puzzles [path] — fails (exit 1) on any rule in spec §6.1.
import { readFileSync } from "node:fs";
import path from "node:path";
import { validatePuzzleSet } from "../src/game/validate";
import type { PuzzleGame } from "../src/game/types";

const file = path.resolve(process.argv[2] ?? "data/puzzles-v1.json");
const games = JSON.parse(readFileSync(file, "utf8")) as PuzzleGame[];
if (!Array.isArray(games) || games.length === 0) {
  console.error(`${file}: expected a non-empty array of games`);
  process.exit(1);
}

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
