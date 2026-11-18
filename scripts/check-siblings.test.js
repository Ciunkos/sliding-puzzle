import assert from 'node:assert/strict';
import { test } from 'node:test';
import { testsWithoutSubject } from './check-siblings.js';

test('a test next to its .ts subject is accepted', () => {
  assert.deepEqual(testsWithoutSubject(['src/puzzle/rules.ts', 'src/puzzle/rules.test.ts']), []);
});

test('a .ts test may cover a .tsx subject', () => {
  assert.deepEqual(testsWithoutSubject(['src/puzzle/board.tsx', 'src/puzzle/board.test.ts']), []);
});

test('a test with no sibling subject is reported with the fix', () => {
  const problems = testsWithoutSubject(['src/game/server.ts', 'src/game/service.test.ts']);
  assert.equal(problems.length, 1);
  assert.match(
    problems[0],
    /^src\/game\/service\.test\.ts has no sibling source file\. Name the test/,
  );
});

test('a subject in another folder does not count', () => {
  assert.equal(testsWithoutSubject(['src/game/rules.ts', 'src/puzzle/rules.test.ts']).length, 1);
});

test('tests outside src are not checked', () => {
  assert.deepEqual(testsWithoutSubject(['gates/boundaries.test.ts']), []);
});
