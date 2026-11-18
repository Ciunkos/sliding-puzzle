import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { gameStateSchema, moveRequestSchema } from './index.ts';

const valid = {
  board: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0],
  initial: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 0, 15],
  moves: 3,
  solved: true,
  version: 4,
};

describe('gameStateSchema', () => {
  test('accepts a well-formed state', () => {
    assert.equal(gameStateSchema.safeParse(valid).success, true);
  });

  test('rejects a board with a repeated tile', () => {
    const board = [...valid.board];
    board[0] = 2;
    assert.equal(gameStateSchema.safeParse({ ...valid, board }).success, false);
  });

  test('rejects a board with the wrong length', () => {
    assert.equal(
      gameStateSchema.safeParse({ ...valid, initial: valid.initial.slice(1) }).success,
      false,
    );
  });

  test('rejects negative moves, version below 1, and a non-boolean solved', () => {
    assert.equal(gameStateSchema.safeParse({ ...valid, moves: -1 }).success, false);
    assert.equal(gameStateSchema.safeParse({ ...valid, version: 0 }).success, false);
    assert.equal(gameStateSchema.safeParse({ ...valid, solved: 1 }).success, false);
  });
});

describe('moveRequestSchema', () => {
  test('accepts tiles 1 to 15', () => {
    assert.equal(moveRequestSchema.safeParse({ tile: 1 }).success, true);
    assert.equal(moveRequestSchema.safeParse({ tile: 15 }).success, true);
  });

  test('rejects the blank, out-of-range tiles, fractions, strings and missing tile', () => {
    for (const body of [{ tile: 0 }, { tile: 16 }, { tile: 2.5 }, { tile: '3' }, {}]) {
      assert.equal(moveRequestSchema.safeParse(body).success, false, JSON.stringify(body));
    }
  });
});
