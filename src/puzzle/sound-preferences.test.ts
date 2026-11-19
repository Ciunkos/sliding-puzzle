import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import fc from 'fast-check';
import { memoryStorage, THROWING_STORAGE } from '../test-support/memory-storage.ts';
import { audible, DEFAULT_SOUND, readSound, writeSound } from './sound-preferences.ts';

const choices = fc.record(
  { effects: fc.boolean(), music: fc.boolean(), muted: fc.boolean() },
  { noNullPrototype: true },
);

describe('readSound', () => {
  test('a browser that never chose hears effects and music', () => {
    assert.deepEqual(readSound(memoryStorage({})), { effects: true, music: true, muted: false });
  });

  test('any choice written is read back', () => {
    fc.assert(
      fc.property(choices, (preferences) => {
        const storage = memoryStorage({});
        writeSound(storage, preferences);
        assert.deepEqual(readSound(storage), preferences);
      }),
    );
  });

  test('choices are kept under their own key as JSON', () => {
    const storage = memoryStorage({});

    writeSound(storage, { effects: false, music: true, muted: true });

    assert.equal(
      storage.getItem('sliding-puzzle:sound'),
      '{"effects":false,"music":true,"muted":true}',
    );
  });

  test('a stored field that is not a yes or no falls back alone', () => {
    const storage = memoryStorage({
      'sliding-puzzle:sound': '{"effects":"loud","music":false,"muted":true}',
    });

    assert.deepEqual(readSound(storage), { effects: true, music: false, muted: true });
  });

  test('missing fields fall back to on and not muted', () => {
    const storage = memoryStorage({ 'sliding-puzzle:sound': '{"music":false}' });

    assert.deepEqual(readSound(storage), { effects: true, music: false, muted: false });
  });

  test('stored text that is not a choice at all gives the default', () => {
    assert.deepEqual(
      [
        readSound(memoryStorage({ 'sliding-puzzle:sound': '{oops' })),
        readSound(memoryStorage({ 'sliding-puzzle:sound': '7' })),
      ],
      [DEFAULT_SOUND, DEFAULT_SOUND],
    );
  });

  test('storage that throws (a private window) gives the default and writing is ignored', () => {
    writeSound(THROWING_STORAGE, { effects: false, music: false, muted: true });

    assert.deepEqual(readSound(THROWING_STORAGE), DEFAULT_SOUND);
  });
});

describe('audible', () => {
  test('muting silences both, and each switch silences its own part', () => {
    assert.deepEqual(
      [
        audible({ effects: true, music: true, muted: true }),
        audible({ effects: true, music: false, muted: false }),
        audible({ effects: false, music: true, muted: false }),
      ],
      [
        { effects: false, music: false },
        { effects: true, music: false },
        { effects: false, music: true },
      ],
    );
  });
});
