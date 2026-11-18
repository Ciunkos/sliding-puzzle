import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import Board3D from './board-3d.tsx';

type Props = Parameters<typeof Board3D>[0];

/** The scene starts in an effect, which server rendering never runs: no canvas or GL is touched. */
const PROPS = {
  surface: {},
  board: [1, 2, 3, 4, 5, 6, 7, 0, 8],
  size: 3,
  finished: false,
  moves: 0,
  skin: { kind: 'numbers' },
  dark: false,
  reducedMotion: false,
  tilt: 'off',
  onReady: () => undefined,
  onLost: () => undefined,
} as unknown as Props;

describe('Board3D', () => {
  test('the 3D board is one element hidden from assistive technology, its canvas added once it runs', () => {
    const html = renderToStaticMarkup(<Board3D {...PROPS} />);

    assert.equal(html, '<div class="sp-scene" data-testid="scene" aria-hidden="true"></div>');
  });
});
