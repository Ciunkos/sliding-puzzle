// Isomorphic entry: the puzzle rules and its game definition.
export {
  type PuzzleMove,
  type PuzzleOptions,
  type PuzzleState,
  puzzleDefinition,
} from './definition.ts';
export {
  applyMove,
  type Board,
  isSolvable,
  isSolved,
  isValidBoard,
  legalMoves,
  type Size,
  SIZES,
  sizeOf,
  solvedBoard,
} from './rules.ts';
export { shuffle } from './shuffle.ts';
