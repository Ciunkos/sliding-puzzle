// Best results, as the browser reads them.
import type { BestResult, SavedGame } from './index.ts';

/**
 * Whether `game` just set a personal best: it is finished and its own result (the one finished at
 * the same moment with the same moves) is the first, so the best, of its variant in `results`.
 */
export function isNewPersonalBest(
  results: readonly BestResult[],
  game: SavedGame<unknown> | undefined,
): boolean {
  if (game?.finishedAt == null) return false;
  const { finishedAt, moves } = game;
  const own = results.find((result) => result.finishedAt === finishedAt && result.moves === moves);
  if (own === undefined) return false;
  return results.find((result) => result.variant === own.variant) === own;
}
