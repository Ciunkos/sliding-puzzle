import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import fc from 'fast-check';
import { PICTURE_IDS, pictureOf, svgUrl } from './pictures.ts';

describe('pictureOf', () => {
  test('the five pictures are a rocket, a cat, a balloon, a fish and a castle, in that order', () => {
    assert.deepEqual(
      [
        pictureOf('rocket').title,
        pictureOf('cat').title,
        pictureOf('balloon').title,
        pictureOf('fish').title,
        pictureOf('castle').title,
      ],
      ['Rocket', 'Cat', 'Balloon', 'Fish', 'Castle'],
    );
    assert.deepEqual(PICTURE_IDS, ['rocket', 'cat', 'balloon', 'fish', 'castle']);
  });

  test('every picture is a whole square SVG drawing of its own, with its id and a sentence of alt text', () => {
    fc.assert(
      fc.property(fc.constantFrom(...PICTURE_IDS), (id) => {
        const picture = pictureOf(id);
        assert.match(
          picture.svg,
          /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 512 512">\n[^]+\n<\/svg>$/,
        );
        assert.match(picture.alt, /^An? [a-z-]+ .{30,}[a-z]$/);
        assert.equal(picture.id, id);
      }),
    );
  });
});

describe('svgUrl', () => {
  test('an SVG becomes a percent-encoded data URL', () => {
    assert.equal(svgUrl('<svg a="1"/>'), 'data:image/svg+xml,%3Csvg%20a%3D%221%22%2F%3E');
  });
});
