import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import fc from 'fast-check';
import { decideStart, nicknameFromPath, profilePath } from './url.ts';

/** Vite's BASE_URL: the app's prefix with a trailing slash. */
const BASE = '/sliding-puzzle/';

/** Nicknames as the rules accept them: 2-30 letters, digits, "_" or "-". */
const VALID_NICKNAME = fc.stringMatching(/^[A-Za-z0-9_-]{2,30}$/);

describe('profilePath', () => {
  test('a nickname is placed under /p/ below the base, without a double slash', () => {
    assert.equal(
      profilePath('tortoise-squirrel-123', BASE),
      '/sliding-puzzle/p/tortoise-squirrel-123',
    );
  });

  test('a base written without the trailing slash gives the same path', () => {
    assert.equal(profilePath('Ada', '/sliding-puzzle'), '/sliding-puzzle/p/Ada');
  });
});

describe('nicknameFromPath', () => {
  test('the base itself, with or without the slash, is home', () => {
    assert.deepEqual(nicknameFromPath('/sliding-puzzle', BASE), { kind: 'home' });
    assert.deepEqual(nicknameFromPath('/sliding-puzzle/', BASE), { kind: 'home' });
  });

  test('a profile path gives its nickname as written', () => {
    assert.deepEqual(nicknameFromPath('/sliding-puzzle/p/Ada_99', BASE), {
      kind: 'profile',
      nickname: 'Ada_99',
    });
  });

  test('percent-encoded surrounding spaces are decoded and trimmed off', () => {
    assert.deepEqual(nicknameFromPath('/sliding-puzzle/p/%20Ada%20', BASE), {
      kind: 'profile',
      nickname: 'Ada',
    });
  });

  test('a name that breaks the rules is invalid and carries the decoded name', () => {
    assert.deepEqual(nicknameFromPath('/sliding-puzzle/p/zo%C3%A9', BASE), {
      kind: 'invalid',
      raw: 'zoé',
    });
  });

  test('malformed percent-encoding is invalid and carries the name as it was in the URL', () => {
    assert.deepEqual(nicknameFromPath('/sliding-puzzle/p/%E0%A4%A', BASE), {
      kind: 'invalid',
      raw: '%E0%A4%A',
    });
  });

  test('an empty name and a name with a slash are invalid', () => {
    assert.deepEqual(nicknameFromPath('/sliding-puzzle/p/', BASE), { kind: 'invalid', raw: '' });
    assert.deepEqual(nicknameFromPath('/sliding-puzzle/p/ada/x', BASE), {
      kind: 'invalid',
      raw: 'ada/x',
    });
  });

  test('a name one character too long is invalid', () => {
    assert.deepEqual(nicknameFromPath('/sliding-puzzle/p/abcdefghijklmnopqrstuvwxyz01234', BASE), {
      kind: 'invalid',
      raw: 'abcdefghijklmnopqrstuvwxyz01234',
    });
  });

  test('a path that is not a profile path is home', () => {
    assert.deepEqual(nicknameFromPath('/elsewhere/p/Ada', BASE), { kind: 'home' });
  });

  test('reading the path of any valid nickname gives that nickname back', () => {
    fc.assert(
      fc.property(VALID_NICKNAME, (nickname) => {
        assert.deepEqual(nicknameFromPath(profilePath(nickname, BASE), BASE), {
          kind: 'profile',
          nickname,
        });
      }),
    );
  });

  test('any path whatsoever is read without throwing', () => {
    // A throw inside the property fails it, so reaching assert.ok means the read did not throw.
    fc.assert(
      fc.property(fc.string({ unit: 'binary' }), fc.string(), (tail, raw) => {
        assert.ok(nicknameFromPath(`/sliding-puzzle/p/${tail}`, BASE));
        assert.ok(nicknameFromPath(raw, BASE));
      }),
    );
  });

  test('any run of percent signs and hex digits after /p/ is read without throwing', () => {
    fc.assert(
      fc.property(
        fc.string({ unit: fc.constantFrom('%', 'E', '0', 'A', '4', 'f', 'z') }),
        (tail) => {
          assert.ok(nicknameFromPath(`/sliding-puzzle/p/${tail}`, BASE));
        },
      ),
    );
  });
});

describe('decideStart', () => {
  test('a first visit home plays the generated candidate at its profile path', () => {
    // Given the home path and nothing remembered
    const input = { pathname: '/sliding-puzzle', base: BASE, remembered: undefined };

    // When the start is decided with a generated candidate
    const decision = decideStart({ ...input, candidate: 'brave-otter-100' });

    // Then the candidate is played and its path replaces home
    assert.deepEqual(decision, {
      kind: 'play',
      nickname: 'brave-otter-100',
      path: '/sliding-puzzle/p/brave-otter-100',
    });
  });

  test('home with a remembered nickname plays the remembered one', () => {
    const decision = decideStart({
      pathname: '/sliding-puzzle',
      base: BASE,
      remembered: 'Ada',
      candidate: 'brave-otter-100',
    });

    assert.deepEqual(decision, { kind: 'play', nickname: 'Ada', path: '/sliding-puzzle/p/Ada' });
  });

  test('a profile path plays that profile, whatever is remembered', () => {
    const decision = decideStart({
      pathname: '/sliding-puzzle/p/Grace',
      base: BASE,
      remembered: 'Ada',
      candidate: 'brave-otter-100',
    });

    assert.deepEqual(decision, {
      kind: 'play',
      nickname: 'Grace',
      path: '/sliding-puzzle/p/Grace',
    });
  });

  test('an invalid profile path is not played and nothing replaces it', () => {
    const decision = decideStart({
      pathname: '/sliding-puzzle/p/a',
      base: BASE,
      remembered: 'Ada',
      candidate: 'brave-otter-100',
    });

    assert.deepEqual(decision, { kind: 'invalid', raw: 'a' });
  });
});
