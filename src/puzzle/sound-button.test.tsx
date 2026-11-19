import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { SoundButton, SoundSettings } from './sound-button.tsx';

const NONE = () => undefined;

/** Static HTML, one element per line. */
const lines = (html: string) => html.replaceAll('><', '>\n<');

const SOUND_ON = `<button type="button" class="sp-sound-button" data-testid="sound-toggle" aria-label="Sound" aria-pressed="true">
<svg class="sp-sound-icon" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
<path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor">
</path>
<path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
</path>
</svg>
</button>`;

const SOUND_OFF_MARK = `<path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round">`;

const BOTH_ON = `<div class="sp-sound-settings" role="group" aria-label="Sound">
<label class="sp-sound-switch">
<input type="checkbox" role="switch" data-testid="sound-effects" checked=""/>Sound effects</label>
<label class="sp-sound-switch">
<input type="checkbox" role="switch" data-testid="sound-music" checked=""/>Music</label>
</div>`;

const MUTED_MUSIC_OFF = `<div class="sp-sound-settings" role="group" aria-label="Sound">
<label class="sp-sound-switch">
<input type="checkbox" role="switch" data-testid="sound-effects" checked=""/>Sound effects</label>
<label class="sp-sound-switch">
<input type="checkbox" role="switch" data-testid="sound-music"/>Music</label>
<p class="sp-sound-note">Muted by the speaker button.</p>
</div>`;

describe('sound controls', () => {
  test('with sound on the corner button is pressed and shows a speaker with waves', () => {
    const html = lines(renderToStaticMarkup(<SoundButton muted={false} onToggle={NONE} />));

    assert.equal(html, SOUND_ON);
  });

  test('muted, the button keeps its name, is not pressed and shows a cross', () => {
    const html = lines(renderToStaticMarkup(<SoundButton muted={true} onToggle={NONE} />));

    assert.match(html, /aria-label="Sound" aria-pressed="false">/);
    assert.ok(html.includes(SOUND_OFF_MARK));
  });

  test('the menu switches show effects and music on, with no note', () => {
    const preferences = { effects: true, music: true, muted: false };
    const html = renderToStaticMarkup(
      <SoundSettings preferences={preferences} onToggleEffects={NONE} onToggleMusic={NONE} />,
    );

    assert.equal(lines(html), BOTH_ON);
  });

  test('when muted the switches keep their own choices and a note says why it is quiet', () => {
    const preferences = { effects: true, music: false, muted: true };
    const html = renderToStaticMarkup(
      <SoundSettings preferences={preferences} onToggleEffects={NONE} onToggleMusic={NONE} />,
    );

    assert.equal(lines(html), MUTED_MUSIC_OFF);
  });
});
