import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { loadLastNickname, saveLastNickname } from './last-profile.ts';

const KEY = 'sliding-puzzle:last-nickname';

interface FakeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  written: Map<string, string>;
}

function fakeStorage(initial: Record<string, string> = {}): FakeStorage {
  const written = new Map<string, string>(Object.entries(initial));
  return {
    written,
    getItem: (key) => written.get(key) ?? null,
    setItem: (key, value) => {
      written.set(key, value);
    },
  };
}

const throwingStorage = {
  getItem(): string | null {
    throw new Error('SecurityError: storage is disabled');
  },
  setItem(): void {
    throw new Error('QuotaExceededError');
  },
};

describe('loadLastNickname', () => {
  test('is undefined when nothing was stored', () => {
    assert.equal(loadLastNickname(fakeStorage()), undefined);
  });

  test('returns a valid stored nickname', () => {
    assert.equal(loadLastNickname(fakeStorage({ [KEY]: 'Ada' })), 'Ada');
  });

  test('ignores stored content that is not a valid nickname', () => {
    assert.equal(loadLastNickname(fakeStorage({ [KEY]: 'a b' })), undefined);
    assert.equal(loadLastNickname(fakeStorage({ [KEY]: 'x' })), undefined);
    assert.equal(loadLastNickname(fakeStorage({ [KEY]: '' })), undefined);
  });

  test('is undefined when reading the storage throws', () => {
    assert.equal(loadLastNickname(throwingStorage), undefined);
  });
});

describe('saveLastNickname', () => {
  test('stores the trimmed nickname under the fixed key', () => {
    const storage = fakeStorage();
    saveLastNickname('  Ada ', storage);
    assert.equal(storage.written.get(KEY), 'Ada');
  });

  test('does not store an invalid nickname', () => {
    const storage = fakeStorage();
    saveLastNickname('a b', storage);
    assert.equal(storage.written.has(KEY), false);
  });

  test('does not throw when writing the storage throws', () => {
    assert.doesNotThrow(() => {
      saveLastNickname('Ada', throwingStorage);
    });
  });

  test('round-trips through loadLastNickname', () => {
    const storage = fakeStorage();
    saveLastNickname('Ada_99', storage);
    assert.equal(loadLastNickname(storage), 'Ada_99');
  });
});
