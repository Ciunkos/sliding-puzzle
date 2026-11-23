// Plain view logic of the puzzle screen.
import type { BestResult, SavedGame } from '../game/index.ts';
import type { PuzzleState } from './definition.ts';
import { PICTURE_IDS, pictureOf, svgUrl } from './pictures.ts';
import type { SkinId } from './preferences.ts';
import { applyMove, type Board, legalMoves, type Size, sizeOf } from './rules.ts';

/** A cell of the board: row and column from the top-left, 0-based. */
export interface Place {
  row: number;
  col: number;
}

export interface TileView extends Place {
  tile: number;
  /** It can slide into the blank and the game is open. */
  movable: boolean;
}

export interface BoardLayout {
  size: Size;
  /** Every tile once, in tile-number order: a stable order lets each tile's element slide. */
  tiles: TileView[];
  blank: Place;
}

/** Stored boards are validated, so the length always has a size; 4 only satisfies the type checker. */
const FALLBACK_SIZE: Size = 4;

function placeOf(index: number, size: Size): Place {
  return { row: Math.floor(index / size), col: index % size };
}

/** Where each tile and the blank sit, and which tiles can move. */
export function layout(game: SavedGame<PuzzleState>): BoardLayout {
  const { board } = game.state;
  const size = sizeOf(board) ?? FALLBACK_SIZE;
  const legal = new Set(legalMoves(board));
  const tiles = board
    .map((tile, index) => ({
      tile,
      ...placeOf(index, size),
      movable: !game.finished && legal.has(tile),
    }))
    .filter((cell) => cell.tile !== 0)
    .sort((a, b) => a.tile - b.tile);
  return { size, tiles, blank: placeOf(board.indexOf(0), size) };
}

/** "3×3", "4×4", "5×5". */
export function sizeLabel(size: Size): string {
  return `${String(size)}×${String(size)}`;
}

function countMoves(moves: number): string {
  return `${String(moves)} ${moves === 1 ? 'move' : 'moves'}`;
}

function twoDigits(n: number): string {
  return String(n).padStart(2, '0');
}

/** Play time as a clock: "0:07", "12:34", "1:02:03". Seconds are rounded down; negative is 0. */
export function formatElapsed(ms: number): string {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  const secondsPart = twoDigits(seconds % 60);
  if (hours > 0) return `${String(hours)}:${twoDigits(minutes)}:${secondsPart}`;
  return `${String(minutes)}:${secondsPart}`;
}

/** How many best results the screen lists. */
const BEST_SHOWN = 5;

/**
 * The best results of one variant ("4x4"), best first (the engine lists each variant best first),
 * each line once: results that read the same (moves and shown time) are one entry.
 */
export function bestOf(results: readonly BestResult[], variant: string): BestResult[] {
  const seen = new Set<string>();
  return results
    .filter((result) => result.variant === variant)
    .filter((result) => {
      const line = resultLine(result);
      if (seen.has(line)) return false;
      seen.add(line);
      return true;
    })
    .slice(0, BEST_SHOWN);
}

/** "12 moves · 0:43": the play time the browser reported, else the time the server saw. */
export function resultLine(result: BestResult): string {
  return `${countMoves(result.moves)} · ${formatElapsed(result.reportedMs ?? result.durationMs)}`;
}

/** How long saving must last before the screen says so: a normal move is saved sooner. */
export const SAVING_SHOWN_AFTER_MS = 400;

/** Whether to show "Saving…": saving started at `syncingSince` (undefined: not saving) and is still on at `now`. */
export function showSaving(syncingSince: number | undefined, now: number): boolean {
  // Not saving counts as having started infinitely far in the future.
  return now - (syncingSince ?? Infinity) >= SAVING_SHOWN_AFTER_MS;
}

/** The line under the win banner: "Time 0:43", and "· New best!" for a personal best. */
export function resultText(elapsedMs: number, newBest: boolean): string {
  const time = `Time ${formatElapsed(elapsedMs)}`;
  return newBest ? `${time} · New best!` : time;
}

export function solvedText(game: SavedGame<PuzzleState>): string {
  return `Solved in ${countMoves(game.moves)}!`;
}

/** Always just the move count. The solved sentence lives in the banner (see solvedText). */
export function statusText(game: SavedGame<PuzzleState>): string {
  return `Moves: ${String(game.moves)}`;
}

/** The tile that slid from `before` to `after` in one legal move, otherwise undefined. */
function movedTile(before: Board, after: Board): number | undefined {
  // The blank (0) itself never moves, so a missing cell is no move either.
  const tile = after[before.indexOf(0)] ?? 0;
  return applyMove(before, tile)?.join() === after.join() ? tile : undefined;
}

/**
 * What the live region says when the game on screen changes from `before` (undefined on the first
 * game) to `game`: the win, one move, or nothing (a load, a new game, a reset). The win only when
 * the board just changed into it: a game loaded already solved is no news.
 */
export function announcement(before: Board | undefined, game: SavedGame<PuzzleState>): string {
  if (game.finished) {
    const changed = before !== undefined && before.join() !== game.state.board.join();
    return changed ? solvedText(game) : '';
  }
  const tile = before === undefined ? undefined : movedTile(before, game.state.board);
  if (tile === undefined) return '';
  return `Moved tile ${String(tile)}. ${countMoves(game.moves)}.`;
}

/** A percentage with at most three decimals: "50%", "66.667%". */
function percent(value: number): string {
  return `${String(Math.round(value * 1000) / 1000)}%`;
}

/** The CSS that shows tile `tile`'s square of a picture on a `size`-wide board (tile N*N: the corner). */
export function pictureBackground(
  tile: number,
  size: Size,
  url: string,
): { backgroundImage: string; backgroundSize: string; backgroundPosition: string } {
  const home = placeOf(tile - 1, size);
  const step = 100 / (size - 1);
  return {
    backgroundImage: `url("${url}")`,
    backgroundSize: `${String(size * 100)}% ${String(size * 100)}%`,
    backgroundPosition: `${percent(home.col * step)} ${percent(home.row * step)}`,
  };
}

/** A choice in the skin picker: its id, its label, and the image of its thumbnail (none for numbers). */
export interface SkinOption {
  id: SkinId;
  title: string;
  thumbnail: string | undefined;
}

/** Numbers, the bundled pictures, and the player's photo when there is one. */
export function skinOptions(photo: string | undefined): SkinOption[] {
  const pictures = PICTURE_IDS.map((id) => {
    const picture = pictureOf(id);
    return { id, title: picture.title, thumbnail: svgUrl(picture.svg) };
  });
  const own: SkinOption[] =
    photo === undefined ? [] : [{ id: 'photo', title: 'Your photo', thumbnail: photo }];
  return [{ id: 'numbers', title: 'Numbers', thumbnail: undefined }, ...pictures, ...own];
}

/** The image a skin shows on the tiles: undefined for numbers. */
export function skinPicture(skin: SkinId, photo: string | undefined): string | undefined {
  if (skin === 'numbers') return undefined;
  if (skin === 'photo') return photo;
  return svgUrl(pictureOf(skin).svg);
}
