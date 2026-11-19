import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import fc from 'fast-check';
import { memoryStorage, THROWING_STORAGE } from '../test-support/memory-storage.ts';
import {
  readLook,
  readPhoto,
  removePhoto,
  shownSkin,
  startLook,
  writeLook,
  writePhoto,
} from './preferences.ts';

const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
/** The look a browser that never chose one shows for calm-heron-207 (worked out by hand). */
const CALM_HERON_START = { skin: 'rocket', scene3d: true, numbers: true };
/** The bundled pictures, written out by hand. */
const PICTURES: readonly string[] = ['rocket', 'cat', 'balloon', 'fish', 'castle'];

describe('readLook', () => {
  test('a browser that never chose a look gets a picture from the nickname, 3D and numbers', () => {
    assert.deepEqual(readLook(memoryStorage({}), 'brave-otter-100'), {
      skin: 'cat',
      scene3d: true,
      numbers: true,
    });
  });

  test('a look written before is read back', () => {
    const storage = memoryStorage({});

    writeLook(storage, { skin: 'castle', scene3d: false, numbers: false });

    assert.deepEqual(readLook(storage, 'brave-otter-100'), {
      skin: 'castle',
      scene3d: false,
      numbers: false,
    });
  });

  test('a stored look with an unknown skin keeps its other choices and shows numbers', () => {
    const storage = memoryStorage({
      'sliding-puzzle:look': '{"skin":"dragon","scene3d":false,"numbers":false}',
    });

    assert.deepEqual(readLook(storage, 'brave-otter-100'), {
      skin: 'numbers',
      scene3d: false,
      numbers: false,
    });
  });

  test('a stored look with bad switches keeps its picture and turns 3D and numbers on', () => {
    const storage = memoryStorage({
      'sliding-puzzle:look': '{"skin":"fish","scene3d":"yes","numbers":7}',
    });

    assert.deepEqual(readLook(storage, 'brave-otter-100'), {
      skin: 'fish',
      scene3d: true,
      numbers: true,
    });
  });

  test('stored text that is not a look at all gives the nickname’s start look', () => {
    assert.deepEqual(
      [
        readLook(memoryStorage({ 'sliding-puzzle:look': '{oops' }), 'calm-heron-207'),
        readLook(memoryStorage({ 'sliding-puzzle:look': '7' }), 'calm-heron-207'),
      ],
      [CALM_HERON_START, CALM_HERON_START],
    );
  });

  test('storage that throws (a private window) gives the start look and writing is ignored', () => {
    writeLook(THROWING_STORAGE, { skin: 'fish', scene3d: true, numbers: true });

    assert.deepEqual(readLook(THROWING_STORAGE, 'calm-heron-207'), CALM_HERON_START);
  });
});

describe('startLook', () => {
  test('each nickname starts on its own picture, the same one every time', () => {
    assert.deepEqual(
      [
        startLook('brave-otter-100').skin,
        startLook('calm-heron-207').skin,
        startLook('quick-lynx-310').skin,
        startLook('tidy-owl-412').skin,
      ],
      ['cat', 'rocket', 'fish', 'castle'],
    );
  });

  test('the start picture does not depend on how the nickname is capitalised', () => {
    assert.equal(startLook('Brave-Otter-100').skin, 'cat');
  });

  test('every nickname starts on a bundled picture', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 2, maxLength: 30 }), (nickname) =>
        PICTURES.includes(startLook(nickname).skin),
      ),
    );
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
