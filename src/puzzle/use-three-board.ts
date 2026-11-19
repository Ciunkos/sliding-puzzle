// Runs the 3D board inside its wrapper element: builds the runtime on the probed canvas (a new one
// for a new size or theme, swapped in once ready), feeds it the game's state, and draws on demand. A frame is requested (invalidate) only when something
// changes or still moves; an idle board draws nothing. Browser wiring (named use-*.ts, so the
// mutation run skips it): it needs WebGL, a DOM and animation frames.
import { type RefObject, useEffect, useRef, useState } from 'react';
import type { SceneSkin, TiltMode } from './look-model.ts';
import type { Board, Size } from './rules.ts';
import {
  orientationTilt,
  type Orientation,
  pointerTilt,
  type Tilt,
  tiltChanged,
} from './scene-model.ts';
import { FPS_FLAG } from './use-fps-flag.ts';
import { publishStats, qualityNow, rememberQuality } from './use-frame-quality.ts';
import type { SceneSurface } from './use-scene-surface.ts';
import { createRuntime, type SceneRuntime } from './use-three-runtime.ts';

export interface Board3DProps {
  surface: SceneSurface;
  board: Board;
  size: Size;
  finished: boolean;
  moves: number;
  skin: SceneSkin;
  dark: boolean;
  reducedMotion: boolean;
  tilt: TiltMode;
  /**
   * The latest tap on a tile that cannot move: it wiggles toward the gap. A new object (a new
   * `serial`) wiggles it again; undefined or the same object does nothing.
   */
  nudge?: { tile: number; serial: number } | undefined;
  /**
   * The tile the player is pulling and how far, 0 (in its cell) to 1 (over the gap): the cube sits
   * exactly there. Undefined when nothing is pulled: a cube let go springs back from where it is.
   * A committed move changes `board` in the same render as this becomes undefined: the slide then
   * starts from the dragged place. Ignored under reduced motion.
   */
  drag?: { tile: number; progress: number } | undefined;
  /** The first frame is drawn: the DOM board may hand its looks over. */
  onReady: () => void;
  /** The WebGL context was lost: back to the flat board. */
  onLost: () => void;
}

interface Live {
  runtime: SceneRuntime;
  invalidate: () => void;
  wrapper: HTMLDivElement;
}

/** With `?fps` the loop draws every frame, so the readout has frames to measure. */
const CONTINUOUS = FPS_FLAG;

/**
 * Draws a frame when asked, and keeps drawing only while the runtime says something moves (or
 * always, with the `?fps` readout).
 */
function demandLoop(draw: (now: number) => boolean, onFirst: () => void) {
  let frame = 0;
  let first = true;
  // A stopped loop ignores late requests: it must never draw over the scene that replaced it.
  let stopped = false;
  const tick = (now: number) => {
    frame = 0;
    const busy = draw(now);
    if (first) {
      first = false;
      onFirst();
    }
    if (busy || CONTINUOUS) invalidate();
  };
  const invalidate = () => {
    if (frame === 0 && !stopped) frame = requestAnimationFrame(tick);
  };
  /** Draws at once, in this task: after a resize, so no cleared canvas is ever shown. */
  const drawNow = () => {
    if (stopped) return;
    cancelAnimationFrame(frame);
    tick(performance.now());
  };
  const stop = () => {
    stopped = true;
    cancelAnimationFrame(frame);
  };
  return { invalidate, drawNow, stop };
}

/** A runtime on screen: what the feeds talk to, and how to take it down. */
interface Shown {
  live: Live;
  /** Stops drawing and frees the runtime; its last frame stays on the canvas. */
  detach: () => void;
}

/**
 * Keeps the drawing buffer sized to the wrapper and the screen: on a resize, and when the window
 * moves to a screen of another pixel ratio. Setting a canvas's size clears it, even to the same
 * size, so only on a real change, and the frame is drawn in the same task.
 */
function fitTo(wrapper: HTMLDivElement, runtime: SceneRuntime, drawNow: () => void) {
  let width = 0;
  let ratio = 0;
  const fit = () => {
    if (wrapper.clientWidth === width && devicePixelRatio === ratio) return;
    width = wrapper.clientWidth;
    ratio = devicePixelRatio;
    runtime.resize(width, ratio);
    drawNow();
  };
  let screen: MediaQueryList | undefined;
  const onScreen = () => {
    fit();
    watchScreen();
  };
  const watchScreen = () => {
    screen?.removeEventListener('change', onScreen);
    screen = matchMedia(`(resolution: ${String(devicePixelRatio)}dppx)`);
    screen.addEventListener('change', onScreen);
  };
  fit();
  watchScreen();
  const observer = new ResizeObserver(fit);
  observer.observe(wrapper);
  const stop = () => {
    observer.disconnect();
    screen?.removeEventListener('change', onScreen);
  };
  return { stop };
}

/**
 * Puts a built runtime on screen in one task: it gets the current board and skin, the canvas its
 * size, and draws its first frame at once, so the hand-over from the scene before shows no gap.
 */
function show(wrapper: HTMLDivElement, runtime: SceneRuntime, latest: RefObject<Board3DProps>) {
  const props = latest.current;
  const loop = demandLoop(
    (now) => runtime.frame(now),
    () => {
      wrapper.dataset.webgl = 'ready';
      latest.current.onReady();
    },
  );
  runtime.setBoard(props.board, props.finished, props.moves, performance.now());
  wrapper.append(props.surface.canvas);
  const sizing = fitTo(wrapper, runtime, loop.drawNow);
  const detach = () => {
    loop.stop();
    sizing.stop();
    runtime.dispose();
  };
  return { live: { runtime, invalidate: loop.invalidate, wrapper }, detach };
}

interface Build {
  cancel: () => void;
  /** Resolves once the build has finished or given up, and freed whatever it gave up. */
  settled: Promise<void>;
}

/** What a scene is built for: the props that need a new runtime when they change. */
interface Wanted {
  size: Size;
  dark: boolean;
  reducedMotion: boolean;
}

/** One surface's scenes: the one on screen, the build under way, and whether it is closed. */
interface Scenes {
  wrapper: HTMLDivElement;
  surface: SceneSurface;
  latest: RefObject<Board3DProps>;
  onLive: (live: Live) => void;
  lost: () => void;
  shown: Shown | undefined;
  building: Build | undefined;
  closed: boolean;
}

/**
 * Builds a runtime for `wanted` while the one on screen keeps drawing. The build claims the GL
 * context only after the build before it has settled (so one renderer at most works on it), then
 * takes the shown runtime down (its last frame stays on the canvas) and swaps in without a gap.
 */
function build(scenes: Scenes, wanted: Wanted): void {
  const before = scenes.building;
  before?.cancel();
  let cancelled = false;
  const claim = async () => {
    await before?.settled;
    if (cancelled || scenes.closed) return false;
    scenes.shown?.detach();
    scenes.shown = undefined;
    return true;
  };
  const { canvas, gl } = scenes.surface;
  const settled = createRuntime({
    ...{ ...wanted, canvas, gl, skin: scenes.latest.current.skin, claim },
    invalidate: () => scenes.shown?.live.invalidate(),
    quality: qualityNow(),
    onQuality: rememberQuality,
    onStats: CONTINUOUS ? publishStats : undefined,
    cancelled: () => cancelled || scenes.closed,
  }).then(
    (runtime) => {
      if (runtime === undefined) return;
      scenes.shown = show(scenes.wrapper, runtime, scenes.latest);
      scenes.onLive(scenes.shown.live);
    },
    () => {
      if (!cancelled) scenes.lost();
    },
  );
  const cancel = () => {
    cancelled = true;
  };
  scenes.building = { cancel, settled };
}

/** The 3D board on one surface (one canvas, one GL context) over its life: builds and swaps scenes. */
function stageOf(
  wrapper: HTMLDivElement,
  surface: SceneSurface,
  latest: RefObject<Board3DProps>,
  onLive: (live: Live) => void,
) {
  const scenes: Scenes = {
    ...{ wrapper, surface, latest, onLive, shown: undefined, building: undefined, closed: false },
    // From the start, a build included: a lost context (a GPU reset) means back to the flat board.
    lost: () => {
      if (!scenes.closed) latest.current.onLost();
    },
  };
  surface.canvas.addEventListener('webglcontextlost', scenes.lost);
  const close = () => {
    scenes.closed = true;
    scenes.building?.cancel();
    scenes.shown?.detach();
    scenes.shown = undefined;
    surface.canvas.removeEventListener('webglcontextlost', scenes.lost);
    surface.canvas.remove();
    delete wrapper.dataset.webgl;
  };
  return {
    build: (wanted: Wanted) => {
      build(scenes, wanted);
    },
    close,
  };
}

type Stage = ReturnType<typeof stageOf>;

function useRuntime(ref: RefObject<HTMLDivElement | null>, props: Board3DProps): Live | undefined {
  const [live, setLive] = useState<Live | undefined>(undefined);
  const [stage, setStage] = useState<Stage | undefined>(undefined);
  const latest = useRef(props);
  latest.current = props;
  const { surface, size, dark, reducedMotion } = props;
  useEffect(() => {
    const wrapper = ref.current;
    if (wrapper === null) return undefined;
    const made = stageOf(wrapper, surface, latest, setLive);
    setStage(made);
    return () => {
      setStage(undefined);
      setLive(undefined);
      made.close();
    };
  }, [ref, surface]);
  // A new size, theme or motion setting: a new scene, built while the current one stays up.
  useEffect(() => {
    stage?.build({ size, dark, reducedMotion });
  }, [stage, size, dark, reducedMotion]);
  return live;
}

/** Feeds the runtime the board and the skin whenever they (or the runtime) change. */
function useStateFeed(current: Live | undefined, props: Board3DProps): void {
  const { board, finished, moves, skin, dark } = props;
  useEffect(() => {
    if (current === undefined) return;
    current.runtime.setBoard(board, finished, moves, performance.now());
    current.wrapper.dataset.sceneBoard = board.join(',');
    current.invalidate();
  }, [current, board, finished, moves]);
  const skinKey = JSON.stringify(skin);
  useEffect(() => {
    if (current === undefined) return;
    current.runtime.setSkin(JSON.parse(skinKey) as SceneSkin, dark);
    current.invalidate();
  }, [current, skinKey, dark]);
}

/**
 * Wiggles a tile each time a new nudge arrives. The last serial is remembered, so a rebuilt
 * runtime (a new `current`) does not replay a nudge it has already shown, nor one from before the
 * board was mounted.
 */
function useNudge(current: Live | undefined, nudge: Board3DProps['nudge']): void {
  const tile = nudge?.tile;
  const serial = nudge?.serial;
  const shown = useRef(serial);
  useEffect(() => {
    if (current === undefined || tile === undefined || serial === shown.current) return;
    shown.current = serial;
    current.runtime.nudge(tile, performance.now());
    current.invalidate();
  }, [current, tile, serial]);
}

/** Puts the pulled cube where the finger has it; lets the last one go when the pull ends. */
function useDrag(current: Live | undefined, drag: Board3DProps['drag']): void {
  const tile = drag?.tile;
  const progress = drag?.progress;
  const held = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (current === undefined) return;
    const before = held.current;
    if (before !== undefined && before !== tile)
      current.runtime.drag(before, undefined, performance.now());
    held.current = tile;
    if (tile !== undefined) current.runtime.drag(tile, progress, performance.now());
    current.invalidate();
  }, [current, tile, progress]);
}

function boardRect(wrapper: HTMLElement) {
  const rect = wrapper.getBoundingClientRect();
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

/** Leans the board toward the mouse, or with the phone; a change below the noise level is ignored. */
function useTilt(current: Live | undefined, mode: TiltMode): void {
  useEffect(() => {
    if (current === undefined || mode === 'off') return undefined;
    let shown: Tilt = { x: 0, y: 0 };
    let baseline: Orientation | undefined;
    const lean = (next: Tilt) => {
      if (!tiltChanged(shown, next)) return;
      shown = next;
      current.runtime.setTilt(next);
      current.invalidate();
    };
    const onPointer = (event: PointerEvent) => {
      if (event.pointerType === 'mouse')
        lean(pointerTilt(event.clientX, event.clientY, boardRect(current.wrapper)));
    };
    const onLeave = (event: PointerEvent) => {
      if (event.relatedTarget === null) lean({ x: 0, y: 0 });
    };
    const onOrientation = (event: DeviceOrientationEvent) => {
      baseline ??= { beta: event.beta, gamma: event.gamma };
      lean(orientationTilt(event, baseline));
    };
    const pointer = mode === 'pointer';
    if (pointer) {
      window.addEventListener('pointermove', onPointer, { passive: true });
      document.addEventListener('pointerout', onLeave);
    } else {
      window.addEventListener('deviceorientation', onOrientation);
    }
    return () => {
      window.removeEventListener('pointermove', onPointer);
      document.removeEventListener('pointerout', onLeave);
      window.removeEventListener('deviceorientation', onOrientation);
      current.runtime.setTilt({ x: 0, y: 0 });
      current.invalidate();
    };
  }, [current, mode]);
}

/** The wrapper's ref: the scene's canvas is placed in it. */
export function useThreeBoard(props: Board3DProps): RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);
  const live = useRuntime(ref, props);
  useStateFeed(live, props);
  useNudge(live, props.nudge);
  useDrag(live, props.drag);
  useTilt(live, props.tilt);
  return ref;
}
