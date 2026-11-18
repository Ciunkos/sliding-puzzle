import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SIZE,
  SOLVED_BOARD,
  applyMove,
  isSolvable,
  isSolved,
  isValidBoard,
  legalMoves,
  type Board,
} from './index.ts';

/** Board with tiles 1..15 in order and the blank at `blank`. */
function withBlankAt(blank: number): Board {
  const board: number[] = [];
  for (let i = 0; i < SIZE * SIZE; i++) {
    if (i === blank) board.push(0);
    else board.push(i < blank ? i + 1 : i);
  }
  return board;
}

function replaceAt(board: readonly unknown[], index: number, value: unknown): unknown[] {
  return board.map((x, i) => (i === index ? value : x));
}

test('SIZE is 4 and SOLVED_BOARD is [1..15, 0]', () => {
  assert.equal(SIZE, 4);
  assert.deepEqual([...SOLVED_BOARD], [...Array.from({ length: 15 }, (_, i) => i + 1), 0]);
});

test('SOLVED_BOARD is valid, solved and solvable', () => {
  assert.equal(isValidBoard(SOLVED_BOARD), true);
  assert.equal(isSolved(SOLVED_BOARD), true);
  assert.equal(isSolvable(SOLVED_BOARD), true);
});

test('isValidBoard accepts a permutation of 0..15 of length 16', () => {
  const reversed = Array.from({ length: 16 }, (_, i) => 15 - i);
  assert.equal(isValidBoard(reversed), true);
});

test('isValidBoard rejects a wrong length', () => {
  assert.equal(isValidBoard(SOLVED_BOARD.slice(0, 15)), false);
  assert.equal(isValidBoard([...SOLVED_BOARD, 0]), false);
  assert.equal(isValidBoard([]), false);
});

test('isValidBoard rejects duplicates', () => {
  assert.equal(isValidBoard(replaceAt(SOLVED_BOARD, 0, 2)), false);
  assert.equal(isValidBoard(replaceAt(SOLVED_BOARD, 15, 1)), false);
});

test('isValidBoard rejects out-of-range values', () => {
  assert.equal(isValidBoard(replaceAt(SOLVED_BOARD, 0, 16)), false);
  assert.equal(isValidBoard(replaceAt(SOLVED_BOARD, 0, -1)), false);
});

test('isValidBoard rejects non-integers', () => {
  assert.equal(isValidBoard(replaceAt(SOLVED_BOARD, 0, 1.5)), false);
  assert.equal(isValidBoard(replaceAt(SOLVED_BOARD, 0, Number.NaN)), false);
  assert.equal(isValidBoard(replaceAt(SOLVED_BOARD, 0, '1')), false);
});

test('isValidBoard rejects non-arrays', () => {
  assert.equal(isValidBoard(null), false);
  assert.equal(isValidBoard(undefined), false);
  assert.equal(isValidBoard('abcdefghijklmnop'), false);
  assert.equal(isValidBoard({ length: 16 }), false);
  assert.equal(isValidBoard(new Set(SOLVED_BOARD)), false);
  assert.equal(isValidBoard(42), false);
});

test('isSolved is false for a shuffled board', () => {
  assert.equal(isSolved(withBlankAt(0)), false);
});

test('legalMoves: blank in a corner gives 2 moves', () => {
  assert.deepEqual(legalMoves(withBlankAt(0)), [1, 4]);
  assert.deepEqual(legalMoves(withBlankAt(15)), [12, 15]);
});

test('legalMoves: blank on an edge gives 3 moves', () => {
  assert.deepEqual(legalMoves(withBlankAt(1)), [1, 2, 5]);
});

test('legalMoves: blank in the centre gives 4 moves, ascending', () => {
  assert.deepEqual(legalMoves(withBlankAt(5)), [2, 5, 6, 9]);
});

test('applyMove swaps a legal tile into the blank', () => {
  const moved = applyMove(SOLVED_BOARD, 15);
  assert.deepEqual(moved, [...SOLVED_BOARD.slice(0, 14), 0, 15]);
});

test('applyMove returns undefined for a tile that is not adjacent to the blank', () => {
  assert.equal(applyMove(SOLVED_BOARD, 1), undefined);
  assert.equal(applyMove(SOLVED_BOARD, 14), undefined);
});

test('applyMove returns undefined for values that are not tiles 1..15', () => {
  assert.equal(applyMove(SOLVED_BOARD, 0), undefined);
  assert.equal(applyMove(SOLVED_BOARD, 16), undefined);
  assert.equal(applyMove(SOLVED_BOARD, -3), undefined);
  assert.equal(applyMove(SOLVED_BOARD, 2.5), undefined);
});

test('applyMove never mutates its input', () => {
  const input = withBlankAt(5);
  const before = [...input];
  const moved = applyMove(input, 6);
  assert.notEqual(moved, undefined);
  assert.notEqual(moved, input);
  assert.deepEqual([...input], before);
});

test('applying the same tile twice restores the board', () => {
  const once = applyMove(SOLVED_BOARD, 15);
  assert.notEqual(once, undefined);
  if (once === undefined) return;
  assert.deepEqual(applyMove(once, 15), [...SOLVED_BOARD]);
});

test('isSolvable is true for a board produced by legal moves', () => {
  let board: Board = SOLVED_BOARD;
  for (let step = 0; step < 60; step++) {
    const moves = legalMoves(board);
    const tile = moves[(step * 7) % moves.length];
    assert.notEqual(tile, undefined);
    if (tile === undefined) return;
    const next = applyMove(board, tile);
    assert.notEqual(next, undefined);
    if (next === undefined) return;
    board = next;
    assert.equal(isSolvable(board), true);
  }
});

test('isSolvable is false for the classic unsolvable board (tiles 14 and 15 swapped)', () => {
  const swapped = replaceAt(replaceAt(SOLVED_BOARD, 13, 15), 14, 14) as number[];
  assert.equal(isValidBoard(swapped), true);
  assert.equal(isSolvable(swapped), false);
});
