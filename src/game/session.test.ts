import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { errorMessage, settle } from './session.ts';

describe('the game session', () => {
  test('errorMessage of an unexpected error is a generic retry message', () => {
    assert.equal(errorMessage(new Error('boom')), 'Something went wrong. Try again.');
  });

  test('a settled request is its value or its error', async () => {
    const BOOM = new Error('boom');

    assert.deepEqual(await settle(Promise.resolve(5)), { ok: true, value: 5 });
    assert.deepEqual(await settle(Promise.reject(BOOM)), { ok: false, error: BOOM });
  });
});
