import { fileURLToPath } from 'node:url';
import { defineConfig } from 'oxlint';
import type { DummyRuleMap, OxlintOverride } from 'oxlint';

/**
 * ARCHITECTURE RULES (modular monolith). See AGENTS.md.
 *
 * Foundations: src/db, src/profile, src/game (a generic game engine that knows no particular game).
 * Features: src/puzzle. A feature plugs into the foundations and must be deletable: remove its
 * folder and its `// pin:` lines in the composition roots, and the project still compiles
 * (scripts/check-deletion.js proves it).
 * Composition roots: src/server, src/web (the only places that wire modules together).
 * A module's public entry points are index.ts (isomorphic), server.ts and client.tsx.
 * Everything else inside a module is private. Duplicate a little instead of reaching in.
 */

/** Which other modules each module may depend on (through public entry points only). */
const MODULE_DEPS: Record<string, string[]> = {
  db: [],
  profile: ['db'],
  game: ['db', 'profile'],
  puzzle: ['game', 'profile'],
};
const FEATURES = Object.keys(MODULE_DEPS);
/** Game rules stay free of every dependency, so they run anywhere and are trivially testable. */
const PURE_FILES = ['src/puzzle/rules.ts', 'src/puzzle/shuffle.ts', 'src/puzzle/rng.ts'];
const ENTRY = '(index|server|client)\\.tsx?$';

interface Group {
  regex: string;
  message: string;
}
const group = (regex: string, message: string): Group => ({ regex, message });

/** Imports of other modules' internals, of composition roots, or of modules not in the allowlist. */
function moduleImportRules(name: string): Group[] {
  const allowed = MODULE_DEPS[name] ?? [];
  const forbiddenModules = FEATURES.filter((m) => m !== name && !allowed.includes(m));
  return [
    group(
      `^\\.\\./(?!test-support/)[^/]+/(?!${ENTRY})`,
      'Deep import into another module. Import only its index.ts, server.ts or client.tsx.',
    ),
    group('^\\.\\./(server|web)(/|$)', 'Feature modules must not import composition roots.'),
    ...(forbiddenModules.length
      ? [
          group(
            `^\\.\\./(${forbiddenModules.join('|')})(/|$)`,
            `Module "${name}" may only depend on: ${allowed.join(', ') || 'nothing'}.`,
          ),
        ]
      : []),
    group('^\\.\\./\\.\\./', 'Do not reach outside src/.'),
  ];
}

const noServerFromClient = [
  group('(^|/)server(\\.ts)?$', 'Client code must not import server code.'),
  group('^(node:|hono|@hono/)', 'Client code must not import Node or server libraries.'),
];
const noClientFromServer = [
  group('(^|/)client(\\.tsx)?$', 'Server code must not import client code.'),
  group('^(react|react-dom)(/|$)', 'Server code must not import React.'),
];

/**
 * The boundary rule, a JavaScript port of ESLint's no-restricted-imports in lint/boundaries.js:
 * oxlint's native rule takes Rust regexes, which have no look-ahead.
 */
const restrict = (patterns: Group[]): DummyRuleMap => ({
  'boundaries/no-restricted-imports': ['error', { patterns }],
});

const featureConfigs: OxlintOverride[] = FEATURES.flatMap((name) => {
  const base = moduleImportRules(name);
  const extra =
    name === 'db' ? [group('^\\.\\./(?!test-support/)', 'db must not import other modules.')] : [];
  return [
    { files: [`src/${name}/**/*.{ts,tsx}`], rules: restrict([...base, ...extra]) },
    {
      files: [`src/${name}/server.ts`],
      rules: restrict([...base, ...extra, ...noClientFromServer]),
    },
    {
      files: [`src/${name}/client.tsx`],
      rules: restrict([...base, ...extra, ...noServerFromClient]),
    },
  ];
});

const pureConfig: OxlintOverride = {
  files: PURE_FILES,
  rules: restrict([
    ...moduleImportRules('puzzle'),
    group('^(?!\\./)', 'Game rules are pure: only relative imports inside src/puzzle.'),
  ]),
};

/** Test-only code stays out of production files. A separate rule id, so it adds to the rules above. */
const noTestCodeInProduction: OxlintOverride = {
  files: ['src/**/*.{ts,tsx}'],
  excludeFiles: ['src/**/*.test.{ts,tsx}', 'src/test-support/**'],
  rules: {
    'boundaries/production-no-restricted-imports': [
      'error',
      {
        patterns: [
          group(
            '(^|/)test-support/',
            'test-support is for tests only. Move shared production code into a module.',
          ),
          group('^(fast-check|node:test|node:assert)', 'Test libraries are for test files only.'),
        ],
      },
    ],
  },
};

// lint/test-standard.js is plain JS (no .d.ts); load it untyped and name the shape here.
const standardUrl = new URL('./lint/test-standard.js', import.meta.url).href;
const { testStandard, e2eStandard, productionLimits } = (await import(standardUrl)) as Record<
  'testStandard' | 'e2eStandard' | 'productionLimits',
  OxlintOverride[]
>;

/** Absolute, so a config that spreads this one from another folder still finds the plugins. */
export const JS_PLUGINS = [
  fileURLToPath(new URL('./lint/boundaries.js', import.meta.url)),
  fileURLToPath(standardUrl),
];

// ---------------------------------------------------------------------------------------------
// The rule set: ESLint's `js.configs.recommended` plus typescript-eslint's `strictTypeChecked` and
// `stylisticTypeChecked`, listed one by one (no oxlint category is switched on), with the options
// those presets set wherever oxlint's defaults differ.
// ---------------------------------------------------------------------------------------------

const on = (names: string[]): DummyRuleMap => Object.fromEntries(names.map((n) => [n, 'error']));
const off = (names: string[]): DummyRuleMap => Object.fromEntries(names.map((n) => [n, 'off']));

/** @eslint/js recommended. no-octal and no-dupe-args have no rule: oxc refuses both as syntax errors in modules, and every file here is a module. */
const ESLINT_RECOMMENDED = [
  'constructor-super',
  'for-direction',
  'getter-return',
  'no-async-promise-executor',
  'no-case-declarations',
  'no-class-assign',
  'no-compare-neg-zero',
  'no-cond-assign',
  'no-const-assign',
  'no-constant-binary-expression',
  'no-constant-condition',
  'no-control-regex',
  'no-debugger',
  'no-delete-var',
  'no-dupe-class-members',
  'no-dupe-else-if',
  'no-dupe-keys',
  'no-duplicate-case',
  'no-empty',
  'no-empty-character-class',
  'no-empty-pattern',
  'no-empty-static-block',
  'no-ex-assign',
  'no-extra-boolean-cast',
  'no-fallthrough',
  'no-func-assign',
  'no-global-assign',
  'no-import-assign',
  'no-invalid-regexp',
  'no-irregular-whitespace',
  'no-loss-of-precision',
  'no-misleading-character-class',
  'no-new-native-nonconstructor',
  'no-nonoctal-decimal-escape',
  'no-obj-calls',
  'no-prototype-builtins',
  'no-redeclare',
  'no-regex-spaces',
  'no-self-assign',
  'no-setter-return',
  'no-shadow-restricted-names',
  'no-sparse-arrays',
  'no-this-before-super',
  'no-unassigned-vars',
  'no-undef',
  'no-unexpected-multiline',
  'no-unreachable',
  'no-unsafe-finally',
  'no-unsafe-negation',
  'no-unsafe-optional-chaining',
  'no-unused-labels',
  'no-unused-private-class-members',
  'no-useless-assignment',
  'no-useless-backreference',
  'no-useless-catch',
  'no-useless-escape',
  'no-with',
  'preserve-caught-error',
  'require-yield',
  'use-isnan',
  'valid-typeof',
];

/** What typescript-eslint's eslint-recommended switches off for TypeScript (the compiler checks it). */
const OFF_FOR_TYPESCRIPT = [
  'constructor-super',
  'getter-return',
  'no-class-assign',
  'no-const-assign',
  'no-dupe-class-members',
  'no-dupe-keys',
  'no-func-assign',
  'no-import-assign',
  'no-new-native-nonconstructor',
  'no-obj-calls',
  'no-redeclare',
  'no-setter-return',
  'no-this-before-super',
  'no-undef',
  'no-unreachable',
  'no-unsafe-negation',
  'no-with',
];
/** ...and what it switches on for TypeScript. */
const ON_FOR_TYPESCRIPT = ['no-var', 'prefer-const', 'prefer-rest-params', 'prefer-spread'];

/** strict + stylistic rules that need no type information (typescript-eslint's extension rules run as oxlint's eslint/* rules, which understand TypeScript). */
const TYPESCRIPT_SYNTAX = [
  'no-array-constructor',
  'no-empty-function',
  'no-unused-expressions',
  'no-unused-vars',
  'no-useless-constructor',
  'typescript/adjacent-overload-signatures',
  'typescript/array-type',
  'typescript/ban-ts-comment',
  'typescript/ban-tslint-comment',
  'typescript/class-literal-property-style',
  'typescript/consistent-generic-constructors',
  'typescript/consistent-indexed-object-style',
  'typescript/consistent-type-assertions',
  'typescript/consistent-type-definitions',
  'typescript/consistent-type-imports',
  'typescript/no-confusing-non-null-assertion',
  'typescript/no-duplicate-enum-values',
  'typescript/no-dynamic-delete',
  'typescript/no-empty-object-type',
  'typescript/no-explicit-any',
  'typescript/no-extra-non-null-assertion',
  'typescript/no-extraneous-class',
  'typescript/no-inferrable-types',
  'typescript/no-invalid-void-type',
  'typescript/no-misused-new',
  'typescript/no-namespace',
  'typescript/no-non-null-asserted-nullish-coalescing',
  'typescript/no-non-null-asserted-optional-chain',
  'typescript/no-non-null-assertion',
  'typescript/no-require-imports',
  'typescript/no-this-alias',
  'typescript/no-unnecessary-type-constraint',
  'typescript/no-unsafe-declaration-merging',
  'typescript/no-unsafe-function-type',
  'typescript/no-wrapper-object-types',
  'typescript/prefer-as-const',
  'typescript/prefer-for-of',
  'typescript/prefer-function-type',
  'typescript/prefer-literal-enum-member',
  'typescript/prefer-namespace-keyword',
  'typescript/triple-slash-reference',
  'typescript/unified-signatures',
];

/** strict + stylistic rules that need type information: run by tsgolint (options.typeAware). */
const TYPE_AWARE = [
  'typescript/await-thenable',
  'typescript/dot-notation',
  'typescript/no-array-delete',
  'typescript/no-base-to-string',
  'typescript/no-confusing-void-expression',
  'typescript/no-deprecated',
  'typescript/no-duplicate-type-constituents',
  'typescript/no-floating-promises',
  'typescript/no-for-in-array',
  'typescript/no-generated-empty-object-type',
  'typescript/no-implied-eval',
  'typescript/no-meaningless-void-operator',
  'typescript/no-misused-promises',
  'typescript/no-misused-spread',
  'typescript/no-mixed-enums',
  'typescript/no-redundant-type-constituents',
  'typescript/no-unnecessary-boolean-literal-compare',
  'typescript/no-unnecessary-condition',
  'typescript/no-unnecessary-template-expression',
  'typescript/no-unnecessary-type-arguments',
  'typescript/no-unnecessary-type-assertion',
  'typescript/no-unnecessary-type-conversion',
  'typescript/no-unnecessary-type-parameters',
  'typescript/no-unsafe-argument',
  'typescript/no-unsafe-assignment',
  'typescript/no-unsafe-call',
  'typescript/no-unsafe-class-instance-assignment',
  'typescript/no-unsafe-enum-assignment',
  'typescript/no-unsafe-enum-comparison',
  'typescript/no-unsafe-member-access',
  'typescript/no-unsafe-return',
  'typescript/no-unsafe-unary-minus',
  'typescript/no-useless-default-assignment',
  'typescript/non-nullable-type-assertion-style',
  'typescript/only-throw-error',
  'typescript/prefer-find',
  'typescript/prefer-includes',
  'typescript/prefer-nullish-coalescing',
  'typescript/prefer-optional-chain',
  'typescript/prefer-promise-reject-errors',
  'typescript/prefer-reduce-type-parameter',
  'typescript/prefer-regexp-exec',
  'typescript/prefer-return-this-type',
  'typescript/prefer-string-starts-ends-with',
  'typescript/related-getter-setter-pairs',
  'typescript/require-await',
  'typescript/restrict-plus-operands',
  'typescript/restrict-template-expressions',
  'typescript/return-await',
  'typescript/unbound-method',
  'typescript/use-unknown-in-catch-callback-variable',
];

/** Options of the presets (and of ESLint's defaults) where oxlint's defaults differ or are unset. */
const OPTIONS: DummyRuleMap = {
  'no-constant-binary-expression': ['error', { checkRelationalComparisons: false }],
  'no-irregular-whitespace': [
    'error',
    {
      skipComments: false,
      skipJSXText: false,
      skipRegExps: false,
      skipStrings: true,
      skipTemplates: false,
    },
  ],
  // oxlint ignores names starting with _ unless options are given; ESLint never does.
  'no-unused-vars': [
    'error',
    {
      vars: 'all',
      args: 'after-used',
      caughtErrors: 'all',
      ignoreRestSiblings: false,
      ignoreClassWithStaticInitBlock: false,
      reportUsedIgnorePattern: false,
      varsIgnorePattern: null,
      argsIgnorePattern: null,
      caughtErrorsIgnorePattern: null,
      destructuredArrayIgnorePattern: null,
    },
  ],
  'no-empty-function': ['error', { allow: [] }],
  'typescript/ban-ts-comment': [
    'error',
    {
      minimumDescriptionLength: 10,
      'ts-check': false,
      'ts-expect-error': 'allow-with-description',
      'ts-ignore': true,
      'ts-nocheck': true,
    },
  ],
  'typescript/class-literal-property-style': ['error', 'fields'],
  'typescript/consistent-generic-constructors': ['error', 'constructor'],
  'typescript/consistent-indexed-object-style': ['error', 'record'],
  'typescript/consistent-type-assertions': [
    'error',
    {
      assertionStyle: 'as',
      arrayLiteralTypeAssertions: 'allow',
      objectLiteralTypeAssertions: 'allow',
    },
  ],
  'typescript/consistent-type-definitions': ['error', 'interface'],
  'typescript/no-require-imports': ['error', { allow: [], allowAsImport: false }],
  'typescript/restrict-plus-operands': [
    'error',
    {
      allowAny: false,
      allowBoolean: false,
      allowNullish: false,
      allowNumberAndString: false,
      allowRegExp: false,
      skipCompoundAssignments: false,
    },
  ],
  'typescript/restrict-template-expressions': [
    'error',
    {
      allow: [{ from: 'lib', name: ['Error', 'URL', 'URLSearchParams'] }],
      allowAny: false,
      allowArray: false,
      allowBoolean: false,
      allowNever: false,
      allowNullish: false,
      allowNumber: false,
      allowRegExp: false,
    },
  ],
  'typescript/return-await': ['error', 'error-handling-correctness-only'],
};

export default defineConfig({
  $schema: './node_modules/oxlint/configuration_schema.json',
  plugins: ['eslint', 'typescript', 'import'],
  jsPlugins: JS_PLUGINS,
  categories: { correctness: 'off' },
  options: { typeAware: true, reportUnusedDisableDirectives: 'error' },
  ignorePatterns: [
    'dist',
    'node_modules',
    'playwright-report',
    'test-results',
    '.stryker-tmp',
    'reports',
    '.wrangler',
  ],
  rules: {
    ...on([...ESLINT_RECOMMENDED, ...TYPESCRIPT_SYNTAX, ...TYPE_AWARE]),
    ...OPTIONS,
    'no-console': 'error',
  },
  overrides: [
    {
      files: ['**/*.{ts,tsx,mts,cts}'],
      rules: { ...off(OFF_FOR_TYPESCRIPT), ...on(ON_FOR_TYPESCRIPT) },
    },
    ...featureConfigs,
    pureConfig,
    noTestCodeInProduction,
    ...productionLimits,
    ...testStandard,
    ...e2eStandard,
    {
      // Composition root: server wires module server.ts entries; never client code or web.
      files: ['src/server/**/*.ts'],
      rules: restrict([
        ...noClientFromServer,
        group(
          '^\\.\\./(?!test-support/)[^/]+/(?!(index|server)\\.ts$)',
          'Import only index.ts or server.ts of a module.',
        ),
        group('^\\.\\./web(/|$)', 'server must not import web.'),
      ]),
    },
    {
      // Composition root: web wires module client.tsx entries; never server code, db or server.
      files: ['src/web/**/*.{ts,tsx}'],
      rules: restrict([
        ...noServerFromClient,
        group(
          '^\\.\\./(?!test-support/)[^/]+/(?!(index\\.ts|client\\.tsx)$)',
          'Import only index.ts or client.tsx of a module.',
        ),
        group('^\\.\\./(db|server)(/|$)', 'web must not import db or server.'),
      ]),
    },
    {
      // Tests in web may use the test runner, and nothing else from Node.
      files: ['src/web/**/*.test.{ts,tsx}'],
      rules: restrict([
        group('(^|/)server(\\.ts)?$', 'Client code must not import server code.'),
        group(
          '^(node:(?!test$|assert(/strict)?$)|hono|@hono/)',
          'Web tests may import node:test and node:assert only; no other Node or server libraries.',
        ),
        group(
          '^\\.\\./(?!test-support/)[^/]+/(?!(index\\.ts|client\\.tsx)$)',
          'Import only index.ts or client.tsx of a module.',
        ),
        group('^\\.\\./(db|server)(/|$)', 'web must not import db or server.'),
      ]),
    },
    // Plain JavaScript has no types to check (typescript-eslint's disableTypeChecked).
    { files: ['**/*.js'], rules: off(TYPE_AWARE) },
    {
      files: ['**/*.test.{ts,tsx}', 'src/test-support/**/*.contract.ts', 'e2e/**/*.ts'],
      rules: { 'no-console': 'off', 'typescript/no-floating-promises': 'off' },
    },
    {
      // `./`: a pattern without a slash would match a file of that name in any folder.
      files: ['src/server/node.ts', 'src/server/worker.ts', './*.config.{js,ts}'],
      rules: { 'no-console': 'off' },
    },
    {
      // Command-line check scripts report through the console.
      files: ['scripts/**/*.js'],
      globals: { console: 'readonly' },
      rules: { 'no-console': 'off' },
    },
  ],
});
