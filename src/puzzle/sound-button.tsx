// The sound controls: the corner button that mutes everything (pressed means sound is on, the
// same pattern as the 3D board button), and the menu's two switches for effects and music.
// Handlers come from use-sound.ts; their CSS is in styles.ts with the rest of the screen's.
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
