// npm run check:leaks — after `next build`, fails if any client-facing build output contains
// puzzle answers, solution rows or clue text (§12.2). Run in CI after the build.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { PuzzleGame } from "../src/game/types";

const ROOT = path.resolve(".next");
const games = JSON.parse(readFileSync("data/puzzles-v1.json", "utf8")) as PuzzleGame[];

// Everything a browser can download: static chunks, prerendered HTML and RSC payloads.
const TARGETS = [
  { dir: path.join(ROOT, "static"), match: () => true },
  {
    dir: path.join(ROOT, "server", "app"),
    match: (f: string) => /\.(html|rsc|body|meta)$/.test(f),
  },
];

function walk(dir: string, match: (f: string) => boolean, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, match, out);
    else if (match(name)) out.push(p);
  }
  return out;
}

const needles: { label: string; test: (s: string) => boolean }[] = [];
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const answers = new Set<string>();
for (const g of games) {
  for (const m of g.metas) answers.add(m.answer);
  for (const b of g.boards) {
    for (const c of b.clues) {
      answers.add(c.answer);
      if (c.text.length > 12)
        needles.push({ label: `clue text "${c.text}"`, test: (s) => s.includes(c.text) });
    }
    for (const row of b.solution) {
      if (row.includes("#"))
        needles.push({ label: `solution row "${row}"`, test: (s) => s.includes(row) });
    }
  }
}
// 3-letter answers are skipped as quoted strings: they collide with tokens such as "GET".
for (const a of answers) {
  if (a.length < 4) continue;
  const re = new RegExp(`["'\`]${escape(a)}["'\`]`);
  needles.push({ label: `answer "${a}"`, test: (s) => re.test(s) });
}
needles.push({ label: '"solution" key', test: (s) => /["']solution["']\s*:/.test(s) });

const files = TARGETS.flatMap((t) => walk(t.dir, t.match));
if (files.length === 0) {
  console.error("No build output found. Run `npm run build` first.");
  process.exit(1);
}
const maps = files.filter((f) => f.endsWith(".map"));
let failures = 0;
for (const f of maps) {
  console.error(`source map shipped to the browser: ${path.relative(".", f)}`);
  failures++;
}
for (const f of files) {
  const text = readFileSync(f, "utf8");
  for (const n of needles) {
    if (n.test(text)) {
      console.error(`${path.relative(".", f)}: contains ${n.label}`);
      failures++;
    }
  }
}
console.log(
  `Scanned ${files.length} files for ${needles.length} patterns: ${failures === 0 ? "no leaks" : `${failures} leaks`}`,
);
process.exit(failures === 0 ? 0 : 1);
