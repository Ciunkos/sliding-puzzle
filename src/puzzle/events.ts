// The moments the puzzle screen reports through `onEvent` (see ClientFeature in src/game), decided
// purely from the game before and after a change. Only what describes the play is in an event: the
// board size, moves and seconds, and the kind of skin. Never a nickname, a board, a picture's name
// or a photo. What leaves the page is decided by the composition root, not here.
import type { FeatureEvent, SavedGame } from '../game/client.tsx';
import type { PuzzleState } from './definition.ts';
import type { SkinId } from './preferences.ts';
import { sizeOf } from './rules.ts';

type Game = SavedGame<PuzzleState>;

export interface GameChange {
  /** The game on screen before this change; undefined before the first one loaded. */
  previous: Game | undefined;
  current: Game | undefined;
  /** The player asked for a new game and it has not arrived yet. */
  requested: boolean;
  /** The play time shown for `current`. */
  elapsedMs: number;
}

const sameStart = (a: Game, b: Game) => a.startedAt === b.startedAt;

/**
 * `game_started` when the new game the player asked for arrives (not a game resumed on load), and
 * `game_solved` when the game on screen goes from unsolved to solved (not a solved game opened by a
 * reload, nor one shown again).
 */
export function gameEvents(change: GameChange): FeatureEvent[] {
  const { previous, current } = change;
  if (current === undefined) return [];
  const size = sizeOf(current.state.board) ?? 0;
  if (previous === undefined || !sameStart(previous, current)) {
    return change.requested ? [{ name: 'game_started', properties: { size } }] : [];
  }
  if (previous.finished || !current.finished) return [];
  const seconds = Math.round(change.elapsedMs / 1000);
  return [{ name: 'game_solved', properties: { size, moves: current.moves, seconds } }];
}

/** Numbers, a bundled picture or the player's photo: the kind only, never which picture. */
function skinKind(skin: SkinId): 'numbers' | 'picture' | 'photo' {
  if (skin === 'numbers' || skin === 'photo') return skin;
  return 'picture';
}

/** `skin_changed` when the chosen skin differs from the one before (not the one read on opening). */
export function skinChanged(
  previous: SkinId | undefined,
  current: SkinId,
): FeatureEvent | undefined {
  if (previous === undefined || previous === current) return undefined;
  return { name: 'skin_changed', properties: { kind: skinKind(current) } };
}

/** `sound_changed` when the player switches all sound on or off with the speaker button. */
export function soundChanged(on: boolean): FeatureEvent {
  return { name: 'sound_changed', properties: { on } };
}

/** The skin on screen for a profile. */
export interface ShownSkin {
  skin: SkinId;
  nickname: string;
}

/**
 * `skin_changed` for a skin the player chose: the same profile, another skin. Switching profile is
 * not a choice, even when that profile starts on another picture (preferences.ts startLook).
 */
export function skinChosen(
  previous: ShownSkin | undefined,
  current: ShownSkin,
): FeatureEvent | undefined {
  if (previous?.nickname !== current.nickname) return undefined;
  return skinChanged(previous.skin, current.skin);
}
