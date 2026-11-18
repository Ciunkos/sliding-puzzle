import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { memoryStorage, THROWING_STORAGE } from '../test-support/memory-storage.ts';
import { loadKnownProfile, saveKnownProfile } from './known-profile.ts';

describe('known profile', () => {
  test('a saved profile is found again under any casing of its nickname', () => {
    // Given Ada's profile saved on this device
    const storage = memoryStorage({});
    saveKnownProfile({ id: 7, nickname: 'Ada' }, storage);

    // When it is looked up in lower case
    const known = loadKnownProfile('ada', storage);

    // Then the canonical profile comes back
    assert.deepEqual(known, { id: 7, nickname: 'Ada' });
  });

  test('it is stored under the lowercased nickname as JSON of the id and the nickname', () => {
    const storage = memoryStorage({});

    saveKnownProfile({ id: 7, nickname: 'Ada' }, storage);

    assert.equal(storage.getItem('sliding-puzzle:profile:ada'), '{"id":7,"nickname":"Ada"}');
  });

  test('a nickname never saved on this device is not known', () => {
    assert.equal(loadKnownProfile('Grace', memoryStorage({})), undefined);
  });

  test('stored content that is not a profile is ignored', () => {
    const storage = memoryStorage({
      'sliding-puzzle:profile:ada': '{"id":"seven","nickname":"Ada"}',
      'sliding-puzzle:profile:bob': 'not json',
    });

    assert.equal(loadKnownProfile('Ada', storage), undefined);
    assert.equal(loadKnownProfile('bob', storage), undefined);
  });

  test('a stored profile under another nickname key is not this nickname', () => {
    const storage = memoryStorage({ 'sliding-puzzle:profile:ada': '{"id":7,"nickname":"Grace"}' });

    assert.equal(loadKnownProfile('Ada', storage), undefined);
  });

  test('storage that throws gives nothing and does not break a save', () => {
    assert.equal(loadKnownProfile('Ada', THROWING_STORAGE), undefined);
    assert.doesNotThrow(() => {
      saveKnownProfile({ id: 7, nickname: 'Ada' }, THROWING_STORAGE);
    });
  });
});
