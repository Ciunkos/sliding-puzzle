// What a game session tells the player, and how its requests end.
import { GameApiError } from './api.ts';

/** What the player is told about the sync state of the game on screen. */
export const NOTICES = {
  /** The session adopted the server's game: it changed somewhere else. */
  'server-newer': 'This game changed somewhere else. Showing the latest.',
  offline: 'You are offline. Your moves will be saved when you are back.',
} as const;

/** Shown when the server refused queued moves for good: they were dropped. */
export const COULD_NOT_SAVE = 'These moves could not be saved.';

export function errorMessage(error: unknown): string {
  return error instanceof GameApiError ? error.message : 'Something went wrong. Try again.';
}

export type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

/** How `promise` ended, as a value: a request's failure is an answer like any other. */
export function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
  return promise.then(
    (value) => ({ ok: true, value }),
    (error: unknown) => ({ ok: false, error }),
  );
}
