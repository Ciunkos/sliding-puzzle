import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SOLVED_BOARD } from '../puzzle/index.ts';
import { InvalidStartBoardError, createGameService } from './server.ts';
import { NEAR_SOLVED, addProfile, openDb } from './test-helpers.ts';

test('startWith starts a game from a given solvable, unsolved board', async () => {
  const db = await openDb();
  const id = await addProfile(db, 'Ann');
  const service = createGameService(db);
  const state = await service.startWith(id, NEAR_SOLVED);
  assert.deepEqual(state.board, NEAR_SOLVED);
  assert.deepEqual(state.initial, NEAR_SOLVED);
  assert.equal(state.moves, 0);
  assert.equal(state.solved, false);
  assert.deepEqual(await service.get(id), state);
});

test('startWith replaces an existing game and keeps the version monotonic', async () => {
  const db = await openDb();
  const id = await addProfile(db, 'Ann');
  const service = createGameService(db);
  const first = await service.start(id);
  const second = await service.startWith(id, NEAR_SOLVED);
  assert.equal(second.version, first.version + 1);
});

test('startWith rejects invalid, unsolvable and already solved boards', async () => {
  const db = await openDb();
  const id = await addProfile(db, 'Ann');
  const service = createGameService(db);
  const unsolvable = [...SOLVED_BOARD];
  unsolvable[13] = 15;
  unsolvable[14] = 14;
  for (const board of [[1, 2, 3], SOLVED_BOARD, unsolvable]) {
    await assert.rejects(service.startWith(id, board), InvalidStartBoardError);
  }
  assert.equal(await service.get(id), undefined);
});

test('a near-solved game is solved by its single correcting move', async () => {
  const db = await openDb();
  const id = await addProfile(db, 'Ann');
  const service = createGameService(db);
  await service.startWith(id, NEAR_SOLVED);
  const result = await service.move(id, 15);
  assert.equal(result.ok && result.state.solved, true);
});
