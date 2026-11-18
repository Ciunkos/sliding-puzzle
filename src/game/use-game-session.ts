// React state for one profile's game: loads or starts it, then runs one action at a time.
import { useEffect, useRef, useState } from 'react';
import type { GameApi } from './api.ts';
import type { SavedGame } from './index.ts';
import { loadOrStart, runRequest, type SessionTarget } from './session.ts';

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
  const [game, setGame] = useState<SavedGame<State> | undefined>(undefined);
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  // Bumped whenever the nickname changes, so responses for an earlier profile are ignored.
  const session = useRef(0);
  const inFlight = useRef(false);
  const target: SessionTarget<State> = { setGame, setMessage, setBusy, inFlight };
  return { game, message, busy, session, target };
}

/** `options` start a new game; pass a stable value (e.g. a module constant). */
export function useGameSession<State, Move, Options>(
  api: GameApi<State, Move, Options>,
  nickname: string,
  options: Options,
): GameSession<State, Move> {
  const { game, message, busy, session, target } = useSessionState<State>();

  useEffect(() => {
    const current = ++session.current;
    target.setGame(undefined);
    void runRequest(
      target,
      () => session.current === current,
      () => loadOrStart(api, nickname, options),
    );
    return () => {
      session.current++;
    };
    // `target` holds only stable setters and refs, so it is not a dependency.
  }, [api, nickname, options]);

  function perform(request: () => Promise<SavedGame<State>>): void {
    if (target.inFlight.current) return;
    const current = session.current;
    void runRequest(target, () => session.current === current, request);
  }

  return {
    game,
    message,
    busy,
    start: () => {
      perform(() => api.start(nickname, options));
    },
    move: (move) => {
      perform(() => api.move(nickname, move));
    },
    reset: () => {
      perform(() => api.reset(nickname));
    },
  };
}
