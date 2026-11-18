import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { BASE, classify } from './paths.ts';

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
});
