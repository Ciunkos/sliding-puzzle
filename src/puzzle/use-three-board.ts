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

/** Draws a frame when asked, and keeps drawing only while the runtime says something moves. */
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
    if (busy) invalidate();
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
  let width = 0;
  const fit = () => {
    // Setting a canvas's size clears it, even to the same size: only when it really changed.
    if (wrapper.clientWidth === width) return;
    width = wrapper.clientWidth;
    runtime.resize(width, devicePixelRatio);
    loop.drawNow();
  };
  fit();
  const observer = new ResizeObserver(fit);
  observer.observe(wrapper);
  const detach = () => {
    loop.stop();
    observer.disconnect();
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
  useTilt(live, props.tilt);
  return ref;
}
