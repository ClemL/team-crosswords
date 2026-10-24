# Team Crossword

A ring of mini crosswords, one per player, that rotate around the table, in three modes:

| Mode | Boards    | Players | Meta words        | Time                 | Games                  |
| ---- | --------- | ------- | ----------------- | -------------------- | ---------------------- |
| 5×   | five 5×5  | 1–5     | 5, of 3–7 letters | par 5 min            | `data/puzzles-v1.json` |
| 6×   | six 6×6   | 1–6     | 6, of 3–8 letters | par 6 min            | `data/puzzles-6x.json` |
| 7×   | seven 7×7 | 1–7     | 7, of 3–9 letters | par and limit, 7 min | `data/puzzles-7x.json` |

Words lock green only when the ring rotates, and a board whose words are all green leaves the ring.
Some clues stay hidden until a letter on another board is confirmed, enough rotations happen, or
enough words are solved. Circled cells spell the meta words; the game ends when all are obtained, by
completing their tiles or by guessing. Alone, you can guess until a guess is wrong; with others, each
player gets one guess and a wrong one knocks them out. In 7× mode the game also ends when its
7-minute limit runs out, and the score is then the number of meta words obtained. The 6× and 7× meta
words come from the themed answers of the sibling crossword app. The results show scorecards (with the wrong letters each player passed
on at rotations), an MVP per board and a tiles leaderboard. The Capt. can end a round and restart
it. Portrait phones only; light, dark or automatic theme; normal, cosy or compact display size.

Up to one player per board (5, 6 or 7 by mode), ten pre-built games per mode. The server keeps all state
(seats, the Capt., versioned polling). Choices made where the spec was silent, and the rule changes
made since V1, are listed in [`DECISIONS.md`](DECISIONS.md).

## Quick start (no Redis needed)

```bash
npm install
npm run dev            # http://localhost:3000, in-process store, auto-seeded
```

Open `/`, pick a mode and a game, then open the join link (or scan the QR code) on a phone or the same device.

## Environment

| Variable                   | Example                        | Purpose                                                              |
| -------------------------- | ------------------------------ | -------------------------------------------------------------------- |
| `UPSTASH_REDIS_REST_URL`   | `https://<your-db>.upstash.io` | Upstash REST endpoint (server only; `KV_REST_API_URL` also accepted) |
| `UPSTASH_REDIS_REST_TOKEN` | `<token>`                      | Upstash token (server only; `KV_REST_API_TOKEN` also accepted)       |
| `ADMIN_SEED_SECRET`        | `change-me`                    | Protects `POST /api/admin/seed`                                      |
| `XW_STORE`                 | `memory`                       | Optional: force the in-process store (single process only)           |
| `XW_CONFIG_OVERRIDES`      | `{"cooldownMs":1500}`          | Optional: override numeric `CONFIG_V1` values on the server          |

Without the Upstash variables, `next dev` uses the in-process store. A production server
(`NODE_ENV=production`) answers API requests with a server error until they are set, unless
`XW_STORE=memory` is set.

## Deploy to Vercel

1. Create an Upstash Redis database and set the database variables plus `ADMIN_SEED_SECRET` in the
   Vercel project. If you connected Upstash through the Vercel Marketplace, it already created
   `KV_REST_API_URL` and `KV_REST_API_TOKEN`; the app accepts those names as well. Use the REST URL
   (`https://…upstash.io`) and the read/write token, not `REDIS_URL` or the read-only token.
2. Redeploy. Environment variable changes only apply to new deployments.
3. Open `https://<your-app>.vercel.app/api/health`. It reports which variables are present (never
   their values), whether the database answers, and whether the puzzles are seeded.
4. Seed the puzzles once (idempotent):

   ```bash
   curl -X POST https://<your-app>.vercel.app/api/admin/seed -H "x-seed-secret: change-me"
   ```

5. `/api/health` should now return `"ok": true` with `"puzzlesSeeded": 30`. After an update that
   changes the stored puzzle format, it reports a stale seed until you seed again.

Rooms expire 24 hours after their last change. Puzzle keys do not expire. Server-side errors are
logged under the deployment's Runtime Logs with a `[store]` or `[api]` prefix.

## Scripts

| Command                                                       | What it does                                                             |
| ------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `npm run dev`                                                 | Next.js dev server                                                       |
| `npm run build` / `npm start`                                 | Production build and server                                              |
| `npm test`                                                    | Vitest: rule engine, scoring, validator, store contract, room repository |
| `npm run test:e2e`                                            | Playwright happy path (run `npm run build` first)                        |
| `npm run validate:puzzles`                                    | Validates both puzzle files against spec §6.1 (exit 1 on failure)        |
| `npm run check:leaks`                                         | After a build, fails if client output contains answers or clue text      |
| `npm run lint` / `npm run format:check` / `npm run typecheck` | ESLint, Prettier, `tsc`                                                  |
| `npm run shim:upstash`                                        | Upstash-REST-compatible proxy in front of a local Redis (see below)      |

### Running against a real Redis locally

```bash
redis-server --port 6379 &
REDIS_URL=redis://127.0.0.1:6379 SHIM_PORT=8079 SHIM_TOKEN=dev npm run shim:upstash &
UPSTASH_REDIS_REST_URL=http://127.0.0.1:8079 UPSTASH_REDIS_REST_TOKEN=dev ADMIN_SEED_SECRET=dev npm run dev
# Store tests against the real @upstash/redis client:
XW_TEST_UPSTASH_URL=http://127.0.0.1:8079 XW_TEST_UPSTASH_TOKEN=dev npm test
```

## Layout

```
data/puzzles-v1.json        10 5× games (server only: contains answers)
data/puzzles-6x.json        10 6× games (server only: contains answers)
data/puzzles-7x.json        10 7× games (server only: contains answers)
src/config.ts               CONFIG_V1 — every rule reads from it
src/game/                   Pure, synchronous rule engine (no I/O) and its tests
  pulse.ts rotation.ts      Validation pulse, rotation, Final Check
  entry.ts end.ts           Typing (with tile authorship), game end, scorecards, MVPs
  suspect.ts meta.ts        Suspect marks, meta word
  master.ts transitions.ts  Board master selection, lazy transitions (§7.2)
  score.ts mask.ts          Scoring and grades, clue masking
  views.ts                  PlayerView / HostView builders (strip all secrets)
  validate.ts               Puzzle validator (used by scripts/validate-puzzles.ts)
src/server/                 Redis layout, store adapters, lock, room repository, room service
src/app/api/                Route handlers (§7.4)
src/app/{page,host,play}    Puzzle picker, host screen, phone
src/components/             UI components
e2e/                        Playwright test and its test-only fixture
scripts/                    Validator, leak checker, Upstash shim, meta word and 6×/7× generators
```

Each request loads the room, applies due transitions (rotation, master hand-off), runs one pure rule
function, and writes the diff in one `MULTI` under a per-room `SET NX PX` lock. Polls send
`?since=<version>` and get `304` until something changes.
