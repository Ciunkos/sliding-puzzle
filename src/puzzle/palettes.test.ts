import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import fc from 'fast-check';
import { minContrast } from '../test-support/contrast.ts';
import { pagePalette, paletteStyle } from './palettes.ts';

/**
 * The HUD's weakest text colours (styles.ts), written out by hand: muted text has the least
 * contrast with the page in each scheme, so the main text passes wherever it passes.
 */
const LIGHT_MUTED = '#5c4630';
const DARK_MUTED = '#cdbba3';
const SKIN = fc.constantFrom('numbers', 'rocket', 'cat', 'balloon', 'fish', 'castle', 'photo');

describe('pagePalette', () => {
  test('numbers and the photo get the warm wood page; each picture its own colours', () => {
    assert.deepEqual(
      [pagePalette('numbers'), pagePalette('photo')],
      [
        { light: ['#fbf3e4', '#efdcbc', '#d9bd92'], dark: ['#2b2119', '#1a140f', '#0d0a07'] },
        { light: ['#fbf3e4', '#efdcbc', '#d9bd92'], dark: ['#2b2119', '#1a140f', '#0d0a07'] },
      ],
    );
  });

  test('the rocket gets a night-sky page', () => {
    assert.deepEqual(pagePalette('rocket'), {
      light: ['#f1edfb', '#ddd5f3', '#c9bdec'],
      dark: ['#2a2347', '#1a1530', '#0e0b1c'],
    });
  });

  test('every page has three colours for each colour scheme', () => {
    fc.assert(
      fc.property(
        SKIN,
        (skin) => pagePalette(skin).light.length * 10 + pagePalette(skin).dark.length === 33,
      ),
    );
  });

  test('the HUD text is AA on every colour of every light page', () => {
    fc.assert(
      fc.property(SKIN, (skin) => minContrast(LIGHT_MUTED, pagePalette(skin).light) >= 4.5),
    );
  });

  test('the HUD text is AA on every colour of every dark page', () => {
    fc.assert(fc.property(SKIN, (skin) => minContrast(DARK_MUTED, pagePalette(skin).dark) >= 4.5));
  });
});

describe('paletteStyle', () => {
  test('the palette reaches the page as custom properties for both colour schemes', () => {
    assert.deepEqual(paletteStyle('fish'), {
      '--sp-bg-light-1': '#e9f8f6',
      '--sp-bg-light-2': '#cdeee9',
      '--sp-bg-light-3': '#addfd8',
      '--sp-bg-dark-1': '#173533',
      '--sp-bg-dark-2': '#0f2423',
      '--sp-bg-dark-3': '#081514',
    });
  });
});
