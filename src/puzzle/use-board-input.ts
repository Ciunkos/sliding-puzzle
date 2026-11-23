// Event wiring of the board: taps, drags, swipes and keys all end in one `onMove(tile)`, or in
// `onBlocked(tile)` for a tap or key on an open game that moves nothing. Thin on purpose: it reads
// the event and asks input.ts what to do. It cannot run under server rendering, so the e2e specs
// cover it: play.spec (taps, keys, swipes), drag.spec and touch.spec (drags, flicks, releases).
import {
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type FocusEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  expects,
  type Gesture,
  isTap,
  keyDirection,
  movable,
  type Point,
  pushStages,
  releaseGesture,
  startGesture,
  type Step,
  stepGesture,
  tabStopTile,
  tileForDirection,
} from './input.ts';
import { type Board, sizeOf } from './rules.ts';
import { useMedia } from './use-media.ts';

export interface BoardInput {
  ref: RefObject<HTMLDivElement | null>;
  /** The tile whose button is the board's one tab stop. */
  tabStop: number;
  onFocus: (event: FocusEvent) => void;
  onKeyDown: (event: KeyboardEvent) => void;
  onPointerDown: (event: PointerEvent) => void;
  onPointerMove: (event: PointerEvent) => void;
  onPointerUp: (event: PointerEvent) => void;
  onPointerCancel: (event: PointerEvent) => void;
  onLostPointerCapture: (event: PointerEvent) => void;
  /** The held tile while a drag is on, for the board (and the 3D board) to draw. */
  drag: DragView | undefined;
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

/** A held tile on its way to the gap, for the board to draw: 0 at its cell, 1 at the gap. */
export interface DragView {
  tile: number;
  progress: number;
}

function pointAt(event: PointerEvent): Point {
  return { x: event.clientX, y: event.clientY, t: event.timeStamp };
}

/** The width of one cell of the board on screen, inside its border. */
function cellWidth(board: HTMLDivElement | null, size: number): number {
  return Math.max(1, (board?.clientWidth ?? 0) / size);
}

/** A mouse press with another button than the main one (a right or middle click): no gesture. */
function otherButton(event: PointerEvent): boolean {
  return event.pointerType === 'mouse' && event.button !== 0;
}

/** A mouse moving with no button down: its release went elsewhere (a context menu, say). */
function lostRelease(event: PointerEvent): boolean {
  return event.type === 'pointermove' && event.pointerType === 'mouse' && event.buttons === 0;
}

/**
 * While a press is open, its end anywhere (up or cancelled off the board, a context menu, the
 * window losing focus) ends it too. Returns how to stop listening.
 */
function watchWindow(pointerId: number, end: () => void): () => void {
  const names = ['pointerup', 'pointercancel', 'contextmenu', 'blur'] as const;
  const onEnd = (event: Event) => {
    if (!(event instanceof window.PointerEvent) || event.pointerId === pointerId) end();
  };
  for (const name of names) window.addEventListener(name, onEnd);
  return () => {
    for (const name of names) window.removeEventListener(name, onEnd);
  };
}

/** A commit: the tile, and the board the gesture moved it on (the board on screen may lag). */
type Commit = (tile: number, on: Board) => unknown;

/** The held tile, shown on the board and told to `onDrag` in the same update as any move. */
function useHeld(onDrag: (drag: DragView | undefined) => void) {
  const [drag, setDrag] = useState<DragView | undefined>(undefined);
  const latest = useRef(onDrag);
  latest.current = onDrag;
  // Gone with the board (a new size, a game loading): let the 3D board go of the block too.
  useEffect(
    () => () => {
      latest.current(undefined);
    },
    [],
  );
  // The 3D board lets go of its block in the very update that moves it, never a frame apart.
  const report = (next: DragView | undefined) => {
    setDrag(next);
    latest.current(next);
  };
  return { drag, report };
}

/**
 * The open press on the board: `step` feeds a pointer event to input.ts and shows (or commits
 * through `onCommit`) what it decides; `end` forgets the press. A press ends by itself when its
 * mouse button is found up, or when the board on screen is not one it expects (a reset, another
 * tab, a new game).
 */
function useGestureState(
  live: RefObject<Board>,
  onDrag: (drag: DragView | undefined) => void,
  onCommit: Commit,
) {
  const gesture = useRef<Gesture | undefined>(undefined);
  const pointer = useRef<number | undefined>(undefined);
  const unwatch = useRef<() => void>(() => undefined);
  const { drag, report } = useHeld(onDrag);
  // With reduced motion the tile does not follow the finger; it still commits at the threshold.
  const still = useMedia('(prefers-reduced-motion: reduce)');
  const show = (step: Step, on: Board) => {
    // Held once it has moved: a press alone keeps the tile's slide (one mid-slide finishes it).
    const held = step.kind === 'hold' && step.progress > 0 && !still;
    report(held ? { tile: step.tile, progress: step.progress } : undefined);
    if (step.kind === 'commit') onCommit(step.tile, on);
    if (step.kind === 'push')
      for (const stage of pushStages(on, step.tiles)) onCommit(stage.tile, stage.on);
  };
  const end = () => {
    unwatch.current();
    gesture.current = undefined;
    pointer.current = undefined;
    report(undefined);
  };
  const begin = (next: Gesture, pointerId: number) => {
    gesture.current = next;
    pointer.current = pointerId;
    unwatch.current = watchWindow(pointerId, end);
  };
  useEffect(() => {
    const open = gesture.current;
    if (open !== undefined && !expects(open, live.current)) end();
  }, [live.current.join()]);
  return { gesture, pointer, drag, show, end, begin };
}

type GestureState = ReturnType<typeof useGestureState>;

/** One pointer event of the open press, stepped; undefined when it is not (or no longer) open. */
function stepPress(
  state: GestureState,
  ref: RefObject<HTMLDivElement | null>,
  live: RefObject<Board>,
  event: PointerEvent,
): Gesture | undefined {
  const current = state.gesture.current;
  if (current === undefined || event.pointerId !== state.pointer.current) return undefined;
  if (lostRelease(event) || !expects(current, live.current)) {
    state.end();
    return undefined;
  }
  const next = stepGesture(
    current,
    pointAt(event),
    cellWidth(ref.current, sizeOf(current.board) ?? 1),
  );
  state.gesture.current = next.gesture;
  state.show(next.step, current.board);
  if (next.gesture.travelled) capture(ref.current, event.pointerId);
  return next.gesture;
}

/**
 * Once it is a drag, the press keeps the board's events even off the tile or the board. (Not for
 * a tap: a captured press would send its click to the board instead of the tile.)
 */
function capture(board: HTMLDivElement | null, pointerId: number): void {
  if (board?.hasPointerCapture(pointerId) === false) board.setPointerCapture(pointerId);
}

/**
 * The click that follows a drag is not a tap, so it is swallowed, once: only a pointer's click
 * (a keyboard or screen reader activation, detail 0, never is), only right after the press (the
 * next frame forgets it), and never after a key.
 */
function useSwallow() {
  const swallow = useRef(false);
  return {
    set: (value: boolean) => {
      swallow.current = value;
      requestAnimationFrame(() => {
        swallow.current = false;
      });
    },
    clear: () => {
      swallow.current = false;
    },
    take: (event: MouseEvent): boolean => {
      const was = swallow.current && event.detail !== 0;
      swallow.current = false;
      return was;
    },
  };
}

/**
 * Pointer handlers for drags, swipes and flicks (input.ts decides; this only reads events): a held
 * tile follows the pointer and commits at the threshold, the finger still down; one press may
 * push several tiles. Only the main mouse button presses; a second finger is ignored.
 */
function useDrag(
  ref: RefObject<HTMLDivElement | null>,
  live: RefObject<Board>,
  finished: boolean,
  onDrag: (drag: DragView | undefined) => void,
  onCommit: Commit,
) {
  const state = useGestureState(live, onDrag, onCommit);
  const swallow = useSwallow();
  const endIfOurs = (event: PointerEvent) => {
    if (event.pointerId === state.pointer.current) state.end();
  };
  return {
    drag: state.drag,
    swallow,
    onPointerDown: (event: PointerEvent) => {
      if (!event.isPrimary || otherButton(event) || state.pointer.current !== undefined) return;
      const next = startGesture(live.current, finished, tileOf(event.target), pointAt(event));
      if (next !== undefined) state.begin(next, event.pointerId);
      swallow.clear();
    },
    onPointerMove: (event: PointerEvent) => {
      stepPress(state, ref, live, event);
    },
    onPointerUp: (event: PointerEvent) => {
      const last = stepPress(state, ref, live, event);
      if (last === undefined) return;
      const release = releaseGesture(last, event.timeStamp);
      swallow.set(release.kind === 'commit' || !isTap(last, pointAt(event)));
      state.show(release, last.board);
      state.end();
    },
    onPointerCancel: endIfOurs,
    // Only the board's own capture: taking it from the tile (a touch's own) fires this too.
    onLostPointerCapture: (event: PointerEvent) => {
      if (event.target === event.currentTarget) endIfOurs(event);
    },
  };
}

/**
 * Slides `tile` if it can move on `on` (the board on screen, or the one a gesture moved it on)
 * and makes it the preferred tab stop. Otherwise, on an open game, reports it blocked: the tile the
 * player meant (`meant`, undefined when no tile was meant), unless `quiet` (a held key
 * repeating). Returns the tile that slid.
 */
function slider(
  board: Board,
  finished: boolean,
  onMove: (tile: number) => void,
  onBlocked: (tile: number | undefined) => void,
  prefer: (tile: number) => void,
) {
  return (tile: number | undefined, meant: number | undefined, quiet = false, on = board) => {
    const chosen = movable(on, finished, tile);
    if (chosen === undefined) {
      if (!finished && !quiet) onBlocked(meant);
      return undefined;
    }
    prefer(chosen);
    onMove(chosen);
    return chosen;
  };
}

/**
 * Handlers for the board element. Keys, drags and swipes slide a tile; a tap slides the tapped tile.
 * `tabStop` is the tile with tabindex 0 (roving tabindex): the board is one tab stop, and it
 * follows the tile that moved or got focus last.
 */
export function useBoardInput(
  board: Board,
  finished: boolean,
  onMove: (tile: number) => void,
  onBlocked: (tile: number | undefined) => void = () => undefined,
  onDrag: (drag: DragView | undefined) => void = () => undefined,
): BoardInput {
  const ref = useRef<HTMLDivElement>(null);
  const live = useRef(board);
  live.current = board;
  const [preferred, setPreferred] = useState<number | undefined>(undefined);
  const slide = slider(board, finished, onMove, onBlocked, setPreferred);
  const { swallow, ...pointer } = useDrag(ref, live, finished, onDrag, (tile, on) =>
    slide(tile, undefined, false, on),
  );
  return {
    ref,
    tabStop: tabStopTile(board, finished, preferred),
    ...pointer,
    onKeyDown(event) {
      swallow.clear();
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
      if (!swallow.take(event)) slide(tile, tile);
    },
  };
}
