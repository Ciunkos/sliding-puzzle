import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { repeated, scriptedRng } from './scripted-rng.ts';

describe('scriptedRng', () => {
  test('it returns the written values in order', () => {
    // Given a script of two values
    const rng = scriptedRng([0.25, 0.75]);

    // When it is called twice
    const values = [rng(), rng()];

    // Then it returned them in the written order
    assert.deepEqual(values, [0.25, 0.75]);
  });

  test('a call after the last written value throws', () => {
    const rng = scriptedRng([0.5]);
    rng();

    assert.throws(() => rng(), /all 1 values were used/);
  });
});

describe('repeated', () => {
  test('a script written twice in a row', () => {
    assert.deepEqual(repeated([0, 0.9], 2), [0, 0.9, 0, 0.9]);
  });
});
