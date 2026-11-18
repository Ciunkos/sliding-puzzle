// Event wiring of the board: taps, swipes and keys all end in one `onMove(tile)`. Thin on purpose:
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
): BoardInput {
  const ref = useRef<HTMLDivElement>(null);
  const [preferred, setPreferred] = useState<number | undefined>(undefined);
  const slide = (tile: number | undefined): number | undefined => {
    const chosen = movable(board, finished, tile);
    if (chosen === undefined) return undefined;
    setPreferred(chosen);
    onMove(chosen);
    return chosen;
  };
  const { takeSwipeClick, ...pointer } = useSwipe((direction) => {
    slide(tileForDirection(board, direction));
  });
  return {
    ref,
    tabStop: tabStopTile(board, finished, preferred),
    ...pointer,
    onKeyDown(event) {
      const direction = keyDirection(event);
      if (direction === undefined) return;
      event.preventDefault();
      const tile = slide(tileForDirection(board, direction));
      // Focus follows the tile that slid; its element stays the same, so it keeps focus after.
      if (tile !== undefined)
        ref.current?.querySelector<HTMLElement>(`[data-tile="${String(tile)}"]`)?.focus();
    },
    onFocus(event) {
      setPreferred(tileOf(event.target));
    },
    onClick(event) {
      if (!takeSwipeClick()) slide(tileOf(event.target));
    },
  };
}
