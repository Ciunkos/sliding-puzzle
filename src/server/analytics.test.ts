import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { analyticsResponse } from './analytics.ts';

const ORIGIN = 'https://example.test';
const CONFIG = { kind: 'analytics-config' } as const;
const TOKEN = 'phc_test_token';

interface Forwarded {
  url: string;
  body: string;
  cookie: string | null;
  forwardedFor: string | null;
}

/** PostHog stands in as the outside world: it records what it is sent and sets a cookie. */
function recordingUpstream(calls: Forwarded[]) {
  return async (url: string, init: RequestInit): Promise<Response> => {
    const request = new Request(url, init);
    const body = await request.text();
    const cookie = request.headers.get('cookie');
    calls.push({ url, body, cookie, forwardedFor: request.headers.get('x-forwarded-for') });
    const headers = { 'content-type': 'application/json', 'set-cookie': 'ph=1' };
    return new Response('{"status":1}', { headers });
  };
}

function settings(calls: Forwarded[]) {
  return { token: TOKEN, host: undefined, fetch: recordingUpstream(calls) };
}

/** A same-origin POST of `body` to /sliding-puzzle/ph<rest>, with a cookie and a client address. */
function eventPost(rest: string, body: string): Request {
  return new Request(`${ORIGIN}/sliding-puzzle/ph${rest}?ver=1`, {
    method: 'POST',
    body,
    headers: {
      origin: ORIGIN,
      cookie: 'session=secret',
      'x-forwarded-for': '203.0.113.7',
      'content-type': 'text/plain',
    },
  });
}

const proxyPath = (rest: string) => ({ kind: 'analytics-proxy', rest }) as const;

describe('analyticsResponse', () => {
  test('without a token the config says analytics is off and is never cached', async () => {
    const request = new Request(`${ORIGIN}/sliding-puzzle/analytics-config`);
    const off = { ...settings([]), token: undefined };

    const res = await analyticsResponse(request, CONFIG, off);

    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await res.json(), { enabled: false });
  });

  test('with a token the config hands the token to the page and is never cached', async () => {
    const request = new Request(`${ORIGIN}/sliding-puzzle/analytics-config`);

    const res = await analyticsResponse(request, CONFIG, settings([]));

    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await res.json(), { enabled: true, token: TOKEN });
  });

  test('an event post is forwarded to the EU host with its body and no cookie or address', async () => {
    // Given a stand-in PostHog
    const calls: Forwarded[] = [];

    // When the page posts an event batch to an ingest path
    const res = await analyticsResponse(
      eventPost('/e/', '{"e":1}'),
      proxyPath('/e/'),
      settings(calls),
    );

    // Then the batch reached the EU host, without the player's cookie or address
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('set-cookie'), null);
    assert.deepEqual(calls, [
      {
        url: 'https://eu.i.posthog.com/e/?ver=1',
        body: '{"e":1}',
        cookie: null,
        forwardedFor: null,
      },
    ]);
  });

  test('a path outside the ingest allowlist is 404 and nothing is forwarded', async () => {
    const calls: Forwarded[] = [];

    const res = await analyticsResponse(
      eventPost('/decide/', '{}'),
      proxyPath('/decide/'),
      settings(calls),
    );

    assert.equal(res.status, 404);
    assert.equal(calls.length, 0);
  });

  test('a GET to an ingest path is 404 and nothing is forwarded', async () => {
    const calls: Forwarded[] = [];
    const request = new Request(`${ORIGIN}/sliding-puzzle/ph/static/array.js`);

    const res = await analyticsResponse(request, proxyPath('/static/array.js'), settings(calls));

    assert.equal(res.status, 404);
    assert.equal(calls.length, 0);
  });

  test('a body over 64 kB is refused with 413 and nothing is forwarded', async () => {
    const calls: Forwarded[] = [];
    const tooBig = eventPost('/batch/', 'x'.repeat(65_537));

    const res = await analyticsResponse(tooBig, proxyPath('/batch/'), settings(calls));

    assert.equal(res.status, 413);
    assert.equal(calls.length, 0);
  });

  test('a body of exactly 64 kB is forwarded', async () => {
    const calls: Forwarded[] = [];
    const largest = eventPost('/batch/', 'x'.repeat(65_536));

    const res = await analyticsResponse(largest, proxyPath('/batch/'), settings(calls));

    assert.equal(res.status, 200);
    assert.equal(calls.length, 1);
  });

  test('without a token the proxy is 404 and nothing is forwarded', async () => {
    const calls: Forwarded[] = [];
    const off = { ...settings(calls), token: undefined };

    const res = await analyticsResponse(eventPost('/e/', '{}'), proxyPath('/e/'), off);

    assert.equal(res.status, 404);
    assert.equal(calls.length, 0);
  });

  test('a post from another origin is 403 and nothing is forwarded', async () => {
    const calls: Forwarded[] = [];
    const request = new Request(`${ORIGIN}/sliding-puzzle/ph/e/`, {
      method: 'POST',
      body: '{}',
      headers: { origin: 'https://elsewhere.test' },
    });

    const res = await analyticsResponse(request, proxyPath('/e/'), settings(calls));

    assert.equal(res.status, 403);
    assert.equal(calls.length, 0);
  });
});
