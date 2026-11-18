import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pinnedFeatures, stripPins, unpinnedImports } from './check-deletion.js';

const ROOT = [
  "import { profileRoutes } from '../profile/server.ts';",
  "import { puzzle } from '../puzzle/server.ts'; // pin: puzzle",
  'export const features = [',
  '  puzzle, // pin: puzzle',
  '];',
].join('\n');

test('features are the names found in pin comments', () => {
  assert.deepEqual(pinnedFeatures([{ path: 'src/server/features.ts', text: ROOT }]), ['puzzle']);
});

test('a file without pin comments names no feature', () => {
  assert.deepEqual(pinnedFeatures([{ path: 'src/a.ts', text: "import './b.ts';" }]), []);
});

test('stripping a feature removes exactly its pinned lines', () => {
  assert.equal(
    stripPins(ROOT, 'puzzle'),
    [
      "import { profileRoutes } from '../profile/server.ts';",
      'export const features = [',
      '];',
    ].join('\n'),
  );
});

test('stripping another feature leaves the file alone', () => {
  assert.equal(stripPins(ROOT, 'blocks'), ROOT);
});

test('an import of the feature without a pin is reported with the fix', () => {
  const files = [
    { path: 'src/game/engine.ts', text: "import { rules } from '../puzzle/index.ts';" },
  ];
  const problems = unpinnedImports(files, 'puzzle');
  assert.equal(problems.length, 1);
  assert.match(
    problems[0],
    /^src\/game\/engine\.ts:1 imports the feature "puzzle" without a pin\./,
  );
});

test('pinned imports and imports inside the feature itself are fine', () => {
  const files = [
    { path: 'src/server/features.ts', text: ROOT },
    { path: 'src/puzzle/definition.ts', text: "import { rules } from '../puzzle/rules.ts';" },
  ];
  assert.deepEqual(unpinnedImports(files, 'puzzle'), []);
});
