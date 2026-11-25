// Unit tests of the lint plugins' own rules, with oxlint's RuleTester. The gate tests in gates/
// prove the wiring (which files get which rule); these prove each rule's logic and message.
import { describe, it } from 'node:test';
import { RuleTester } from 'oxlint/plugins-dev';
import boundaries from './boundaries.js';
import standard from './test-standard.js';

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'ts' } } });
const rules = standard.rules;
const HEAD = "import assert from 'node:assert/strict';\nimport { test } from 'node:test';\n";
const inTest = (/** @type {string} */ body) =>
  `${HEAD}test('the board does the thing', () => {\n${body}\n});\n`;

tester.run('no-restricted-imports', boundaries.rules['no-restricted-imports'], {
  valid: [
    {
      code: "import '../test-support/db.ts';",
      options: [{ patterns: [{ regex: '^\\.\\./(?!test-support/)', message: 'No.' }] }],
    },
    { code: "import 'zod';", options: [{ patterns: [{ regex: '^node:', message: 'No.' }] }] },
    {
      code: "import 'Node:fs';",
      options: [{ patterns: [{ regex: '^node:', message: 'No.', caseSensitive: true }] }],
    },
  ],
  invalid: [
    {
      // Look-ahead, which oxlint's native rule (Rust regexes) cannot express.
      code: "import '../profile/store.ts';",
      options: [
        { patterns: [{ regex: '^\\.\\./(?!test-support/)[^/]+/(?!index)', message: 'Deep.' }] },
      ],
      errors: [
        {
          message: "'../profile/store.ts' import is restricted from being used by a pattern. Deep.",
        },
      ],
    },
    {
      // Case-insensitive unless caseSensitive is set, as in ESLint.
      code: "import 'Node:fs';",
      options: [{ patterns: [{ regex: '^node:', message: 'No Node.' }] }],
      errors: [{ messageId: 'patternWithCustomMessage' }],
    },
    {
      code: "export { a } from '../game/store.ts';\nexport * from '../game/store.ts';\nimport type { B } from '../game/store.ts';",
      options: [{ patterns: [{ regex: '^\\.\\./game/' }] }],
      errors: [{ messageId: 'patterns' }, { messageId: 'patterns' }, { messageId: 'patterns' }],
    },
    {
      // Every matching pattern reports.
      code: "import '../server/x.ts';",
      options: [
        {
          patterns: [
            { regex: '^\\.\\./', message: 'A.' },
            { regex: 'server', message: 'B.' },
          ],
        },
      ],
      errors: 2,
    },
  ],
});

tester.run('no-restricted-syntax', rules['no-restricted-syntax'], {
  valid: [{ code: 'f();', options: ['IfStatement'] }],
  invalid: [
    {
      code: 'if (a) f();',
      options: [{ selector: 'IfStatement', message: 'Remove the if.' }],
      errors: [{ message: 'Remove the if.' }],
    },
    {
      code: "describe('a', () => { describe('b', () => {}); });",
      options: [
        {
          selector: 'CallExpression[callee.name="describe"] CallExpression[callee.name="describe"]',
          message: 'One level.',
        },
      ],
      errors: [{ message: 'One level.' }],
    },
    {
      code: 'while (a) f();',
      options: ['WhileStatement'],
      errors: [{ message: "Using 'WhileStatement' is not allowed." }],
    },
  ],
});

tester.run('no-inline-config', rules['no-inline-config'], {
  valid: ['// Given a board\nf();', '/* the eslint docs say so */\nf();'],
  invalid: [
    {
      code: '// eslint-disable-next-line no-restricted-syntax\nf();',
      errors: [
        {
          message:
            'Lint comments are switched off in tests: remove the `eslint-disable-next-line` comment and fix the code it would hide.',
          line: 1,
        },
      ],
    },
    { code: '/* oxlint-enable */\nf();', errors: 1 },
    { code: '/* global window */\nf();', errors: 1 },
  ],
});

tester.run('literal-expected', rules['literal-expected'], {
  valid: [
    inTest("assert.deepEqual(f(), { a: [1, -2, 'x'], b: null, c: SOLVED });"),
    inTest('fc.assert(fc.property(fc.nat(), (n) => assert.equal(f(n), g(n))));'),
  ],
  invalid: [
    {
      code: inTest('assert.equal(f(), g());'),
      errors: [{ messageId: 'assert', data: { method: 'equal' } }],
    },
    {
      code: inTest('expect(await f()).toBe(x.length);').replace('() =>', 'async () =>'),
      options: [{ mode: 'expect' }],
      errors: [{ messageId: 'expect' }],
    },
  ],
});

tester.run('test-shape', rules['test-shape'], {
  valid: [inTest('assert.equal(f(), 1);')],
  invalid: [
    { code: inTest('f();'), errors: [{ messageId: 'noAssertion' }] },
    {
      code: inTest('assert.ok(a);\nassert.ok(b);\nassert.ok(c);\nassert.ok(d);'),
      errors: [{ messageId: 'tooManyAssertions', data: { count: '4', max: '3' } }],
    },
  ],
});

tester.run('allowed-imports', rules['allowed-imports'], {
  valid: [
    {
      code: "import { a } from './board.ts';\nimport type { B } from '../game/index.ts';",
      filename: 'src/puzzle/board.test.ts',
    },
  ],
  invalid: [
    {
      code: "import { a } from './shuffle.ts';",
      filename: 'src/puzzle/board.test.ts',
      errors: [{ messageId: 'unit' }],
    },
    {
      code: 'const m = await import(name);\nexport { m };',
      filename: 'src/puzzle/board.test.ts',
      errors: [{ messageId: 'dynamic' }],
    },
  ],
});

const STRAIGHT = / Tests must be straight-line code: /;
tester.run('test-complexity', rules['test-complexity'], {
  valid: [{ code: 'const f = () => g();', options: [1] }],
  invalid: [
    {
      code: 'const f = (a) => a?.b;',
      options: [1],
      errors: [
        { message: /^Arrow function has a complexity of 2\. Maximum allowed is 1\. Tests must/ },
      ],
    },
    { code: 'const f = (a = 1) => a;', options: [1], errors: [{ message: STRAIGHT }] },
    { code: 'const f = (a) => a ?? b;', options: [1], errors: [{ message: STRAIGHT }] },
  ],
});

tester.run('complexity', rules.complexity, {
  valid: [
    { code: `function f(a) {\n${'if (a === 1) return 1;\n'.repeat(7)}return 0;\n}`, options: [8] },
    // Class fields are their own functions and do not add to the class around them.
    { code: 'class A { x = a || b; y = c || d; }', options: [2] },
  ],
  invalid: [
    {
      code: `function f(a) {\n${'if (a === 1) return 1;\n'.repeat(8)}return 0;\n}`,
      options: [8],
      errors: [
        {
          message:
            "Function 'f' has a complexity of 9. Maximum allowed is 8. Split the function into smaller named functions, or replace branches with a lookup table or guard clauses.",
          line: 1,
        },
      ],
    },
    {
      code: 'class A { m() { a ||= b; c &&= d; } }',
      options: [2],
      errors: [{ message: /^Method 'm' has a complexity of 3\./ }],
    },
    {
      code: 'switch (a) { case 1: f(); case 2: g(); default: h(); }\nfunction f() { switch (a) { case 1: break; case 2: break; } }',
      options: [{ max: 1, variant: 'modified' }],
      errors: [{ message: /^Function 'f' has a complexity of 2\./ }],
    },
  ],
});

tester.run('max-depth', rules['max-depth'], {
  valid: [
    { code: 'function f() { if (a) { if (b) { if (c) { g(); } } } }', options: [3] },
    {
      code: 'function f() { if (a) {} else if (b) {} else if (c) {} else if (d) {} }',
      options: [1],
    },
  ],
  invalid: [
    {
      code: 'function f() { if (a) { if (b) { if (c) { if (d) { g(); } } } } }',
      options: [3],
      errors: [
        {
          message:
            'Blocks are nested too deeply (4). Maximum allowed is 3. Flatten the nesting with guard clauses (early return/continue) or extract the inner block into a named function.',
        },
      ],
    },
  ],
});

tester.run('test-max-nested-callbacks', rules['test-max-nested-callbacks'], {
  valid: [{ code: 'a(() => b(() => c(() => d)));', options: [3] }],
  invalid: [
    {
      code: 'a(() => b(() => c(() => e(() => d))));',
      options: [3],
      errors: [
        { message: /^Too many nested callbacks \(4\)\. Maximum allowed is 3\. Nest at most/ },
      ],
    },
  ],
});

tester.run('max-lines-per-function', rules['max-lines-per-function'], {
  valid: [
    {
      code: `function f() {\n${'g();\n// note\n\n'.repeat(38)}}`,
      options: [{ max: 40, skipBlankLines: true, skipComments: true }],
    },
  ],
  invalid: [
    {
      code: `function f() {\n${'g();\n'.repeat(39)}}`,
      options: [{ max: 40, skipBlankLines: true, skipComments: true }],
      errors: [
        {
          message:
            "Function 'f' has too many lines (41). Maximum allowed is 40. Extract cohesive parts into named helper functions so each function fits on one screen.",
        },
      ],
    },
  ],
});

const ORDER = [
  {
    groups: ['builtin', 'external', 'parent', 'sibling'],
    alphabetize: { order: 'asc', caseInsensitive: true },
  },
];
tester.run('import-order', rules['import-order'], {
  valid: [
    {
      code: "import fs from 'node:fs';\nimport { z } from 'zod';\nimport { p } from '../puzzle/index.ts';\nimport { A } from './A.ts';\nimport { b } from './b.ts';\nimport './side-effect.ts';",
      options: ORDER,
    },
    // Path segments are compared one by one, as in import-x.
    { code: "import a from 'react';\nimport b from 'react-dom/server';", options: ORDER },
  ],
  invalid: [
    {
      code: "import { b } from './b.ts';\nimport { z } from 'zod';\nimport fs from 'node:fs';",
      options: ORDER,
      output: "import fs from 'node:fs';\nimport { z } from 'zod';\nimport { b } from './b.ts';",
      // The messages of import-x's `order` for the same code, word for word.
      errors: [
        {
          message:
            '`zod` import should occur before import of `./b.ts`. Order imports as builtin (node:*), packages, ../parent, ./sibling, each group alphabetized; run oxlint --fix.',
        },
        { message: /^`node:fs` import should occur before import of `\.\/b\.ts`\./ },
      ],
    },
    {
      // A comment between the imports: no fix, the import has to be moved by hand.
      code: "import { b } from './b.ts';\n// why\nimport { a } from './a.ts';",
      options: ORDER,
      output: null,
      errors: [{ message: /^`\.\/a\.ts` import should occur before import of `\.\/b\.ts`\./ }],
    },
    {
      code: "import type { T } from './t.ts';\nimport { z } from 'zod';",
      options: ORDER,
      output: "import { z } from 'zod';\nimport type { T } from './t.ts';",
      errors: [{ message: /^`zod` import should occur before type import of `\.\/t\.ts`\./ }],
    },
  ],
});
