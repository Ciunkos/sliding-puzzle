import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { ESLint, type Linter } from 'eslint';
import tseslint from 'typescript-eslint';

// eslint.test-standard.js is plain JS (no .d.ts); load it untyped and name the shape here.
const standardUrl = new URL('../eslint.test-standard.js', import.meta.url).href;
const { testStandard, e2eStandard, productionLimits } = (await import(standardUrl)) as Record<
  'testStandard' | 'e2eStandard' | 'productionLimits',
  Linter.Config[]
>;

const ROOT = path.resolve(import.meta.dirname, '..');
const PARSER: Linter.Config = {
  files: ['**/*.ts', '**/*.tsx'],
  languageOptions: { parser: tseslint.parser },
};
const config = [PARSER, ...testStandard, ...e2eStandard, ...productionLimits];
const eslint = new ESLint({ cwd: ROOT, overrideConfigFile: true, overrideConfig: config });

/** Lints a snippet under a virtual path (no type information needed). */
async function lint(filePath: string, code: string): Promise<Linter.LintMessage[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages ?? [];
}

/** Messages of `ruleId` whose text contains `hint` (empty hint = any message of that rule). */
async function hits(filePath: string, code: string, ruleId: string | null, hint = '') {
  const messages = await lint(filePath, code);
  return messages.filter((m) => m.ruleId === ruleId && m.message.includes(hint));
}

const UNIT = 'src/puzzle/board.test.ts';
const E2E = 'e2e/play.spec.ts';
const PROD = 'src/puzzle/board.ts';
const HEAD =
  "import assert from 'node:assert/strict';\nimport { test, describe } from 'node:test';\n";

/** Wraps a test body in a test with a valid name. */
const inTest = (body: string) => `${HEAD}test('the board does the thing', () => {\n${body}\n});\n`;

/** One rule: `bad` must be reported by `ruleId` (message containing `hint`), `good` must not. */
interface Case {
  rule: string;
  ruleId: string | null;
  hint?: string;
  file: string;
  bad: string;
  good: string;
}

const SYNTAX = 'no-restricted-syntax';
const ok = 'assert.equal(1, 1);';

const cases: Case[] = [
  // 1. No branching or looping
  {
    rule: 'if statement',
    ruleId: SYNTAX,
    hint: 'assert.ok(x)',
    file: UNIT,
    bad: inTest('const x = f(); if (x) { assert.equal(x, 1); }'),
    good: inTest('const x = f(); assert.ok(x); assert.equal(x, 1);'),
  },
  {
    rule: 'switch statement',
    ruleId: SYNTAX,
    hint: 'Remove the switch',
    file: UNIT,
    bad: inTest(`switch (f()) { case 1: break; }\n${ok}`),
    good: inTest(ok),
  },
  {
    rule: 'conditional expression',
    ruleId: SYNTAX,
    hint: '?: operator',
    file: UNIT,
    bad: inTest('assert.equal(f(), g() ? 1 : 2);'),
    good: inTest('assert.equal(f(), 1);'),
  },
  {
    rule: 'for loop',
    ruleId: SYNTAX,
    hint: 'fast-check property',
    file: UNIT,
    bad: inTest(`for (let i = 0; i < 3; i++) f(i);\n${ok}`),
    good: inTest(ok),
  },
  {
    rule: 'for-of, for-in, while and do-while loops',
    ruleId: SYNTAX,
    hint: 'Remove the loop',
    file: UNIT,
    bad: inTest(
      `for (const a of b) f(a);\nfor (const k in o) f(k);\nwhile (f()) g();\ndo g(); while (f());\n${ok}`,
    ),
    good: inTest(ok),
  },
  {
    rule: 'iteration callbacks',
    ruleId: SYNTAX,
    hint: 'forEach/map/reduce',
    file: UNIT,
    bad: inTest('[1, 2].forEach((n) => assert.equal(f(n), 1));'),
    good: inTest('assert.equal(f(1), 1);'),
  },
  {
    rule: 'try/catch',
    ruleId: SYNTAX,
    hint: 'assert.throws',
    file: UNIT,
    bad: inTest('try { f(); } catch { assert.ok(true); }'),
    good: inTest('assert.throws(() => f(), /bad/);'),
  },
  {
    rule: 'early return in a test, but expression-bodied fast-check arrows are fine',
    ruleId: SYNTAX,
    hint: 'Do not return inside a test',
    file: UNIT,
    bad: inTest(`const x = f();\nassert.ok(x);\nreturn;`),
    good: inTest('fc.assert(fc.property(fc.integer(), (n) => f(n) === n));'),
  },
  {
    rule: 'complexity 1 (logical operators, optional chaining, defaults)',
    ruleId: 'test-standard/test-complexity',
    hint: 'straight-line',
    file: UNIT,
    bad: inTest('assert.equal(f()?.x, 1);'),
    good: inTest('assert.equal(f().x, 1);'),
  },
  // 2. No .only / .skip / .todo
  {
    rule: '.only, .skip and .todo',
    ruleId: SYNTAX,
    hint: '.only/.skip/.todo',
    file: UNIT,
    bad: `${HEAD}test.only('the board does the thing', () => { ${ok} });`,
    good: inTest(ok),
  },
  {
    rule: 'only/skip/todo options',
    ruleId: SYNTAX,
    hint: 'only/skip/todo option',
    file: UNIT,
    bad: `${HEAD}test('the board does the thing', { skip: true }, () => { ${ok} });`,
    good: `${HEAD}test('the board does the thing', { timeout: 100 }, () => { ${ok} });`,
  },
  // 3. One describe level
  {
    rule: 'nested describe',
    ruleId: SYNTAX,
    hint: 'one describe level',
    file: UNIT,
    bad: `${HEAD}describe('a', () => { describe('b', () => { test('the board does the thing', () => { ${ok} }); }); });`,
    good: `${HEAD}describe('a', () => { test('the board does the thing', () => { ${ok} }); });`,
  },
  // 4. Literal expected values
  {
    rule: 'expected value is a call',
    ruleId: 'test-standard/literal-expected',
    hint: 'written out by hand',
    file: UNIT,
    bad: inTest('assert.deepEqual(f(), applyMove(SOLVED, 15));'),
    good: inTest('assert.deepEqual(f(), { board: [1, 2, -3], ok: true, none: null, at: SOLVED });'),
  },
  {
    rule: 'expected value is a lower-case variable, member, binary, spread or await',
    ruleId: 'test-standard/literal-expected',
    file: UNIT,
    bad: inTest('assert.equal(f(), first.version + 1);'),
    good: inTest('assert.equal(f(), 2);'),
  },
  {
    rule: 'expected value may be a grid tagged template or an UPPER_CASE constant',
    ruleId: 'test-standard/literal-expected',
    file: UNIT,
    bad: inTest('assert.deepEqual(f(), board);'),
    good: inTest(
      'assert.deepEqual(f(), grid`\n 1 2\n 3 0\n`);\nassert.deepEqual(g(), SOLVED_BOARD);',
    ),
  },
  {
    rule: 'Playwright matcher argument is a literal',
    ruleId: 'test-standard/literal-expected',
    hint: '.toBe()',
    file: E2E,
    bad: "import { expect, test } from '@playwright/test';\ntest('the board shows moves', async () => { expect(await f()).toBe(other.length); });",
    good: "import { expect, test } from '@playwright/test';\ntest('the board shows moves', async () => { await expect(f()).not.toHaveText('Moves: 0'); });",
  },
  // 5. Determinism
  {
    rule: 'Math.random',
    ruleId: SYNTAX,
    hint: 'Math.random',
    file: UNIT,
    bad: inTest('assert.equal(f(Math.random()), 1);'),
    good: inTest('assert.equal(f(createRng(1)), 1);'),
  },
  {
    rule: 'Date.now and new Date()',
    ruleId: SYNTAX,
    hint: 'read the clock',
    file: UNIT,
    bad: inTest('assert.equal(f(Date.now(), new Date()), 1);'),
    good: inTest("assert.equal(f(new Date('2026-01-01T00:00:00Z')), 1);"),
  },
  {
    rule: 'setTimeout and setInterval',
    ruleId: SYNTAX,
    hint: 'setTimeout/setInterval',
    file: UNIT,
    bad: inTest(`setTimeout(f, 10);\n${ok}`),
    good: inTest(ok),
  },
  // 6. Shape
  {
    rule: 'at most 3 assert calls per test',
    ruleId: 'test-standard/test-shape',
    hint: '4 assert calls',
    file: UNIT,
    bad: inTest('assert.equal(a, 1);\nassert.equal(b, 1);\nassert.equal(c, 1);\nassert.ok(d);'),
    good: inTest('assert.equal(a, 1);\nassert.equal(b, 1);\nassert.ok(d);'),
  },
  {
    rule: 'a test asserts something (assert or fast-check)',
    ruleId: 'test-standard/test-shape',
    hint: 'asserts nothing',
    file: UNIT,
    bad: inTest('f();'),
    good: inTest('fc.assert(fc.property(fc.nat(), (n) => f(n) >= 0));'),
  },
  {
    rule: 'an e2e test expects something',
    ruleId: 'test-standard/test-shape',
    hint: 'add an expect',
    file: E2E,
    bad: "import { test } from '@playwright/test';\ntest('the board shows moves', async ({ page }) => { await page.goto('/'); });",
    good: "import { expect, test } from '@playwright/test';\ntest('the board shows moves', async ({ page }) => { await expect(page).toHaveTitle('Puzzle'); });",
  },
  {
    rule: 'at most 8 statements per function',
    ruleId: 'test-standard/test-shape',
    hint: '9 statements',
    file: UNIT,
    bad: inTest(`${'f();\n'.repeat(8)}${ok}`),
    good: inTest(`${'f();\n'.repeat(7)}${ok}`),
  },
  {
    rule: 'at most 20 code lines per function, blank lines and comments excluded',
    ruleId: 'test-standard/test-shape',
    hint: 'code lines',
    file: UNIT,
    bad: inTest(`assert.deepEqual(f(), [\n${'1,\n'.repeat(20)}]);`),
    good: inTest(
      `// Given\n\n// When\n\nassert.deepEqual(f(), [\n${'1,\n'.repeat(16)}]);\n\n\n// Then`,
    ),
  },
  {
    rule: 'describe callbacks are exempt from the size limits',
    ruleId: 'test-standard/test-shape',
    file: UNIT,
    bad: `${HEAD}const helper = () => {\n${'f();\n'.repeat(9)}};`,
    good: `${HEAD}describe('board', () => {\n${"test('the board does the thing', () => { assert.ok(1); });\n".repeat(12)}});`,
  },
  {
    rule: 'at most 3 nested callbacks',
    ruleId: 'test-standard/test-max-nested-callbacks',
    hint: 'describe > test > fc.property',
    file: UNIT,
    bad: `${HEAD}describe('a', () => { test('the board does the thing', () => { fc.assert(fc.property(fc.nat(), (n) => g(() => n))); }); });`,
    good: `${HEAD}describe('a', () => { test('the board does the thing', () => { fc.assert(fc.property(fc.nat(), (n) => g(n))); }); });`,
  },
  // 7. Names
  {
    rule: 'a test name has at least 3 words',
    ruleId: SYNTAX,
    hint: 'at least 3 words',
    file: UNIT,
    bad: `${HEAD}test('applyMove', () => { ${ok} });`,
    good: `${HEAD}test('applyMove swaps tiles', () => { ${ok} });`,
  },
  {
    rule: 'a test name is a string literal',
    ruleId: SYNTAX,
    hint: 'string literal sentence',
    file: UNIT,
    bad: `${HEAD}test(\`the \${x} board works\`, () => { ${ok} });`,
    good: `${HEAD}test('the board is solved', () => { ${ok} });`,
  },
  {
    rule: "a test name does not start with 'test', 'should work' or 'works'",
    ruleId: SYNTAX,
    hint: "not with 'test'",
    file: UNIT,
    bad: `${HEAD}test('should work for a corner blank', () => { ${ok} });`,
    good: `${HEAD}test('a corner blank has two moves', () => { ${ok} });`,
  },
  // 8. Imports
  {
    rule: 'a unit test imports only its subject, public entries, test-support and allowed packages',
    ruleId: 'test-standard/allowed-imports',
    hint: 'may import only ./board.ts(x)',
    file: UNIT,
    bad: inTest(ok).replace(HEAD, `${HEAD}import { shuffle } from './shuffle.ts';\n`),
    good: inTest(ok).replace(
      HEAD,
      `${HEAD}import fc from 'fast-check';\nimport { applyMove } from './board.ts';\nimport { SIZE } from './index.ts';\nimport { grid } from '../test-support/grid.ts';\n`,
    ),
  },
  {
    rule: 'a unit test does not import another feature at runtime, but may import its types',
    ruleId: 'test-standard/allowed-imports',
    file: 'src/game/service.test.ts',
    bad: `import { applyMove } from '../puzzle/index.ts';\nimport { openDb } from './test-helpers.ts';`,
    good: `import type { Board } from '../puzzle/index.ts';\nimport { createGameService } from './server.ts';\nimport { renderToString } from 'react-dom/server';`,
  },
  {
    rule: 'inline type specifiers still load the module, so they count as runtime imports',
    ruleId: 'test-standard/allowed-imports',
    file: 'src/game/service.test.ts',
    bad: `import { type Board } from '../puzzle/index.ts';`,
    good: `import type { Board } from '../puzzle/index.ts';`,
  },
  {
    rule: 'a .test.tsx file may import its .tsx subject',
    ruleId: 'test-standard/allowed-imports',
    file: 'src/game/board-view.test.tsx',
    bad: `import { BoardView } from './other-view.tsx';`,
    good: `import { BoardView } from './board-view.tsx';\nimport { GameScreen } from './client.tsx';`,
  },
  {
    rule: 'an e2e spec imports only Playwright, axe and files under e2e/',
    ruleId: 'test-standard/allowed-imports',
    hint: 'e2e specs may import only',
    file: E2E,
    bad: "import { z } from 'zod';\nimport { SIZE } from '../src/puzzle/index.ts';",
    good: "import { expect, test } from '@playwright/test';\nimport AxeBuilder from '@axe-core/playwright';\nimport { signIn } from './helpers.ts';",
  },
  // Locked linter options
  {
    rule: 'inline eslint-disable comments do not switch rules off in tests',
    ruleId: SYNTAX,
    hint: 'Remove the if',
    file: UNIT,
    bad: inTest(`// eslint-disable-next-line no-restricted-syntax\nif (f()) g();\n${ok}`),
    good: inTest(ok),
  },
  // Production limits
  {
    rule: 'production complexity at most 8',
    ruleId: 'test-standard/complexity',
    hint: 'Split the function',
    file: PROD,
    bad: `export function f(a: number): number {\n${'if (a === 1) return 1;\n'.repeat(8)}return 0;\n}\n`,
    good: `export function f(a: number): number {\n${'if (a === 1) return 1;\n'.repeat(7)}return 0;\n}\n`,
  },
  {
    rule: 'production nesting depth at most 3',
    ruleId: 'test-standard/max-depth',
    hint: 'guard clauses',
    file: PROD,
    bad: 'export function f(a: number): void {\nif (a) { if (a) { if (a) { if (a) { g(); } } } }\n}\n',
    good: 'export function f(a: number): void {\nif (a) { if (a) { if (a) { g(); } } }\n}\n',
  },
  {
    rule: 'production functions at most 40 lines, blank lines and comments skipped',
    ruleId: 'test-standard/max-lines-per-function',
    hint: 'Extract cohesive parts',
    file: PROD,
    bad: `export function f(): void {\n${'g();\n'.repeat(39)}}\n`,
    good: `export function f(): void {\n${'g();\n// note\n\n'.repeat(38)}}\n`,
  },
  {
    rule: 'production imports ordered builtin, external, parent, sibling, alphabetized',
    ruleId: 'test-standard/import-order',
    hint: 'Order imports',
    file: 'src/game/flow.ts',
    bad: "import { b } from './b.ts';\nimport { z } from 'zod';\nimport fs from 'node:fs';\nexport { b, z, fs };\n",
    good: "import fs from 'node:fs';\nimport { z } from 'zod';\nimport { p } from '../puzzle/index.ts';\nimport { a } from './a.ts';\nimport { b } from './b.ts';\nexport { a, b, p, z, fs };\n",
  },
  {
    rule: 'production code reports unused eslint-disable directives',
    ruleId: null,
    hint: 'Unused eslint-disable directive',
    file: PROD,
    bad: '// eslint-disable-next-line no-console\nexport const a = 1;\n',
    good: 'export const a = 1;\n',
  },
];

describe('test standard rules', () => {
  for (const c of cases) {
    test(`reports and allows: ${c.rule}`, async () => {
      const bad = await hits(c.file, c.bad, c.ruleId, c.hint);
      const good = await hits(c.file, c.good, c.ruleId);
      assert.ok(bad.length > 0, `expected ${String(c.ruleId)} on the bad snippet`);
      assert.deepEqual(
        good.map((m) => m.message),
        [],
      );
    });
  }
});

test('production code is checked for import cycles', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'test-standard-'));
  await mkdir(path.join(dir, 'src'));
  await writeFile(
    path.join(dir, 'src/a.ts'),
    "import { b } from './b.ts';\nexport const a = (): number => b();\n",
  );
  await writeFile(
    path.join(dir, 'src/b.ts'),
    "import { a } from './a.ts';\nexport const b = (): number => a();\n",
  );
  await writeFile(
    path.join(dir, 'src/c.ts'),
    "import { a } from './a.ts';\nexport const c = (): number => a();\n",
  );
  const cycles = new ESLint({ cwd: dir, overrideConfigFile: true, overrideConfig: config });
  const [a, c] = await cycles.lintFiles(['src/a.ts', 'src/c.ts']);
  const ids = (r: ESLint.LintResult | undefined) => (r?.messages ?? []).map((m) => m.ruleId);
  assert.deepEqual(ids(a), ['test-standard/no-cycle']);
  assert.deepEqual(ids(c), []);
});

test('every reported message tells the author how to fix it', async () => {
  const messages = await lint(UNIT, inTest('if (f()) return;\nassert.equal(f(), g() + 1);'));
  assert.ok(messages.length >= 3);
  assert.deepEqual(
    messages.filter((m) => !/(use|write|replace|remove|narrow|split|move)/i.test(m.message)),
    [],
  );
});

const CONFORMING = `import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import fc from 'fast-check';
import { boardAfter, grid } from '../test-support/boards.ts';
import type { GameState } from '../game/index.ts';
import { applyMove } from './board.ts';
import { SOLVED_BOARD, isSolvable } from './index.ts';

describe('applyMove', () => {
  test('sliding tile 15 into the blank swaps them', () => {
    // Given a solved board
    const board = SOLVED_BOARD;

    // When tile 15 slides right into the blank
    const moved = applyMove(board, 15);

    // Then tile 15 and the blank have swapped places
    assert.deepEqual(moved, grid\`
       1  2  3  4
       5  6  7  8
       9 10 11 12
      13 14  0 15
    \`);
  });

  test('a tile next to the blank can move', () => {
    const moved = applyMove(SOLVED_BOARD, 12);
    assert.ok(moved);
    assert.equal(moved.length, 16);
  });

  test('a tile far from the blank cannot move', () => {
    assert.equal(applyMove(SOLVED_BOARD, 1), undefined);
  });
});

test('any sequence of legal moves keeps the board solvable', () => {
  fc.assert(fc.property(fc.array(fc.nat({ max: 3 })), (picks) => isSolvable(boardAfter(picks))));
});

const NO_GAME: GameState | undefined = undefined;
`;

test('a conforming test file produces no errors at all', async () => {
  const messages = await lint(UNIT, CONFORMING);
  assert.deepEqual(
    messages.map((m) => `${String(m.ruleId)}: ${m.message}`),
    [],
  );
});

describe('the worst real offenders from board.test.ts are reported', () => {
  test('the assert.notEqual(x, undefined) plus if-return guard', async () => {
    const code = inTest(
      'const once = applyMove(SOLVED_BOARD, 15);\nassert.notEqual(once, undefined);\nif (once === undefined) return;\nassert.deepEqual(applyMove(once, 15), [...SOLVED_BOARD]);',
    );
    const ids = new Set((await lint(UNIT, code)).map((m) => m.ruleId));
    assert.deepEqual([...ids].sort(), [
      SYNTAX,
      'test-standard/literal-expected',
      'test-standard/test-complexity',
    ]);
  });

  test('the (step * 7) % moves.length loop', async () => {
    const code = inTest(
      'let board = SOLVED_BOARD;\nfor (let step = 0; step < 60; step++) {\n  const moves = legalMoves(board);\n  const tile = moves[(step * 7) % moves.length];\n  if (tile === undefined) return;\n  board = applyMove(board, tile);\n  assert.equal(isSolvable(board), true);\n}',
    );
    const loop = await hits(UNIT, code, SYNTAX, 'Remove the loop');
    const guard = await hits(UNIT, code, SYNTAX, 'Remove the if');
    assert.equal(loop.length, 1);
    assert.equal(guard.length, 1);
  });

  test('an expected value computed with applyMove', async () => {
    const code = inTest(
      'const expected = { board: applyMove(game.board, tile), moves: 1 };\nassert.deepEqual(await service.move(id, tile), { ok: true, state: expected });',
    );
    const found = await hits(UNIT, code, 'test-standard/literal-expected');
    assert.equal(found.length, 1);
  });
});

describe('expected values inside a fast-check property', () => {
  const property = (assertion: string) =>
    inTest(`fc.assert(fc.property(fc.integer(), (seed) => {\n  ${assertion}\n}));`);

  test('may be computed, because a property compares two computed sides', async () => {
    const code = property('assert.deepEqual(roundTrip(seed), boardFrom(seed));');
    assert.equal((await hits(UNIT, code, 'test-standard/literal-expected')).length, 0);
  });

  test('must still be literal outside the property callback', async () => {
    const code = inTest('assert.deepEqual(roundTrip(1), boardFrom(1));');
    assert.equal((await hits(UNIT, code, 'test-standard/literal-expected')).length, 1);
  });
});

describe('a shared contract in test-support', () => {
  const CONTRACT = 'src/test-support/db.contract.ts';

  test('is held to the test standard, so branching in it is reported', async () => {
    const code = inTest('if (rows.length > 0) assert.equal(rows.length, 1);');
    assert.equal((await hits(CONTRACT, code, SYNTAX, 'Remove the if')).length, 1);
  });

  test('is not held to the production function-length limit', async () => {
    const code = inTest(ok);
    assert.equal((await hits(CONTRACT, code, 'test-standard/max-lines-per-function')).length, 0);
  });
});
