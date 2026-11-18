// Client entry: the generic browser side of a game (API client, session hook) and the shape of a
// game feature's client side. Games render their own screen; this module has no game UI.
import type { ReactElement } from 'react';

export * from './index.ts';
export { createGameApi, type GameApi } from './api.ts';
export { useGameSession, type GameSession } from './use-game-session.ts';

/** What a game feature hands to the web composition root. */
export interface ClientFeature {
  id: string;
  title: string;
  /** `apiBase` is where the API is mounted, e.g. /sliding-puzzle/api. */
  Screen: (props: { nickname: string; apiBase: string }) => ReactElement;
}
