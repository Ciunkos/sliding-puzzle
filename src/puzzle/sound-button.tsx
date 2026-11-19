// The sound controls: the corner button that mutes everything (pressed means sound is on, the
// same pattern as the 3D board button), and the menu's two switches for effects and music.
// Handlers come from use-sound.ts. SOUND_STYLES holds their CSS for the screen to include.
import type { ReactElement } from 'react';
import type { SoundPreferences } from './sound-preferences.ts';

export interface SoundButtonProps {
  muted: boolean;
  onToggle: () => void;
}

/** A speaker; sound waves beside it when on, a cross when muted. */
function SpeakerIcon(props: { muted: boolean }): ReactElement {
  return (
    <svg
      className="sp-sound-icon"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
      {props.muted ? (
        <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      ) : (
        <path
          d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

export function SoundButton(props: SoundButtonProps): ReactElement {
  return (
    <button
      type="button"
      className="sp-sound-button"
      data-testid="sound-toggle"
      aria-label="Sound"
      aria-pressed={!props.muted}
      onClick={props.onToggle}
    >
      <SpeakerIcon muted={props.muted} />
    </button>
  );
}

export interface SoundSettingsProps {
  preferences: SoundPreferences;
  onToggleEffects: () => void;
  onToggleMusic: () => void;
}

/** Two switches in the menu; a note says when the corner button has muted them both. */
export function SoundSettings(props: SoundSettingsProps): ReactElement {
  const { effects, music, muted } = props.preferences;
  return (
    <div className="sp-sound-settings" role="group" aria-label="Sound">
      <label className="sp-sound-switch">
        <input
          type="checkbox"
          role="switch"
          data-testid="sound-effects"
          checked={effects}
          onChange={props.onToggleEffects}
        />
        Sound effects
      </label>
      <label className="sp-sound-switch">
        <input
          type="checkbox"
          role="switch"
          data-testid="sound-music"
          checked={music}
          onChange={props.onToggleMusic}
        />
        Music
      </label>
      {muted ? <p className="sp-sound-note">Muted by the speaker button.</p> : null}
    </div>
  );
}

/** The CSS of the controls above; colours come from the screen's --sp-* tokens when present. */
export const SOUND_STYLES = `
.sp-sound-button {
  display: inline-flex; align-items: center; justify-content: center;
  inline-size: 44px; block-size: 44px; padding: 0; border-radius: 50%;
  border: 1px solid var(--sp-line, currentColor);
  background: var(--sp-button, transparent); color: var(--sp-button-text, inherit);
  cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent;
}
.sp-sound-button[aria-pressed="false"] { color: var(--sp-muted, inherit); }
.sp-sound-button:focus-visible {
  outline: 3px solid var(--sp-ring-outer, currentColor); outline-offset: 2px;
}
.sp-sound-icon { display: block; }
.sp-sound-settings { display: grid; gap: 0.5rem; }
.sp-sound-switch {
  display: flex; align-items: center; gap: 0.75rem; min-block-size: 44px; cursor: pointer;
}
.sp-sound-switch input {
  appearance: none; -webkit-appearance: none; margin: 0; flex: none;
  inline-size: 2.75rem; block-size: 1.5rem; border-radius: 0.75rem; position: relative;
  border: 1px solid var(--sp-line, currentColor); background: var(--sp-well, transparent);
  cursor: pointer; transition: background-color 0.15s;
}
.sp-sound-switch input::after {
  content: ""; position: absolute; inset-block-start: 0.125rem; inset-inline-start: 0.125rem;
  inline-size: 1.125rem; block-size: 1.125rem; border-radius: 50%;
  background: var(--sp-button-text, currentColor); transition: transform 0.15s;
}
.sp-sound-switch input:checked { background: var(--sp-tile, currentColor); }
.sp-sound-switch input:checked::after {
  transform: translateX(1.25rem); background: var(--sp-tile-text, #fff);
}
.sp-sound-switch input:focus-visible {
  outline: 3px solid var(--sp-ring-outer, currentColor); outline-offset: 2px;
}
.sp-sound-note { margin: 0; font-size: 0.875rem; color: var(--sp-muted, inherit); }
@media (prefers-reduced-motion: reduce) {
  .sp-sound-switch input, .sp-sound-switch input::after { transition: none; }
}
`;
