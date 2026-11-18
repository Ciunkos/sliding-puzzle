// Plain logic behind useGameSession: load-or-start, and one request at a time with busy/error state.
import { type GameApi, GameApiError } from './api.ts';
import type { SavedGame } from './index.ts';

/** Resume the profile's saved game, or start one if this profile has none yet. */
export async function loadOrStart<State, Move, Options>(
  api: GameApi<State, Move, Options>,
  nickname: string,
  options: Options,
): Promise<SavedGame<State>> {
  return (await api.load(nickname)) ?? api.start(nickname, options);
}

export function errorMessage(error: unknown): string {
  return error instanceof GameApiError ? error.message : 'Something went wrong. Try again.';
}

export interface SessionTarget<State> {
  setGame: (game: SavedGame<State> | undefined) => void;
  setMessage: (message: string | undefined) => void;
  setBusy: (busy: boolean) => void;
  /** Synchronous guard: a click that lands before React re-renders must still be ignored. */
  inFlight: { current: boolean };
}

/**
 * Runs one request: marks the session busy, then stores the game or the error message. `isLive`
 * turns false when the session moved on (another nickname), so a late response is ignored.
 */
export async function runRequest<State>(
  target: SessionTarget<State>,
  isLive: () => boolean,
  request: () => Promise<SavedGame<State>>,
): Promise<void> {
  target.inFlight.current = true;
  target.setBusy(true);
  target.setMessage(undefined);
  try {
    const game = await request();
    if (isLive()) target.setGame(game);
  } catch (failure: unknown) {
    if (isLive()) target.setMessage(errorMessage(failure));
  } finally {
    if (isLive()) {
      target.inFlight.current = false;
      target.setBusy(false);
    }
  }
}
