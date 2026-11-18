// Reports the screen's moments through `onEvent`; what counts as a moment is decided in events.ts.
import { useEffect, useRef } from 'react';
import type { FeatureEvent, SavedGame } from '../game/client.tsx';
import type { PuzzleState } from './definition.ts';
import { gameEvents, skinChanged } from './events.ts';
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

/** Reports a skin the player chose; the one read when the screen opens is not a change. */
export function useSkinEvents(skin: SkinId, onEvent: OnEvent): void {
  const previous = useRef<SkinId | undefined>(undefined);
  useEffect(() => {
    const event = skinChanged(previous.current, skin);
    previous.current = skin;
    if (event !== undefined) onEvent?.(event);
  }, [skin, onEvent]);
}
