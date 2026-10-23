# Rotating Co-op Crossword (V1)

A ring of three 5×5 mini crosswords that rotate around the table. Words lock green only when the
ring rotates; some clues stay hidden until a letter on another board is confirmed, enough rotations
happen, or enough words are solved. Shaded cells spell a 6-letter meta word.

V1 is single player: one player in seat 0, three boards, ten pre-built games
(`data/puzzles-v1.json`). The server keeps all state (seats, board master, versioned polling), so
V1.5 multiplayer can build on it. Choices made where the spec was silent are listed in
[`DECISIONS.md`](DECISIONS.md).

## Quick start (no Redis needed)

```bash
npm install
npm run dev            # http://localhost:3000, in-process store, auto-seeded
```

Open `/`, pick a game, then open the join link (or scan the QR code) on a phone or the same device.

## Environment

| Variable                   | Example                        | Purpose                                                     |
| -------------------------- | ------------------------------ | ----------------------------------------------------------- |
| `UPSTASH_REDIS_REST_URL`   | `https://<your-db>.upstash.io` | Upstash REST endpoint (server only)                         |
| `UPSTASH_REDIS_REST_TOKEN` | `<token>`                      | Upstash token (server only)                                 |
| `ADMIN_SEED_SECRET`        | `change-me`                    | Protects `POST /api/admin/seed`                             |
| `XW_STORE`                 | `memory`                       | Optional: force the in-process store (single process only)  |
| `XW_CONFIG_OVERRIDES`      | `{"cooldownMs":1500}`          | Optional: override numeric `CONFIG_V1` values on the server |

Without the Upstash variables, `next dev` uses the in-process store. A production server
(`NODE_ENV=production`) answers API requests with a server error until they are set, unless
`XW_STORE=memory` is set.

## Deploy to Vercel

1. Create an Upstash Redis database and set the three variables above in the Vercel project.
2. Deploy.
3. Seed the puzzles once (idempotent):

   ```bash
   curl -X POST https://<your-app>.vercel.app/api/admin/seed -H "x-seed-secret: change-me"
   ```

Rooms expire 24 hours after their last change. Puzzle keys do not expire.

## Scripts

| Command                                                       | What it does                                                             |
| ------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `npm run dev`                                                 | Next.js dev server                                                       |
| `npm run build` / `npm start`                                 | Production build and server                                              |
| `npm test`                                                    | Vitest: rule engine, scoring, validator, store contract, room repository |
| `npm run test:e2e`                                            | Playwright happy path (run `npm run build` first)                        |
| `npm run validate:puzzles`                                    | Validates `data/puzzles-v1.json` against spec §6.1 (exit 1 on failure)   |
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
data/puzzles-v1.json        10 games (server only: contains answers)
src/config.ts               CONFIG_V1 — every rule reads from it
src/game/                   Pure, synchronous rule engine (no I/O) and its tests
  pulse.ts rotation.ts      Validation pulse, rotation, Final Check
  entry.ts check.ts         Typing, Check Cells
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
scripts/                    Validator, leak checker, Upstash shim
```

Each request loads the room, applies due transitions (rotation, master hand-off), runs one pure rule
function, and writes the diff in one `MULTI` under a per-room `SET NX PX` lock. Polls send
`?since=<version>` and get `304` until something changes.
