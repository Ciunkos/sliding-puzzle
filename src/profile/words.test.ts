import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import fc from 'fast-check';
import { ADJECTIVES, ANIMALS } from './words.ts';

describe('word lists', () => {
  test('there are 48 distinct adjectives', () => {
    assert.equal(new Set(ADJECTIVES).size, 48);
    assert.equal(ADJECTIVES.length, 48);
  });

  test('there are 48 distinct animals', () => {
    assert.equal(new Set(ANIMALS).size, 48);
    assert.equal(ANIMALS.length, 48);
  });

  test('every word is 3-10 lowercase ASCII letters', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ADJECTIVES, ...ANIMALS), (word) => {
        assert.match(word, /^[a-z]{3,10}$/);
      }),
    );
  });
});
