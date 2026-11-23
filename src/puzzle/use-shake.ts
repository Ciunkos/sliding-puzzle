// Which shake the flat board plays (styles.ts): 'a' and 'b' take turns for each move that lands,
// so the animation starts again every time; 'win' when the game is solved. Loading a game, a reset
// or a new game shakes nothing. Decided while rendering (no extra commit per move), and cleared
// once it has played straight on the stage element (no commit either), so nothing replays it
// later, e.g. when the board is remounted or the 3D board is switched off.
import { type RefObject, useEffect, useState } from 'react';

export type Shake = 'a' | 'b' | 'win' | undefined;

interface ShakeGame {
  startedAt: string;
  size: number;
  moves: number;
  finished: boolean;
}

/** How long each shake lasts, its delay included (styles.ts), with a little to spare. */
const PLAYED_MS: Record<'a' | 'b' | 'win', number> = { a: 400, b: 400, win: 800 };

/** What identifies the game for the shake: equal keys, nothing to shake for. */
function keyOf(game: ShakeGame | undefined): string {
  if (game === undefined) return '';
  return [game.startedAt, game.size, game.moves, game.finished].join();
}

/** Whether `game` is the game `was` went on with (not loaded, reset or started anew). */
function goesOn(was: ShakeGame | undefined, game: ShakeGame | undefined): boolean {
  if (game === undefined || was === undefined) return false;
  return game.startedAt === was.startedAt && game.size === was.size;
}

/** The shake for the change from `was` to `game`, the last one having been `last`. */
function nextShake(was: ShakeGame | undefined, game: ShakeGame | undefined, last: Shake): Shake {
  if (!goesOn(was, game) || game === undefined || was === undefined) return undefined;
  if (game.finished && !was.finished) return 'win';
  if (game.moves === was.moves + 1) return last === 'a' ? 'b' : 'a';
  return last;
}

/** `game` is the game on screen; `stage` the element that carries data-shake. */
export function useShake(game: ShakeGame | undefined, stage: RefObject<HTMLElement | null>): Shake {
  const [seen, setSeen] = useState<{ game: ShakeGame | undefined; shake: Shake }>({
    game,
    shake: undefined,
  });
  let { shake } = seen;
  if (keyOf(seen.game) !== keyOf(game)) {
    // Derived from the game it is rendered with: React renders again at once, before committing.
    shake = nextShake(seen.game, game, seen.shake);
    setSeen({ game, shake });
  }
  const moves = seen.game?.moves;
  useEffect(() => {
    if (shake === undefined) return undefined;
    const timer = setTimeout(() => {
      stage.current?.removeAttribute('data-shake');
    }, PLAYED_MS[shake]);
    return () => {
      clearTimeout(timer);
    };
  }, [shake, moves]);
  return shake;
}
