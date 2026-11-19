// Event wiring of the board: taps, swipes and keys all end in one `onMove(tile)`, or in
// `onBlocked(tile)` for a tap or key on an open game that moves nothing. Thin on purpose:
// it reads the event and asks input.ts what to move. Covered by e2e/play.spec.ts (it cannot run
// under server rendering).
import {
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type FocusEvent,
  type RefObject,
  useRef,
  useState,
} from 'react';
import {
  type Direction,
  keyDirection,
  movable,
  swipeDirection,
  tabStopTile,
  tileForDirection,
} from './input.ts';
import type { Board } from './rules.ts';

export interface BoardInput {
  ref: RefObject<HTMLDivElement | null>;
  /** The tile whose button is the board's one tab stop. */
  tabStop: number;
  onFocus: (event: FocusEvent) => void;
  onKeyDown: (event: KeyboardEvent) => void;
  onPointerDown: (event: PointerEvent) => void;
  onPointerUp: (event: PointerEvent) => void;
  onPointerCancel: () => void;
  onClick: (event: MouseEvent) => void;
}

/** The number in the data-tile attribute of the tile button an event landed in, if any. */
function tileOf(target: EventTarget): number | undefined {
  if (!(target instanceof Element)) return undefined;
  const value = target.closest('[data-tile]')?.getAttribute('data-tile');
  return value === null || value === undefined ? undefined : Number(value);
}

/** Focus follows the tile that slid; its element stays the same, so it keeps focus after. */
function focusTile(board: RefObject<HTMLDivElement | null>, tile: number | undefined): void {
  if (tile !== undefined)
    board.current?.querySelector<HTMLElement>(`[data-tile="${String(tile)}"]`)?.focus();
}

/** Pointer handlers that report a swipe, and whether the click that may follow it is to be ignored. */
function useSwipe(onSwipe: (direction: Direction) => void) {
  const start = useRef<{ x: number; y: number } | undefined>(undefined);
  // The click that a browser may fire at the end of a swipe is not a tap.
  const swiped = useRef(false);
  return {
    onPointerDown: (event: PointerEvent) => {
      swiped.current = false;
      start.current = event.isPrimary ? { x: event.clientX, y: event.clientY } : undefined;
    },
    onPointerUp: (event: PointerEvent) => {
      const from = start.current;
      start.current = undefined;
      if (from === undefined) return;
      const direction = swipeDirection(event.clientX - from.x, event.clientY - from.y);
      if (direction === undefined) return;
      swiped.current = true;
      onSwipe(direction);
    },
    onPointerCancel: () => {
      start.current = undefined;
    },
    /** True once for the click that ends a swipe. */
    takeSwipeClick: (): boolean => {
      const was = swiped.current;
      swiped.current = false;
      return was;
    },
  };
}

/**
 * Handlers for the board element. Keys and swipes slide a tile; a tap slides the tapped tile.
 * `tabStop` is the tile with tabindex 0 (roving tabindex): the board is one tab stop, and it
 * follows the tile that moved or got focus last.
 */
export function useBoardInput(
  board: Board,
  finished: boolean,
  onMove: (tile: number) => void,
  onBlocked: (tile: number | undefined) => void = () => undefined,
): BoardInput {
  const ref = useRef<HTMLDivElement>(null);
  const [preferred, setPreferred] = useState<number | undefined>(undefined);
  /**
   * Slides `tile` if it can move. Otherwise, on an open game, reports it blocked: the tile the
   * player meant (`meant`, undefined when no tile was meant), unless `quiet` (a held key repeating).
   */
  const slide = (tile: number | undefined, meant: number | undefined, quiet = false) => {
    const chosen = movable(board, finished, tile);
    if (chosen === undefined) {
      if (!finished && !quiet) onBlocked(meant);
      return undefined;
    }
    setPreferred(chosen);
    onMove(chosen);
    return chosen;
  };
  const { takeSwipeClick, ...pointer } = useSwipe((direction) => {
    slide(tileForDirection(board, direction), undefined);
  });
  return {
    ref,
    tabStop: tabStopTile(board, finished, preferred),
    ...pointer,
    onKeyDown(event) {
      const direction = keyDirection(event);
      if (direction === undefined) return;
      event.preventDefault();
      // A blocked arrow means no tile (none is on that side of the gap); held down it is quiet.
      focusTile(ref, slide(tileForDirection(board, direction), undefined, event.repeat));
    },
    onFocus(event) {
      setPreferred(tileOf(event.target));
    },
    onClick(event) {
      const tile = tileOf(event.target);
      if (!takeSwipeClick()) slide(tile, tile);
    },
  };
}
