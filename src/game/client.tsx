// Client entry: the generic browser side of a game (API client, session hook) and the shape of a
// game feature's client side. Games render their own screen; this module has no game UI.
import type { ReactElement, ReactNode } from 'react';

export * from './index.ts';
export { createGameApi, type GameApi } from './api.ts';
export type { QueueStorage } from './queue-storage.ts';
export { isNewPersonalBest } from './results.ts';
export { useGameSession, type GameSession } from './use-game-session.ts';

/**
 * A moment a game's screen reports, e.g. a game solved. The engine knows no particular game: the
 * name and the properties are the feature's own, and the composition root decides what, if
 * anything, leaves the page.
 */
export interface FeatureEvent {
  name: string;
  properties: Readonly<Record<string, string | number | boolean>>;
}

/** What a game feature hands to the web composition root. */
export interface ClientFeature {
  id: string;
  title: string;
  /**
   * `apiBase` is where the API is mounted, e.g. /sliding-puzzle/api. `onEvent`, when given, hears
   * the moments the screen reports. `shellMenu` is what the page itself wants in the game's menu
   * (who is playing, the usage statistics): the screen shows it in its menu, as it is.
   */
  Screen: (props: {
    nickname: string;
    apiBase: string;
    onEvent?: (event: FeatureEvent) => void;
    shellMenu: ReactNode;
  }) => ReactElement;
}
