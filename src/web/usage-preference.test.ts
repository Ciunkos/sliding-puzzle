import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { memoryStorage, THROWING_STORAGE } from '../test-support/memory-storage.ts';
import { readOptedOut, usageLabel, writeOptedOut } from './usage-preference.ts';

describe('usage statistics preference', () => {
  test('a browser that never chose has usage statistics on', () => {
    assert.equal(readOptedOut(memoryStorage({})), false);
  });

  test('switching off is kept and read back as off', () => {
    const storage = memoryStorage({});

    writeOptedOut(storage, true);

    assert.equal(storage.getItem('sliding-puzzle:usage-statistics'), 'off');
    assert.equal(readOptedOut(storage), true);
  });

  test('switching back on removes the stored choice', () => {
    const storage = memoryStorage({ 'sliding-puzzle:usage-statistics': 'off' });

    writeOptedOut(storage, false);

    assert.equal(storage.getItem('sliding-puzzle:usage-statistics'), null);
    assert.equal(readOptedOut(storage), false);
  });

  test('a stored value that is not the known one counts as on', () => {
    assert.equal(readOptedOut(memoryStorage({ 'sliding-puzzle:usage-statistics': 'no' })), false);
  });

  test('storage that cannot be read counts as off, and writing to it does not throw', () => {
    writeOptedOut(THROWING_STORAGE, false);

    assert.equal(readOptedOut(THROWING_STORAGE), true);
  });

  test('the control says on or off', () => {
    assert.equal(usageLabel(false), 'Usage statistics: on');
    assert.equal(usageLabel(true), 'Usage statistics: off');
  });
});
