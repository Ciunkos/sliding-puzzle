import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { GameApiError, type GameApi } from './api.ts';
import type { GameState } from './index.ts';
import { errorMessage, loadOrStart } from './flow.ts';

const STATE: GameState = {
  board: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0],
  initial: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0],
  moves: 0,
  solved: true,
  version: 1,
};

function fakeApi(existing: GameState | undefined) {
  const calls: string[] = [];
  const api: GameApi = {
    load: (nickname) => {
      calls.push(`load ${nickname}`);
      return Promise.resolve(existing);
    },
    start: (nickname) => {
      calls.push(`start ${nickname}`);
      return Promise.resolve(STATE);
    },
    move: () => Promise.reject(new Error('not used')),
    reset: () => Promise.reject(new Error('not used')),
  };
  return { api, calls };
}

describe('loadOrStart', () => {
  test('returns the existing game and does not start a new one', async () => {
    const { api, calls } = fakeApi(STATE);
    assert.deepEqual(await loadOrStart(api, 'Alice'), STATE);
    assert.deepEqual(calls, ['load Alice']);
  });

  test('starts a new game when none exists for the profile', async () => {
    const { api, calls } = fakeApi(undefined);
    assert.deepEqual(await loadOrStart(api, 'Alice'), STATE);
    assert.deepEqual(calls, ['load Alice', 'start Alice']);
  });
});

describe('errorMessage', () => {
  test('shows the message of a GameApiError', () => {
    assert.equal(errorMessage(new GameApiError('illegal move', 409)), 'illegal move');
  });

  test('falls back to a generic message for anything else', () => {
    assert.equal(errorMessage(new Error('boom')), 'Something went wrong. Try again.');
    assert.equal(errorMessage('boom'), 'Something went wrong. Try again.');
  });
});
