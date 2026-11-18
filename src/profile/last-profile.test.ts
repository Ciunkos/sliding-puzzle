import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { LAST_NICKNAME_KEY, loadLastNickname, saveLastNickname } from './last-profile.ts';

/** A Storage-shaped stand-in for the browser's localStorage, kept in memory. */
function memoryStorage(entries: Record<string, string>): Pick<Storage, 'getItem' | 'setItem'> {
  // URLSearchParams.get already answers null for a missing key, like Storage.getItem.
  const values = new URLSearchParams(entries);
  return {
    getItem: (key) => values.get(key),
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

/** Storage as in a private window or with site data blocked: every access throws. */
const THROWING_STORAGE = {
  getItem(): string | null {
    throw new Error('SecurityError: storage is disabled');
  },
  setItem(): void {
    throw new Error('QuotaExceededError');
  },
};

describe('last profile', () => {
  test('a remembered nickname is returned', () => {
    // Given a browser that remembers Ada
    const storage = memoryStorage({ [LAST_NICKNAME_KEY]: 'Ada' });

    // When the last nickname is loaded
    const nickname = loadLastNickname(storage);

    // Then it is Ada
    assert.equal(nickname, 'Ada');
  });

  test('nothing is returned when nothing was stored', () => {
    assert.equal(loadLastNickname(memoryStorage({})), undefined);
  });

  test('stored content that is not a valid nickname is ignored', () => {
    assert.equal(loadLastNickname(memoryStorage({ [LAST_NICKNAME_KEY]: 'a b' })), undefined);
  });

  test('saving stores the trimmed nickname under the last-nickname key', () => {
    const storage = memoryStorage({});

    saveLastNickname('  Ada ', storage);

    assert.equal(storage.getItem(LAST_NICKNAME_KEY), 'Ada');
  });

  test('storage that throws on read gives no nickname instead of crashing', () => {
    assert.equal(loadLastNickname(THROWING_STORAGE), undefined);
  });

  test('storage that throws on write does not crash the save', () => {
    assert.doesNotThrow(() => {
      saveLastNickname('Ada', THROWING_STORAGE);
    });
  });
});
