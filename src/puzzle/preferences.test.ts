import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { memoryStorage, THROWING_STORAGE } from '../test-support/memory-storage.ts';
import {
  DEFAULT_LOOK,
  readLook,
  readPhoto,
  removePhoto,
  shownSkin,
  writeLook,
  writePhoto,
} from './preferences.ts';

const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';

describe('readLook', () => {
  test('a browser that never chose a look gets numbers, the 3D board and numbers on pictures', () => {
    assert.deepEqual(readLook(memoryStorage({})), {
      skin: 'numbers',
      scene3d: true,
      numbers: true,
    });
  });

  test('a look written before is read back', () => {
    const storage = memoryStorage({});

    writeLook(storage, { skin: 'castle', scene3d: false, numbers: false });

    assert.deepEqual(readLook(storage), { skin: 'castle', scene3d: false, numbers: false });
  });

  test('a stored look with an unknown skin keeps its other choices and shows numbers', () => {
    const storage = memoryStorage({
      'sliding-puzzle:look': '{"skin":"dragon","scene3d":false,"numbers":false}',
    });

    assert.deepEqual(readLook(storage), { skin: 'numbers', scene3d: false, numbers: false });
  });

  test('stored text that is not a look at all gives the default look', () => {
    assert.deepEqual(
      [
        readLook(memoryStorage({ 'sliding-puzzle:look': '{oops' })),
        readLook(memoryStorage({ 'sliding-puzzle:look': '7' })),
      ],
      [DEFAULT_LOOK, DEFAULT_LOOK],
    );
  });

  test('storage that throws (a private window) gives the default look and writing is ignored', () => {
    writeLook(THROWING_STORAGE, { skin: 'fish', scene3d: true, numbers: true });

    assert.deepEqual(readLook(THROWING_STORAGE), DEFAULT_LOOK);
  });
});

describe('photo storage', () => {
  test('a photo written is read back, and removing it leaves none', () => {
    const storage = memoryStorage({});

    const kept = writePhoto(storage, PHOTO);
    const read = readPhoto(storage);
    removePhoto(storage);

    assert.deepEqual([kept, read, readPhoto(storage)], [true, PHOTO, undefined]);
  });

  test('a photo stored before is read back', () => {
    assert.equal(readPhoto(memoryStorage({ 'sliding-puzzle:photo': PHOTO })), PHOTO);
  });

  test('a stored value that is not a JPEG data URL is not a photo', () => {
    assert.equal(
      readPhoto(memoryStorage({ 'sliding-puzzle:photo': 'https://example.com/me.jpg' })),
      undefined,
    );
  });

  test('a photo that cannot be kept (quota, private window) says so, and nothing is read', () => {
    removePhoto(THROWING_STORAGE);

    assert.deepEqual(
      [writePhoto(THROWING_STORAGE, PHOTO), readPhoto(THROWING_STORAGE)],
      [false, undefined],
    );
  });

  test('something that is not a JPEG data URL is never written', () => {
    const storage = memoryStorage({});

    const kept = writePhoto(storage, 'data:text/html;base64,PGgxPg==');

    assert.deepEqual([kept, storage.getItem('sliding-puzzle:photo')], [false, null]);
  });
});

describe('shownSkin', () => {
  test('the photo skin shows numbers until there is a photo; other skins show as chosen', () => {
    assert.deepEqual(
      [shownSkin('photo', false), shownSkin('photo', true), shownSkin('cat', false)],
      ['numbers', 'photo', 'cat'],
    );
  });
});
