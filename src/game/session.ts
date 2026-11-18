// Plain logic behind useGameSession: one request at a time with busy/error state.
import { GameApiError, StaleGameError } from './api.ts';
import type { SavedGame } from './index.ts';

/** Shown when a request was made on an outdated game and the session adopted the server's game. */
const STALE_NOTICE = 'This game changed somewhere else. Showing the latest.';

export function errorMessage(error: unknown): string {
  return error instanceof GameApiError ? error.message : 'Something went wrong. Try again.';
}

/** A stale request adopts the server's current game; any other failure shows its message. */
function showFailure<State>(target: SessionTarget<State>, failure: unknown): void {
  if (failure instanceof StaleGameError) {
    // The API client parsed this game with the same definition's state schema.
    target.setGame(failure.game as SavedGame<State>);
    target.setMessage(STALE_NOTICE);
    return;
  }
  target.setMessage(errorMessage(failure));
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
  const settle = await request().then(
    (game) => () => {
      target.setGame(game);
    },
    (failure: unknown) => () => {
      showFailure(target, failure);
    },
  );
  if (!isLive()) return;
  settle();
  target.inFlight.current = false;
  target.setBusy(false);
}
