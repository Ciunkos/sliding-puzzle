import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createProfileApi, ProfileApiError } from './api.ts';

const profileJson = { id: 7, nickname: 'Ada', createdAt: '2026-01-02T03:04:05.000Z' };
const GENERIC = 'Could not reach the server';

interface RecordedCall {
  url: string;
  init: RequestInit | undefined;
}

/** A fake fetch that records each call and answers with whatever `respond` produces. */
function fakeFetch(respond: () => Response | Promise<Response>) {
  const calls: RecordedCall[] = [];
  const fn = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    return await respond();
  };
  return { fn, calls };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function expectApiError(promise: Promise<unknown>, message: string): Promise<void> {
  await assert.rejects(promise, (err: unknown) => {
    assert.ok(err instanceof ProfileApiError, `expected ProfileApiError, got ${String(err)}`);
    assert.equal(err.message, message);
    return true;
  });
}

describe('createProfileApi().selectOrCreate', () => {
  test('POSTs the nickname as JSON to /api/profiles and returns the parsed profile', async () => {
    const fake = fakeFetch(() => json(profileJson));
    const api = createProfileApi(fake.fn);

    const profile = await api.selectOrCreate('Ada');

    assert.deepEqual(profile, profileJson);
    assert.equal(fake.calls.length, 1);
    const call = fake.calls[0];
    assert.ok(call);
    assert.equal(call.url, '/api/profiles');
    assert.deepEqual(
      { method: call.init?.method, body: call.init?.body },
      { method: 'POST', body: JSON.stringify({ nickname: 'Ada' }) },
    );
  });

  test('a 400 carries the server error message', async () => {
    const api = createProfileApi(
      fakeFetch(() => json({ error: 'nickname may only contain letters' }, 400)).fn,
    );
    await expectApiError(api.selectOrCreate('a b'), 'nickname may only contain letters');
  });

  test('a 400 without a string error falls back to the generic message', async () => {
    const api = createProfileApi(fakeFetch(() => json({}, 400)).fn);
    await expectApiError(api.selectOrCreate('a b'), GENERIC);
  });

  test('a 400 with a non-JSON body falls back to the generic message', async () => {
    const api = createProfileApi(fakeFetch(() => new Response('bad request', { status: 400 })).fn);
    await expectApiError(api.selectOrCreate('a b'), GENERIC);
  });

  test('a network failure throws the generic message', async () => {
    const api = createProfileApi(
      fakeFetch(() => {
        throw new TypeError('fetch failed');
      }).fn,
    );
    await expectApiError(api.selectOrCreate('Ada'), GENERIC);
  });

  test('a 500 throws the generic message even with a JSON error body', async () => {
    const api = createProfileApi(fakeFetch(() => json({ error: 'boom' }, 500)).fn);
    await expectApiError(api.selectOrCreate('Ada'), GENERIC);
  });

  test('a 200 with a body that is not JSON throws the generic message', async () => {
    const api = createProfileApi(fakeFetch(() => new Response('<html>', { status: 200 })).fn);
    await expectApiError(api.selectOrCreate('Ada'), GENERIC);
  });

  test('a 200 with the wrong shape throws the generic message', async () => {
    const api = createProfileApi(fakeFetch(() => json({ id: 'seven', nickname: 'Ada' })).fn);
    await expectApiError(api.selectOrCreate('Ada'), GENERIC);
  });

  test('ProfileApiError is an Error with the message it was given', () => {
    const err = new ProfileApiError('nope');
    assert.ok(err instanceof Error);
    assert.equal(err.message, 'nope');
  });
});
