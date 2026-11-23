// Decisions about the look that the screen wires together: what to say when the 3D board is not
// shown, how the board may tilt, what the scene draws, and how a picture is described.
import { pictureOf } from './pictures.ts';
import type { SkinId } from './preferences.ts';

/** Where the 3D board is: shown (or loading), waiting for its probe, or why there is none. */
export type SceneStatus = 'shown' | 'waiting' | 'no-webgl' | 'save-data';

const NOTES: Record<SceneStatus, string | undefined> = {
  shown: undefined,
  waiting: undefined,
  'no-webgl': 'This browser cannot draw the 3D board, so the flat board is shown.',
  'save-data': 'The 3D board is off to save data.',
};

/** What to say under the 3D control, if anything. */
export function sceneNote(
  wanted: boolean,
  status: SceneStatus,
  failed: boolean,
): string | undefined {
  if (!wanted) return undefined;
  if (failed) return 'The 3D board could not start, so the flat board is shown.';
  return NOTES[status];
}

/**
 * Whether a 3D board that broke (a lost WebGL context: phones drop them in the background) is
 * tried again as the page is shown: once a session, so a board that keeps breaking stays flat.
 */
export function sceneRetry(state: {
  failed: boolean;
  retried: boolean;
  visible: boolean;
}): boolean {
  return state.failed && !state.retried && state.visible;
}

export type TiltMode = 'pointer' | 'orientation' | 'off';

/** The board follows the mouse, or the phone once tilt is enabled; never with reduced motion. */
export function tiltMode(input: {
  reducedMotion: boolean;
  orientation: boolean;
  finePointer: boolean;
}): TiltMode {
  if (input.reducedMotion) return 'off';
  if (input.orientation) return 'orientation';
  return input.finePointer ? 'pointer' : 'off';
}

export type SceneSkin = { kind: 'numbers' } | { kind: 'picture'; url: string; badges: boolean };

export function sceneSkin(picture: string | undefined, badges: boolean): SceneSkin {
  return picture === undefined ? { kind: 'numbers' } : { kind: 'picture', url: picture, badges };
}

/** A sentence that says what the picture on the board shows; none for numbers. */
export function pictureDescription(skin: SkinId): string | undefined {
  if (skin === 'numbers') return undefined;
  if (skin === 'photo') return 'The picture: your own photo.';
  return `The picture: ${pictureOf(skin).alt}.`;
}
