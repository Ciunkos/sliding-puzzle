import { GameApiError, type GameApi } from './api.ts';
import type { GameState } from './index.ts';

/** Resume the profile's active game, or start one if this profile has none yet. */
export async function loadOrStart(api: GameApi, nickname: string): Promise<GameState> {
  return (await api.load(nickname)) ?? api.start(nickname);
}

export function errorMessage(error: unknown): string {
  return error instanceof GameApiError ? error.message : 'Something went wrong. Try again.';
}
