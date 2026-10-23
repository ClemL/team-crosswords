# Decisions

Choices made where the V1 spec was silent, and rules implemented as written but flagged for review.
Section numbers refer to the V1 spec.

## A. Rules implemented as written, flagged for review

1. **Per-word validation pulse (required assumption, §3.4).** "A word turns green when filled, correct,
   and the board has been rotated" is implemented as the per-word validation pulse: on every rotation
   (and Final Check), every filled, correct word on all three boards locks. It is not a one-time global
   gate.
2. **Rotation-count unlocks lag one pulse (§3.6.4, §7.2).** The spec orders a rotation as
   pulse → shift → `rotations++`. Unlocks are evaluated inside the pulse, so a `rotations: N` clue
   unlocks at the pulse of rotation N + 1 (or at a Final Check after N rotations), not at rotation N.
   The phone can therefore show `Unlocks at 3 rotations (now 3)` while the clue is still locked. That
   matches how `solvedCount` behaves after a Check Cells lock: the count is reached, and the unlock
   waits for the next pulse. If the intent is "unlock at rotation N", increment `rotations` before
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
3. **The in-process store seeds itself** at first use, because it starts empty on every boot. Upstash
   is never auto-seeded: run `POST /api/admin/seed` once.
4. **Extra keys and fields (§7.1).** `puzzles:index` (JSON list of `{id, title}`) backs
   `GET /api/puzzles`. The meta answer lives in the solution key as `metaAnswer`, because the public
   puzzle must not contain any answer. The room meta hash adds `createdAt` and `result` (the score,
   frozen when the game ends).
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
   `UNAUTHORIZED` (401) for the seed route; `ROOM_FULL` (409); `BUSY` (503); `SERVER_ERROR` (500, with
   no internal details in the body). Status codes for the spec's codes: `NOT_FOUND` 404,
   `NOT_IN_ROOM` and `NOT_MASTER` 403, all other rule rejections 409.
2. **Check Cells on a locked word** returns `LOCKED_CELL`; on an empty or partial word, `NOT_FILLED`.
   No token is spent on any rejection.
3. **Rotating while a rotation is pending** returns `COOLDOWN`.
4. **Mutation responses include `version`,** so the phone can reconcile optimistic letters.
5. **Player ids.** `playerId` must match `^[A-Za-z0-9-]{8,64}$`; the server generates a UUID when it is
   null. Joining with a known id reclaims the seat (name optional). A new player needs a name
   (whitespace collapsed, max 16 characters). New players cannot join an ended game.
6. **Seed route** requires `ADMIN_SEED_SECRET` to be set and compares the header in constant time.
   Re-seeding overwrites the puzzle keys (idempotent).
7. **Room codes** are matched case-insensitively.

## D. Game-rule details the spec left open

1. **The first rotation waits one cooldown.** Starting the timer sets
   `cooldownUntil = start + cooldownMs`, so the master cannot rotate (and unlock rotation clues) in the
   first 20 seconds.
2. **Tokens are issued when the timer starts** (`tokensPerPlayer × players`). A late joiner (V1.5)
   adds `tokensPerPlayer`.
3. **Initial master** is the first player to join (V1: the only player).
4. **Seat assignment** is the first free seat (V1: seat 0). The V2 spacing table is not implemented.
5. **Final Check** does not change the master and is allowed only when no rotation is pending.
6. **Red marks** clear when the cell's letter changes; retyping the same letter keeps the mark.
7. **Suspect marks.** Marking an already-marked cell is a no-op (no double count). Removing a mark and
   marking again counts again. `accurateSuspects` counts marks on cells holding a wrong letter; empty
   cells count as neither false nor accurate.
8. **Meta.** A guess counts as "solved before the game ended" when `metaSolvedAt <= endedAt`. The
   answer is sent to clients once solved or once the game has ended (all six slots are visible by
   then). Empty guesses (after normalization) are rejected without using a guess.
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
3. **Extra view fields:** `rid`, `puzzleTitle`, `board.lockedCount`/`totalCount`, `meta.enumeration`,
   `result.details` (time, par, tokens, false suspects, meta), and on the host view `masterName` and
   `players` (names, seats, ready, master). The host view never contains board letters.
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
2. **Check 🎟 sits in the current-clue bar,** not below the keyboard, so the clue list keeps usable
   height at 360×780.
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
5. **E2E** runs `next start` with the in-process store, a 1.5 s cooldown and a 0.7 s warning. It also
   reloads mid-game and asserts that recorded API responses never contain a clue answer, a solution
   grid, or the text of a locked clue.
