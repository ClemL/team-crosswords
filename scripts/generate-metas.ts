// One-off generator (kept for reproducibility): gives every game 5 meta words of differing
// lengths (3, 4, 5, 6, 7). The 6-letter word is the game's original meta and keeps its shaded
// cells; the others are common words spelled by open cells spread across all three boards.
// Deterministic per game id. Usage: npx tsx scripts/generate-metas.ts [path]
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { hashString, mulberry32 } from "../src/game/rng";

type LegacyBoard = {
  index: number;
  layout: string[];
  solution: string[];
  shaded?: [number, number][];
  clues: { answer: string }[];
};
type LegacyGame = {
  id: string;
  meta?: { answer: string; enumeration: string };
  metas?: { id: string; answer: string; enumeration: string; cells: [number, number, number][] }[];
  boards: LegacyBoard[];
  [k: string]: unknown;
};

const WORDS: Record<number, string> = {
  3: `ACE AGE AIM AIR ANT APE ARM ART ASK BAG BAT BAY BED BEE BOX BUS CAB CAP CAT COW CUP DAY DOG DOT
      EAR EGG ELF ELM END FAN FIG FIN FOX FUN GEM GUM HAT HEN HOP ICE INK JAM JAR JET JOY KEY KIT LID
      LOG MAP MAT MIX MOP MUD NAP NUT OAK OAR OIL OWL PAN PEA PEN PET PIE PIG POT RAY RIB SEA SKY SUN
      TAP TEA TOE TOY VAN WAX WEB YAK ZIP ZOO`,
  4: `ARCH AUNT BAKE BALL BAND BARN BEAN BEAR BELL BIRD BOAT BONE BOOK CAKE CAMP CARD CAVE CITY CLAY
      COAT CORN DEER DESK DOOR DOVE DRUM DUCK DUSK EAST FERN FISH FLAG FROG GATE GIFT GOAT GOLD HARP
      HILL HOME HORN IRIS KITE LAKE LAMP LEAF LION MILK MINT MOON NEST OVEN PARK PEAR PINE RAIN ROAD
      ROSE SAIL SALT SAND SEED SHIP SNOW SOAP STAR TENT TIDE TREE WAVE WIND WOLF WOOD YARN`,
  5: `ACORN APPLE BEACH BENCH BREAD BRICK CABIN CANOE CHAIR CHALK CLOUD COAST CRANE DAISY DANCE EAGLE
      EARTH FLAME FLUTE GRAPE GRASS HEART HONEY HORSE HOUSE IVORY JEWEL LEMON LIGHT MAPLE MELON MOUSE
      NIGHT NOVEL OCEAN OLIVE ONION OTTER PEACH PEARL PIANO PLANT QUEEN RADIO RIVER ROBIN SALAD SHEEP
      SHELL SNAKE SPOON STAIR STONE STORM SUGAR TIGER TOAST TOWER TRAIN TULIP WATER WHALE WHEAT WORLD`,
  7: `BALLOON BLANKET CHAPTER CHEETAH CHICKEN COMPASS CRYSTAL DIAMOND DOLPHIN FEATHER GALLERY HARVEST
      JOURNEY KITCHEN LANTERN LEOPARD LETTUCE LIBRARY MACHINE MESSAGE MINERAL MORNING MUSTARD ORCHARD
      PAINTER PELICAN PICTURE PILGRIM PIONEER PUMPKIN PYRAMID RAINBOW SANDALS SEASIDE SILENCE SPARROW
      STATION SUNRISE TEACHER THEATER THUNDER TRAILER TRUMPET UNICORN VILLAGE VOLCANO WEATHER WHISTLE`,
};
const lists = Object.fromEntries(
  Object.entries(WORDS).map(([n, s]) => [n, s.trim().split(/\s+/)]),
) as Record<string, string[]>;

type Spot = { board: number; r: number; c: number; letter: string };

function shuffle<T>(items: T[], rng: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Assigns a distinct unused cell to each letter, rotating through boards so every board is used. */
function place(
  word: string,
  spots: Spot[],
  used: Set<string>,
  boards: number,
  rng: () => number,
): Spot[] | null {
  const key = (s: Spot) => `${s.board}:${s.r},${s.c}`;
  const taken = new Set(used);
  const out: Spot[] = [];
  const offset = Math.floor(rng() * boards);
  for (let i = 0; i < word.length; i++) {
    const preferred = (i + offset) % boards;
    const options = spots.filter((s) => s.letter === word[i] && !taken.has(key(s)));
    if (options.length === 0) return null;
    const onBoard = options.filter((s) => s.board === preferred);
    const pick = shuffle(onBoard.length > 0 ? onBoard : options, rng)[0];
    taken.add(key(pick));
    out.push(pick);
  }
  const boardsUsed = new Set(out.map((s) => s.board));
  return boardsUsed.size === Math.min(boards, word.length) ? out : null;
}

const file = path.resolve(process.argv[2] ?? "data/puzzles-v1.json");
const games = JSON.parse(readFileSync(file, "utf8")) as LegacyGame[];
const allAnswers = new Set(
  games.flatMap((g) => g.boards.flatMap((b) => b.clues.map((c) => c.answer))),
);
const usedWords = new Set<string>();

for (const g of games) {
  if (!g.meta) throw new Error(`${g.id}: already converted (no "meta" field)`);
  const sixCells: [number, number, number][] = g.boards.flatMap((b) =>
    (b.shaded ?? []).map(([r, c]) => [b.index, r, c] as [number, number, number]),
  );
  const used = new Set(sixCells.map(([b, r, c]) => `${b}:${r},${c}`));
  usedWords.add(g.meta.answer);
  const spots: Spot[] = g.boards.flatMap((b) =>
    b.solution.flatMap((row, r) =>
      [...row]
        .map((letter, c) => ({ board: b.index, r, c, letter }))
        .filter((s) => s.letter !== "#"),
    ),
  );
  const metas = [{ answer: g.meta.answer, cells: sixCells }];
  for (const length of [7, 5, 4, 3]) {
    const rng = mulberry32(hashString(`${g.id}:${length}`));
    let placed = false;
    for (const word of shuffle(lists[length], rng)) {
      if (allAnswers.has(word) || usedWords.has(word)) continue;
      const cells = place(word, spots, used, g.boards.length, rng);
      if (!cells) continue;
      for (const s of cells) used.add(`${s.board}:${s.r},${s.c}`);
      usedWords.add(word);
      metas.push({ answer: word, cells: cells.map((s) => [s.board, s.r, s.c]) });
      placed = true;
      break;
    }
    if (!placed) throw new Error(`${g.id}: no ${length}-letter word fits`);
  }
  metas.sort((a, b) => a.answer.length - b.answer.length);
  g.metas = metas.map((m, i) => ({
    id: `M${i + 1}`,
    answer: m.answer,
    enumeration: `(${m.answer.length})`,
    cells: m.cells,
  }));
  delete g.meta;
  for (const b of g.boards) delete b.shaded;
  console.log(g.id, g.metas.map((m) => m.answer).join(" "));
}

writeFileSync(file, JSON.stringify(games, null, 1) + "\n");
console.log(`wrote ${file}`);
