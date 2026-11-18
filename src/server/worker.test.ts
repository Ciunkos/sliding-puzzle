import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { closeTestD1, openTestD1Binding } from '../test-support/d1.ts';
import worker from './worker.ts';

after(closeTestD1);

describe('worker', () => {
  test('the worker answers the health check over a real D1 binding', async () => {
    // Given the worker with a local D1 database
    const env = { DB: await openTestD1Binding() };

    // When the health route is requested
    const res = await worker.fetch(new Request('http://localhost/api/health'), env);

    // Then it answers ok
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  });

  test('the worker never mounts the test routes', async () => {
    const env = { DB: await openTestD1Binding() };
    const request = new Request('http://localhost/api/test/profiles/Ada/game/near-solved', {
      method: 'POST',
    });

    const res = await worker.fetch(request, env);

    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: 'not found' });
  });
});
