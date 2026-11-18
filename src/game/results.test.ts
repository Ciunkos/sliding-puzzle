import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { isNewPersonalBest } from './results.ts';

const FINISHED = {
  state: { count: 5, target: 5 },
  initial: { count: 0, target: 5 },
  moves: 3,
  finished: true,
  version: 4,
  startedAt: '2026-01-01T00:00:00.000Z',
  finishedAt: '2026-01-01T00:01:00.000Z',
};
const OWN = {
  variant: 'to 5',
  moves: 3,
  durationMs: 60_000,
  reportedMs: 50_000,
  finishedAt: '2026-01-01T00:01:00.000Z',
};
const EARLIER_BETTER = { ...OWN, moves: 2, finishedAt: '2025-12-31T00:00:00.000Z' };
const OTHER_VARIANT = { ...OWN, variant: 'to 3', moves: 1, finishedAt: '2025-12-30T00:00:00.000Z' };

describe('isNewPersonalBest', () => {
  test('a finished game whose result leads its variant is a new personal best', () => {
    assert.equal(isNewPersonalBest([OTHER_VARIANT, OWN], FINISHED), true);
  });

  test('a finished game behind an earlier better result of its variant is not', () => {
    assert.equal(isNewPersonalBest([EARLIER_BETTER, OWN], FINISHED), false);
  });

  test('a finished game whose result is not listed yet is not', () => {
    assert.equal(isNewPersonalBest([OTHER_VARIANT], FINISHED), false);
  });

  test('a result with the same moves at another moment is not the game', () => {
    assert.equal(
      isNewPersonalBest([{ ...OWN, finishedAt: '2026-01-02T00:00:00.000Z' }], FINISHED),
      false,
    );
  });

  test('a result at the same moment with other moves is not the game', () => {
    assert.equal(isNewPersonalBest([{ ...OWN, moves: 4 }], FINISHED), false);
  });

  test('an unfinished game or no game is not', () => {
    const playing = { ...FINISHED, finished: false, finishedAt: null };

    assert.equal(isNewPersonalBest([OWN], playing), false);
    assert.equal(isNewPersonalBest([OWN], undefined), false);
  });
});
