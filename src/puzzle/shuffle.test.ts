import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, isSolvable, isSolved, isValidBoard, shuffle, type Board } from './index.ts';

test('createRng is deterministic for the same seed', () => {
  const a = createRng(12345);
  const b = createRng(12345);
  for (let i = 0; i < 100; i++) assert.equal(a(), b());
});

test('createRng returns floats in [0, 1)', () => {
  const rng = createRng(7);
  for (let i = 0; i < 1000; i++) {
    const value = rng();
    assert.ok(value >= 0 && value < 1, `out of range: ${String(value)}`);
  }
});

test('shuffle over 500 seeds is always valid, solvable and not solved', () => {
  const boards = new Set<string>();
  for (let seed = 1; seed <= 500; seed++) {
    const board: Board = shuffle(createRng(seed));
    assert.equal(isValidBoard(board), true, `seed ${String(seed)} invalid`);
    assert.equal(isSolvable(board), true, `seed ${String(seed)} unsolvable`);
    assert.equal(isSolved(board), false, `seed ${String(seed)} solved`);
    boards.add(board.join(','));
  }
  assert.ok(boards.size > 1);
});

test('shuffle with the same seed is deterministic', () => {
  assert.deepEqual(shuffle(createRng(99)), shuffle(createRng(99)));
});

test('shuffle with different seeds produces more than one distinct board', () => {
  const boards = new Set<string>();
  for (let seed = 1; seed <= 20; seed++) boards.add(shuffle(createRng(seed)).join(','));
  assert.ok(boards.size > 1);
});

test('shuffle without an rng argument returns a valid, solvable, unsolved board', () => {
  const board = shuffle();
  assert.equal(isValidBoard(board), true);
  assert.equal(isSolvable(board), true);
  assert.equal(isSolved(board), false);
});
