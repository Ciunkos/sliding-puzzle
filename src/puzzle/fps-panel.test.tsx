import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { FpsPanel, FpsReadout } from './fps-panel.tsx';

/** A phone at 60 fps, one level down. */
const STATS = {
  fps: 60,
  median: 16.7,
  worst: 20,
  worstDuring: 'dust',
  width: 860,
  height: 860,
  level: 1,
  cap: 60,
  renderer: 'Apple GPU',
} as const;

describe('FpsPanel', () => {
  test('before the runtime has measured any frames, the live panel says it is measuring', () => {
    assert.ok(renderToStaticMarkup(<FpsPanel />).includes('<div>measuring...</div>'));
  });
});

describe('FpsReadout', () => {
  test('it shows the rate, frame times, buffer and quality, cap and renderer, a line each', () => {
    const html = renderToStaticMarkup(<FpsReadout stats={STATS} />);

    assert.ok(
      html.includes(
        '<div>60 fps (drawing every frame)</div><div>frame 16.7 ms, worst 20.0 ms (dust)</div><div>860 x 860 px, quality 1</div><div>capped at 60</div><div>Apple GPU</div>',
      ),
    );
  });

  test('before the first frames it says it is measuring', () => {
    assert.ok(
      renderToStaticMarkup(<FpsReadout stats={undefined} />).includes('<div>measuring...</div>'),
    );
  });

  test('it floats in the bottom-right corner above the game, set off from the edge', () => {
    const html = renderToStaticMarkup(<FpsReadout stats={STATS} />);

    assert.ok(html.includes('position:fixed;right:8px;bottom:8px;z-index:1000'));
    assert.ok(html.includes('padding:6px 8px'));
  });

  test('it reads as light monospace text on a dark backing, whatever the board looks like', () => {
    const html = renderToStaticMarkup(<FpsReadout stats={STATS} />);

    assert.ok(html.includes('background:rgb(0 0 0 / 0.7);color:#fff'));
    assert.ok(html.includes('monospace'));
  });

  test('it is hidden from assistive technology and lets the pointer through to the game', () => {
    const html = renderToStaticMarkup(<FpsReadout stats={STATS} />);

    assert.ok(html.startsWith('<div aria-hidden="true" data-testid="fps-panel"'));
    assert.ok(html.includes('pointer-events:none'));
  });
});
