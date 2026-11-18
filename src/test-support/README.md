# src/test-support

Shared helpers for unit tests. Test files import them as `../test-support/<file>.ts` (the test
standard allows exactly that). Production code must never import from here (ESLint blocks it).

## Belongs here

- Ways to write expected values by hand: `grid` turns a drawn board into a flat array,
  `formatGrid` renders one back for readable failure messages.
- The real database: `openTestDb()` is in-memory SQLite with every migration in `migrations/`
  applied. Each call is a new, independent database.
- Fixed clocks: `FIXED_NOW` and `fixedNow`.
- Later: fast-check arbitraries shared by several modules.

## Does not belong here

- Logic that decides expected values (for example applying moves to get the "expected" board).
  Expected values are literals in the test.
- Fakes or mocks of our own modules. Use the real module through its public entry.
- Code that one test file uses. Keep that in the test file.

Every helper here has its own `*.test.ts` that follows the test standard.
