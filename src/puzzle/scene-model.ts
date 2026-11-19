// The 3D board as numbers: where tiles stand, how they move, how the board tilts. Plain functions,
// so the scene (use-three-board.ts) only reads them each frame. World units: the board's grid of
// tiles is the unit square centred on the origin, x to the right, y up, tile tops at z = 0.
import { IMPACT_MS, SETTLE_MS, springAt, springEasing } from './effects.ts';
import type { Size } from './rules.ts';

export interface Vec2 {
  x: number;
  y: number;
}

/** A tilt in degrees: `x` turns the board about its horizontal axis, `y` about its vertical one. */
export type Tilt = Vec2;

/**
 * How long a tile takes to slide and settle on its spring (effects.ts). The DOM board's transition
 * (styles.ts) shares it: `transition: transform ${SLIDE_MS}ms ${SLIDE_EASING}`.
 */
export const SLIDE_MS = SETTLE_MS;
/** The spring as a CSS easing, sampled every 10 ms: the DOM tiles overshoot and snap the same way. */
export const SLIDE_EASING = springEasing(30);
/** The most the board leans, in degrees: little enough that the buttons stay over their tiles. */
export const MAX_TILT_DEG = 6;
/** How high a sliding tile lifts at mid-slide, in board widths. */
const SLIDE_LIFT = 0.01;

/** The centre of cell `index` (row-major from the top-left) on a `size`-wide board. */
export function cellCentre(index: number, size: Size): Vec2 {
  const cell = 1 / size;
  const col = index % size;
  const row = Math.floor(index / size);
  return { x: (col + 0.5) * cell - 0.5, y: 0.5 - (row + 0.5) * cell };
}

/** Cubic ease-out over progress 0..1 (clamped): fast start, soft landing. */
export function easeOut(progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  return 1 - (1 - p) ** 3;
}

/** A tile on its way from one cell to another, starting at `start` (ms). */
export interface Slide {
  from: Vec2;
  to: Vec2;
  start: number;
}

/**
 * Where a sliding tile is at `now` on its spring (past its cell for a moment, then back), how high
 * it is lifted on the way to its landing, and whether it has settled. `durationMs` stretches the
 * spring's time; 0 (reduced motion) puts the tile in its cell at once.
 */
export function slideAt(
  slide: Slide,
  now: number,
  durationMs = SLIDE_MS,
): Vec2 & { lift: number; done: boolean } {
  const t = durationMs <= 0 ? SETTLE_MS : ((now - slide.start) * SETTLE_MS) / durationMs;
  const done = t >= SETTLE_MS;
  const share = springAt(t);
  const flight = Math.min(1, Math.max(0, t / IMPACT_MS));
  return {
    x: slide.from.x + (slide.to.x - slide.from.x) * share,
    y: slide.from.y + (slide.to.y - slide.from.y) * share,
    lift: flight >= 1 ? 0 : SLIDE_LIFT * Math.sin(Math.PI * flight),
    done,
  };
}

/** Scales (x, y) down to length 1 when it is longer, so a diagonal never tilts more than an axis. */
function withinUnit(x: number, y: number): Vec2 {
  const length = Math.hypot(x, y);
  return length > 1 ? { x: x / length, y: y / length } : { x, y };
}

/** A tilt from offsets in -1..1: across turns about the vertical axis, along about the horizontal. */
function tiltOf(across: number, along: number): Tilt {
  const unit = withinUnit(across, along);
  return { x: unit.y * MAX_TILT_DEG, y: unit.x * MAX_TILT_DEG };
}

/**
 * The board leans toward the pointer at (`x`, `y`) in page pixels: half the maximum when it is
 * over an edge of `rect`, the maximum one board width from the centre (and beyond).
 */
export function pointerTilt(
  x: number,
  y: number,
  rect: { left: number; top: number; width: number; height: number },
): Tilt {
  const across = (x - (rect.left + rect.width / 2)) / rect.width;
  const along = (y - (rect.top + rect.height / 2)) / rect.height;
  return tiltOf(across, along);
}

/** A device orientation reading (DeviceOrientationEvent), null when the device has no sensor. */
export interface Orientation {
  beta: number | null;
  gamma: number | null;
}

/** How far the phone must turn, in degrees, for the board to lean the maximum. */
const FULL_TURN_DEG = 30;

/** The board leans as the phone turns away from `baseline`, the reading when tilt was enabled. */
export function orientationTilt(reading: Orientation, baseline: Orientation): Tilt {
  const turn = (now: number | null, then: number | null) =>
    now === null || then === null ? 0 : (now - then) / FULL_TURN_DEG;
  return tiltOf(turn(reading.gamma, baseline.gamma), turn(reading.beta, baseline.beta));
}

/** Changes smaller than this (degrees) are sensor noise and do not wake the renderer. */
const TILT_NOISE_DEG = 0.25;

export function tiltChanged(current: Tilt, next: Tilt): boolean {
  return Math.hypot(next.x - current.x, next.y - current.y) >= TILT_NOISE_DEG;
}

/** Closer than this (degrees) is there. */
const SETTLED = 0.01;

/** Eases `current` toward `target` over `dtMs` with time constant `tauMs`, frame-rate independent. */
export function approach(current: number, target: number, dtMs: number, tauMs: number): number {
  const next = current + (target - current) * (1 - Math.exp(-dtMs / tauMs));
  return Math.abs(target - next) < SETTLED ? target : next;
}

/** How long the win celebration lasts. */
export const CELEBRATION_MS = 1500;
/** The wave: each step along a diagonal starts this much later. */
const WAVE_STEP_MS = 60;
const POP_MS = 400;
const POP_HEIGHT = 0.06;

/** How high the tile in cell `index` is lifted `t` ms into the celebration: a wave from the top-left. */
export function celebrationLift(index: number, size: Size, t: number): number {
  const diagonal = (index % size) + Math.floor(index / size);
  const local = (t - diagonal * WAVE_STEP_MS) / POP_MS;
  if (local <= 0 || local >= 1) return 0;
  return POP_HEIGHT * Math.sin(Math.PI * local);
}

/** The square of a picture that tile `tile` shows: from (u, v), texture coordinates growing upwards. */
export function tileUv(tile: number, size: Size): { u: number; v: number; size: number } {
  const home = tile - 1;
  const row = Math.floor(home / size);
  return { u: (home % size) / size, v: (size - 1 - row) / size, size: 1 / size };
}

/**
 * How far above the tile tops the camera stands so the board's grid, `contentPx` wide on screen,
 * fills exactly that part of a canvas `canvasPx` wide: the buttons then sit over the tiles.
 */
export function cameraDistance(canvasPx: number, contentPx: number, fovDeg: number): number {
  const halfVisible = canvasPx / contentPx / 2;
  return halfVisible / Math.tan((fovDeg * Math.PI) / 360);
}

/** The DOM board's border, as a share of the board's width (styles.ts): the 3D tray's rim. */
export const BOARD_BORDER_SHARE = 0.025;
/** How far the 3D canvas reaches past the board on each side, as a share of the board's width. */
export const SCENE_MARGIN_SHARE = 0.035;
/** The rim's width in world units (the grid of tiles is 1 wide). */
export const RIM_UNITS = BOARD_BORDER_SHARE / (1 - 2 * BOARD_BORDER_SHARE);
/** The canvas's width in world units. */
export const CANVAS_UNITS = (1 + 2 * SCENE_MARGIN_SHARE) / (1 - 2 * BOARD_BORDER_SHARE);

const GLOW_MS = 900;
const GLOW_PEAK = 0.35;

/** How brightly the tiles glow `t` ms into the celebration: up and back down within GLOW_MS. */
export function glowAt(t: number): number {
  if (t <= 0 || t >= GLOW_MS) return 0;
  return GLOW_PEAK * Math.sin((Math.PI * t) / GLOW_MS);
}

const CORNER_MS = 600;
const CORNER_DROP = 0.08;

/** The missing corner of a picture `t` ms into the win: it fades in as it drops into place. */
export function cornerAt(t: number): { opacity: number; drop: number } {
  const eased = easeOut(t / CORNER_MS);
  return { opacity: eased, drop: CORNER_DROP * (1 - eased) };
}
