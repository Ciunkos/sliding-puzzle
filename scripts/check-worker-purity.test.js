import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nodeImportsReachableFrom, runtimeImports } from './check-worker-purity.js';

const reader = (files) => (path) => files[path];

test('runtime imports are listed and type-only imports are skipped', () => {
  const source = [
    "import { Hono } from 'hono';",
    "import type { Db } from '../db/index.ts';",
    "export * from './index.ts';",
    "import './side-effect.ts';",
  ].join('\n');
  assert.deepEqual(runtimeImports(source), ['hono', './index.ts', './side-effect.ts']);
});

test('a Worker graph without node imports is clean', () => {
  const files = {
    'src/server/worker.ts': "import { createApp } from './create-app.ts';",
    'src/server/create-app.ts': "import { Hono } from 'hono';",
  };
  assert.deepEqual(nodeImportsReachableFrom('src/server/worker.ts', reader(files)), []);
});

test('a node import two hops from the Worker entry is reported with its trail', () => {
  const files = {
    'src/server/worker.ts': "import { createApp } from './create-app.ts';",
    'src/server/create-app.ts': "import { open } from '../db/server.ts';",
    'src/db/server.ts': "import { DatabaseSync } from 'node:sqlite';",
  };
  const problems = nodeImportsReachableFrom('src/server/worker.ts', reader(files));
  assert.equal(problems.length, 1);
  assert.match(
    problems[0],
    /^src\/db\/server\.ts imports node:sqlite and is bundled into the Worker \(src\/server\/worker\.ts -> src\/server\/create-app\.ts -> src\/db\/server\.ts\)/,
  );
});

test('a type-only import of a Node-only module does not taint the Worker', () => {
  const files = {
    'src/server/worker.ts': "import type { Thing } from '../db/server.ts';",
    'src/db/server.ts': "import { DatabaseSync } from 'node:sqlite';",
  };
  assert.deepEqual(nodeImportsReachableFrom('src/server/worker.ts', reader(files)), []);
});

test('import cycles end', () => {
  const files = { 'a.ts': "import './b.ts';", 'b.ts': "import './a.ts';" };
  assert.deepEqual(nodeImportsReachableFrom('a.ts', reader(files)), []);
});
