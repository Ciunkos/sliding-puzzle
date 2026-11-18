import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addedLines, findNames, nameMatcher, parseNames } from './check-client-names.js';

// "Acme" and "Jan Kowalski" are invented placeholders, not real clients or people.
const MATCHER = nameMatcher(['Acme', 'Jan Kowalski']) ?? /never/;

test('the denylist ignores comments and blank lines', () => {
  assert.deepEqual(parseNames('# clients\nAcme\n\n  Jan Kowalski  # a person\n'), [
    'Acme',
    'Jan Kowalski',
  ]);
});

test('an empty denylist means there is nothing to check', () => {
  assert.equal(nameMatcher([]), undefined);
});

test('a name is found as a whole word, in any letter case', () => {
  assert.deepEqual(findNames(MATCHER, 'README.md', 'built for ACME last year'), [
    'README.md:1: "ACME"',
  ]);
});

test('a name inside a longer word is not a hit', () => {
  assert.deepEqual(findNames(MATCHER, 'a.ts', 'const acmeology = 1;'), []);
});

test('the reported line number is the line of the hit', () => {
  assert.deepEqual(findNames(MATCHER, 'a.ts', 'one\ntwo\nby Jan Kowalski'), [
    'a.ts:3: "Jan Kowalski"',
  ]);
});

test('only added lines of a diff are scanned, labelled with their file', () => {
  const diff = ['+++ b/src/a.ts', '-old Acme line', '+new line', ' context'].join('\n');
  assert.deepEqual(addedLines(diff), [{ file: 'src/a.ts', text: 'new line' }]);
});
