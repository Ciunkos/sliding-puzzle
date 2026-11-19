// Which shake the flat board plays (styles.ts): 'a' and 'b' take turns for each move that lands,
// so the animation starts again every time; 'win' when the game is solved. Loading a game, a reset
// or a new game shakes nothing. A shake is cleared once it has played (and by a new game or size),
// so nothing replays it later, e.g. when the board is remounted or the 3D board is switched off.
import { useEffect, useRef, useState } from 'react';

export type Shake = 'a' | 'b' | 'win' | undefined;

/** How long each shake lasts, its delay included (styles.ts), with a little to spare. */
const PLAYED_MS: Record<'a' | 'b' | 'win', number> = { a: 400, b: 400, win: 800 };

/** `game` is the game on screen: its start, size, moves and whether it is solved. */
export function useShake(
  game: { startedAt: string; size: number; moves: number; finished: boolean } | undefined,
): Shake {
  const [shake, setShake] = useState<Shake>(undefined);
  const previous = useRef(game);
  useEffect(() => {
    const was = previous.current;
    previous.current = game;
    if (game === undefined || was === undefined) return;
    if (game.startedAt !== was.startedAt || game.size !== was.size) setShake(undefined);
    else if (game.finished && !was.finished) setShake('win');
    else if (game.moves === was.moves + 1) setShake((last) => (last === 'a' ? 'b' : 'a'));
  }, [game?.startedAt, game?.size, game?.moves, game?.finished]);
  useEffect(() => {
    if (shake === undefined) return undefined;
    const timer = setTimeout(() => {
      setShake(undefined);
    }, PLAYED_MS[shake]);
    return () => {
      clearTimeout(timer);
    };
  }, [shake]);
  return shake;
}
