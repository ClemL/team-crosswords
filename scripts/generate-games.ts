// One-off generator (kept for reproducibility) for data/puzzles-<mode>.json, the 6× and 7× sets:
// ten games of three N×N boards, each with N meta words of 3 to N + 2 letters drawn from the
// crossword-app themed answers.
//
// It borrows crossword-app's lexicon, grid and filler, so it needs a checkout of that repository
// (with its dictionary cache, fetched on first run):
//
//   npx tsx scripts/generate-games.ts --mode=6x|7x [--xw=../crossword-app] [--out=…] [--reclue]
//
// Fills are time-boxed, so a run on another machine can produce different grids; the committed
// file is the source of truth. --reclue keeps the grids, unlocks and metas of the existing file and
// only re-picks the clues. Clues come from scripts/clues.ts first, then crossword-app's
// hand-written clues; the run fails and lists any answer that has neither.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { MODES, type Mode } from "../src/config";
import { cellKey } from "../src/game/puzzle";
import { hashString, mulberry32 } from "../src/game/rng";
import type { PuzzleBoard, PuzzleClue, PuzzleGame, UnlockRule } from "../src/game/types";
import { simulateSolve, validatePuzzleSet } from "../src/game/validate";
import { BLOCKED, CLUES } from "./clues";

const arg = (name: string, fallback: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const XW = path.resolve(arg("xw", "../crossword-app"));
const MODE_ID = arg("mode", "6x") as Mode;
if (!(MODE_ID in MODES) || MODE_ID === "5x") throw new Error(`--mode must be 6x or 7x`);
const OUT = path.resolve(arg("out", `data/puzzles-${MODE_ID}.json`));
const RECLUE = process.argv.includes("--reclue");
const MODE = MODES[MODE_ID];
const SIZE = MODE.boardSize;
const GAMES = 10;
const BOARDS = 3;

type Entry = { word: string; clues: string[]; tier: number; rank: number; derived?: boolean };
type Slot = { dir: "across" | "down"; number: number; cells: number[] };
type Fill = { entries: Entry[]; letters: string[] };

const lib = (f: string) => import(pathToFileURL(path.join(XW, "scripts", "lib", f)).href);
const { buildLexicon, indexLexicon, THEME_SETS, TIER } = await lib("lexicon.mjs");
const { analyze, isValidPattern } = await lib("grid.mjs");
const { createFiller } = await lib("fill.mjs");

// ---- Vocabulary ---------------------------------------------------------------------------

// Three-letter fill is the most visible, so it must have a hand-written clue. Longer entries may
// come from the frequency list (up to "familiar"), and every one of those is clued by hand.
const lexicon = (await buildLexicon({ maxTier: TIER.FAMILIAR })) as Entry[];
const blocked = new Set(BLOCKED);
const fillWords = lexicon.filter(
  (e) =>
    !e.derived &&
    !blocked.has(e.word) &&
    e.word.length <= SIZE &&
    (e.word.length === 3 ? e.tier === TIER.CURATED : e.tier <= TIER.FAMILIAR),
);
const curated = new Map(
  lexicon.filter((e) => e.tier === TIER.CURATED).map((e) => [e.word, e.clues] as const),
);

// Meta words: every themed answer of any player, by length.
type Themed = { word: string; topic: string };
const themedByLength = new Map<number, Themed[]>();
const seenThemed = new Set<string>();
for (const set of ["shared", "clem", "lori"]) {
  for (const [topic, items] of Object.entries(THEME_SETS[set] as Record<string, string[][]>)) {
    for (const [word] of items) {
      if (seenThemed.has(word)) continue;
      seenThemed.add(word);
      const list = themedByLength.get(word.length) ?? [];
      list.push({ word, topic });
      themedByLength.set(word.length, list);
    }
  }
}

// ---- Grid patterns ------------------------------------------------------------------------

/**
 * Which patterns fill with everyday vocabulary, measured: a 6×6 with 4 or 6 blocks never did,
 * every 10-block and some 8-block ones did. A 7×7 filled only in the classic 8-block, 22-entry
 * layout (in under a second); all 51 patterns of 14–16 entries failed, and with rarer 6- and
 * 7-letter words allowed only 1 of 30 filled, with a name in it. So every 7×7 board uses it.
 */
const PATTERN_RULES: Record<"6x" | "7x", { blocks: number[]; minSlots: number }> = {
  "6x": { blocks: [8, 10], minSlots: 0 },
  "7x": { blocks: [8], minSlots: 22 },
};

/**
 * Every 180°-symmetric pattern with runs of 3+ that meets the mode's rule: blocks come in mirrored
 * pairs, plus the centre cell of an odd grid.
 */
function patterns(): Uint8Array[] {
  const { blocks: counts, minSlots } = PATTERN_RULES[MODE_ID as "6x" | "7x"];
  const cells = SIZE * SIZE;
  const half = Math.floor(cells / 2);
  const center = cells % 2 === 1 ? half : -1;
  const maxPairs = Math.floor(Math.max(...counts) / 2);
  const out: Uint8Array[] = [];
  const visit = (start: number, chosen: number[]) => {
    for (const withCenter of center >= 0 ? [false, true] : [false]) {
      if (!counts.includes(chosen.length * 2 + (withCenter ? 1 : 0))) continue;
      const b = new Uint8Array(cells);
      for (const i of chosen) b[i] = b[cells - 1 - i] = 1;
      if (withCenter) b[center] = 1;
      if (!isValidPattern(b, SIZE, { minRun: 3, maxRun: SIZE })) continue;
      if ((analyze(b, SIZE) as { slots: Slot[] }).slots.length >= minSlots) out.push(b);
    }
    if (chosen.length === maxPairs) return;
    for (let i = start; i < half; i++) visit(i + 1, [...chosen, i]);
  };
  visit(0, []);
  return out;
}

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---- Boards -------------------------------------------------------------------------------

function fillBoard(blocks: Uint8Array, exclude: Set<string>, seed: number): Fill | null {
  const filler = createFiller(indexLexicon(fillWords.filter((e) => !exclude.has(e.word))));
  const { slots } = analyze(blocks, SIZE) as { slots: Slot[] };
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = filler.fill(slots, SIZE * SIZE, {
      seed: seed + attempt * 7919,
      timeBudgetMs: 4000,
      nodeLimit: 2_000_000,
      branch: 400,
    });
    if (result) return result as Fill;
  }
  return null;
}

function clueFor(word: string, rng: () => number): string | null {
  // Draw even when an own clue wins, so adding an override never re-picks any other clue.
  const options = curated.get(word);
  const pick = options ? options[Math.floor(rng() * options.length)] : null;
  return CLUES[word] ?? pick;
}

function toBoard(index: number, blocks: Uint8Array, fill: Fill, rng: () => number): PuzzleBoard {
  const { slots } = analyze(blocks, SIZE) as { slots: Slot[] };
  const rows = (open: (i: number) => string) =>
    Array.from({ length: SIZE }, (_, r) =>
      Array.from({ length: SIZE }, (_, c) =>
        blocks[r * SIZE + c] ? "#" : open(r * SIZE + c),
      ).join(""),
    );
  const clues: PuzzleClue[] = slots
    .map((slot, si) => {
      const dir = slot.dir === "across" ? "A" : "D";
      const word = fill.entries[si].word;
      return {
        id: `B${index}-${slot.number}${dir}`,
        num: slot.number,
        dir,
        cells: slot.cells.map((i) => [Math.floor(i / SIZE), i % SIZE] as [number, number]),
        answer: word,
        text: clueFor(word, rng) ?? "",
        unlock: { type: "base" },
      } satisfies PuzzleClue;
    })
    .sort((a, b) => (a.dir === b.dir ? a.num - b.num : a.dir === "A" ? -1 : 1));
  return { index, layout: rows(() => "."), solution: rows((i) => fill.letters[i]), clues };
}

// ---- Unlocks ------------------------------------------------------------------------------

/**
 * Per board, as in the 5×5 set: about 40% base clues, a third waiting on a letter of another
 * board, one on a rotation count and the rest on a solved count.
 */
function assignUnlocks(boards: PuzzleBoard[], rng: () => number): void {
  const total = boards.reduce((n, b) => n + b.clues.length, 0);
  for (const board of boards) {
    const order = shuffle(board.clues, rng);
    const base = Math.ceil(order.length * 0.4);
    const cross = Math.round(order.length / 3);
    order.forEach((clue, i) => {
      let unlock: UnlockRule;
      if (i < base) unlock = { type: "base" };
      else if (i < base + cross) {
        const others = boards.filter((b) => b.index !== board.index);
        const target = others[Math.floor(rng() * others.length)];
        const open = target.layout.flatMap((row, r) =>
          [...row].flatMap((ch, c) => (ch === "." ? [[r, c] as [number, number]] : [])),
        );
        unlock = {
          type: "crossLetter",
          board: target.index,
          cell: open[Math.floor(rng() * open.length)],
        };
      } else if (i === base + cross)
        unlock = { type: "rotations", atLeast: 2 + Math.floor(rng() * 3) };
      else
        unlock = {
          type: "solvedCount",
          atLeast: Math.max(3, Math.round(total * (0.1 + rng() * 0.5))),
        };
      clue.unlock = unlock;
    });
  }
}

// ---- Meta words ---------------------------------------------------------------------------

type Spot = { board: number; r: number; c: number; letter: string };

/** Assigns a distinct unused cell to each letter, rotating through boards so every board is used. */
function place(word: string, spots: Spot[], used: Set<string>, rng: () => number): Spot[] | null {
  const key = (s: Spot) => `${s.board}:${cellKey(s.r, s.c)}`;
  const taken = new Set(used);
  const out: Spot[] = [];
  const offset = Math.floor(rng() * BOARDS);
  for (let i = 0; i < word.length; i++) {
    const preferred = (i + offset) % BOARDS;
    const options = spots.filter((s) => s.letter === word[i] && !taken.has(key(s)));
    if (options.length === 0) return null;
    const onBoard = options.filter((s) => s.board === preferred);
    const pick = shuffle(onBoard.length > 0 ? onBoard : options, rng)[0];
    taken.add(key(pick));
    out.push(pick);
  }
  return new Set(out.map((s) => s.board)).size === BOARDS ? out : null;
}

function pickMetas(
  boards: PuzzleBoard[],
  answers: Set<string>,
  usedMetas: Set<string>,
  rng: () => number,
): PuzzleGame["metas"] {
  const spots: Spot[] = boards.flatMap((b) =>
    b.solution.flatMap((row, r) =>
      [...row].flatMap((letter, c) => (letter === "#" ? [] : [{ board: b.index, r, c, letter }])),
    ),
  );
  const used = new Set<string>();
  const topics = new Set<string>();
  const picked: { word: string; topic: string; cells: Spot[] }[] = [];
  const lengths = Array.from({ length: MODE.metaWords }, (_, i) => 3 + i).reverse();
  for (const length of lengths) {
    const pool = shuffle(themedByLength.get(length) ?? [], rng).filter(
      (t) => !answers.has(t.word) && !usedMetas.has(t.word),
    );
    // One topic per game where possible, so the six words do not all come from one subject.
    const ordered = [
      ...pool.filter((t) => !topics.has(t.topic)),
      ...pool.filter((t) => topics.has(t.topic)),
    ];
    let hit: (typeof picked)[number] | null = null;
    for (const t of ordered) {
      const cells = place(t.word, spots, used, rng);
      if (cells) {
        hit = { ...t, cells };
        break;
      }
    }
    if (!hit) throw new Error(`no themed ${length}-letter word fits`);
    for (const s of hit.cells) used.add(`${s.board}:${cellKey(s.r, s.c)}`);
    usedMetas.add(hit.word);
    topics.add(hit.topic);
    picked.push(hit);
  }
  picked.sort((a, b) => a.word.length - b.word.length);
  console.log(`  metas: ${picked.map((p) => `${p.word} (${p.topic})`).join(", ")}`);
  return picked.map((p, i) => ({
    id: `M${i + 1}`,
    answer: p.word,
    enumeration: `(${p.word.length})`,
    cells: p.cells.map((s) => [s.board, s.r, s.c] as [number, number, number]),
  }));
}

// ---- Games --------------------------------------------------------------------------------

function generate(): PuzzleGame[] {
  const allPatterns = patterns();
  const usedAnswers = new Set<string>();
  const usedMetas = new Set<string>();
  const seenGrids = new Set<string>();
  const games: PuzzleGame[] = [];

  for (let g = 1; g <= GAMES; g++) {
    const id = `${MODE_ID}-${String(g).padStart(2, "0")}`;
    const rng = mulberry32(hashString(id));
    console.log(id);
    const gameAnswers = new Set<string>();
    const boards: PuzzleBoard[] = [];
    const order = shuffle(allPatterns, rng);
    const usedPatterns = new Set<Uint8Array>();
    // First no answer an earlier game used; failing that, earlier games' 3- and 4-letter answers
    // may come back; last, any earlier answer. A whole board never comes back.
    const passes = [
      () => new Set([...usedAnswers, ...gameAnswers]),
      () => new Set([...[...usedAnswers].filter((a) => a.length > 4), ...gameAnswers]),
      () => new Set(gameAnswers),
    ];
    // A game's boards take different patterns where the mode has enough of them (7×7 has one).
    const varied = allPatterns.length >= BOARDS;
    for (let b = 0; b < BOARDS; b++) {
      let made: PuzzleBoard | null = null;
      for (const exclude of passes) {
        for (const blocks of varied ? order : [...order, ...order, ...order]) {
          if (made) break;
          if (varied && usedPatterns.has(blocks)) continue;
          const fill = fillBoard(blocks, exclude(), Math.floor(rng() * 1e9));
          if (!fill || seenGrids.has(fill.letters.join(""))) continue;
          seenGrids.add(fill.letters.join(""));
          usedPatterns.add(blocks);
          made = toBoard(b, blocks, fill, rng);
        }
        if (made) break;
      }
      if (!made) throw new Error(`${id}: board ${b} did not fill`);
      for (const c of made.clues) gameAnswers.add(c.answer);
      console.log(`  board ${b}: ${made.solution.join(" ")}`);
      boards.push(made);
    }
    for (const a of gameAnswers) usedAnswers.add(a);

    const game: PuzzleGame = {
      id,
      title: `Game ${g}`,
      version: 1,
      boardSize: SIZE,
      parMinutes: MODE.parMinutes,
      metas: [],
      boards,
    };
    game.metas = pickMetas(boards, gameAnswers, usedMetas, rng);
    // Re-draw the unlocks until the idealized solve takes 2–4 rotations, like the 5×5 set.
    let solved: number | null = null;
    for (let attempt = 0; attempt < 200; attempt++) {
      assignUnlocks(boards, rng);
      solved = simulateSolve(game);
      if (solved !== null && solved >= 2 && solved <= 4) break;
    }
    console.log(`  solvable in ${solved} rotations`);
    games.push(game);
  }
  return games;
}

function reclue(games: PuzzleGame[]): PuzzleGame[] {
  for (const g of games) {
    const rng = mulberry32(hashString(`${g.id}:clues`));
    for (const b of g.boards) for (const c of b.clues) c.text = clueFor(c.answer, rng) ?? "";
  }
  return games;
}

const games = RECLUE ? reclue(JSON.parse(readFileSync(OUT, "utf8")) as PuzzleGame[]) : generate();

// Written even when clues are missing: the grids took minutes and will not come out the same
// again, so add the clues to scripts/clues.ts and run --reclue.
writeFileSync(OUT, JSON.stringify(games, null, 1) + "\n");
console.log(`wrote ${OUT}`);

const missing = new Map<string, string>();
for (const g of games)
  for (const b of g.boards)
    for (const c of b.clues)
      if (!c.text) missing.set(c.answer, lexicon.find((e) => e.word === c.answer)?.clues[0] ?? "");
if (missing.size > 0) {
  console.error(`\n${missing.size} answers need a clue in scripts/clues.ts, then --reclue:`);
  for (const [w, hint] of [...missing].sort()) console.error(`  ${w}: "${hint}"`);
  process.exit(1);
}

let failed = 0;
for (const g of games)
  for (const b of g.boards)
    for (const c of b.clues)
      if (new RegExp(`\\b${c.answer}\\b`, "i").test(c.text)) {
        console.error(`${g.id}: the clue for ${c.answer} contains it: "${c.text}"`);
        failed++;
      }
for (const report of validatePuzzleSet(games)) {
  for (const e of report.errors) console.error(`${report.id}: ${e}`);
  if (report.errors.length > 0) failed++;
}
process.exit(failed > 0 ? 1 : 0);
