import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { LookControls, type LookControlsProps } from './look-controls.tsx';

const NONE = () => undefined;
const DEFAULTS: LookControlsProps = {
  look: { skin: 'numbers', scene3d: true, numbers: true },
  photo: undefined,
  photoNote: undefined,
  sceneNote: undefined,
  tilt: undefined,
  onPickSkin: NONE,
  onToggle3d: NONE,
  onToggleTilt: NONE,
  onToggleNumbers: NONE,
  onPhotoFile: NONE,
  onRemovePhoto: NONE,
};

/** Static HTML, one element per line, with the long picture URLs shortened to "svg". */
function markup(change: Partial<LookControlsProps>): string {
  return renderToStaticMarkup(<LookControls {...DEFAULTS} {...change} />)
    .replaceAll(/data:image\/svg\+xml,[^"]+/g, 'svg')
    .replaceAll('><', '>\n<');
}

const FIRST_ROW = `<div class="sp-look">
<div class="sp-row">
<button type="button" class="sp-button" data-testid="toggle-3d" aria-pressed="true">3D board</button>
</div>
<details class="sp-skins" data-testid="skin-picker">
<summary class="sp-summary">Picture: <strong>Numbers</strong>
</summary>
<div class="sp-skin-grid" role="group" aria-label="Pictures">
<button type="button" class="sp-skin" data-skin="numbers" data-testid="skin-numbers" aria-pressed="true">
<span class="sp-thumb sp-thumb-numbers" aria-hidden="true">
<span>1</span>
<span>2</span>
<span>3</span>
<span>4</span>
</span>
<span class="sp-skin-name">Numbers</span>
</button>
<button type="button" class="sp-skin" data-skin="rocket" data-testid="skin-rocket" aria-pressed="false">
<img class="sp-thumb" src="svg" alt="" width="56" height="56"/>
<span class="sp-skin-name">Rocket</span>
</button>`;

const LAST_ROWS = `<label class="sp-check">
<input type="checkbox" data-testid="show-numbers" checked=""/>Show numbers on pictures</label>
<div class="sp-photo">
<div class="sp-row">
<label class="sp-button sp-file">Use your own photo<input type="file" accept="image/*" class="sp-file-input" data-testid="photo-input"/>
</label>
</div>
<p class="sp-hint">Your photo stays on this device. It is never uploaded.</p>
<p class="sp-hint sp-note" data-testid="photo-note" role="status">
</p>
</div>
</details>
</div>`;

describe('LookControls', () => {
  test('by default: 3D on, no tilt control, numbers chosen in a closed picker of six', () => {
    const html = markup({});

    assert.equal(html.slice(0, FIRST_ROW.length), FIRST_ROW);
    assert.equal(html.slice(-LAST_ROWS.length), LAST_ROWS);
    assert.equal(html.split('class="sp-skin"').length, 7);
  });

  test('a chosen picture is pressed and named in the summary', () => {
    const html = markup({ look: { skin: 'castle', scene3d: false, numbers: false } });

    assert.match(html, /aria-pressed="false">3D board<\/button>/);
    assert.match(html, /Picture: <strong>Castle<\/strong>/);
    assert.match(html, /data-skin="castle" data-testid="skin-castle" aria-pressed="true">/);
  });

  test('with a photo it is offered as a skin, with a way to remove it', () => {
    const html = markup({
      look: { skin: 'photo', scene3d: true, numbers: false },
      photo: 'data:image/jpeg;base64,AA',
    });

    assert.match(
      html,
      /aria-pressed="true">\n<img class="sp-thumb" src="data:image\/jpeg;base64,AA" alt="" width="56" height="56"\/>\n<span class="sp-skin-name">Your photo<\/span>/,
    );
    assert.match(
      html,
      /<button type="button" class="sp-button" data-testid="remove-photo">Remove photo<\/button>/,
    );
    assert.match(html, /<input type="checkbox" data-testid="show-numbers"\/>/);
  });

  test('the photo skin without a photo reads as numbers', () => {
    const html = markup({ look: { skin: 'photo', scene3d: true, numbers: true } });

    assert.match(html, /Picture: <strong>Numbers<\/strong>/);
  });

  test('notes about the 3D board and the photo are shown when there are some', () => {
    const html = markup({ sceneNote: 'No 3D here.', photoNote: 'That file is not a picture.' });

    assert.match(html, /<\/div>\n<p class="sp-hint">No 3D here.<\/p>\n<details/);
    assert.match(html, /role="status">That file is not a picture.<\/p>/);
  });

  test('on a phone the tilt control first enables tilt, then stops it', () => {
    assert.match(
      markup({ tilt: { on: false } }),
      /3D board<\/button>\n<button type="button" class="sp-button" data-testid="tilt">Enable tilt<\/button>/,
    );
    assert.match(markup({ tilt: { on: true } }), /data-testid="tilt">Stop tilt<\/button>/);
  });
});
