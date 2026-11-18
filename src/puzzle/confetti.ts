// The win's confetti burst as numbers: pieces drawn from a seeded random source, and where each one
// is at a time. The scene draws them as one instanced mesh; nothing here touches three.js.
import type { Rng } from './rng.ts';
import type { Board } from './rules.ts';

/** Bright colours of the pieces (sRGB hex), picked by index. */
export const CONFETTI_COLOURS = [
  0xff4d6d, 0xffb703, 0x3ad29f, 0x4cc9f0, 0x9b5de5, 0xffffff,
] as const;

/** One piece: its direction across the board, speeds, spin, colour index and size. */
export interface ConfettiPiece {
  /** Direction of flight across the board, radians. */
  angle: number;
  /** Board widths per second across the board. */
  speed: number;
  /** Board widths per second up toward the viewer at the start. */
  rise: number;
  /** Radians per second. */
  spin: number;
  colour: number;
  scale: number;
}

/** `count` pieces; the same random sequence always makes the same burst. */
export function createConfetti(random: Rng, count: number): ConfettiPiece[] {
  return Array.from({ length: count }, () => ({
    angle: random() * 2 * Math.PI,
    speed: 0.4 + random(),
    rise: 1 + random() * 1.2,
    spin: (random() - 0.5) * 20,
    colour: Math.floor(random() * CONFETTI_COLOURS.length),
    scale: 0.5 + random() * 0.5,
  }));
}

/** Pull back toward the board, board widths per second squared. */
const GRAVITY = 4.5;
/** The pieces start just above the tile tops. */
const START_HEIGHT = 0.05;
const FADE_FROM_MS = 1000;
const FADE_MS = 500;

/** Where a piece is `t` ms after the win, its turn (radians) and size (0 once it is gone). */
export function confettiAt(
  piece: ConfettiPiece,
  t: number,
): { x: number; y: number; z: number; turn: number; scale: number } {
  const s = t / 1000;
  const fade = Math.min(1, Math.max(0, 1 - (t - FADE_FROM_MS) / FADE_MS));
  return {
    x: Math.cos(piece.angle) * piece.speed * s,
    y: Math.sin(piece.angle) * piece.speed * s,
    z: START_HEIGHT + piece.rise * s - (GRAVITY / 2) * s * s,
    turn: piece.spin * s,
    scale: piece.scale * fade,
  };
}

/** A seed for the burst from the solved game (32-bit FNV-1a of the cells, then the moves). */
export function celebrationSeed(board: Board, moves: number): number {
  let hash = 2166136261;
  for (const value of [...board, moves]) {
    hash = Math.imul(hash ^ value, 16777619) >>> 0;
  }
  return hash;
}
