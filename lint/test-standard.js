// @ts-check
/**
 * TEST STANDARD (lint-enforced). Tested in gates/test-standard.test.ts and lint/rules.test.js.
 *
 * An oxlint JS plugin, `test-standard`, and three override lists that oxlint.config.ts wires in:
 *   testStandard     - src/**\/*.test.{ts,tsx} and src/test-support/**\/*.contract.ts
 *   e2eStandard      - e2e/**\/*.spec.ts
 *   productionLimits - every other src/**\/*.{ts,tsx}
 *
 * Every message says how to fix the problem. The ported ESLint core rules (./eslint-core.js) and
 * import order (./import-order.js) have fixed messages, so they are registered through `withHint()`
 * below, which appends a fix hint. Rule ids live in the `test-standard` plugin, so they never clash
 * with the boundary rules in ./boundaries.js or with oxlint's native rules.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { complexity, maxDepth, maxLinesPerFunction, maxNestedCallbacks } from './eslint-core.js';
import { importOrder } from './import-order.js';

/** Absolute path of this plugin, for `jsPlugins` in a config that lives anywhere. */
export const PLUGIN_PATH = fileURLToPath(import.meta.url);

// ---------------------------------------------------------------------------------------------
// Numbers (the owner's limits; tests prove each one)
// ---------------------------------------------------------------------------------------------
const TEST_LIMITS = {
  maxAssertions: 3, // assert.* calls per test callback
  maxStatements: 8, // top-level statements per function (Given 3 + When 2 + Then 3)
  maxLines: 20, // lines holding code per function, blank lines and comments excluded
  maxNestedCallbacks: 3, // describe > test > fc.property
  maxDepth: 1,
};
const PROD_LIMITS = { complexity: 8, maxDepth: 3, maxLinesPerFunction: 40 };

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

/**
 * Returns `rule` with `hint` appended to every message it reports.
 * @param {any} rule
 * @param {string} hint
 */
function withHint(rule, hint) {
  /** @type {Record<string, string>} */
  const messages = {};
  for (const [id, text] of Object.entries(
    /** @type {Record<string, string>} */ (rule.meta.messages),
  )) {
    const stop = /[.!?]$/.test(text) ? '' : '.';
    messages[id] = `${text}${stop} ${hint}`;
  }
  return { ...rule, meta: { ...rule.meta, messages } };
}

/**
 * Names along a callee: `test` -> ['test'], `test.describe.only` -> ['test', 'describe', 'only'].
 * @param {any} callee
 * @returns {string[]}
 */
function calleeNames(callee) {
  if (callee?.type === 'Identifier') return [callee.name];
  if (callee?.type === 'MemberExpression' && !callee.computed) {
    return [...calleeNames(callee.object), callee.property.name];
  }
  return [];
}

/** @param {any} node */
const isTestCall = (node) =>
  node.type === 'CallExpression' &&
  node.callee.type === 'Identifier' &&
  (node.callee.name === 'test' || node.callee.name === 'it');

/** @param {any} node */
const isDescribeCall = (node) =>
  node?.type === 'CallExpression' && calleeNames(node.callee).includes('describe');

// ---------------------------------------------------------------------------------------------
// Local rules
// ---------------------------------------------------------------------------------------------

/** Count of lines that hold code (tokens) inside `node`: blank lines and comments do not count. */
function codeLines(sourceCode, node) {
  const lines = new Set();
  for (const token of sourceCode.getTokens(node)) {
    for (let l = token.loc.start.line; l <= token.loc.end.line; l++) lines.add(l);
  }
  return lines.size;
}

/** A contract helper: a function whose whole body is one describe(...) call holding the tests. */
function wrapsOnlyDescribe(fn) {
  const body = fn.body;
  if (body.type !== 'BlockStatement') return isDescribeCall(body);
  const [only, ...rest] = body.body;
  return (
    rest.length === 0 && only?.type === 'ExpressionStatement' && isDescribeCall(only.expression)
  );
}

const testShape = {
  meta: {
    type: 'suggestion',
    schema: [
      {
        type: 'object',
        properties: {
          assertion: { enum: ['assert', 'expect'] },
          maxAssertions: { type: 'integer' },
          maxStatements: { type: 'integer' },
          maxLines: { type: 'integer' },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      noAssertion:
        'This test asserts nothing: add assert.equal/deepEqual(actual, expected) or fc.assert(fc.property(...)) directly in the test callback.',
      noExpect:
        'This test asserts nothing: add an expect(...) in the test callback (await expect(locator).toHaveText(...) for the UI).',
      tooManyAssertions:
        'This test has {{count}} assert calls (max {{max}}): split it into one test per behaviour, or compare one object literal with assert.deepEqual.',
      tooManyStatements:
        'This function has {{count}} statements (max {{max}}): keep Given/When/Then short and move setup into a helper in ../test-support/.',
      tooManyLines:
        'This function has {{count}} code lines (max {{max}}): split the test or move setup into a helper in ../test-support/.',
    },
  },
  create(context) {
    const options = context.options[0] ?? {};
    const mode = options.assertion ?? 'assert';
    const maxAssertions = options.maxAssertions ?? TEST_LIMITS.maxAssertions;
    const maxStatements = options.maxStatements ?? TEST_LIMITS.maxStatements;
    const maxLines = options.maxLines ?? TEST_LIMITS.maxLines;
    /** @type {{ node: any, count: number, present: boolean }[]} */
    const frames = [];

    /** @param {any} node @returns {'counted' | 'present' | undefined} */
    const assertionKind = (node) => {
      const names = calleeNames(node.callee);
      if (mode === 'expect')
        return names[0] === 'expect' && names.length <= 2 ? 'counted' : undefined;
      if (names[0] === 'assert' && names.length <= 2) return 'counted';
      if (names[0] === 'fc' && (names[1] === 'assert' || names[1] === 'property')) return 'present';
      return undefined;
    };

    return {
      CallExpression(node) {
        if (isTestCall(node)) {
          frames.push({ node, count: 0, present: false });
          return;
        }
        const kind = assertionKind(node);
        const frame = frames.at(-1);
        if (!kind || !frame) return;
        frame.present = true;
        if (kind === 'counted') frame.count += 1;
      },
      'CallExpression:exit'(node) {
        if (frames.at(-1)?.node !== node) return;
        const frame = /** @type {{ count: number, present: boolean }} */ (frames.pop());
        if (!frame.present) {
          context.report({ node, messageId: mode === 'expect' ? 'noExpect' : 'noAssertion' });
        } else if (frame.count > maxAssertions) {
          context.report({
            node,
            messageId: 'tooManyAssertions',
            data: { count: String(frame.count), max: String(maxAssertions) },
          });
        }
      },
      /** Size limits for every function except describe callbacks (they hold the tests). */
      ':function'(/** @type {any} */ fn) {
        if (isDescribeCall(fn.parent) || wrapsOnlyDescribe(fn)) return;
        const statements = fn.body.type === 'BlockStatement' ? fn.body.body.length : 1;
        if (statements > maxStatements) {
          const data = { count: String(statements), max: String(maxStatements) };
          context.report({ node: fn, messageId: 'tooManyStatements', data });
        }
        const lines = codeLines(context.sourceCode, fn);
        if (lines > maxLines) {
          const data = { count: String(lines), max: String(maxLines) };
          context.report({ node: fn, messageId: 'tooManyLines', data });
        }
      },
    };
  },
};

const ASSERT_EQUALITY = new Set([
  'equal',
  'deepEqual',
  'strictEqual',
  'deepStrictEqual',
  'notEqual',
  'notDeepEqual',
  'notStrictEqual',
  'notDeepStrictEqual',
]);
const UPPER_CASE = /^[A-Z][A-Z0-9_]*$/;

/**
 * True for a hand-written value: literals, `undefined`, UPPER_CASE constants, grid`...`,
 * and arrays/objects made only of those.
 * @param {any} node
 * @returns {boolean}
 */
function isLiteralValue(node) {
  switch (node?.type) {
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
      return isLiteralValue(node.expression);
    case 'Literal':
      return true;
    case 'TemplateLiteral':
      return node.expressions.length === 0;
    case 'TaggedTemplateExpression':
      return (
        node.tag.type === 'Identifier' &&
        node.tag.name === 'grid' &&
        node.quasi.expressions.length === 0
      );
    case 'Identifier':
      return ['undefined', 'NaN', 'Infinity'].includes(node.name) || UPPER_CASE.test(node.name);
    case 'UnaryExpression':
      return (node.operator === '-' || node.operator === '+') && node.argument.type === 'Literal';
    case 'ArrayExpression':
      return node.elements.every((/** @type {any} */ e) => e === null || isLiteralValue(e));
    case 'ObjectExpression':
      return node.properties.every(
        (/** @type {any} */ p) =>
          p.type === 'Property' &&
          !p.computed &&
          p.kind === 'init' &&
          !p.method &&
          isLiteralValue(p.value),
      );
    default:
      return false;
  }
}

/**
 * The receiver of a matcher, through `.not`, `.resolves`, `.rejects`: `expect(x).not.toBe` -> expect(x).
 * @param {any} node
 */
function expectCall(node) {
  let current = node;
  while (current?.type === 'MemberExpression') current = current.object;
  return current?.type === 'CallExpression' && calleeNames(current.callee)[0] === 'expect';
}

/** True when one of the ancestors is a call to fc.property / fc.asyncProperty. */
function insideProperty(ancestors) {
  return ancestors.some((ancestor) => {
    if (ancestor.type !== 'CallExpression') return false;
    const [object, method] = calleeNames(ancestor.callee);
    return object === 'fc' && (method === 'property' || method === 'asyncProperty');
  });
}

const literalExpected = {
  meta: {
    type: 'suggestion',
    schema: [
      {
        type: 'object',
        properties: { mode: { enum: ['assert', 'expect'] } },
        additionalProperties: false,
      },
    ],
    messages: {
      assert:
        'The expected value (2nd argument of assert.{{method}}) must be written out by hand: use a literal, an array/object of literals, grid`...` or an UPPER_CASE constant, never a call, variable or computation.',
      expect:
        'The expected value of .{{method}}() must be written out by hand: use a literal, an array/object of literals or an UPPER_CASE constant, never a call, variable or computation.',
    },
  },
  create(context) {
    const mode = context.options[0]?.mode ?? 'assert';
    return {
      CallExpression(/** @type {any} */ node) {
        const callee = node.callee;
        if (callee.type !== 'MemberExpression' || callee.computed) return;
        const method = callee.property.name;
        const isAssert =
          mode === 'assert' &&
          callee.object.type === 'Identifier' &&
          callee.object.name === 'assert' &&
          ASSERT_EQUALITY.has(method);
        const isExpect =
          mode === 'expect' && expectCall(callee.object) && node.arguments.length > 0;
        if (!isAssert && !isExpect) return;
        const expected = node.arguments[isAssert ? 1 : 0];
        if (!expected || isLiteralValue(expected)) return;
        // A property compares two computed sides for every generated input: no literal is possible.
        if (insideProperty(context.sourceCode.getAncestors(node))) return;
        context.report({ node: expected, messageId: mode, data: { method } });
      },
    };
  },
};

const UNIT_PACKAGES = new Set([
  'node:test',
  'node:assert/strict',
  'fast-check',
  'react',
  'react-dom/server',
]);
// features.ts(x) is the pins file of a composition root: its public wiring.
const OWN_ENTRIES = new Set([
  './index.ts',
  './server.ts',
  './client.tsx',
  './features.ts',
  './features.tsx',
]);
const TEST_SUPPORT = /^\.\.\/test-support\/[\w.-]+\.ts$/;
const OTHER_PUBLIC_ENTRY = /^\.\.\/[\w-]+\/(index\.ts|server\.ts|client\.tsx)$/;
const E2E_PACKAGES = new Set(['@playwright/test', '@axe-core/playwright']);

const allowedImports = {
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        properties: { mode: { enum: ['unit', 'e2e'] } },
        additionalProperties: false,
      },
    ],
    messages: {
      unit: "'{{spec}}' is not allowed here: {{file}} may import only ./{{base}}.ts(x), ./index.ts, ./server.ts, ./client.tsx, ../test-support/*.ts, node:test, node:assert/strict, fast-check, react and react-dom/server (plus `import type` from another module's public entry), so test through the public entry and move shared helpers to src/test-support/.",
      e2e: "'{{spec}}' is not allowed here: e2e specs may import only @playwright/test, @axe-core/playwright and files under e2e/, so drive the app through the browser and keep helpers in e2e/.",
      dynamic: 'Use a static import with a string literal so the allowed-imports check can see it.',
    },
  },
  create(context) {
    const mode = context.options[0]?.mode ?? 'unit';
    const file = context.filename;
    const fileName = path.basename(file);
    const base = fileName.replace(/\.(test|spec)\.tsx?$/, '');
    const segments = path.resolve(file).split(path.sep);
    const e2eRoot = segments.slice(0, segments.lastIndexOf('e2e') + 1).join(path.sep);

    /** @param {string} spec @param {boolean} typeOnly */
    const allowed = (spec, typeOnly) => {
      if (mode === 'e2e') {
        if (E2E_PACKAGES.has(spec)) return true;
        const target = path.resolve(path.dirname(path.resolve(file)), spec);
        return spec.startsWith('.') && target.startsWith(e2eRoot + path.sep);
      }
      return (
        UNIT_PACKAGES.has(spec) ||
        spec === `./${base}.ts` ||
        spec === `./${base}.tsx` ||
        OWN_ENTRIES.has(spec) ||
        TEST_SUPPORT.test(spec) ||
        (typeOnly && OTHER_PUBLIC_ENTRY.test(spec))
      );
    };

    /** @param {any} node @param {any} source @param {boolean} typeOnly */
    const check = (node, source, typeOnly) => {
      if (source?.type !== 'Literal' || typeof source.value !== 'string') {
        context.report({ node, messageId: 'dynamic' });
        return;
      }
      if (allowed(source.value, typeOnly)) return;
      context.report({
        node: source,
        messageId: mode,
        data: { spec: source.value, file: fileName, base },
      });
    };

    return {
      ImportDeclaration: (/** @type {any} */ n) => check(n, n.source, n.importKind === 'type'),
      ExportAllDeclaration: (/** @type {any} */ n) => check(n, n.source, n.exportKind === 'type'),
      ExportNamedDeclaration: (/** @type {any} */ n) => {
        if (n.source) check(n, n.source, n.exportKind === 'type');
      },
      ImportExpression: (/** @type {any} */ n) => check(n, n.source, false),
    };
  },
};

/** ESLint's no-restricted-syntax (lib/rules/no-restricted-syntax.js, MIT, see ./eslint-core.js). */
const restrictedSyntax = {
  meta: {
    type: 'suggestion',
    schema: {
      type: 'array',
      items: {
        oneOf: [
          { type: 'string' },
          {
            type: 'object',
            properties: { selector: { type: 'string' }, message: { type: 'string' } },
            required: ['selector'],
            additionalProperties: false,
          },
        ],
      },
      uniqueItems: true,
      minItems: 0,
    },
    messages: { restrictedSyntax: '{{message}}' },
  },
  /** @param {any} context */
  create(context) {
    /** @type {Record<string, (node: any) => void>} */
    const visitors = {};
    for (const option of /** @type {(string | { selector: string, message?: string })[]} */ (
      context.options
    )) {
      const selector = typeof option === 'string' ? option : option.selector;
      const message =
        typeof option !== 'string' && option.message
          ? option.message
          : `Using '${selector}' is not allowed.`;
      visitors[selector] = (node) =>
        context.report({ node, messageId: 'restrictedSyntax', data: { message } });
    }
    return visitors;
  },
};

/**
 * Inline configuration is switched off in tests (ESLint's `noInlineConfig`). oxlint has no such
 * option and honours `oxlint-disable` and `eslint-disable` comments, so every directive comment in a
 * test file is an error: a test cannot switch a rule off.
 *
 * A directive can hide the report about itself: one without a rule list hides every rule, and one
 * that names this rule hides this rule. For those two, the rule also throws, after every visitor
 * has run. oxlint turns a thrown error into an error of its own that no comment can hide (the file's
 * other plugin reports are lost with it, and come back once the comment is removed).
 */
const DIRECTIVE =
  /^\s*(?:(?:eslint|oxlint)(?:-disable(?:-next-line|-line)?|-enable|-env)?|globals?|exported)(?:\s|$)/;
const DISABLE = /^\s*(?:eslint|oxlint)-disable(?:-next-line|-line)?(?:\s|$)/;
const noInlineConfig = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      locked:
        'Lint comments are switched off in tests: remove the `{{directive}}` comment and fix the code it would hide.',
    },
  },
  /** @param {any} context */
  create(context) {
    /** @type {string[]} */
    const unhideable = [];
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          if (!DIRECTIVE.test(comment.value)) continue;
          const [directive = '', ...rest] = comment.value.trim().split(/\s+/);
          context.report({ loc: comment.loc, messageId: 'locked', data: { directive } });
          const rules = rest.join(' ').split('--')[0].trim();
          if (DISABLE.test(comment.value) && (rules === '' || rules.includes('no-inline-config'))) {
            unhideable.push(`line ${String(comment.loc.start.line)}: \`${directive}\``);
          }
        }
      },
      'Program:exit'() {
        if (unhideable.length === 0) return;
        const error = new Error(
          `Lint comments are switched off in tests (${unhideable.join(', ')}): remove the comment and fix the code it would hide.`,
        );
        error.stack = error.message;
        throw error;
      },
    };
  },
};

// ---------------------------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------------------------
const STRAIGHT_LINE =
  'Tests must be straight-line code: remove if, ?:, &&, ||, ??, ?. and default values; narrow with assert.ok(x) and split cases into separate tests or a fast-check property.';

export default {
  meta: { name: 'test-standard' },
  rules: {
    'allowed-imports': allowedImports,
    'literal-expected': literalExpected,
    'test-shape': testShape,
    'no-restricted-syntax': restrictedSyntax,
    'no-inline-config': noInlineConfig,
    'test-complexity': withHint(complexity, STRAIGHT_LINE),
    'test-max-depth': withHint(maxDepth, STRAIGHT_LINE),
    'test-max-nested-callbacks': withHint(
      maxNestedCallbacks,
      'Nest at most describe > test > fc.property: move inner callbacks into named helpers in ../test-support/.',
    ),
    complexity: withHint(
      complexity,
      'Split the function into smaller named functions, or replace branches with a lookup table or guard clauses.',
    ),
    'max-depth': withHint(
      maxDepth,
      'Flatten the nesting with guard clauses (early return/continue) or extract the inner block into a named function.',
    ),
    'max-lines-per-function': withHint(
      maxLinesPerFunction,
      'Extract cohesive parts into named helper functions so each function fits on one screen.',
    ),
    'import-order': withHint(
      importOrder,
      'Order imports as builtin (node:*), packages, ../parent, ./sibling, each group alphabetized; run oxlint --fix.',
    ),
  },
};

// ---------------------------------------------------------------------------------------------
// Banned syntax in tests (ONE array per file set: a later override of the same rule replaces it)
// ---------------------------------------------------------------------------------------------
const TEST_CALL = 'CallExpression[callee.name=/^(test|it)$/]';
const DESCRIBE =
  ':matches(CallExpression[callee.name="describe"], CallExpression[callee.property.name="describe"])';
const ban = (selector, message) => ({ selector, message });

const TEST_SYNTAX = [
  ban(
    'IfStatement',
    'Remove the if: narrow a possibly-undefined value with assert.ok(x) (TypeScript then knows it is defined), or split the cases into separate tests.',
  ),
  ban(
    'SwitchStatement',
    'Remove the switch: write one test per case with its own literal expected value.',
  ),
  ban(
    'ConditionalExpression',
    'Remove the ?: operator: write one test per case, each with a literal expected value.',
  ),
  ban(
    ':matches(ForStatement, ForInStatement, ForOfStatement, WhileStatement, DoWhileStatement)',
    'Remove the loop: for many inputs write a fast-check property, fc.assert(fc.property(arb, (x) => ...)), otherwise one test per case.',
  ),
  ban(
    'CallExpression[callee.property.name=/^(forEach|map|reduce|filter|flatMap|every|some)$/]',
    'Do not iterate with forEach/map/reduce/filter/flatMap/every/some in a test file: write inputs and expected values as literals, use a fast-check property, or move the builder to ../test-support/.',
  ),
  ban(
    'TryStatement',
    'Remove try/catch: use assert.throws(() => fn(), expected) or await assert.rejects(promise, expected).',
  ),
  ban(
    `${TEST_CALL} > :function ReturnStatement`,
    'Do not return inside a test: replace `if (x === undefined) return;` with assert.ok(x), and write fast-check predicates as expression-bodied arrows.',
  ),
  ban(
    'CallExpression > MemberExpression.callee[property.name=/^(only|skip|todo|fixme)$/]',
    'Remove .only/.skip/.todo: commit only tests that run, so fix or delete the test instead.',
  ),
  ban(
    'CallExpression[callee.name=/^(test|it|describe)$/] > ObjectExpression > Property[key.name=/^(only|skip|todo)$/]',
    'Remove the only/skip/todo option: commit only tests that run, so fix or delete the test instead.',
  ),
  ban(
    `${DESCRIBE} ${DESCRIBE}`,
    'Use one describe level only: move these tests into the outer describe and put the context into each test name.',
  ),
  ban(
    'MemberExpression[object.name="Math"][property.name="random"]',
    'Do not use Math.random in tests: use a seeded generator such as createRng(1) or a fast-check arbitrary.',
  ),
  ban(
    ':matches(MemberExpression[object.name="Date"][property.name="now"], NewExpression[callee.name="Date"][arguments.length=0], CallExpression[callee.name="Date"])',
    "Do not read the clock in tests: use a fixed date such as new Date('2026-01-01T00:00:00Z') or inject a clock.",
  ),
  ban(
    'Identifier[name=/^(setTimeout|setInterval)$/]',
    'Do not use setTimeout/setInterval in tests: await the promise or event you need, or use mock.timers from node:test.',
  ),
  ban(
    `${TEST_CALL}:not([arguments.0.value=/^\\S+\\s+\\S+\\s+\\S/])`,
    "Name the test with a string literal sentence of at least 3 words that states the behaviour, e.g. 'sliding a tile next to the blank swaps them'.",
  ),
  ban(
    `${TEST_CALL}[arguments.0.value=/^(test|should work|works)\\b/i]`,
    "Start the test name with the subject and the behaviour, not with 'test', 'should work' or 'works', e.g. 'an illegal move leaves the board unchanged'.",
  ),
];

/** @param {'assert' | 'expect'} assertion */
const testRules = (assertion) => ({
  'test-standard/no-restricted-syntax': ['error', ...TEST_SYNTAX],
  'test-standard/no-inline-config': 'error',
  'test-standard/test-complexity': ['error', 1],
  'test-standard/test-max-depth': ['error', TEST_LIMITS.maxDepth],
  'test-standard/test-max-nested-callbacks': ['error', TEST_LIMITS.maxNestedCallbacks],
  'test-standard/test-shape': [
    'error',
    {
      assertion,
      maxAssertions: assertion === 'assert' ? TEST_LIMITS.maxAssertions : 1000,
      maxStatements: TEST_LIMITS.maxStatements,
      maxLines: TEST_LIMITS.maxLines,
    },
  ],
  'test-standard/literal-expected': ['error', { mode: assertion }],
});

// Unused disable directives are an error everywhere: oxlint.config.ts sets
// options.reportUnusedDisableDirectives, which oxlint reads from the root config only.

export const testStandard = [
  {
    // A *.contract.ts file in test-support defines tests shared by several test files.
    files: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/test-support/**/*.contract.ts'],
    rules: {
      ...testRules('assert'),
      'test-standard/allowed-imports': ['error', { mode: 'unit' }],
    },
  },
];

export const e2eStandard = [
  {
    files: ['e2e/**/*.spec.ts'],
    rules: {
      ...testRules('expect'),
      'test-standard/allowed-imports': ['error', { mode: 'e2e' }],
    },
  },
];

export const productionLimits = [
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    excludeFiles: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/test-support/**/*.contract.ts'],
    rules: {
      'test-standard/complexity': ['error', PROD_LIMITS.complexity],
      'test-standard/max-depth': ['error', PROD_LIMITS.maxDepth],
      'test-standard/max-lines-per-function': [
        'error',
        { max: PROD_LIMITS.maxLinesPerFunction, skipBlankLines: true, skipComments: true },
      ],
      // Native: oxlint resolves the TypeScript imports itself. Type-only imports do not count, as in
      // import-x. Its message comes with a help line on how to break the cycle.
      'import/no-cycle': 'error',
      'test-standard/import-order': [
        'error',
        {
          groups: ['builtin', 'external', 'parent', 'sibling'],
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
    },
  },
];
