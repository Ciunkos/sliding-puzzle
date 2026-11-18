import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { SOLVED_BOARD } from '../puzzle/index.ts';
import type { GameState } from './index.ts';
import { statusText, toCells } from './view-model.ts';

function stateOf(board: readonly number[], moves = 0): GameState {
  return {
    board,
    initial: board,
    moves,
    solved: board.every((tile, index) => tile === SOLVED_BOARD[index]),
    version: 1,
  };
}

/** Blank in the top-left corner: tiles 1 (right of it) and 5 (below it) can move. */
const CORNER = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
/** Blank at row 1, col 1: tiles 2, 5, 7 and 10 are its neighbours. */
const CENTRE = [1, 2, 3, 4, 5, 0, 7, 6, 8, 10, 11, 12, 13, 14, 15, 9];

function movableTiles(cells: ReturnType<typeof toCells>): number[] {
  return cells
    .filter((cell) => cell.movable)
    .map((cell) => cell.tile)
    .sort((a, b) => a - b);
}

describe('toCells', () => {
  test('returns 16 cells in board order with row and col', () => {
    const cells = toCells(stateOf(CENTRE));
    assert.equal(cells.length, 16);
    assert.deepEqual(cells[0], { tile: 1, row: 0, col: 0, movable: false });
    assert.deepEqual(cells[6], { tile: 7, row: 1, col: 2, movable: true });
    assert.deepEqual(cells[15], { tile: 9, row: 3, col: 3, movable: false });
  });

  test('marks the two neighbours of a blank in a corner as movable', () => {
    const cells = toCells(stateOf(CORNER));
    assert.deepEqual(movableTiles(cells), [1, 4]);
  });

  test('marks the four neighbours of a blank in the centre as movable', () => {
    const cells = toCells(stateOf(CENTRE));
    assert.deepEqual(movableTiles(cells), [2, 5, 7, 10]);
  });

  test('the blank is never movable', () => {
    const blank = toCells(stateOf(CENTRE)).find((cell) => cell.tile === 0);
    assert.equal(blank?.movable, false);
  });

  test('nothing is movable once the game is solved', () => {
    const cells = toCells(stateOf([...SOLVED_BOARD]));
    assert.deepEqual(movableTiles(cells), []);
  });
});

describe('statusText', () => {
  test('an unsolved game shows the move count', () => {
    assert.equal(statusText(stateOf(CENTRE, 3)), 'Moves: 3');
    assert.equal(statusText(stateOf(CENTRE, 0)), 'Moves: 0');
  });

  test('a solved game still shows only the move count', () => {
    assert.equal(statusText(stateOf([...SOLVED_BOARD], 12)), 'Moves: 12');
  });
});
