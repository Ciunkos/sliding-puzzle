// Runs the 3D board inside its wrapper element: creates the runtime on the probed canvas, feeds it
// the game's state, and draws on demand. A frame is requested (invalidate) only when something
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
  const stop = () => {
    stopped = true;
    cancelAnimationFrame(frame);
  };
  return { invalidate, stop };
}

/** Connects a built runtime to `wrapper`: its canvas, size, context loss and frames. */
function attach(
  wrapper: HTMLDivElement,
  runtime: SceneRuntime,
  surface: SceneSurface,
  latest: RefObject<Board3DProps>,
) {
  const { canvas } = surface;
  const loop = demandLoop(
    (now) => runtime.frame(now),
    () => {
      wrapper.dataset.webgl = 'ready';
      latest.current.onReady();
    },
  );
  wrapper.append(canvas);
  const lost = () => {
    latest.current.onLost();
  };
  canvas.addEventListener('webglcontextlost', lost);
  const observer = new ResizeObserver(() => {
    runtime.resize(wrapper.clientWidth, devicePixelRatio);
    loop.invalidate();
  });
  observer.observe(wrapper);
  const stop = () => {
    loop.stop();
    observer.disconnect();
    canvas.removeEventListener('webglcontextlost', lost);
    runtime.dispose();
    canvas.remove();
    delete wrapper.dataset.webgl;
  };
  return { live: { runtime, invalidate: loop.invalidate, wrapper }, stop };
}

/**
 * Builds the scene for `wrapper` in the background (the flat board shows meanwhile) and calls
 * `onLive` once it is attached; returns how to stop it, whether built yet or not.
 */
function start(
  wrapper: HTMLDivElement,
  props: Board3DProps,
  latest: RefObject<Board3DProps>,
  onLive: (live: Live) => void,
): () => void {
  let stopped = false;
  let stopAttached: (() => void) | undefined;
  // A picture that loads asks for a frame through here, once the loop exists.
  let invalidate: (() => void) | undefined;
  const { surface, size, dark, reducedMotion } = props;
  const built = createRuntime({
    ...{ canvas: surface.canvas, gl: surface.gl, size, dark, reducedMotion },
    invalidate: () => {
      invalidate?.();
    },
    cancelled: () => stopped,
  });
  void built.then((runtime) => {
    if (runtime === undefined || stopped) return;
    const scene = attach(wrapper, runtime, surface, latest);
    invalidate = scene.live.invalidate;
    stopAttached = scene.stop;
    onLive(scene.live);
  });
  return () => {
    stopped = true;
    stopAttached?.();
  };
}

function useRuntime(ref: RefObject<HTMLDivElement | null>, props: Board3DProps): Live | undefined {
  const [live, setLive] = useState<Live | undefined>(undefined);
  const latest = useRef(props);
  latest.current = props;
  const { surface, size, dark, reducedMotion } = props;
  useEffect(() => {
    const wrapper = ref.current;
    if (wrapper === null) return undefined;
    const props = { ...latest.current, surface, size, dark, reducedMotion };
    const stop = start(wrapper, props, latest, setLive);
    return () => {
      setLive(undefined);
      stop();
    };
  }, [ref, surface, size, dark, reducedMotion]);
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

/** Wiggles a tile each time a new nudge arrives. */
function useNudge(current: Live | undefined, nudge: Board3DProps['nudge']): void {
  const tile = nudge?.tile;
  const serial = nudge?.serial;
  useEffect(() => {
    if (current === undefined || tile === undefined || serial === undefined) return;
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
