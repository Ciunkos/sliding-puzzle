// Reports the screen's moments through `onEvent`; what counts as a moment is decided in events.ts.
import { useEffect, useRef } from 'react';
import type { FeatureEvent, SavedGame } from '../game/client.tsx';
import type { PuzzleState } from './definition.ts';
import { gameEvents, type ShownSkin, skinChosen } from './events.ts';
import type { SkinId } from './preferences.ts';

type OnEvent = ((event: FeatureEvent) => void) | undefined;

/**
 * Reports a started and a solved game. Returns what the screen calls when the player asks for a new
 * game, so the game that arrives next is known to be theirs.
 */
export function useGameEvents(
  game: SavedGame<PuzzleState> | undefined,
  elapsedMs: number,
  onEvent: OnEvent,
): () => void {
  const previous = useRef<SavedGame<PuzzleState> | undefined>(undefined);
  const requested = useRef(false);
  useEffect(() => {
    if (game === previous.current) return;
    const events = gameEvents({
      previous: previous.current,
      current: game,
      requested: requested.current,
      elapsedMs,
    });
    previous.current = game;
    if (events.some((event) => event.name === 'game_started')) requested.current = false;
    events.forEach((event) => onEvent?.(event));
  }, [game, elapsedMs, onEvent]);
  return () => {
    requested.current = true;
  };
}

/** Reports a skin the player chose; the one read on opening, or another profile's, is not one. */
export function useSkinEvents(skin: SkinId, nickname: string, onEvent: OnEvent): void {
  const previous = useRef<ShownSkin | undefined>(undefined);
  useEffect(() => {
    const event = skinChosen(previous.current, { skin, nickname });
    previous.current = { skin, nickname };
    if (event !== undefined) onEvent?.(event);
  }, [skin, nickname, onEvent]);
}
