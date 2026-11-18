// @ts-check
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

/**
 * ARCHITECTURE RULES (modular monolith). See README.md "Boundaries".
 *
 * Feature modules: src/puzzle, src/profile, src/game, src/db.
 * Composition roots: src/server, src/web (the only places that wire modules together).
 * A module's public entry points are index.ts (isomorphic), server.ts and client.tsx.
 * Everything else inside a module is private. Duplicate a little instead of reaching in.
 */

/** Which other feature modules each module may depend on (through public entry points only). */
const MODULE_DEPS = {
  puzzle: [],
  db: [],
  profile: ['db'],
  game: ['puzzle', 'profile', 'db'],
};
const FEATURES = Object.keys(MODULE_DEPS);
const ENTRY = '(index|server|client)\\.tsx?$';

const group = (regex, message) => ({ regex, message });

/** Imports of other modules' internals, of composition roots, or of modules not in the allowlist. */
function moduleImportRules(name) {
  const allowed = MODULE_DEPS[name];
  const forbiddenModules = FEATURES.filter((m) => m !== name && !allowed.includes(m));
  return [
    group(
      `^\\.\\./[^/]+/(?!${ENTRY})`,
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

/** @param {{regex: string, message: string}[]} patterns */
const restrict = (patterns) => ({
  'no-restricted-imports': ['error', { patterns }],
});

const featureConfigs = FEATURES.flatMap((name) => {
  const base = moduleImportRules(name);
  const extra =
    name === 'puzzle'
      ? [group('^(?!\\./)', 'puzzle is pure: only relative imports inside src/puzzle.')]
      : name === 'db'
        ? [group('^\\.\\./', 'db must not import other modules.')]
        : [];
  return [
    { files: [`src/${name}/**/*.{ts,tsx}`], rules: restrict([...base, ...extra]) },
    // Tests may use the native Node test runner even in pure modules.
    ...(name === 'puzzle'
      ? [
          {
            files: ['src/puzzle/**/*.test.ts'],
            rules: restrict([
              ...base,
              group(
                '^(?!\\./|node:test$|node:assert(/strict)?$)',
                'puzzle tests: only relative imports, node:test and node:assert.',
              ),
            ]),
          },
        ]
      : []),
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

export default defineConfig(
  { ignores: ['dist', 'node_modules', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['*.js'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': 'error',
    },
  },
  ...featureConfigs,
  {
    // Composition root: server wires module server.ts entries; never client code or web.
    files: ['src/server/**/*.ts'],
    rules: restrict([
      ...noClientFromServer,
      group(
        '^\\.\\./[^/]+/(?!(index|server)\\.ts$)',
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
        '^\\.\\./[^/]+/(?!(index\\.ts|client\\.tsx)$)',
        'Import only index.ts or client.tsx of a module.',
      ),
      group('^\\.\\./(db|server)(/|$)', 'web must not import db or server.'),
    ]),
  },
  { files: ['**/*.js'], extends: [tseslint.configs.disableTypeChecked] },
  {
    files: ['**/*.test.ts', 'e2e/**/*.ts'],
    rules: { 'no-console': 'off', '@typescript-eslint/no-floating-promises': 'off' },
  },
  {
    files: ['src/server/node.ts', 'src/server/worker.ts', '*.config.{js,ts}'],
    rules: { 'no-console': 'off' },
  },
);
