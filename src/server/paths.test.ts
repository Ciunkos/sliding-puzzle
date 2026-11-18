import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { BASE, classify, pathHeaders } from './paths.ts';

describe('classify', () => {
  test('the base path is /sliding-puzzle', () => {
    assert.equal(BASE, '/sliding-puzzle');
  });

  test('the base path without a trailing slash is the shell', () => {
    assert.deepEqual(classify('/sliding-puzzle'), { kind: 'shell' });
  });

  test('the base path with a trailing slash redirects to the form without it', () => {
    assert.deepEqual(classify('/sliding-puzzle/'), { kind: 'redirect', to: '/sliding-puzzle' });
  });

  test('a profile route is the shell', () => {
    assert.deepEqual(classify('/sliding-puzzle/p/Ada'), { kind: 'shell' });
  });

  test('a profile route with a trailing slash redirects to the form without it', () => {
    assert.deepEqual(classify('/sliding-puzzle/p/Ada/'), {
      kind: 'redirect',
      to: '/sliding-puzzle/p/Ada',
    });
  });

  test('a path below a profile route is an asset path', () => {
    assert.deepEqual(classify('/sliding-puzzle/p/Ada/games'), { kind: 'asset' });
  });

  test('the api root is the api', () => {
    assert.deepEqual(classify('/sliding-puzzle/api'), { kind: 'api' });
  });

  test('a path under the api is the api', () => {
    assert.deepEqual(classify('/sliding-puzzle/api/profiles/Ada/'), { kind: 'api' });
  });

  test('a name that only starts with api is an asset path', () => {
    assert.deepEqual(classify('/sliding-puzzle/apis'), { kind: 'asset' });
  });

  test('a built file is an asset path', () => {
    assert.deepEqual(classify('/sliding-puzzle/assets/index-abc123.js'), { kind: 'asset' });
  });

  test('the site root is outside', () => {
    assert.deepEqual(classify('/'), { kind: 'outside' });
  });

  test('a path that only starts with the base name is outside', () => {
    assert.deepEqual(classify('/sliding-puzzle-x'), { kind: 'outside' });
  });

  test('the api at the site root is outside', () => {
    assert.deepEqual(classify('/api/health'), { kind: 'outside' });
  });

  test('a profile path with an empty name redirects to the home page', () => {
    assert.deepEqual(classify('/sliding-puzzle/p/'), { kind: 'redirect', to: '/sliding-puzzle' });
  });

  test('a profile path with no name at all redirects to the home page', () => {
    assert.deepEqual(classify('/sliding-puzzle/p'), { kind: 'redirect', to: '/sliding-puzzle' });
  });

  test('the analytics config path is the analytics config', () => {
    assert.deepEqual(classify('/sliding-puzzle/analytics-config'), { kind: 'analytics-config' });
  });

  test('a path under ph is the analytics proxy with the rest of the path', () => {
    assert.deepEqual(classify('/sliding-puzzle/ph/i/v0/e/'), {
      kind: 'analytics-proxy',
      rest: '/i/v0/e/',
    });
  });

  test('the bare ph path is the analytics proxy with an empty rest', () => {
    assert.deepEqual(classify('/sliding-puzzle/ph'), { kind: 'analytics-proxy', rest: '' });
  });

  test('a name that only starts with ph is an asset path', () => {
    assert.deepEqual(classify('/sliding-puzzle/phone.png'), { kind: 'asset' });
  });
});

describe('pathHeaders', () => {
  test('the service worker may control the base without a slash and is never cached', () => {
    assert.deepEqual(pathHeaders('/sliding-puzzle/sw.js'), {
      'Cache-Control': 'no-store',
      'Service-Worker-Allowed': '/sliding-puzzle',
    });
  });

  test('a hashed build file may be kept for a year', () => {
    assert.deepEqual(pathHeaders('/sliding-puzzle/assets/index-abc123.js'), {
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
  });

  test('any other path gets no extra headers', () => {
    assert.deepEqual(pathHeaders('/sliding-puzzle/icons/icon.svg'), {});
  });
});
