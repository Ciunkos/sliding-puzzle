import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { pictureDescription, sceneNote, sceneSkin, tiltMode } from './look-model.ts';

describe('sceneNote', () => {
  test('nothing is said while the 3D board is shown, still loading, or switched off', () => {
    assert.deepEqual(
      [
        sceneNote(true, 'shown', false),
        sceneNote(true, 'waiting', false),
        sceneNote(false, 'no-webgl', true),
      ],
      [undefined, undefined, undefined],
    );
  });

  test('without WebGL, with a data saver, or after the 3D board broke, the flat board is explained', () => {
    assert.deepEqual(
      [
        sceneNote(true, 'no-webgl', false),
        sceneNote(true, 'save-data', false),
        sceneNote(true, 'shown', true),
      ],
      [
        'This browser cannot draw the 3D board, so the flat board is shown.',
        'The 3D board is off to save data.',
        'The 3D board could not start, so the flat board is shown.',
      ],
    );
  });
});

describe('tiltMode', () => {
  test('a mouse tilts the board, a phone only once tilt is enabled', () => {
    assert.deepEqual(
      [
        tiltMode({ reducedMotion: false, orientation: false, finePointer: true }),
        tiltMode({ reducedMotion: false, orientation: true, finePointer: false }),
        tiltMode({ reducedMotion: false, orientation: false, finePointer: false }),
      ],
      ['pointer', 'orientation', 'off'],
    );
  });

  test('with reduced motion the board never tilts', () => {
    assert.deepEqual(
      [
        tiltMode({ reducedMotion: true, orientation: true, finePointer: true }),
        tiltMode({ reducedMotion: true, orientation: false, finePointer: true }),
      ],
      ['off', 'off'],
    );
  });
});

describe('sceneSkin', () => {
  test('no picture means numbers; a picture is drawn with or without number badges', () => {
    assert.deepEqual(
      [sceneSkin(undefined, true), sceneSkin('a.svg', false)],
      [{ kind: 'numbers' }, { kind: 'picture', url: 'a.svg', badges: false }],
    );
  });
});

describe('pictureDescription', () => {
  test('a picture skin is described by its alt text, the photo as the player’s own', () => {
    assert.deepEqual(
      [pictureDescription('balloon'), pictureDescription('photo'), pictureDescription('numbers')],
      [
        'The picture: A striped hot-air balloon over green hills with houses, trees, a river and the sun.',
        'The picture: your own photo.',
        undefined,
      ],
    );
  });
});
