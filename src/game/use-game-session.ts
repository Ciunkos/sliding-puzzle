// React state for one profile's game: resumes it (one atomic request), then runs one action at a
// time. Moves and resets carry the version of the game on screen, so the server can tell a stale one.
import { useEffect, useRef, useState } from 'react';
import type { GameApi } from './api.ts';
import type { SavedGame } from './index.ts';
import { runRequest, type SessionTarget } from './session.ts';

export interface GameSession<State, Move> {
  /** Undefined while loading, or when loading failed. */
  game: SavedGame<State> | undefined;
  message: string | undefined;
  busy: boolean;
  start: () => void;
  move: (move: Move) => void;
  reset: () => void;
}

/** The session's React state, plus the target that runRequest writes into. */
function useSessionState<State>() {
  const [game, setGameState] = useState<SavedGame<State> | undefined>(undefined);
  // The game on screen, readable without waiting for a re-render: its version goes with each request.
  const latest = useRef<SavedGame<State> | undefined>(undefined);
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  // Bumped whenever the nickname changes, so responses for an earlier profile are ignored.
  const session = useRef(0);
  const inFlight = useRef(false);
  const setGame = (next: SavedGame<State> | undefined) => {
    latest.current = next;
    setGameState(next);
  };
  const target: SessionTarget<State> = { setGame, setMessage, setBusy, inFlight };
  return { game, message, busy, session, target, latest };
}

/** Runs one request at a time for the current session; a request while one is in flight is ignored. */
function performer<State>(target: SessionTarget<State>, session: { current: number }) {
  return (request: () => Promise<SavedGame<State>>): void => {
    if (target.inFlight.current) return;
    const current = session.current;
    void runRequest(target, () => session.current === current, request);
  };
}

/** `options` start a new game; pass a stable value (e.g. a module constant). */
export function useGameSession<State, Move, Options>(
  api: GameApi<State, Move, Options>,
  nickname: string,
  options: Options,
): GameSession<State, Move> {
  const { game, message, busy, session, target, latest } = useSessionState<State>();

  useEffect(() => {
    const current = ++session.current;
    target.setGame(undefined);
    void runRequest(
      target,
      () => session.current === current,
      () => api.resume(nickname, options),
    );
    return () => {
      session.current++;
    };
    // `target` holds only setters and refs that do not change behaviour, so it is not a dependency.
  }, [api, nickname, options]);

  const perform = performer(target, session);
  /** A request on the game on screen, made on its version; nothing to do without a game. */
  const performOnGame = (request: (baseVersion: number) => Promise<SavedGame<State>>) => {
    const shown = latest.current;
    if (shown !== undefined) perform(() => request(shown.version));
  };

  return {
    game,
    message,
    busy,
    start: () => {
      perform(() => api.start(nickname, options));
    },
    move: (move) => {
      performOnGame((baseVersion) => api.move(nickname, move, baseVersion));
    },
    reset: () => {
      performOnGame((baseVersion) => api.reset(nickname, baseVersion));
    },
  };
}
