// Which shake the flat board plays (styles.ts): 'a' and 'b' take turns for each move that lands,
// so the animation starts again every time; 'win' when the game is solved. Loading a game, a reset
// or a new game shakes nothing.
import { useEffect, useRef, useState } from 'react';

export type Shake = 'a' | 'b' | 'win' | undefined;

export function useShake(moves: number | undefined, finished: boolean): Shake {
  const [shake, setShake] = useState<Shake>(undefined);
  const previous = useRef({ moves, finished });
  useEffect(() => {
    const was = previous.current;
    previous.current = { moves, finished };
    if (moves === undefined || was.moves === undefined) return;
    if (finished && !was.finished) setShake('win');
    else if (moves === was.moves + 1) setShake((last) => (last === 'a' ? 'b' : 'a'));
  }, [moves, finished]);
  return shake;
}
