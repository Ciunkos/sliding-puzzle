import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { swRoute } from './sw-route.ts';

/** A same-origin GET that is not a navigation, e.g. a script or an image. */
const FETCH = { method: 'GET', navigate: false, sameOrigin: true };
/** A same-origin navigation: the address bar, a link, a reload. */
const NAVIGATE = { method: 'GET', navigate: true, sameOrigin: true };

describe('swRoute', () => {
  test('opening the home page is a page', () => {
    assert.equal(swRoute({ ...NAVIGATE, pathname: '/sliding-puzzle' }), 'page');
  });

  test('opening a profile is a page, whether or not it was visited before', () => {
    assert.equal(swRoute({ ...NAVIGATE, pathname: '/sliding-puzzle/p/Ada' }), 'page');
  });

  test('a path that only starts with the app name is left to the network', () => {
    assert.equal(swRoute({ ...NAVIGATE, pathname: '/sliding-puzzle-x' }), 'pass');
    assert.equal(swRoute({ ...FETCH, pathname: '/sliding-puzzlex/a.js' }), 'pass');
  });

  test('the api is never answered by the worker', () => {
    assert.equal(swRoute({ ...FETCH, pathname: '/sliding-puzzle/api' }), 'pass');
    assert.equal(swRoute({ ...FETCH, pathname: '/sliding-puzzle/api/health' }), 'pass');
    assert.equal(swRoute({ ...NAVIGATE, pathname: '/sliding-puzzle/api/health' }), 'pass');
  });

  test('a built file under assets is hashed', () => {
    assert.equal(
      swRoute({ ...FETCH, pathname: '/sliding-puzzle/assets/board-3d-a1b2c3.js' }),
      'hashed',
    );
  });

  test('another file under the prefix is static', () => {
    assert.equal(swRoute({ ...FETCH, pathname: '/sliding-puzzle/icons/icon-192.png' }), 'static');
  });

  test('the worker script itself is left to the network', () => {
    assert.equal(swRoute({ ...FETCH, pathname: '/sliding-puzzle/sw.js' }), 'pass');
  });

  test('a navigation to a path that is not a page is left to the network', () => {
    assert.equal(swRoute({ ...NAVIGATE, pathname: '/sliding-puzzle/' }), 'pass');
    assert.equal(swRoute({ ...NAVIGATE, pathname: '/sliding-puzzle/p/Ada/games' }), 'pass');
  });

  test('a request that is not a GET is left to the network', () => {
    assert.equal(
      swRoute({ ...FETCH, method: 'POST', pathname: '/sliding-puzzle/assets/a.js' }),
      'pass',
    );
  });

  test('a request to another origin is left to the network', () => {
    assert.equal(
      swRoute({ ...FETCH, sameOrigin: false, pathname: '/sliding-puzzle/assets/a.js' }),
      'pass',
    );
  });
});
