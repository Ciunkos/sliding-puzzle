// The 3D board's motion with weight, as numbers: a spring that overshoots and snaps, the squash of
// a landing cube, the camera's kick, dust puffs, and the wiggle of a cube that cannot move. Plain
// functions of time, so the runtime (use-three-runtime.ts) only reads them each frame; every one is
// exactly at rest (0, or 1 for the spring) once its time is up, so the render loop can go idle.
import type { Rng } from './rng.ts';
import type { Board, Size } from './rules.ts';

/** How strongly the spring is damped: below 1 it overshoots once, by about 4.6%, then settles. */
const DAMPING = 0.7;
/** The spring's natural frequency in radians per millisecond. */
const OMEGA = 0.033;
/** The spring is treated as settled (exactly 1) from here on: what is left is a fifth of a pixel. */
export const SETTLE_MS = 300;
/** About when a sliding cube first reaches its cell (the spring crosses 1): the landing. */
export const IMPACT_MS = 100;

/** Share of the way a spring slide has covered `t` ms after it started: overshoots past 1, ends at 1. */
export function springAt(t: number): number {
  if (t <= 0) return 0;
  if (t >= SETTLE_MS) return 1;
  const damped = OMEGA * Math.sqrt(1 - DAMPING * DAMPING);
  const decay = Math.exp(-DAMPING * OMEGA * t);
  const sway = Math.cos(damped * t) + ((DAMPING * OMEGA) / damped) * Math.sin(damped * t);
  return 1 - decay * sway;
}

/** The spring as a CSS `linear()` easing of `steps` equal parts, rounded to thousandths. */
export function springEasing(steps: number): string {
  const points = Array.from({ length: steps + 1 }, (_, i) =>
    String(Math.round(springAt((i * SETTLE_MS) / steps) * 1000) / 1000),
  );
  return `linear(${points.join(', ')})`;
}

const SQUASH_MS = 180;
const SQUASH_DEPTH = 0.14;

/**
 * How much a landing cube is squashed, as a share of its height, `t` ms after its slide started:
 * nothing until it lands, a squash, a smaller stretch (negative), and still again after SQUASH_MS.
 */
export function squashAt(t: number): number {
  const k = (t - IMPACT_MS) / SQUASH_MS;
  if (k <= 0 || k >= 1) return 0;
  return SQUASH_DEPTH * (1 - k) ** 2 * Math.sin(3 * Math.PI * k);
}

/** How long the camera shakes after a kick. */
export const SHAKE_MS = 260;
/** A landing's kick and the win's, in board widths. */
export const LANDING_KICK = 0.0035;
export const WIN_KICK = 0.014;

/** The camera's offset `t` ms after a kick of `strength` board widths: it dies out to exactly 0. */
export function shakeAt(t: number, strength: number): { x: number; y: number } {
  const k = t / SHAKE_MS;
  if (k <= 0 || k >= 1) return { x: 0, y: 0 };
  const envelope = strength * (1 - k) ** 2;
  return { x: envelope * Math.sin(t * 0.13), y: envelope * Math.sin(t * 0.09) };
}

/** One mote of a dust puff: where along the landing edge it starts and how it drifts. */
export interface DustMote {
  /** Place along the edge, -0.5..0.5 of the cube's width. */
  along: number;
  /** Speeds in board widths per second: ahead of the edge, sideways along it, and up. */
  ahead: number;
  drift: number;
  rise: number;
  size: number;
}

/** `count` motes; the same random sequence always makes the same puff. */
export function createDust(random: Rng, count: number): DustMote[] {
  return Array.from({ length: count }, () => ({
    along: random() - 0.5,
    ahead: 0.04 + random() * 0.1,
    drift: (random() - 0.5) * 0.12,
    rise: 0.05 + random() * 0.1,
    size: 0.6 + random() * 0.6,
  }));
}

/** How long a puff lasts, and the time constant of the air slowing it down. */
export const DUST_MS = 520;
const DUST_TAU_MS = 160;

/**
 * Where a mote is `t` ms after the landing, in board widths from where it started (`ahead` of the
 * edge, `across` along it, `z` up), and its size (0 before and after the puff).
 */
export function dustAt(
  mote: DustMote,
  t: number,
): { across: number; ahead: number; z: number; scale: number } {
  const k = t / DUST_MS;
  if (k <= 0 || k >= 1) return { across: 0, ahead: 0, z: 0, scale: 0 };
  const travel = (DUST_TAU_MS / 1000) * (1 - Math.exp(-t / DUST_TAU_MS));
  return {
    across: mote.drift * travel,
    ahead: mote.ahead * travel,
    z: mote.rise * travel,
    scale: mote.size * (0.5 + k),
  };
}

const DUST_FADE_IN_MS = 60;

/** How visible a puff is `t` ms after the landing: in quickly, out slowly, gone at DUST_MS. */
export function dustOpacity(t: number): number {
  const k = t / DUST_MS;
  if (k <= 0 || k >= 1) return 0;
  return Math.min(1, t / DUST_FADE_IN_MS) * (1 - k) ** 2;
}

/** How long a cube that cannot move wiggles. */
export const WIGGLE_MS = 380;
const WIGGLE_PUSH = 0.012;
const WIGGLE_TURN = 0.05;

/**
 * A cube that cannot move, `t` ms after it was tapped: how far it lurches toward the gap (board
 * widths, negative is away) and how far it turns (radians). Both die out to exactly 0.
 */
export function wiggleAt(t: number): { push: number; turn: number } {
  const k = t / WIGGLE_MS;
  if (k <= 0 || k >= 1) return { push: 0, turn: 0 };
  const envelope = (1 - k) ** 2;
  return {
    push: WIGGLE_PUSH * envelope * Math.sin(4 * Math.PI * k),
    turn: WIGGLE_TURN * envelope * Math.sin(6 * Math.PI * k),
  };
}

/**
 * The way a tapped cube would have to go toward the gap: one step along the longer of its row
 * and column distance (the row on a tie), with y up. No way when it is the gap or not on the board.
 */
export function nudgeDirection(board: Board, tile: number, size: Size): { x: number; y: number } {
  const from = board.indexOf(tile);
  const gap = board.indexOf(0);
  if (from < 0 || gap < 0 || from === gap) return { x: 0, y: 0 };
  const across = (gap % size) - (from % size);
  const down = Math.floor(gap / size) - Math.floor(from / size);
  if (Math.abs(across) >= Math.abs(down)) return { x: Math.sign(across), y: 0 };
  return { x: 0, y: -Math.sign(down) };
}
