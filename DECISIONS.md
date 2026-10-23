# Decisions

Choices made where the V1 spec was silent, and rules implemented as written but flagged for review.
Section numbers refer to the V1 spec. Sections H and I list rule changes requested after V1; where
they conflict with the spec or with an earlier entry here, the later section wins (I over H).

## A. Rules implemented as written, flagged for review

1. **Per-word validation pulse (required assumption, §3.4).** "A word turns green when filled, correct,
   and the board has been rotated" is implemented as the per-word validation pulse: on every rotation
   (and Final Check), every filled, correct word on all three boards locks. It is not a one-time global
   gate.
2. **Rotation-count unlocks lag one pulse (§3.6.4, §7.2).** The spec orders a rotation as
   pulse → shift → `rotations++`. Unlocks are evaluated inside the pulse, so a `rotations: N` clue
   unlocks at the pulse of rotation N + 1 (or at a Final Check after N rotations), not at rotation N.
   The phone can therefore show `Unlocks at 3 rotations (now 3)` while the clue is still locked. That
   matches how `solvedCount` behaves: the count is reached, and the unlock waits for the next pulse. If the intent is "unlock at rotation N", increment `rotations` before
   calling `runPulse` in `completeRotation` (`src/game/rotation.ts`). The unit test
   `evaluates rotation unlocks in the pulse before the rotation counter increments` pins the current
   behavior. The validator's solvability result is the same under both readings (all 10 games:
   2–4 rotations).
3. **The second unlock pass is a no-op today (§3.5.3 c).** No unlock condition depends on other
   unlocks (`crossLetter` reads entries, `rotations` reads the counter, `solvedCount` reads locked
   words), so the cascade pass cannot change anything with the current rule types. It is kept for
   future rule types. Locks made in the same pulse do cascade into unlocks, because step (b) runs on
   the post-lock state; that is what the unit test covers.
4. **Master idle timeout is a no-op for one player (§3.7).** With one active player, mastership
   cannot pass, so the idle and inactivity rules change nothing in V1. They are implemented and
   unit-tested for V1.5.

## B. Stack and infrastructure

1. **Versions.** Next.js 16.4 (App Router, Turbopack), React 19, TypeScript 5.9 strict. TypeScript 7
   was not used.
2. **Storage abstraction.** All Redis access goes through `src/server/store.ts`, a small command set
   (GET, SET NX/PX/EX, DEL, HGETALL, HSET, HDEL, SMEMBERS, SADD, SREM, EXPIRE), pipelined or in MULTI.
   Production uses `@upstash/redis` with `automaticDeserialization: false`. An in-process store is
   used when `XW_STORE=memory`, or when the Upstash variables are missing outside production. It works
   only in a single process (local development, E2E), never on Vercel. A production server without
   the Upstash variables fails with an error instead of falling back.
   The Vercel Marketplace names `KV_REST_API_URL` and `KV_REST_API_TOKEN` are accepted as fallbacks
   (the same order `@upstash/redis` uses in `Redis.fromEnv()`), values are trimmed, and a
   `redis://` / `rediss://` connection string in the URL variable is rejected with a clear message.
3. **The in-process store seeds itself** at first use, because it starts empty on every boot. Upstash
   is never auto-seeded: run `POST /api/admin/seed` once.
4. **Extra keys and fields (§7.1).** `puzzles:index` (`{format, puzzles: [{id, title}]}`) backs
   `GET /api/puzzles`; puzzles seeded with an older `format` count as not seeded. Meta answers live in
   the solution key as `metaAnswers` (id → answer), because the public puzzle must not contain any
   answer. The room meta hash adds `createdAt`, `result` (the score, frozen when the game ends) and
   `metaSolved` (JSON, replacing `metaSolvedAt`). Added in I: `room:{rid}:b:{n}:authors` (cell →
   player id who typed it) and `room:{rid}:pstats` (player id → per-player stats JSON). Removed with
   Check Cells: `room:{rid}:b:{n}:red` and the token fields.
5. **Version bumps.** Saves run under the room lock and write `SET version n+1` inside the same MULTI
   as the diff. Under the lock this is equivalent to `INCR`.
6. **TTL.** Every save refreshes `EXPIRE roomTtlSeconds` on every room key, so a room expires 24 hours
   after its last change. Puzzle keys have no TTL. The lock key has its own `PX 2000`.
7. **Lock.** `SET NX PX 2000` with 3 retries at 100, 200 and 300 ms. If the lock is not acquired,
   polls proceed read-only (as specified) and mutations fail with `BUSY` (503). Release is
   compare-and-delete (Lua `EVAL` on Upstash). Phones also send mutations one at a time to keep
   contention low.
8. **Diff-based saves.** A route loads the whole room in one pipeline, runs a pure rule function, and
   writes only the changed hash fields and set members in one MULTI. A request that changes nothing
   does not bump the version.
9. **Activity tracking.** `GET /state` records `lastSeen` and `activeSeconds` with a single `HSET` of
   the player's own record, outside the lock and without a version bump. Otherwise every poll would
   change the version and `304` would never happen. Mutations do not update `lastSeen`; the phone
   polls every second anyway.
10. **Polling fast path.** `GET /state` and `GET /host` first read only `version`, the meta hash and
    the players hash. They take the lock and load the full room only when a due transition would
    change state (`hasDueTransition`) or when the version moved.
11. **Config overrides.** `XW_CONFIG_OVERRIDES` (JSON of numbers) overrides `CONFIG_V1` on the server
    only. The E2E test uses it to shorten the cooldown. Client-side values (poll intervals, seating
    flash) always come from `CONFIG_V1`.
12. **Puzzle cache.** Each server instance caches loaded puzzles in memory; puzzles do not change
    during V1.
13. **`AGENTS.md`** is generated by `next dev` (Next.js 16.4) and is committed to keep the tree clean.

## C. API

1. **Additional error codes.** `BAD_REQUEST` (400) for malformed input, black cells or non-letters;
   `UNAUTHORIZED` (401) for the seed route; `ROOM_FULL` (409); `BUSY` (503); `STORE_NOT_CONFIGURED`
   (503, names the missing or malformed variable); `STORE_UNAVAILABLE` (503, wrong token, read-only
   token, unreachable URL); `SERVER_ERROR` (500, with no internal details in the body). Raw Upstash
   errors are never returned or logged in full: their message embeds the request body
   (`command was: …`), which for the seed route contains solutions. They are classified into a fixed
   message and logged with the body stripped. Status codes for the spec's codes: `NOT_FOUND` 404,
   `NOT_IN_ROOM` and `NOT_MASTER` 403, all other rule rejections 409.
2. **Check Cells was removed (I.6)**, with its route, tokens and red marks.
3. **Rotating while a rotation is pending** returns `COOLDOWN`.
4. **Mutation responses include `version`,** so the phone can reconcile optimistic letters.
5. **Player ids.** `playerId` must match `^[A-Za-z0-9-]{8,64}$`; the server generates a UUID when it is
   null. Joining with a known id reclaims the seat (name optional). A new player needs a name
   (whitespace collapsed, max 16 characters). New players cannot join an ended game.
6. **Seed route** requires `ADMIN_SEED_SECRET` to be set and compares the header in constant time.
   Re-seeding overwrites the puzzle keys (idempotent).
7. **Room codes** are matched case-insensitively.
8. **`GET /api/health`** reports the store in use, which configuration variables are present
   (booleans only, never values), whether the database answers, and how many puzzles are seeded.
   It returns 503 until the database is reachable and seeded.

## D. Game-rule details the spec left open

1. **In multiplayer the first rotation waits one cooldown.** Starting the timer sets
   `cooldownUntil = start + cooldown`, so the Capt. cannot rotate (and unlock rotation clues) in the
   first 20 seconds. Single player has no cooldown (H.4).
2. **Late joiners** may take a free seat while a game is running (up to 3 players).
3. **Initial master** is the first player to join (V1: the only player).
4. **Seat assignment** is the first free seat, in join order (seats 0, 1, 2). The V2 spacing table is
   not implemented.
5. **Final Check** does not change the master and is allowed only when no rotation is pending.
6. **Tile authorship.** Each cell remembers who typed its current letter; clearing a cell clears it,
   and retyping the same letter changes nothing.
7. **Suspect marks.** Marking an already-marked cell is a no-op (no double count). Removing a mark and
   marking again counts again. `accurateSuspects` counts marks on cells holding a wrong letter; empty
   cells count as neither false nor accurate.
8. **Meta.** See H.1–H.3. A guess counts when it was made at or before `endedAt`. An answer is sent to
   clients once its word is solved or once the game has ended. Empty guesses (after normalization)
   are rejected without using a guess.
9. **Scoring.**
   - `effPlayers` is floored at 1. With one player it is exactly 1, as the spec states. Without the
     floor, time spent with the tab hidden would lower `effPlayers` and lengthen par.
   - Each component is rounded to one decimal; the total is their sum; the grade uses that total.
   - The result is computed once, when the game ends, and stored.
10. **Ended games** reject cell, suspect, check, rotate and meta requests (`GAME_ENDED`).

## E. Views and security

1. **`readyPids` became `readySeats`.** A player id is the only credential a player has. Sending ids
   on the unauthenticated host view would let anyone with the room code act as that player.
2. **`canFinalCheck`** means "every cell on every board is filled and you are master". It does not
   include the cooldown, because views are cached by version and a time-based flag would go stale.
   The phone disables the button until the cooldown ends, as it does for ⟲ and ⟳.
3. **Extra view fields:** `rid`, `puzzleTitle`, `board.lockedCount`/`totalCount`,
   `board.metaCells`, `meta.words` (per word: number, slots, solved/auto-completed, points),
   `meta.pointsNow`, `meta.guessesLeftBySeat`, `you.canGuess`/`you.guess`, `result.details` (time, par,
   false suspects, per-word meta results), `result.players`/`mvps`/`leaderboard` (I.5),
   and on the host view `masterName` and `players` (names, seats, ready, Capt.). The host view never
   contains board letters.
4. **Host view rotation previews** (`nextIfLeft`/`nextIfRight`, `pending.youReceive`) are computed for
   the master's seat.
5. **Masked clue text** is generated on the server for every clue that is neither unlocked nor locked
   green. A 1e-9 epsilon guards `ceil` against float noise (10 × (1 − 0.7) = 3.0000000000000004).
6. **No source maps in the browser** (`productionBrowserSourceMaps: false`), and `npm run check:leaks`
   scans the built client output for answers, solution rows and clue text. Three-letter answers are
   not scanned as quoted strings because they collide with code tokens such as `"GET"`.

## F. Phone and host UI

1. **Keyboard tap targets (spec conflict).** A 10-key QWERTY row cannot have 44 px wide keys at a
   360 px viewport (36 px is the maximum). Keys are 46 px tall, and each key's hit area spans its full
   share of the row with no dead gaps. All other controls, including grid cells, are at least
   44×44 px.
2. **The current-clue bar** has ‹ and › to move between clues. (It used to hold the Check button,
   removed in I.6.)
3. **Typing** advances to the next non-locked cell in the word and stays on the last cell at the end
   of the word. Typing on a locked cell writes into the next non-locked cell of the word. Tab and
   Shift+Tab move between clues on desktop.
4. **The rotation banner** overlays the top header row during the countdown; input stays enabled.
5. **Seating flash** is shown on the phone whenever the rotation count increases.
6. **"Animate green once"** compares the board's locked cells with the last time this phone saw that
   board, so words locked while the board was elsewhere animate on arrival.
7. **The host screen** cannot start the game (it has no player id). It shows that the master starts
   from their phone, and its join link also serves single-device play.
8. **Reload.** The phone remembers that it joined a room (`localStorage["xw:joined:<rid>"]`) and
   rejoins with its stored id. If storage is unavailable, the id is kept in `?pid=` and the player
   re-enters a name, which reclaims the same seat.
9. **Light theme only.**

## G. Validator and tests

1. **Validator extras (§6.1).** Each clue's run must be bounded by black cells or the edge, and clue
   text must be non-empty. An answer reused in another game is a warning, not an error.
2. **Solvability** uses the real engine (`runPulse`) rather than a separate model, so the validator
   and the game cannot disagree.
3. **Measured solve lengths.** Idealized model (every unlocked clue solved before each pulse):
   2–4 rotations. A scripted single player who fills only clues it can read, one board at a time,
   always rotating ⟲: 5–7 rotations for all 10 games.
4. **Upstash adapter coverage.** `scripts/upstash-shim.ts` is a minimal Upstash-REST-compatible proxy
   in front of a real Redis. CI starts Redis and the shim and runs the store contract and repository
   tests against both the in-process store and the real `@upstash/redis` client.
5. **E2E** runs `next start` with the in-process store, a 1.5 s cooldown and a 1.5 s warning.
   - Single player: reloads mid-game, opens the meta panel and types without clicking the field (the
     focus bug), uses the one guess, checks the scorecard, and asserts that recorded API responses
     never contain a clue answer, a solution grid, the text of a locked clue, or a meta answer before
     it is obtained.
   - Two players: both join and ready, each fills the board at their seat, one spends their guess,
     the Capt. rotates (the other phone sees the warning), the Capt. role passes, the game ends when
     all meta words are obtained, and both phones and the host show the MVPs, leaderboard and
     scorecards without any player id.

## H. Rule changes requested after V1

These supersede the spec's §3.10, §4, §3.6 cooldown and the `meta`/`shaded` fields of §6. Items 2,
3 and 5 are partly superseded by section I.

1. **Five meta words per game, of lengths 3, 4, 5, 6 and 7.** The 6-letter word is the game's
   original meta (same cells). The other four were generated by `scripts/generate-metas.ts` from a
   list of common words: deterministic per game id, letters drawn from all three boards, no cell
   shared between words, and no word equal to any clue answer in the set. Puzzle file:
   `metas: [{ id, answer, enumeration, cells: [[board, row, col], …] }]`; `meta` and `shaded` are gone.
   The validator enforces 5 words, distinct lengths, correct spelling, open and unshared cells, every
   board used, and no clash with a clue answer.
2. **One guess box, 3 wrong guesses shared by all words.** A guess is compared with every unsolved
   word. A miss costs one shared wrong guess; a hit costs nothing; re-guessing a solved word is free.
3. **Meta scoring.** Each word is worth 7 points (5 × 7 = 35), minus 10% of that per rotation made
   before the guess, never below 10% (0.7). Final Check does not count as a rotation. When the game
   ends, unguessed words are revealed ("auto-completed") for 0 points.
4. **Cooldowns.** Single player: no cooldown, and ⟲/⟳ validate and swap immediately (no 3-second
   warning; the seating flash still shows). Multiplayer: the cooldown starts at 20 s and each rotation
   makes the next one 1 s shorter (`cooldownMs − cooldownStepMs × rotations`, floor `cooldownMinMs`
   = 0). The 3-second warning stays in multiplayer.
5. **Score: Time 50 · Metas 35 · Suspects 15.** Check tokens are no longer scored (still 2 per player,
   reported on the results screen as "not scored"). S\* needs ≥ 95, 0 false suspects and all 5 words
   guessed (the "0 tokens spent" condition is gone).
6. **Par is 5 minutes** for the three 5×5 boards (`parMinutes: 5` in the puzzle file).
7. **"Capt." replaces "master" in all user-facing text,** in red. Internal identifiers (`masterPid`,
   `isMaster`, `NOT_MASTER`) keep the spec's names.
8. **Rotate buttons show the board they bring** (`⟲ 🌵`, `⟳ 🐙`). The seating button uses a folded-map
   icon (inline SVG) instead of the 🗺 world-map emoji.
9. **Meta cells** are circled in their word's color and carry the word number (1–5) in the corner, so
   color is never the only cue. The phone's meta bar shows one compact chip per word (e.g. `C__N`) and
   opens the meta panel.
10. **Meta field bug.** The dialog component re-ran its focus effect on every render (each keystroke
    and each 1-second poll passed a new `onClose`), pulling focus off the guess field, so only the
    first letter registered. It now focuses the first field once when it opens and never takes focus
    back from inside the dialog.

## I. Rule changes requested after V1 (second round)

1. **The game ends when all 5 meta words are obtained**, not when every clue is locked. A word is
   obtained by a correct guess, or during a pulse once every one of its cells is locked green.
   Solving every clue still obtains every word, so the old ending is a special case. The validator's
   solvability rule still requires every clue to be reachable.
2. **One guess per player per game.** The guess is checked against every word not yet obtained.
   Right or wrong, it is used up; the field is then disabled. Completing a word with tiles never uses
   a guess. An empty guess, or a guess of a word that is already obtained (and therefore fully shown),
   is rejected without using it. The team-wide "3 wrong guesses" rule is gone.
3. **Every meta word scores when it is obtained,** by guess or by tiles: 7 points minus 10% per
   rotation made before it was obtained (floor 0.7). A word obtained by tiles during a rotation's
   pulse uses the count before that rotation, like the clue unlocks (A.2). Nothing is auto-completed
   for 0 any more.
4. **S\*** needs a total of at least 95 and 0 false suspects (every word is obtained by the end).
5. **Scorecards, board MVPs and the tiles leaderboard,** computed once when the game ends:
   - A **tile** is a locked cell, credited to the player who typed the letter it holds. Wrong and
     overwritten letters earn nothing.
   - **Scorecard** per player: tiles (total and per board), letters typed, rotations made as Capt.,
     accurate and false suspect marks, their guess and its points, active time.
   - **Board MVP:** the player with the most tiles on that board; ties share it; a board with no
     credited tiles has none.
   - **Leaderboard:** players by tiles, most first (seat breaks ties).
   - Players are identified by seat and name in results, never by player id. The phone shows "Your
     scorecard" alone in single player; with 2–3 players it shows MVPs, leaderboard and every card
     (yours first). The host shows them all.
   - Per-player stats live in their own hash, written only under the room lock: the player record is
     rewritten by every poll outside the lock, which would race with stat increments.
   - The Capt.'s rotation count is credited before the rotation's pulse, so a rotation that ends the
     game is counted.
6. **Check Cells is removed:** route, rule, tokens, red marks and the button. **Final Check** (a pulse
   without rotating once every cell is filled) is a different feature and stays.
7. **Multiplayer is on: up to 3 players,** one per board, joining in seat order. The shrinking
   multiplayer cooldown (H.4), the 3-second warning, the Capt. hand-off after each rotation (§3.7),
   per-player Ready and the Capt.'s Start now all apply. `par` uses `effPlayers` (§4), so two
   always-active players get par 5 × √½ ≈ 3:32.
8. **Dark mode:** a theme button (🌓 Auto → ☀️ Light → 🌙 Dark) on the home page, the host header,
   the lobby and the phone's seating panel. Auto follows the system setting. The choice is stored per
   device (`localStorage["xw:theme"]`) and applied by a tiny inline script before the first paint, so
   pages never flash the wrong theme. All colors are theme tokens; dark text colors were chosen for
   contrast (for example green text is lighter than the green tile fill). The QR code keeps a white
   background so phones can scan it.
