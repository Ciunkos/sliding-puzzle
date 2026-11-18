// React glue for one profile's game: a SessionDriver (session-driver.ts) per profile, wired to the
// browser's storage, network and visibility events. `game` is the optimistic game: a tap shows at
// once, and moves reach the server in batches, also after being made offline.
import { useEffect, useRef, useState } from 'react';
import type { GameApi } from './api.ts';
import type { BestResult } from './index.ts';
import type { QueueStorage } from './queue-storage.ts';
import { type DriverEnvironment, SessionDriver, type SessionView } from './session-driver.ts';

export interface GameSession<State, Move> extends SessionView<State> {
  /** Undefined while loading, or when loading failed. The optimistic game. */
  game: SessionView<State>['game'];
  /** True only for a new game, a reset and the initial load; never for moves. */
  busy: boolean;
  start: () => void;
  move: (move: Move) => void;
  reset: () => void;
  results: readonly BestResult[];
  /** Active play time by `now` (Date.now()); call it on every tick of the screen's timer. */
  elapsedMs: (now: number) => number;
}

/** Storage that keeps nothing, for a browser without (usable) localStorage. */
const NO_STORAGE: QueueStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
  key: () => null,
  length: 0,
};

/** The browser's localStorage, or NO_STORAGE when it is absent or access itself throws. */
function browserStorage(): QueueStorage {
  try {
    return globalThis.localStorage;
  } catch {
    return NO_STORAGE;
  }
}

/** The browser around the driver. Time and timers are read here, at the edge. */
function browserEnvironment(): DriverEnvironment {
  return {
    storage: browserStorage(),
    isOnline: () => globalThis.navigator.onLine,
    isVisible: () => globalThis.document.visibilityState !== 'hidden',
    now: () => Date.now(),
    schedule: (run, ms) => {
      const timer = setTimeout(run, ms);
      return () => {
        clearTimeout(timer);
      };
    },
  };
}

const LOADING: SessionView<never> = {
  game: undefined,
  message: undefined,
  notice: undefined,
  busy: true,
  syncing: false,
  results: [],
};

/** Feeds the browser's online and visibility events to `driver`; returns the unsubscribe. */
function listen(driver: {
  online: () => Promise<void>;
  visibility: (visible: boolean) => Promise<void>;
}): () => void {
  const online = () => void driver.online();
  const visibility = () => void driver.visibility(document.visibilityState !== 'hidden');
  window.addEventListener('online', online);
  document.addEventListener('visibilitychange', visibility);
  return () => {
    window.removeEventListener('online', online);
    document.removeEventListener('visibilitychange', visibility);
  };
}

/** `options` start a new game; pass a stable value (e.g. a module constant). */
export function useGameSession<State, Move, Options>(
  api: GameApi<State, Move, Options>,
  nickname: string,
  options: Options,
): GameSession<State, Move> {
  const [view, setView] = useState<SessionView<State>>(LOADING);
  const driver = useRef<SessionDriver<State, Move, Options> | undefined>(undefined);

  useEffect(() => {
    const current = new SessionDriver(api, nickname, options, browserEnvironment(), setView);
    driver.current = current;
    setView(LOADING);
    void current.load();
    const unlisten = listen(current);
    return () => {
      current.dispose();
      unlisten();
    };
  }, [api, nickname, options]);

  return {
    ...view,
    start: () => void driver.current?.start(),
    move: (move) => void driver.current?.move(move),
    reset: () => void driver.current?.reset(),
    elapsedMs: (now) => driver.current?.elapsedMs(now) ?? 0,
  };
}
