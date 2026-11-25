# src/test-support

Shared helpers for unit tests. Test files import them as `../test-support/<file>.ts` (the test
standard allows exactly that). Production code must never import from here (lint blocks it).

## What is here

- Expected values written by hand: `grid.ts` turns a drawn board into a flat array (`formatGrid`
  renders one back for failure messages); `contrast.ts` is the WCAG contrast ratio of two colours.
- Facts that do not come from the code under test: `reachable.ts` searches which states moves can
  reach and which arrangements match.
- Real databases: `db.ts` (`openTestDb()`, in-memory SQLite with every migration, plus the fixed
  clock `FIXED_NOW` / `fixedNow`), `d1.ts` and `d1-db.ts` (a real local Cloudflare D1 through
  Miniflare, with the migrations), `empty-db.ts` (no tables, for genuine internal errors),
  `interleaving-db.ts` (a concurrent writer right after a batch commits), `db.contract.ts` (the
  cases every Db driver must pass), `migration-files.ts` (hand-written migration folders in temp
  dirs).
- Real services and games for the engine: `profiles.ts` (the real profile service), `feature-app.ts`
  (one feature on the real engine), `tally-game.ts` and `score-game.ts` (tiny games that prove the
  engine is generic).
- The browser around a game session: `device.ts` (network, storage, clocks and timers under the
  test's control), `flaky-network.ts` (loses and repeats requests, for the sync model property),
  `memory-storage.ts` (localStorage in memory, and one that throws).
- Steering randomness: `scripted-rng.ts` returns hand-written values.

## Does not belong here

- Logic that decides expected values (for example applying moves to get the "expected" board).
  Expected values are literals in the test.
- Fakes or mocks of our own modules. Use the real module through its public entry.
- Code that one test file uses. Keep that in the test file.

Helpers with logic of their own have a `*.test.ts` that follows the test standard.
