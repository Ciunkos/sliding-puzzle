import assert from 'node:assert/strict';
import { after, describe, test } from 'node:test';
import { closeTestD1, openTestD1Binding } from '../test-support/d1.ts';
import worker from './worker.ts';

after(closeTestD1);

/** The static-assets binding stands in for Cloudflare: it records each requested URL and answers 200. */
function recordingAssets(urls: string[]) {
  return {
    fetch: (request: Request) => {
      urls.push(request.url);
      return Promise.resolve(new Response('shell'));
    },
  };
}

/** The static-assets binding as Cloudflare answers a missing hashed file: 404, with the _headers rule. */
const missingImmutableAsset = {
  fetch: () =>
    Promise.resolve(
      new Response('Not Found', {
        status: 404,
        headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
      }),
    ),
};

describe('worker', () => {
  test('the worker answers the health check over a real D1 binding', async () => {
    // Given the worker with a local D1 database
    const env = { DB: await openTestD1Binding(), ASSETS: recordingAssets([]) };

    // When the health route is requested
    const res = await worker.fetch(new Request('http://localhost/sliding-puzzle/api/health'), env);

    // Then it answers ok
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  });

  test('the worker never mounts the test routes', async () => {
    const env = { DB: await openTestD1Binding(), ASSETS: recordingAssets([]) };
    const request = new Request(
      'http://localhost/sliding-puzzle/api/test/profiles/Ada/game/near-solved',
      { method: 'POST' },
    );

    const res = await worker.fetch(request, env);

    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: 'not found' });
  });

  test('a request to the www host is redirected permanently to the apex host', async () => {
    const env = { DB: await openTestD1Binding(), ASSETS: recordingAssets([]) };
    const request = new Request('https://www.example.test/sliding-puzzle/p/Ada?x=1');

    const res = await worker.fetch(request, env);

    assert.equal(res.status, 301);
    assert.equal(res.headers.get('location'), 'https://example.test/sliding-puzzle/p/Ada?x=1');
  });

  test('a client route is answered with the shell fetched from the assets at the base path', async () => {
    // Given the worker over an assets binding that records what it is asked for
    const urls: string[] = [];
    const env = { DB: await openTestD1Binding(), ASSETS: recordingAssets(urls) };

    // When a profile route is requested
    const res = await worker.fetch(new Request('https://example.test/sliding-puzzle/p/Ada'), env);

    // Then the assets were asked for the shell, spelled without a trailing slash
    assert.equal(res.status, 200);
    assert.deepEqual(urls, ['https://example.test/sliding-puzzle']);
  });

  test('a request outside the base path is 404 without asking the assets', async () => {
    const urls: string[] = [];
    const env = { DB: await openTestD1Binding(), ASSETS: recordingAssets(urls) };

    const res = await worker.fetch(new Request('https://example.test/api/health'), env);

    assert.equal(res.status, 404);
    assert.deepEqual(urls, []);
  });

  test('a POST to an asset path is 405 without asking the assets', async () => {
    const urls: string[] = [];
    const env = { DB: await openTestD1Binding(), ASSETS: recordingAssets(urls) };
    const request = new Request('https://example.test/sliding-puzzle/assets/a.js', {
      method: 'POST',
    });

    const res = await worker.fetch(request, env);

    assert.equal(res.status, 405);
    assert.deepEqual(urls, []);
  });

  test('a missing hashed file is 404 and never kept, whatever the assets headers say', async () => {
    // Given assets that answer a missing file with the year-long rule of _headers
    const env = { DB: await openTestD1Binding(), ASSETS: missingImmutableAsset };

    // When a hashed file that is not there is requested
    const res = await worker.fetch(
      new Request('https://example.test/sliding-puzzle/assets/gone-abc123.js'),
      env,
    );

    // Then it is not found, and nobody may keep that answer
    assert.equal(res.status, 404);
    assert.equal(res.headers.get('cache-control'), 'no-store');
  });
});
