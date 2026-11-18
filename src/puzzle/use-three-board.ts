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

/** Starts the scene in `wrapper`; returns it and how to stop it. */
function start(wrapper: HTMLDivElement, props: Board3DProps, latest: RefObject<Board3DProps>) {
  const { canvas, gl } = props.surface;
  wrapper.append(canvas);
  const loop = demandLoop(
    (now) => runtime.frame(now),
    () => {
      wrapper.dataset.webgl = 'ready';
      latest.current.onReady();
    },
  );
  const { size, dark, reducedMotion } = props;
  const runtime = createRuntime({
    canvas,
    gl,
    size,
    dark,
    reducedMotion,
    invalidate: loop.invalidate,
  });
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

function useRuntime(ref: RefObject<HTMLDivElement | null>, props: Board3DProps): Live | undefined {
  const [live, setLive] = useState<Live | undefined>(undefined);
  const latest = useRef(props);
  latest.current = props;
  const { surface, size, dark, reducedMotion } = props;
  useEffect(() => {
    const wrapper = ref.current;
    if (wrapper === null) return undefined;
    const scene = start(wrapper, { ...latest.current, surface, size, dark, reducedMotion }, latest);
    setLive(scene.live);
    return () => {
      setLive(undefined);
      scene.stop();
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
  useTilt(live, props.tilt);
  return ref;
}
