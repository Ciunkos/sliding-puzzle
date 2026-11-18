import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { permutationsWhere, reachableKeys } from './reachable.ts';

/** A ring of six numbers where one move adds 2 or 4 (mod 6), and 5 is a wall nothing enters. */
const STEPS = [2, 4];
const RING = [0, 1, 2, 3, 4, undefined];
const step = (n: number, by: number): number | undefined => RING[(n + by) % 6];

describe('reachableKeys', () => {
  test('a breadth-first search finds exactly the states connected to the start', () => {
    // Given the ring from 1, where 1 + 4 = 5 is the wall
    const reached = reachableKeys(1, () => STEPS, step, String);

    // Then 1 and 3 are reached (3 + 2 = 5 is the wall too) and no even number is
    assert.deepEqual([...reached].sort(), ['1', '3']);
  });

  test('the start alone is reached when no move leads anywhere', () => {
    const reached = reachableKeys(0, () => [], step, String);

    assert.deepEqual([...reached], ['0']);
  });
});

describe('permutationsWhere', () => {
  test('every arrangement of 0 to 3 is visited once', () => {
    const all = permutationsWhere(4, () => true);

    assert.deepEqual(all, { count: 24, first: [0, 1, 2, 3] });
  });

  test('the first match is the earliest in lexicographic order', () => {
    const startsWithTwo = permutationsWhere(3, (p) => p[0] === 2);

    assert.deepEqual(startsWithTwo, { count: 2, first: [2, 0, 1] });
  });

  test('no match gives a count of zero and no arrangement', () => {
    const none = permutationsWhere(3, () => false);

    assert.deepEqual(none, { count: 0, first: undefined });
  });
});
