# Sliding Puzzle

4×4 sliding puzzle (tiles 1–15 plus a blank). Pick a nickname profile, play, and the backend saves your
active game in SQLite, so the same profile resumes in another browser. No authentication.
Runs locally on Node + SQLite; designed to deploy to Cloudflare Workers + D1.

## Commands

| Command                                 | What it does                                                    |
| --------------------------------------- | --------------------------------------------------------------- |
| `npm install`                           | Installs deps and enables the git hooks (`.githooks/`)          |
| `npm test`                              | lint + typecheck + unit tests + build. **Run before you push.** |
| `npm run test:unit`                     | Node native test runner only. Scope: `node --test src/puzzle`   |
| `npm run test:e2e`                      | Playwright end-to-end (chromium)                                |
| `npm run dev`                           | API on :8787 and Vite on :5173                                  |
| `npm run lint` / `typecheck` / `format` | ESLint / `tsc --noEmit` / Prettier                              |

Hooks: `pre-commit` checks staged files (prettier, eslint, tsc). `pre-push` runs `npm test` and `npm run test:e2e`.
Please do not use `--no-verify`.

## Layout

```
src/
  puzzle/   pure game logic (no imports outside the folder)
  profile/  nickname profiles
  game/     the active game per profile (uses puzzle, profile, db)
  db/       Db port + node:sqlite driver + D1 driver + migrator
  server/   composition root: wires module server.ts entries (node.ts, worker.ts)
  web/      composition root: wires module client.tsx entries (React)
migrations/ plain .sql, applied locally by our migrator and on D1 by wrangler
e2e/        Playwright specs
```

## Boundaries (enforced by ESLint, tested in `src/boundaries.test.ts`)

A module exposes only `index.ts` (isomorphic: types, zod schemas, pure logic), `server.ts` (Hono routes/service) and
`client.tsx` (React + API client). Everything else in the folder is private.

1. Import another module only through its `index.ts`, `server.ts` or `client.tsx`. Never deep-import.
2. Server code never imports client code, and the reverse. Client code never imports `node:*`.
3. Allowed module dependencies: `game` → `puzzle`, `profile`, `db`; `profile` → `db`; `puzzle` and `db` → nothing.
4. `puzzle` is pure: relative imports inside its own folder only.
5. Only `server/` and `web/` wire modules together. Modules never import them.
6. Duplicating a few lines beats reaching into another module.

If a rule blocks you, change the design or ask. Do not weaken the rule to get green.

## Conventions

TypeScript strict, no `any`, no `!`, no `console` in modules, no enums (Node strips types, it does not compile them).
Relative imports include the extension (`./board.ts`). Validate every edge with zod (HTTP, DB rows, storage).
Write the test first. Never edit a test only to make it pass. Keep JSX thin: logic goes in `.ts` files that can be unit-tested.
