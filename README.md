# Sliding Puzzle

A 4×4 sliding puzzle (tiles 1–15 plus a blank). Open it and you are playing: the backend saves your
game under a nickname, and the nickname is in the URL, so the link resumes it in any browser.
There is no authentication.

### Identity without authentication

- A profile lives at `/sliding-puzzle/p/<nickname>`. Opening that URL plays as that profile and
  creates it on first use (`POST /sliding-puzzle/api/profiles` is get-or-create). Sharing the link,
  or editing the name in the address bar, is how you "log in"; anyone with the link can play.
- A first visit to `/sliding-puzzle` generates a nickname such as `tortoise-squirrel-123` (two words
  from `src/profile/words.ts` and a number 100-999) and replaces the URL with its profile path.
- The last profile is remembered in this browser (localStorage), so `/sliding-puzzle` later goes
  straight back to it.
- Nicknames are case-insensitive and the server keeps the first casing it saw. Once a profile loads,
  the URL is replaced with that canonical casing, so one profile has one URL.
- A name that breaks the rules (`src/profile/index.ts`), including malformed percent-encoding,
  shows a "cannot be used" screen whose one action is a new random profile; nothing is created for it.
- The pure parts (paths, the start decision, name generation) are in `src/profile/url.ts` and
  `generate.ts`; the hooks only touch `history`, `location` and storage.

It runs locally on Node and SQLite and is built to deploy to Cloudflare Workers and D1.

## Run it

Needs Node 26 (see `.nvmrc`).

```sh
npm install     # also enables the git hooks
npm run dev     # API on :8787, web on :5173
```

## Commands

| Command            | What it does                                                                     |
| ------------------ | -------------------------------------------------------------------------------- |
| `npm run check`    | Format, lint, types, unit and property tests, gate tests, computed checks, build |
| `npm run test:e2e` | Playwright against the real servers, on a phone and a desktop project            |
| `npm run mutate`   | Mutation testing: changes the code and checks that a test notices                |
| `npm run dev`      | API and web together; Ctrl-C stops both                                          |
| `npm run format`   | Prettier                                                                         |

Scoped tests: `node --import ./scripts/tsx-hooks.js --test src/puzzle`.

## Architecture

A modular monolith: one package, flat folders in `src/`, cut by what they do.

```
src/
  db/        Db port, node:sqlite driver, Cloudflare D1 driver, migrator    foundation
  profile/   nickname profiles                                              foundation
  game/      generic game engine: saved game per profile, versions,         foundation
             start / resume / move / reset. Knows no particular game.
  puzzle/    the sliding puzzle: rules, shuffle, board view. A FEATURE.
  server/    composition root: wires features into the Hono app (Node and Worker entries)
  web/       composition root: wires features into the React shell
  test-support/  literal board grids, the real in-memory database, small test fixtures
migrations/  plain SQL, applied locally by our migrator and on D1 by wrangler
e2e/         Playwright acceptance tests
gates/       tests of the quality gates themselves
scripts/     computed checks and the TSX loader
```

### The deletion test

A feature is a good module if you can delete its folder, remove the lines that pin it, and the
project still compiles. `scripts/check-deletion.js` does exactly that for every feature, on every
run of `npm run check`.

- Foundations never import a feature. A feature plugs into the engine through a `GameDefinition`
  (`start`, `apply`, `isFinished`, and zod schemas for its state, moves and options).
- Only `src/server/features.ts` and `src/web/features.tsx` import features, and each such line
  ends with `// pin: <folder>`.

### Adding a game

1. Create `src/<name>/` with a `definition.ts`, a `server.ts` exporting a `ServerFeature` and a
   `client.tsx` exporting a `ClientFeature` (see `src/puzzle/`).
2. Pin it in `src/server/features.ts` and `src/web/features.tsx`.
3. `npm run check`. The deletion test now covers your folder too.

### Module rules (enforced by lint, tested in `gates/boundaries.test.ts`)

- Import another module only through its `index.ts`, `server.ts` or `client.tsx`.
- Server code never imports client code, and the reverse.
- `puzzle/rules.ts`, `shuffle.ts` and `rng.ts` are pure: no imports outside the folder.
- Only `src/server` supplies randomness and time. Modules take them as required options.

### Saved games

The server is authoritative. The browser sends a move together with the version it was made on.
If the stored game has moved on, the server answers `409 stale` with the current game and the
browser adopts it. Signing in is one atomic "resume" call that returns the saved game or creates it.

## Tests

The standard is in `AGENTS.md` and is enforced by lint (`eslint.test-standard.js`), so a test that
breaks it cannot be committed:

- A test sits next to the file it covers and reads in ten seconds: one behaviour, Given / When / Then.
- Expected values are written by hand. Boards are drawn with the `grid` tag.
- No branching or loops in tests; many inputs means a fast-check property.
- No fakes of our own modules: tests use the real in-memory SQLite, and the D1 driver is tested
  against a real local D1.

`npm run mutate` shows whether the tests can fail. `gates/hooks.test.ts` shows that the git hooks
refuse a bad commit or push.

## Working in this repo

Read `AGENTS.md`. It is short, and it applies to people and coding agents alike.
