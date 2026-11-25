# Rules for coding agents and people

Prefer adding a check over adding a sentence here. Every rule below that a machine can decide is
enforced by lint, a script in `scripts/` or a test in `gates/`, and their messages say how to fix it.

## Commands

- `npm run check`: format, lint, types, unit + property tests, gate tests, computed checks, build. One command; it must be green before every commit.
- `npm run test:e2e`: Playwright against the real servers. `npm run mutate`: mutation testing.
- `npm run dev`: API on :8787, web on :5173. Scoped tests: `node --import ./scripts/tsx-hooks.js --test src/puzzle`.
- Judge every command by its exit status, never by filtered output.

## Modules

- Flat folders in `src/`, cut by what they do, never by technical layer.
- Foundations: `db`, `profile`, `game` (a generic engine: saves, versions, moves; it knows no particular game).
- Features: `puzzle`. A feature plugs into the engine through a `GameDefinition`. Deleting its folder and its `// pin: <name>` lines in `src/server/features.ts` and `src/web/features.tsx` must still compile.
- Import another module only through its `index.ts`, `server.ts` or `client.tsx`. Foundations never import a feature. Duplicate a little instead of reaching in.
- `rules.ts`, `shuffle.ts`, `rng.ts` are pure. Only `src/server` supplies randomness and time; modules take `random` and `now` as required options.

## Tests

- A test sits next to the file it covers (`rules.ts`, `rules.test.ts`) and is readable in ten seconds: one behaviour, a sentence for a name, Given / When / Then.
- Expected values are written by hand: literals, `grid` drawings, UPPER_CASE constants. Never computed by the code under test, never by a copy of its logic.
- No `if`, loops, `try` or early `return` in tests. Many inputs means a fast-check property.
- No fakes of our own modules. Use the real in-memory database from `src/test-support/`.
- Each layer owns its behaviour once: rules in `puzzle`, state changes in the `game` engine, HTTP mapping in routes, acceptance criteria in e2e. Do not repeat an assertion at another layer.
- Fewer, better tests. Delete a test that cannot fail or that asserts how the code is written.
- Changing an existing expectation together with production code needs a `Reason:` line in the commit message. If the code is wrong, fix the code.

## Working

- Restate the task and its acceptance criterion before writing code. Ask when unsure; do not guess.
- Write the failing test first. Small commits, each with why.
- No new dependency without a one-line reason. No `any`, no `!`, no enums, no `console` in modules.
- Validate every edge with zod: HTTP in and out, database rows, browser storage.
- Never read, print or commit `.env` files or secrets. No real client or people names anywhere.
- Do not edit the gates (`oxlint.config.ts`, `lint/`, `.githooks/`, `gates/`, `scripts/`, `stryker.config.json`, `.github/`) to get green. If a rule is wrong, say so and stop.
- If something fails three times, stop and report what you tried.

## Done means

`npm run check` and `npm run test:e2e` are green, you ran the app and saw the change work (phone and desktop width), and you said what you verified and what you did not.
