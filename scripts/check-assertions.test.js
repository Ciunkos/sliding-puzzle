import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasReason, logArgs, needsReason, parseNumstat } from './check-assertions.js';

test('numstat lines become path, added and deleted counts', () => {
  assert.deepEqual(parseNumstat('3\t1\tsrc/puzzle/rules.ts\n0\t2\tsrc/puzzle/rules.test.ts\n'), [
    { path: 'src/puzzle/rules.ts', added: 3, deleted: 1 },
    { path: 'src/puzzle/rules.test.ts', added: 0, deleted: 2 },
  ]);
});

test('editing an existing test together with production code needs a reason', () => {
  const changes = [
    { path: 'src/puzzle/rules.ts', added: 3, deleted: 1 },
    { path: 'src/puzzle/rules.test.ts', added: 1, deleted: 1 },
  ];
  assert.equal(needsReason(changes), true);
});

test('an edited e2e spec counts as an edited test', () => {
  const changes = [
    { path: 'src/game/server.ts', added: 3, deleted: 1 },
    { path: 'e2e/play.spec.ts', added: 1, deleted: 4 },
  ];
  assert.equal(needsReason(changes), true);
});

test('adding test lines with production code needs no reason', () => {
  const changes = [
    { path: 'src/puzzle/rules.ts', added: 3, deleted: 1 },
    { path: 'src/puzzle/rules.test.ts', added: 9, deleted: 0 },
  ];
  assert.equal(needsReason(changes), false);
});

test('changing only tests needs no reason', () => {
  assert.equal(needsReason([{ path: 'src/puzzle/rules.test.ts', added: 2, deleted: 2 }]), false);
});

test('a Reason line of at least ten characters is accepted', () => {
  assert.equal(
    hasReason('Fix plural\n\nReason: "1 moves" was a bug, the text is now "1 move".\n'),
    true,
  );
});

test('a missing or empty Reason is rejected', () => {
  assert.equal(hasReason('Fix plural\n\nReason: ok\n'), false);
  assert.equal(hasReason('Fix plural, tests updated\n'), false);
});

test('test-support files are test code, not production code', () => {
  const changes = [
    { path: 'src/test-support/d1.ts', added: 30, deleted: 0 },
    { path: 'src/db/migrate.test.ts', added: 5, deleted: 9 },
  ];
  assert.equal(needsReason(changes), false);
});

test('a range is listed without merges', () => {
  assert.deepEqual(logArgs('abc..HEAD', undefined), [
    'log',
    '--format=%H',
    '--no-merges',
    'abc..HEAD',
  ]);
});

test('commits made before the guard existed are left out of the range', () => {
  assert.deepEqual(logArgs('abc..HEAD', '6780253'), [
    'log',
    '--format=%H',
    '--no-merges',
    'abc..HEAD',
    '^6780253',
  ]);
});
