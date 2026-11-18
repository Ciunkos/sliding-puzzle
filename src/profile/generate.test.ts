import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import fc from 'fast-check';
import { scriptedRng } from '../test-support/scripted-rng.ts';
import { generateNickname } from './generate.ts';
import { nicknameSchema } from './index.ts';

/** Any value a random source may return: [0, 1). */
const UNIT = fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true });

describe('generateNickname', () => {
  test('the lowest random values give the first adjective, the first animal and 100', () => {
    // Given a random source that always answers 0
    const random = scriptedRng([0, 0, 0]);

    // When a nickname is generated
    const nickname = generateNickname(random);

    // Then it joins the first words and the smallest 3-digit number with dashes
    assert.equal(nickname, 'brave-otter-100');
  });

  test('the highest random values give the last adjective, the last animal and 999', () => {
    assert.equal(generateNickname(scriptedRng([0.9999, 0.9999, 0.9999])), 'zippy-zebra-999');
  });

  test('middle values pick words and the number by their share of each range', () => {
    assert.equal(generateNickname(scriptedRng([0.5, 0.25, 0.5])), 'merry-falcon-550');
  });

  test('any generated nickname is two lowercase words and 3 digits, accepted by the rules', () => {
    fc.assert(
      fc.property(fc.tuple(UNIT, UNIT, UNIT), (values) => {
        const nickname = generateNickname(scriptedRng(values));
        assert.match(nickname, /^[a-z]+-[a-z]+-\d{3}$/);
        assert.equal(nicknameSchema.parse(nickname), nickname);
      }),
    );
  });
});
