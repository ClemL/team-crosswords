// One-off generator (kept for reproducibility) for the puzzle sets: ten games per mode, each of
// MODES[mode].boards N×N boards (one per player) with N meta words of 3 to N + 2 letters. Fresh
// 6× and 7× meta words are drawn from the crossword-app themed answers.
//
// It borrows crossword-app's lexicon, grid and filler, so it needs a checkout of that repository
// (with its dictionary cache, fetched on first run):
//
//   npx tsx scripts/generate-games.ts --mode=5x|6x|7x [--xw=../crossword-app] [--out=…]
//                                     [--extend | --reclue]
//
// Fills are time-boxed, so a run on another machine can produce different grids; the committed
// file is the source of truth. --extend keeps every board of the existing file and fills new ones
// until each game has the mode's board count; the game keeps its meta words, re-spelled over all
// of its boards, and only the new boards get unlocks (unless the solve then falls out of 2–4
// rotations). It saves after each game and skips games that are already complete, so an
// interrupted run can be started again. --reclue keeps the grids, unlocks, metas and clues, and
// only fills in the clues that are empty. Clues come from scripts/clues.ts first, then
// crossword-app's hand-written clues, then the clue the answer already has in a committed puzzle
// file; the run fails and lists any answer that has none.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { MODES, type Mode } from "../src/config";
import { cellKey } from "../src/game/puzzle";
import { hashString, mulberry32 } from "../src/game/rng";
import type { PuzzleBoard, PuzzleClue, PuzzleGame, UnlockRule } from "../src/game/types";
import { simulateSolve, validatePuzzleSet } from "../src/game/validate";
import { BLOCKED, CLUES, EXTRA_THREES } from "./clues";

const arg = (name: string, fallback: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const XW = path.resolve(arg("xw", "../crossword-app"));
const MODE_ID = arg("mode", "6x") as Mode;
if (!(MODE_ID in MODES)) throw new Error(`--mode must be one of ${Object.keys(MODES).join(", ")}`);
const DATA_FILES: Record<Mode, string> = {
  "5x": "data/puzzles-v1.json",
  "6x": "data/puzzles-6x.json",
  "7x": "data/puzzles-7x.json",
};
const OUT = path.resolve(arg("out", DATA_FILES[MODE_ID]));
const RECLUE = process.argv.includes("--reclue");
const EXTEND = process.argv.includes("--extend");
const MODE = MODES[MODE_ID];
const SIZE = MODE.boardSize;
const GAMES = 10;
const BOARDS = MODE.boards;

type Entry = { word: string; clues: string[]; tier: number; rank: number; derived?: boolean };
type Slot = { dir: "across" | "down"; number: number; cells: number[] };
type Fill = { entries: Entry[]; letters: string[] };

const lib = (f: string) => import(pathToFileURL(path.join(XW, "scripts", "lib", f)).href);
const { buildLexicon, indexLexicon, THEME_SETS, TIER } = await lib("lexicon.mjs");
const { analyze, isValidPattern } = await lib("grid.mjs");
const { createFiller } = await lib("fill.mjs");

// ---- Vocabulary ---------------------------------------------------------------------------

// Three-letter fill is the most visible, so it must have a hand-written clue: a curated word, or
// one of EXTRA_THREES. Longer entries may come from the frequency list (up to "familiar"), and
// every one of those is clued by hand.
const lexicon = (await buildLexicon({ maxTier: TIER.UNCOMMON })) as Entry[];
const blocked = new Set(BLOCKED);
const extraThrees = new Set(EXTRA_THREES);
const fillWords = lexicon.filter(
  (e) =>
    !e.derived &&
    !blocked.has(e.word) &&
    e.word.length <= SIZE &&
    (e.word.length === 3
      ? e.tier === TIER.CURATED || extraThrees.has(e.word)
      : e.tier <= TIER.FAMILIAR),
);
const curated = new Map(
  lexicon.filter((e) => e.tier === TIER.CURATED).map((e) => [e.word, e.clues] as const),
);
// The clue each answer already has in a committed puzzle file (the 5× clues were written by hand).
const known = new Map<string, string>();
for (const file of Object.values(DATA_FILES))
  for (const g of JSON.parse(readFileSync(path.resolve(file), "utf8")) as PuzzleGame[])
    for (const b of g.boards)
      for (const c of b.clues) if (c.text && !known.has(c.answer)) known.set(c.answer, c.text);

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
 * Which patterns fill with everyday vocabulary. A 5×5 takes 4 or 6 blocks, like the hand-made
 * set. Measured: a 6×6 with 4 or 6 blocks never did, every 10-block and some 8-block ones did. A
 * 7×7 filled only in the classic 8-block, 22-entry layout (in under a second); all 51 patterns of
 * 14–16 entries failed, and with rarer 6- and 7-letter words allowed only 1 of 30 filled, with a
 * name in it. So every 7×7 board uses it.
 */
const PATTERN_RULES: Record<Mode, { blocks: number[]; minSlots: number }> = {
  "5x": { blocks: [4, 6], minSlots: 0 },
  "6x": { blocks: [8, 10], minSlots: 0 },
  "7x": { blocks: [8], minSlots: 22 },
};

/**
 * Every 180°-symmetric pattern with runs of 3+ that meets the mode's rule: blocks come in mirrored
 * pairs, plus the centre cell of an odd grid.
 */
function patterns(): Uint8Array[] {
  const { blocks: counts, minSlots } = PATTERN_RULES[MODE_ID];
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

/** `discourage`: words the filler takes only after every other candidate (it ranks by tier). */
function fillBoard(
  blocks: Uint8Array,
  exclude: Set<string>,
  seed: number,
  discourage: Set<string> = new Set(),
): Fill | null {
  const words = fillWords
    .filter((e) => !exclude.has(e.word))
    .map((e) => (discourage.has(e.word) ? { ...e, tier: e.tier + 5 } : e));
  const filler = createFiller(indexLexicon(words));
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
  return CLUES[word] ?? pick ?? known.get(word) ?? null;
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
 * board, one on a rotation count and the rest on a solved count. Only `targets` get new unlocks.
 */
function assignUnlocks(boards: PuzzleBoard[], targets: PuzzleBoard[], rng: () => number): void {
  const total = boards.reduce((n, b) => n + b.clues.length, 0);
  for (const board of targets) {
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

/**
 * Re-draws the unlocks of `targets` until the idealized solve takes 2–4 rotations, like the 5×5
 * set; if that never happens, every board's unlocks are re-drawn instead.
 */
function drawUnlocks(game: PuzzleGame, targets: PuzzleBoard[], rng: () => number): void {
  let solved: number | null = null;
  for (let attempt = 0; attempt < 400; attempt++) {
    assignUnlocks(game.boards, attempt < 200 ? targets : game.boards, rng);
    solved = simulateSolve(game);
    if (solved !== null && solved >= 2 && solved <= 4) break;
  }
  console.log(`  solvable in ${solved} rotations`);
}

// ---- Meta words ---------------------------------------------------------------------------

type Spot = { board: number; r: number; c: number; letter: string };
const spotKey = (s: Spot) => `${s.board}:${cellKey(s.r, s.c)}`;

function openSpots(boards: PuzzleBoard[]): Spot[] {
  return boards.flatMap((b) =>
    b.solution.flatMap((row, r) =>
      [...row].flatMap((letter, c) => (letter === "#" ? [] : [{ board: b.index, r, c, letter }])),
    ),
  );
}

/**
 * Assigns a distinct unused cell to each letter so that the word uses every board or, when it is
 * shorter than the ring, as many boards as it has letters. A bounded search: each letter tries
 * boards the word has not used yet first, so the letters spread around the ring.
 */
function place(word: string, spots: Spot[], used: Set<string>, rng: () => number): Spot[] | null {
  const need = Math.min(BOARDS, word.length);
  const free = spots.filter((s) => !used.has(spotKey(s)));
  const out: Spot[] = [];
  const taken = new Set<string>();
  const boardUses = new Map<number, number>();
  let budget = 20_000;
  const visit = (i: number): boolean => {
    if (budget-- <= 0 || boardUses.size + (word.length - i) < need) return false;
    if (i === word.length) return true;
    const options = shuffle(
      free.filter((s) => s.letter === word[i] && !taken.has(spotKey(s))),
      rng,
    ).sort((a, b) => Number(boardUses.has(a.board)) - Number(boardUses.has(b.board)));
    for (const s of options) {
      taken.add(spotKey(s));
      boardUses.set(s.board, (boardUses.get(s.board) ?? 0) + 1);
      out.push(s);
      if (visit(i + 1)) return true;
      out.pop();
      const left = boardUses.get(s.board)! - 1;
      if (left === 0) boardUses.delete(s.board);
      else boardUses.set(s.board, left);
      taken.delete(spotKey(s));
    }
    return false;
  };
  return visit(0) ? out : null;
}

function pickMetas(
  boards: PuzzleBoard[],
  answers: Set<string>,
  usedMetas: Set<string>,
  rng: () => number,
): PuzzleGame["metas"] {
  const spots = openSpots(boards);
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
    for (const s of hit.cells) used.add(spotKey(s));
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

/** Spells a game's meta words again over all of its boards: same words, new cells. */
function respellMetas(game: PuzzleGame, rng: () => number): void {
  const spots = openSpots(game.boards);
  // Longest first: it has the fewest ways to fit.
  const order = [...game.metas].sort((a, b) => b.answer.length - a.answer.length);
  for (let attempt = 0; attempt < 50; attempt++) {
    const used = new Set<string>();
    const cells = new Map<string, Spot[]>();
    for (const m of order) {
      const hit = place(m.answer, spots, used, rng);
      if (!hit) break;
      for (const s of hit) used.add(spotKey(s));
      cells.set(m.id, hit);
    }
    if (cells.size < order.length) continue;
    for (const m of game.metas)
      m.cells = cells.get(m.id)!.map((s) => [s.board, s.r, s.c] as [number, number, number]);
    console.log(`  metas: ${game.metas.map((m) => m.answer).join(", ")}`);
    return;
  }
  throw new Error(`${game.id}: the meta words do not fit`);
}

// ---- Games --------------------------------------------------------------------------------

/** What the boards of a whole set share: grid patterns, answers used so far, grids made so far. */
type SetState = { patterns: Uint8Array[]; usedAnswers: Set<string>; seenGrids: Set<string> };

const patternOf = (b: PuzzleBoard) => b.layout.join("").replace(/\./g, "0").replace(/#/g, "1");

/**
 * Fills new boards until `boards` has the mode's board count. No answer repeats within the game
 * (beyond what the mode's repeatLength allows), and none is in `avoid` (the game's meta words).
 */
function fillBoards(
  id: string,
  boards: PuzzleBoard[],
  avoid: Set<string>,
  set: SetState,
  rng: () => number,
): void {
  const gameAnswers = new Set(boards.flatMap((b) => b.clues.map((c) => c.answer)));
  const order = shuffle(set.patterns, rng);
  const usedPatterns = new Set(boards.map(patternOf));
  // First no answer an earlier game used; failing that, earlier games' 3- and 4-letter answers
  // may come back; then any earlier answer. In a mode with a repeatLength, last, answers of that
  // length from this game's other boards may come back too, ranked after every other word. A
  // whole board never comes back.
  const { repeatLength } = MODE;
  const passes: { exclude: () => Set<string>; discourage?: () => Set<string> }[] = [
    { exclude: () => new Set([...set.usedAnswers, ...gameAnswers, ...avoid]) },
    {
      exclude: () =>
        new Set([...[...set.usedAnswers].filter((a) => a.length > 4), ...gameAnswers, ...avoid]),
    },
    { exclude: () => new Set([...gameAnswers, ...avoid]) },
    ...(repeatLength === null
      ? []
      : [
          {
            exclude: () =>
              new Set([...[...gameAnswers].filter((a) => a.length !== repeatLength), ...avoid]),
            discourage: () => new Set(gameAnswers),
          },
        ]),
  ];
  // A game's boards take different patterns where the mode has enough of them (7×7 has one).
  const varied = set.patterns.length >= BOARDS;
  const tries = varied ? order : Array.from({ length: BOARDS }, () => order).flat();
  for (let b = boards.length; b < BOARDS; b++) {
    let made: PuzzleBoard | null = null;
    for (const pass of passes) {
      for (const blocks of tries) {
        if (made) break;
        if (varied && usedPatterns.has(blocks.join(""))) continue;
        const fill = fillBoard(
          blocks,
          pass.exclude(),
          Math.floor(rng() * 1e9),
          pass.discourage?.(),
        );
        if (!fill || set.seenGrids.has(fill.letters.join(""))) continue;
        set.seenGrids.add(fill.letters.join(""));
        usedPatterns.add(blocks.join(""));
        made = toBoard(b, blocks, fill, rng);
      }
      if (made) break;
    }
    if (!made) throw new Error(`${id}: board ${b} did not fill`);
    for (const c of made.clues) gameAnswers.add(c.answer);
    console.log(`  board ${b}: ${made.solution.join(" ")}`);
    boards.push(made);
  }
  for (const a of gameAnswers) set.usedAnswers.add(a);
}

function generate(): PuzzleGame[] {
  const set: SetState = { patterns: patterns(), usedAnswers: new Set(), seenGrids: new Set() };
  const usedMetas = new Set<string>();
  const games: PuzzleGame[] = [];

  for (let g = 1; g <= GAMES; g++) {
    const id = `${MODE_ID}-${String(g).padStart(2, "0")}`;
    const rng = mulberry32(hashString(id));
    console.log(id);
    const boards: PuzzleBoard[] = [];
    fillBoards(id, boards, new Set(), set, rng);
    const game: PuzzleGame = {
      id,
      title: `Game ${g}`,
      version: 1,
      boardSize: SIZE,
      parMinutes: MODE.parMinutes,
      metas: [],
      boards,
    };
    const answers = new Set(boards.flatMap((b) => b.clues.map((c) => c.answer)));
    game.metas = pickMetas(boards, answers, usedMetas, rng);
    drawUnlocks(game, boards, rng);
    games.push(game);
  }
  return games;
}

/**
 * --extend: keeps every board and meta word, and adds boards up to the mode's count. The file is
 * saved after each game, and a game that already has the mode's count is left alone, so an
 * interrupted run picks up where it stopped.
 */
function extend(games: PuzzleGame[]): PuzzleGame[] {
  const set: SetState = {
    patterns: patterns(),
    usedAnswers: new Set(
      games.flatMap((g) => g.boards.flatMap((b) => b.clues.map((c) => c.answer))),
    ),
    seenGrids: new Set(games.flatMap((g) => g.boards.map((b) => b.solution.join("")))),
  };
  for (const game of games) {
    const rng = mulberry32(hashString(`${game.id}:extend`));
    const kept = game.boards.length;
    if (kept > BOARDS) throw new Error(`${game.id}: has ${kept} boards, more than ${BOARDS}`);
    if (kept === BOARDS) continue;
    console.log(game.id);
    fillBoards(game.id, game.boards, new Set(game.metas.map((m) => m.answer)), set, rng);
    respellMetas(game, rng);
    drawUnlocks(game, game.boards.slice(kept), rng);
    save(games);
  }
  return games;
}

/** --reclue: fills in the clues that are empty, leaving every other clue as it is. */
function reclue(games: PuzzleGame[]): PuzzleGame[] {
  for (const g of games) {
    const rng = mulberry32(hashString(`${g.id}:clues`));
    for (const b of g.boards)
      for (const c of b.clues) {
        const text = clueFor(c.answer, rng);
        if (!c.text) c.text = text ?? "";
      }
  }
  return games;
}

const existing = () => JSON.parse(readFileSync(OUT, "utf8")) as PuzzleGame[];
function save(games: PuzzleGame[]): void {
  writeFileSync(OUT, JSON.stringify(games, null, 1) + "\n");
}
const games = RECLUE ? reclue(existing()) : EXTEND ? extend(existing()) : generate();

// Written even when clues are missing: the grids took minutes and will not come out the same
// again, so add the clues to scripts/clues.ts and run --reclue.
save(games);
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
