import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import fc from 'fast-check';
import {
  checkPhotoFile,
  cropSquare,
  fitsStorage,
  outputSide,
  PHOTO_MAX_CHARS,
  photoMessage,
} from './photo.ts';

describe('cropSquare', () => {
  test('a landscape photo keeps its centred square, the sides cut off', () => {
    assert.deepEqual(cropSquare(4000, 3000), { x: 500, y: 0, side: 3000 });
  });

  test('a portrait photo keeps its centred square, the top and bottom cut off', () => {
    assert.deepEqual(cropSquare(1080, 1921), { x: 0, y: 420, side: 1080 });
  });

  test('a square photo is kept whole', () => {
    assert.deepEqual(cropSquare(800, 800), { x: 0, y: 0, side: 800 });
  });

  test('the square of any photo lies inside it', () => {
    const length = fc.integer({ min: 1, max: 20_000 });
    fc.assert(
      fc.property(length, length, (width, height) => {
        const crop = cropSquare(width, height);
        assert.ok(Math.min(crop.x, crop.y) >= 0);
        assert.ok(Math.max(crop.x + crop.side - width, crop.y + crop.side - height) <= 0);
      }),
    );
  });
});

describe('outputSide', () => {
  test('a large square is scaled down to 1024 pixels, a small one is kept as it is', () => {
    assert.deepEqual([outputSide(3000), outputSide(1024), outputSide(640)], [1024, 1024, 640]);
  });
});

describe('checkPhotoFile', () => {
  test('a JPEG of a few megabytes can be read', () => {
    assert.equal(checkPhotoFile({ type: 'image/jpeg', size: 4_000_000 }), undefined);
  });

  test('a file that is not an image is refused before it is read', () => {
    assert.equal(checkPhotoFile({ type: 'application/pdf', size: 1000 }), 'not-an-image');
  });

  test('an image over 40 MB is refused before it is read', () => {
    assert.deepEqual(
      [
        checkPhotoFile({ type: 'image/png', size: 40 * 1024 * 1024 }),
        checkPhotoFile({ type: 'image/png', size: 40 * 1024 * 1024 + 1 }),
      ],
      [undefined, 'too-big'],
    );
  });
});

describe('fitsStorage', () => {
  test('a JPEG data URL fits up to the size limit and not beyond it', () => {
    const prefix = 'data:image/jpeg;base64,';

    assert.deepEqual(
      [
        fitsStorage(prefix.padEnd(PHOTO_MAX_CHARS, 'A')),
        fitsStorage(prefix.padEnd(PHOTO_MAX_CHARS + 1, 'A')),
      ],
      [true, false],
    );
  });

  test('anything but a JPEG data URL never goes into storage', () => {
    assert.deepEqual(
      [
        fitsStorage('data:image/png;base64,AAAA'),
        fitsStorage('https://example.com/a.jpg'),
        fitsStorage('data:image/jpeg;base64,'),
      ],
      [false, false, false],
    );
  });

  test('a JPEG data URL with anything before or after it is not kept', () => {
    assert.deepEqual(
      [fitsStorage(' data:image/jpeg;base64,AAAA'), fitsStorage('data:image/jpeg;base64,AAAA!')],
      [false, false],
    );
  });
});

describe('photoMessage', () => {
  test('each problem has a quiet sentence for the player', () => {
    assert.deepEqual(
      [
        photoMessage('not-an-image'),
        photoMessage('too-big'),
        photoMessage('unreadable'),
        photoMessage('not-kept'),
      ],
      [
        'That file is not a picture. Choose a photo instead.',
        'That photo is too big. Choose one under 40 MB.',
        'That photo could not be opened. Try another one.',
        'There is no room to keep that photo on this device.',
      ],
    );
  });
});
