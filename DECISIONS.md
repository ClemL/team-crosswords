# Decisions

Choices made where the V1 spec was silent, and rules implemented as written but flagged for review.
Section numbers refer to the V1 spec. Sections H to L list rule changes requested after V1; where
they conflict with the spec or with an earlier entry here, the later section wins (L over K over J
over I over H).

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

## J. Rule changes requested after V1 (third round)

1. **Guesses depend on the number of players** (replaces I.2).
   - **Alone:** guess as often as you like until a guess is wrong. The wrong guess ends your
     guessing, nothing else: you keep playing, and words can still be obtained by tiles.
   - **With others:** one guess each. A right one is used up; a wrong one **knocks you out**. A
     knocked-out player stays in the room as a spectator: they see the board at their seat but
     cannot type, mark cells, guess or be Capt. The Capt. role passes at once if they
     held it. Their active time stops at the knock-out, so `effPlayers` (and par) follow the players
     still in the game; tiles they typed before keep counting.
   - **Everyone knocked out ends the game.** Words not obtained score 0 and, like every answer at
     the end, are revealed (D.8); the results list them as "not obtained".
   - The rule follows the current player count, so a solo player's guesses count toward the one
     multiplayer guess once someone joins. A solo wrong guess made before that is never turned into
     a knock-out.
   - Storage: player stats hold `guesses[]` (a stored `guess` from an older room reads as a
     one-element list). Knock-outs live in the meta hash as `knockedOut` (player id → time), not in
     the stats, because the polling fast path needs them to decide whether the Capt. must be
     replaced (B.10). Views report knock-outs per seat (`out`), never by player id.
2. **Completed boards leave the ring.** Read as: a board (one 5×5 or 6×6 puzzle) whose every word
   is locked green is taken out of the rotating pool at the next rotation, so nobody is handed a
   finished board. Words only lock in a pulse, so a board completed by a rotation leaves in that same
   rotation, before the shift; a board completed by Final Check leaves at the next one. The other
   reading, removing finished games from the home page, would need a pool rotation schedule the
   spec does not have; it is not implemented.
   - A seat can now hold no board (`boardAtSeat` entries are `null`). A rotation still shifts the
     ring, gaps included; then every seat with a player still in the game but no board takes the
     nearest board at a seat nobody plays (empty or knocked out), looking the way boards arrive
     from. Alone, you therefore always get a board, and the one you get is the one the next
     rotation in that direction would have brought.
   - With more players than boards left, someone sits out each rotation. That phone shows a "No
     board at your seat" screen with the timer, the Capt. controls and the meta guesses.
   - The rotate buttons and the countdown preview use the current ring. They do not predict which
     boards the coming pulse will complete: that would tell players which boards are fully correct.
   - The seating card, the seating flash and the host list finished boards as done.
3. **6× mode:** three 6×6 boards, 6 meta words of 3–8 letters, par 6 minutes. `MODES` in
   `src/config.ts` holds both modes; a game's mode is read from its `boardSize`.
   - **Meta points:** the words share 35 points, 7 each in 5× and 35/6 ≈ 5.83 each in 6×, with the
     same 10%-per-rotation decay. Each word's points are shown to one decimal (5.8), but the meta
     total adds the unrounded values, so six words still make 35. The score stays Time 50 · Metas 35
     · Suspects 15 in both modes.
   - **Validator:** per mode, exactly `metaWords` words with one of each length from 3 to
     `metaWords + 2`, and `parMinutes` equal to the mode's. `npm run validate:puzzles` checks both
     files together, so a game id used twice is caught.
   - **Seeding:** the seed route loads both files. The index now carries each game's mode, size,
     meta count and par, so `PUZZLE_FORMAT` is 3 and older seeds read as stale until re-seeded.
   - The phone grid keeps cells at least 46 px (276 px for a 6×6), and a sixth meta color was added
     for light and dark themes.
4. **The 6× games** (`data/puzzles-6x.json`) are built by `scripts/generate-games.ts` (then
   `generate-6x.ts`; renamed in L) with the sibling
   crossword-app's lexicon, grid code and filler (it needs that checkout).
   - **Grids:** 180°-symmetric, every entry 3+ letters, 8 or 10 blocks. Fewer blocks did not fill
     with everyday vocabulary: every 4- and 6-block pattern failed eight 5-second attempts, while
     every 10-block and some 8-block patterns filled in under a few seconds.
   - **Vocabulary:** three-letter fill must have a hand-written crossword-app clue; longer fill may
     come from its frequency list up to "familiar". Names, places, nationalities and crude words are
     blocked (`BLOCKED`). Every clue is hand-written: crossword-app's, or `scripts/clues.ts`
     for answers it has none for (no dictionary-derived clues). No board repeats, and an answer
     from an earlier game is reused only when nothing else fills (3–4 letters only).
   - **Unlocks** follow the 5× set's mix per board (about 40% base, a third waiting on a letter of
     another board, one on a rotation count of 2–4, the rest on a solved count), re-drawn until the
     idealized solve (G.3) takes 2–4 rotations.
   - **Meta words** are themed answers of any player in crossword-app (the shared, Clem and Lori
     sets: climbing, golf, MBTA and other rail lines, programming, pharma, travel, …), one topic per
     word where possible, each used once across the set and never a clue answer of its own game.
     They are spelled by cells spread over all three boards, as in 5×. The 5× meta words were left
     as they were.
5. **Setup UI:** the home page has 5×5 / 6×6 mode tabs, each listing its own games, with the
   mode's boards, meta count and par spelled out; the choice is remembered per device
   (`localStorage["xw:mode"]`). The lobby and host titles show the board size. The rules on the
   home page describe both modes, the guess rules and board removal.

## K. Changes requested after V1 (fourth round)

1. **Unlock helper cells.** A cell whose correct letter would unlock a still-hidden clue on another
   board has a dashed amber outline and, in its bottom-left corner, the emoji of the board it helps.
   The marker goes once that clue unlocks (or its word locks). This reveals nothing new: the other
   board's clue already names the cell ("Needs 🦊 r1c3"). Views carry it as `board.helperCells`.
2. **Meta words are lettered A, B, C…** on the grid, in the meta bar and panel, and in the results,
   so they never read as clue numbers. The API still numbers them (`metaNumber`, `meta`); the letter
   is display only.
3. **Meta panel:** the help paragraph and the "(n)" under each unsolved word are gone. A disabled
   guess field says why in its placeholder ("No guesses left", "Knocked out").
4. **The guess field uses the on-screen keyboard** (letters, ⌫ and a Guess key in place of the
   suspect key). The field has `inputMode="none"`, so phones never raise their own keyboard, and a
   physical keyboard still types into it.
5. **Portrait only.** The web manifest declares `orientation: "portrait"` (honored when the game is
   added to a home screen). In a browser, a phone turned sideways (landscape and under 520 px tall)
   sees a "Turn your phone upright" cover on the play page; desktop windows and the host screen are
   unaffected.
6. **The Capt.'s phone:** the rotate buttons, cooldown and Final Check take the top row instead of
   the board progress and the clock, and the header and the area around the grid are tinted red
   instead of showing the word "Capt.". Other phones keep progress and clock. The seating map now
   shows the clock and the rotation count for everyone.
7. **Display density:** a Normal / Cosy / Compact button next to the theme button (home, host,
   lobby, seating map). It scales text through the root font size (100%, 93.75%, 87.5%) and controls
   through `--tap`, `--key-h` and `--cell-min` (44/46/46 px, 40/42/42, 36/38/38). Compact goes below
   the 44 px tap target of F.1, by choice. Stored per device (`localStorage["xw:density"]`) and
   applied before the first paint, like the theme.
8. **Players: up to one per board, the board count coming from the mode.** `MODES` has `boards`
   (3 in both modes today), the validator checks it, and a room seats at most as many players as its
   puzzle has boards. `maxPlayers` is gone from the config. The ring size is no longer fixed in the
   engine; the Redis layout reads `cfg.seats` boards first and re-reads with the room's own count if
   it differs, so a mode with another board count costs one more read per load.
9. **Spaced seating** (the V2 spacing idea of D.4, generalized): a new player takes the free seat
   farthest from every taken seat, the lowest on a tie. In a three-seat ring every seat is next to
   every other, so this changes nothing today; it starts to matter at four boards or more. Seats with
   no player are labeled "Empty" instead of "idle".
10. **Wrong letters passed on.** At every rotation, each player still in the game is charged the
    wrong letters they typed that sit on the board leaving their seat. A letter left wrong through
    several rotations counts each time; letters typed by someone else, or on a board at an empty
    seat, are not charged. Counted before the pulse, so a rotation that ends the game is included.
    Shown on each scorecard and as a team total in the results; not scored.
11. **End round & restart.** `POST /api/rooms/[rid]/restart` puts the same puzzle back in the lobby
    with the same players, seats, Capt. and board emojis, and wipes everything else (letters, locks,
    unlocks, meta words, stats, knock-outs, the timer). While a game is on only the Capt. may do it,
    from the seating map, with a confirm step; once it has ended anyone may ("Play this game again"
    on the results screen). The version keeps increasing, so every phone and the host pick it up on
    their next poll.

## L. Changes requested after V1 (fifth round)

1. **The game is called Team Crossword** (page titles, home heading, manifest, README).
2. **7× mode:** three 7×7 boards, 7 meta words of 3–9 letters (labeled A–G, a seventh meta color),
   par 7 minutes, and a **7-minute time limit**. The 35 meta points split 5 per word. Only 7× has a
   limit (`MODES.timeLimitMinutes`); 5× and 6× are unchanged.
3. **Time limit.** The deadline is fixed when the timer starts (`timeUpAt`, in the room meta hash so
   the polling fast path sees it). It is a lazy transition like a rotation: the first request at or
   after the deadline ends the game, recorded as ending at the deadline itself. A rotation that was
   due before the deadline still completes, as of its due time, so its locks and meta words count;
   one due after it is dropped. After the deadline every action is rejected as `GAME_ENDED`.
4. **Score when time runs out** is the number of meta words obtained, by guess or by tiles: the
   result has `endedBy: "time"`, `total` = that count and no grade, and the results screen shows
   "4/7" and "Time's up" instead of a grade out of 100. A 7× game whose meta words are all obtained
   in time is scored as before (out of 100, with a grade); so is one where everyone is knocked out.
   Results record `endedBy` (`metas`, `time`, `knockout`) and `metasObtained` in every mode.
5. **The clock** counts down ("03:12 left") in a mode with a limit: in the non-Capt. phone header,
   the seating map and the host screen. The Capt.'s header still has no clock (K.6); it is on the map.
6. **The 7× games** (`data/puzzles-7x.json`) come from the same generator, now
   `scripts/generate-games.ts --mode=7x`, with the clues in `scripts/clues.ts` (both renamed from
   their 6× names). Every board uses the classic 7×7 layout of 8 blocks and 22 entries (eighteen of
   3 letters, four of 7). That is the only layout that filled with everyday words: all 51 layouts
   of 14–16 entries failed, and even with rarer 6- and 7-letter words allowed, 1 of 30 filled, with
   a name and a star in it. Every 7-letter answer has a hand-written clue (238 more in `scripts/clues.ts`, a few for words a later run replaced); names, nationalities, religious terms, a brand and crude words were blocked
   as they came up. Unlocks follow the same mix; every game solves in 3–4 rotations in the idealized
   model. Meta words are again themed answers of any player, one topic per word where possible.
7. **Tests:** the time limit can be scaled (`timeLimitScale` in `CONFIG_V1`, overridable through
   `XW_CONFIG_OVERRIDES`); the end-to-end test runs 7× with a 4.2-second limit.

## M. Changes requested after V1 (sixth round)

1. **As many boards as the mode's number, one player per board.** 5× games have five 5×5 boards,
   6× six 6×6 and 7× seven 7×7 (`MODES.boards`), so a room seats up to 5, 6 or 7 players. The
   seat cap was already the puzzle's board count (K.8); what changed is the data. Spaced seating
   (K.9) now matters: a second player sits across the ring (seat 3 of 5, not seat 2).
2. **The games were extended, not replaced.** Every game keeps its three boards with their clues
   and unlocks. `scripts/generate-games.ts --extend` fills the new boards with the same filler and
   rules (5× now uses it too, with every symmetric 5×5 layout of 4 or 6 blocks, as in the hand-made
   set), preferring
   answers no other board of the set has used. Each game keeps its meta words, spelled again over
   all of its boards: a word uses every board or, when it has fewer letters than the ring has
   boards, as many boards as letters (the validator's existing rule). Only the new boards got
   unlocks, drawn until the idealized solve takes 2–4 rotations; no game needed its old boards'
   unlocks redrawn. The run saves after each game and skips finished ones, so it can be restarted.
   Result: 90 new boards (20 in 5×, 30 in 6×, 40 in 7×), with every original board, clue and
   unlock unchanged. The idealized solve takes 2–3 rotations in 5× and 3–4 in 6× and 7×. Distinct
   answers per set: 459 of 500 in 5×, 536 of 720 in 6×, 514 of 1,540 in 7× (an answer may recur
   in another game, as before).
3. **7× may repeat a 3-letter answer on another board of the same game** (`MODES.repeatLength`,
   checked by the validator; never twice on one board, and longer answers stay unique). The 7×7
   layout has eighteen 3-letter entries, so seven boards need 126 per game, and the curated list
   has 332: in a trial, every game needed repeats by its fourth or fifth board (by its sixth or
   seventh with the extra words below); a 30-second search budget did not help, and the
   14–16-entry layouts with 10–12 blocks filled none of 40 tries. The
   generator tries repeat-free first and only then lets this game's 3-letter answers back in,
   ranked after every other word. The 7× set has 126 such repeats among its 720 new 3-letter
   entries (7 to 22 per game); the 5× and 6× sets have none.
4. **More 3-letter fill:** `EXTRA_THREES` in `scripts/clues.ts` adds 76 three-letter words from
   below crossword-app's curated tier (AFT, COY, FEZ, NAB, WRY, VEX…), each with a hand-written
   clue; the filler ranks them after the curated words. With them, repeats in the trial fell from
   226 to 116 of 720 new 3-letter entries. Names, crude words, religious terms and abbreviations
   from those tiers were left out. Blocked as they came up: BAPTISM, BONDAGE, BRISTOL, BROTHEL,
   DARBY, DOPE, MOULD, PADRE, PAULINE and PLUTO; also ACROSS and DOWN, which the clue list shows
   as headings, so the leak check flags them as answers in the client bundle.
5. **Clues:** 159 new answers got a hand-written clue in `scripts/clues.ts`; the rest came from
   crossword-app's curated clues or from the clue the answer already had in a committed puzzle
   file. `--reclue` now only fills in empty clues; it used to re-pick every clue, which would have
   replaced the hand-written 5× clues.
6. **Par and the 7× time limit are unchanged** (5, 6 and 7 minutes) although a game now has more
   boards; par still shrinks with effective players (§4). Flagged for review: a solo player now
   covers five to seven boards in the same par.
7. **Redis:** rooms are read assuming seven boards (`CONFIG_V1.seats`, the largest ring) in one
   round trip; a smaller room drops the extra, empty board hashes instead of being read again.
   `PUZZLE_FORMAT` is 4, so a deployment seeded with three-board games reports a stale seed until
   the seed route runs again.
8. **Host ring:** more than four seats get a wider ring (760 px), a bigger circle and narrower,
   compact tiles, so seven tiles do not overlap; in the lobby that ring takes two thirds of a wide
   screen (900 px and up) beside the join card, or a row of its own below it. The home page and
   README give each mode's board and player count.
