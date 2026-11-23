// Event wiring of the board: taps, drags, swipes and keys all end in one `onMove(tile)`, or in
// `onBlocked(tile)` for a tap or key on an open game that moves nothing. Thin on purpose: it reads
// the event and asks input.ts what to do. It cannot run under server rendering, so the e2e specs
// cover it: journey.spec (a tap, a drag by touch and by mouse, a key) and moving.spec (the rest).
import {
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type FocusEvent,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  dragShift,
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
import { pullScene } from './use-scene-drag.ts';

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
  /** The tile held by a drag, if any: its offset is written straight on its button. */
  held: number | undefined;
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

/** The button of `tile` on the board. */
function tileButton(board: HTMLDivElement | null, tile: number): HTMLElement | null {
  return board?.querySelector<HTMLElement>(`[data-tile="${String(tile)}"]`) ?? null;
}

/** Draws the held tile where the drag has it: its offset, straight on its button's style. */
function writeOffset(board: HTMLDivElement | null, on: Board, drag: DragView): void {
  const shift = dragShift(on, drag);
  const button = tileButton(board, drag.tile);
  if (shift === undefined || button === null) return;
  button.style.setProperty('--sp-drag-x', `${String(shift.col * 100)}%`);
  button.style.setProperty('--sp-drag-y', `${String(shift.row * 100)}%`);
}

function clearOffset(board: HTMLDivElement | null, tile: number): void {
  const button = tileButton(board, tile);
  button?.style.removeProperty('--sp-drag-x');
  button?.style.removeProperty('--sp-drag-y');
}

/**
 * The drag's offset on the held tile's button, outside React, at most once an animation frame,
 * whatever the number of pointer moves.
 */
function useFrameWriter(ref: RefObject<HTMLDivElement | null>) {
  const latest = useRef<{ drag: DragView; on: Board } | undefined>(undefined);
  const frame = useRef(0);
  const flush = () => {
    frame.current = 0;
    const next = latest.current;
    if (next !== undefined) writeOffset(ref.current, next.on, next.drag);
  };
  return {
    write: (drag: DragView, on: Board) => {
      latest.current = { drag, on };
      if (frame.current === 0) frame.current = requestAnimationFrame(flush);
    },
    stop: () => {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      latest.current = undefined;
    },
  };
}

interface HeldOptions {
  ref: RefObject<HTMLDivElement | null>;
  onDrag: (drag: DragView | undefined) => void;
}

/**
 * The held tile. React hears only when a tile is taken and let go (its class, data-held, and
 * `onDrag`, in the same update as any move); the offset between goes straight to the page: the
 * button's style once a frame, and the 3D board's cube through pullScene, with every move.
 */
function useHeld({ ref, onDrag }: HeldOptions) {
  const [held, setHeld] = useState<number | undefined>(undefined);
  const current = useRef<number | undefined>(undefined);
  const lastHeld = useRef<number | undefined>(undefined);
  const told = useRef(onDrag);
  told.current = onDrag;
  const writer = useFrameWriter(ref);
  // Its offset goes in the same frame as its class (so it springs back or on, not jumps).
  useLayoutEffect(() => {
    if (held === undefined && lastHeld.current !== undefined)
      clearOffset(ref.current, lastHeld.current);
    lastHeld.current = held;
  }, [held]);
  // Gone with the board (a new size, a game loading): let the 3D board go of the block too, and
  // write no more offsets.
  useEffect(
    () => () => {
      writer.stop();
      told.current(undefined);
    },
    [],
  );
  const take = (drag: DragView, on: Board) => {
    if (current.current !== drag.tile) {
      current.current = drag.tile;
      setHeld(drag.tile);
      told.current(drag);
    }
    writer.write(drag, on);
    pullScene(drag.tile, drag.progress);
  };
  /** Lets go; `moved`: it was committed (the move takes the cube on), else it springs back. */
  const release = (moved: boolean) => {
    const tile = current.current;
    if (tile === undefined) return;
    current.current = undefined;
    writer.stop();
    if (!moved) pullScene(tile, undefined);
    setHeld(undefined);
    told.current(undefined);
  };
  return { held, take, release };
}

/**
 * The open press on the board: `step` feeds a pointer event to input.ts and shows (or commits
 * through `onCommit`) what it decides; `end` forgets the press. A press ends by itself when its
 * mouse button is found up, or when the board on screen is not one it expects (a reset, another
 * tab, a new game).
 */
function useGestureState(live: RefObject<Board>, options: HeldOptions, onCommit: Commit) {
  const gesture = useRef<Gesture | undefined>(undefined);
  const pointer = useRef<number | undefined>(undefined);
  const unwatch = useRef<() => void>(() => undefined);
  const { held, take, release } = useHeld(options);
  // With reduced motion the tile does not follow the finger; it still commits at the threshold.
  const still = useMedia('(prefers-reduced-motion: reduce)');
  const show = (step: Step, on: Board) => {
    // Held once it has moved: a press alone keeps the tile's slide (one mid-slide finishes it).
    if (step.kind === 'hold' && step.progress > 0 && !still)
      take({ tile: step.tile, progress: step.progress }, on);
    else release(step.kind === 'commit' || step.kind === 'push');
    if (step.kind === 'commit') onCommit(step.tile, on);
    if (step.kind === 'push')
      for (const stage of pushStages(on, step.tiles)) onCommit(stage.tile, stage.on);
  };
  const end = () => {
    unwatch.current();
    gesture.current = undefined;
    pointer.current = undefined;
    release(false);
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
  // A board unmounted during a press leaves no listeners on the window.
  useEffect(
    () => () => {
      unwatch.current();
    },
    [],
  );
  return { gesture, pointer, held, show, end, begin };
}

type GestureState = ReturnType<typeof useGestureState>;

/** The positions a pointer event stands for: its coalesced moves where the browser keeps them. */
function samplesOf(event: PointerEvent): Point[] {
  const coalesced =
    event.type === 'pointermove' ? event.nativeEvent.getCoalescedEvents() : undefined;
  if (coalesced === undefined || coalesced.length === 0) return [pointAt(event)];
  return coalesced.map((sample) => ({ x: sample.clientX, y: sample.clientY, t: sample.timeStamp }));
}

/**
 * Steps the gesture through `points`; the last step, and the board it was decided on, are what
 * the page shows. A commit ends the run: one move per press.
 */
function stepAll(gesture: Gesture, points: Point[], cellPx: number) {
  let current = { gesture, step: { kind: 'idle' } as Step, on: gesture.board };
  for (const point of points) {
    const on = current.gesture.board;
    const next = stepGesture(current.gesture, point, cellPx);
    current = { ...next, on };
    if (next.step.kind === 'commit' || next.step.kind === 'push') break;
  }
  return current;
}

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
  const next = stepAll(
    current,
    samplesOf(event),
    cellWidth(ref.current, sizeOf(current.board) ?? 1),
  );
  state.gesture.current = next.gesture;
  state.show(next.step, next.on);
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
  live: RefObject<Board>,
  finished: boolean,
  options: HeldOptions,
  onCommit: Commit,
) {
  const { ref } = options;
  const state = useGestureState(live, options, onCommit);
  const swallow = useSwallow();
  const endIfOurs = (event: PointerEvent) => {
    if (event.pointerId === state.pointer.current) state.end();
  };
  return {
    held: state.held,
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

/** What the board tells its owner: moves, blocked taps, and a drag taken, let go and moving. */
export interface BoardHandlers {
  onMove: (tile: number) => void;
  onBlocked?: (tile: number | undefined) => void;
  onDrag?: (drag: DragView | undefined) => void;
}

const NOTHING = () => undefined;

/**
 * Handlers for the board element. Keys, drags and swipes slide a tile; a tap slides the tapped tile.
 * `tabStop` is the tile with tabindex 0 (roving tabindex): the board is one tab stop, and it
 * follows the tile that moved or got focus last.
 */
export function useBoardInput(
  board: Board,
  finished: boolean,
  handlers: BoardHandlers,
): BoardInput {
  const { onMove, onBlocked = NOTHING, onDrag = NOTHING } = handlers;
  const ref = useRef<HTMLDivElement>(null);
  const live = useRef(board);
  live.current = board;
  const [preferred, setPreferred] = useState<number | undefined>(undefined);
  const slide = slider(board, finished, onMove, onBlocked, setPreferred);
  const { swallow, ...pointer } = useDrag(live, finished, { ref, onDrag }, (tile, on) =>
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
