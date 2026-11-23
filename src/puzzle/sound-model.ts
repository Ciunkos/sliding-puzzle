// Which sound a moment of play makes, and every sound effect as plain data: layers of filtered
// noise and pitched tones with their envelopes. use-sound.ts turns a recipe into Web Audio nodes
// and decides nothing itself. All times are seconds from the start of the effect.
//
// Gain budget. One effect's layer gains sum to at most 1 (effectScale enforces it), times the
// effects bus 1 and the master 0.8: at most 0.8 even with every layer in phase. Measured in Chrome
// (OfflineAudioContext): slide peaks 0.29 to 0.40, win 0.31, blocked 0.13, shuffle 0.11, pops and
// switches 0.10. The win starts 0.1 s after its slide has faded, so they never add up. The music
// bus (0.12) peaks at 0.05 (RMS -42 dBFS against -26 for a slide) and is ducked to 55 % under an
// effect; music with a slide every half second peaked at 0.37. No limiter: a compressor would add
// make-up gain and colour the clack.
import { applyMove } from './rules.ts';

export const SOUND_EFFECTS = [
  'slide',
  'push',
  'blocked',
  'win',
  'shuffle',
  'menu-open',
  'menu-close',
  'press',
  'toggle-on',
  'toggle-off',
] as const;
export type SoundEffect = (typeof SOUND_EFFECTS)[number];

/** A sound to play: the effect, a number (the move count) that varies it, and for a push its blocks. */
export interface SoundCue {
  effect: SoundEffect;
  variation: number;
  count?: number;
}

/** The parts of a saved game a sound depends on (a SavedGame<PuzzleState> fits). */
export interface GameSnapshot {
  state: { board: readonly number[] };
  moves: number;
  finished: boolean;
  startedAt: string;
}

interface Envelope {
  /** Seconds after the effect starts. */
  start: number;
  /** Seconds from silence to the peak; at least 2 ms so it never clicks. */
  attack: number;
  /** Seconds from the peak down to silence (-60 dB), exponentially. */
  decay: number;
  /** Peak gain before the master gain. */
  gain: number;
}

export interface NoiseLayer extends Envelope {
  kind: 'noise';
  filter: 'bandpass' | 'lowpass' | 'highpass';
  frequency: number;
  q: number;
}

export interface ToneLayer extends Envelope {
  kind: 'tone';
  wave: 'sine' | 'triangle';
  frequency: number;
  /** The pitch it glides to (exponentially) over its decay; the same as frequency for none. */
  endFrequency: number;
}

export type SoundLayer = NoiseLayer | ToneLayer;

export interface EffectRecipe {
  layers: readonly SoundLayer[];
  /** The music dips under this effect. */
  duck: boolean;
  /** A navigator.vibrate pattern in ms; empty for none. */
  vibrate: readonly number[];
}

/** Levels and ramps of the mixer (gains 0..1, times in seconds). */
export const MIX = {
  master: 0.8,
  effects: 1,
  music: 0.12,
  /** The music level under an effect, as a share of its own level. */
  duck: 0.55,
  duckAttack: 0.02,
  duckRelease: 0.35,
  /** Time constant of the master gain on mute and unmute: no click. */
  muteRamp: 0.03,
  /** How long the music takes to fade when it is switched off. */
  musicFade: 0.6,
} as const;

/** The tile that slid from `before` to `after` in one legal move (as in view-model.ts). */
function slidOnce(before: readonly number[], after: readonly number[]): boolean {
  const tile = after[before.indexOf(0)] ?? 0;
  return applyMove(before, tile)?.join() === after.join();
}

/**
 * The blocks of a row or column pushed in one go from `before` to `after`: the gap moved two or
 * more cells along one line, and each block between moved one cell into the place of the one
 * before it. Undefined for anything else (one slide, or the server catching up by other moves).
 */
function pushedBlocks(before: readonly number[], after: readonly number[]): number | undefined {
  const line = gapLine(before.indexOf(0), after.indexOf(0), Math.round(Math.sqrt(before.length)));
  if (line === undefined) return undefined;
  let board: readonly number[] | undefined = before;
  for (let gap = line.from; gap !== line.to && board !== undefined; gap += line.step) {
    board = applyMove(board, board[gap + line.step] ?? 0);
  }
  return board?.join() === after.join() ? line.blocks : undefined;
}

/**
 * How the gap went from cell `from` to `to` on a board `size` wide: the step between cells (one
 * along a row, `size` down a column) and the blocks it passed, when it went two or more cells
 * along one row or column; undefined otherwise.
 */
function gapLine(from: number, to: number, size: number) {
  const sameRow = Math.floor(from / size) === Math.floor(to / size);
  const sameColumn = from % size === to % size;
  if (!sameRow && !sameColumn) return undefined;
  const step = (sameRow ? 1 : size) * Math.sign(to - from);
  const blocks = step === 0 ? 0 : (to - from) / step;
  return blocks < 2 ? undefined : { from, to, step, blocks };
}

/**
 * The sounds of the change from `before` (undefined on the first game shown) to `after`: a slide
 * for one move, a push for a row or column pushed in one go, the win when it turns solved, a
 * shuffle for a new game or a reset (both start again), nothing for a page load or the server
 * catching up by several moves.
 */
export function gameSounds(before: GameSnapshot | undefined, after: GameSnapshot): SoundCue[] {
  if (before === undefined) return [];
  const variation = after.moves;
  if (before.startedAt !== after.startedAt) return [{ effect: 'shuffle', variation }];
  const cues: SoundCue[] = [];
  const count = pushedBlocks(before.state.board, after.state.board);
  if (slidOnce(before.state.board, after.state.board)) cues.push({ effect: 'slide', variation });
  else if (count !== undefined) cues.push({ effect: 'push', variation, count });
  if (!before.finished && after.finished) cues.push({ effect: 'win', variation });
  return cues;
}

const ATTACK = 0.002;

function noise(
  filter: NoiseLayer['filter'],
  frequency: number,
  q: number,
  envelope: Envelope,
): NoiseLayer {
  return { kind: 'noise', filter, frequency, q, ...envelope };
}

function tone(
  wave: ToneLayer['wave'],
  frequency: number,
  endFrequency: number,
  envelope: Envelope,
): ToneLayer {
  return { kind: 'tone', wave, frequency, endFrequency, ...envelope };
}

/** Five slightly different woods, so repeated moves do not sound like one sample. */
const CLACKS = [
  { click: 1900, body: 240 },
  { click: 1750, body: 226 },
  { click: 2050, body: 254 },
  { click: 1820, body: 232 },
  { click: 1980, body: 262 },
] as const;

/** The body's pitch falls by this share as it rings: a struck block, not a beep. */
const BODY_DROP = 0.85;
/** A wood block's first overtone is inharmonic, about 2.76 times the body. */
const OVERTONE = 2.76;

function slide(variation: number): EffectRecipe {
  const { click, body } = CLACKS[variation % CLACKS.length] ?? CLACKS[0];
  return {
    layers: [
      noise('bandpass', click, 1.6, { start: 0, attack: ATTACK, decay: 0.04, gain: 0.45 }),
      noise('lowpass', 700, 0.7, { start: 0, attack: ATTACK, decay: 0.025, gain: 0.14 }),
      tone('sine', body, body * BODY_DROP, { start: 0, attack: ATTACK, decay: 0.09, gain: 0.3 }),
      tone('sine', Math.round(body * OVERTONE), Math.round(body * OVERTONE), {
        start: 0,
        attack: ATTACK,
        decay: 0.035,
        gain: 0.07,
      }),
    ],
    duck: true,
    vibrate: [8],
  };
}

/** The most blocks a push sounds heavier for, and the gap between its ticks (wood on wood). */
const PUSH_MOST = 4;
const PUSH_TICK = 0.018;

/**
 * A row pushed: the slide's clack on its wood, its body lower and longer the more blocks move,
 * and a very short tick for each block after the first (at most three), not a roll.
 */
function push(variation: number, count: number): EffectRecipe {
  const { click, body } = CLACKS[variation % CLACKS.length] ?? CLACKS[0];
  const blocks = Math.min(PUSH_MOST, Math.max(2, count));
  const low = Math.round(body * (0.9 - 0.05 * blocks));
  const ticks = Array.from({ length: blocks - 1 }, (_, index) =>
    noise('bandpass', Math.round(click * 1.1), 2, {
      start: PUSH_TICK * (index + 1),
      attack: ATTACK,
      decay: 0.012,
      gain: 0.045,
    }),
  );
  return {
    layers: [
      noise('bandpass', Math.round(click * 0.9), 1.6, {
        start: 0,
        attack: ATTACK,
        decay: 0.04,
        gain: 0.36,
      }),
      noise('lowpass', 600, 0.7, { start: 0, attack: ATTACK, decay: 0.035, gain: 0.16 }),
      tone('sine', low, Math.round(low * BODY_DROP * 10) / 10, {
        start: 0,
        attack: ATTACK,
        decay: Math.round((0.08 + 0.02 * blocks) * 1000) / 1000,
        gain: 0.28,
      }),
      tone('sine', Math.round(low * OVERTONE), Math.round(low * OVERTONE), {
        start: 0,
        attack: ATTACK,
        decay: 0.035,
        gain: 0.05,
      }),
      ...ticks,
    ],
    duck: true,
    vibrate: [12],
  };
}

const BLOCKED: EffectRecipe = {
  layers: [
    noise('lowpass', 420, 0.8, { start: 0, attack: 0.003, decay: 0.05, gain: 0.14 }),
    tone('sine', 150, 128, { start: 0, attack: 0.003, decay: 0.08, gain: 0.18 }),
  ],
  duck: true,
  vibrate: [],
};

/** D5 F#5 A5 D6 rising, then D4 under a D major chord: in the key of the music. */
const WIN: EffectRecipe = {
  layers: [
    ...[
      [587.33, 0.1],
      [739.99, 0.2],
      [880, 0.3],
      [1174.66, 0.42],
    ].map(([frequency = 0, start = 0]) =>
      tone('triangle', frequency, frequency, { start, attack: 0.004, decay: 0.9, gain: 0.15 }),
    ),
    ...[
      [293.66, 0.12, 1.6],
      [587.33, 0.1, 1.8],
      [739.99, 0.09, 1.8],
      [880, 0.09, 1.8],
    ].map(([frequency = 0, gain = 0, decay = 0]) =>
      tone('sine', frequency, frequency, { start: 0.62, attack: 0.01, decay, gain }),
    ),
  ],
  duck: true,
  vibrate: [10, 60, 10],
};

/** A soft pop gliding from one pitch to another, with a faint tick on top. */
function pop(from: number, to: number, gain: number): EffectRecipe {
  return {
    layers: [
      tone('sine', from, to, { start: 0, attack: ATTACK, decay: 0.06, gain }),
      noise('highpass', 3500, 0.7, { start: 0, attack: ATTACK, decay: 0.012, gain: 0.025 }),
    ],
    duck: false,
    vibrate: [],
  };
}

/** Two short notes a fifth apart. */
function step(first: number, second: number): EffectRecipe {
  return {
    layers: [
      tone('sine', first, first, { start: 0, attack: ATTACK, decay: 0.07, gain: 0.12 }),
      tone('sine', second, second, { start: 0.06, attack: ATTACK, decay: 0.07, gain: 0.12 }),
    ],
    duck: false,
    vibrate: [],
  };
}

/** Four quick, lighter clacks: the tiles being mixed. */
const SHUFFLE: EffectRecipe = {
  layers: [
    [0, 1600, 200],
    [0.055, 2100, 230],
    [0.11, 1800, 210],
    [0.17, 2300, 250],
  ].flatMap(([start = 0, click = 0, body = 0]) => [
    noise('bandpass', click, 1.4, { start, attack: ATTACK, decay: 0.03, gain: 0.14 }),
    tone('sine', body, body * BODY_DROP, { start, attack: ATTACK, decay: 0.06, gain: 0.1 }),
  ]),
  duck: true,
  vibrate: [],
};

const RECIPES: Record<SoundEffect, (variation: number, count: number) => EffectRecipe> = {
  slide,
  push,
  blocked: () => BLOCKED,
  win: () => WIN,
  shuffle: () => SHUFFLE,
  'menu-open': () => pop(520, 820, 0.11),
  'menu-close': () => pop(820, 520, 0.11),
  press: () => pop(720, 480, 0.12),
  'toggle-on': () => step(660, 990),
  'toggle-off': () => step(990, 660),
};

/**
 * The recipe of `effect`; `variation` (the move count) picks the wood of a slide or a push, and
 * `count` is a push's blocks.
 */
export function effectRecipe(effect: SoundEffect, variation: number, count = 1): EffectRecipe {
  return RECIPES[effect](Math.abs(Math.trunc(variation)), count);
}

/** Seconds until the last layer of `recipe` is silent. */
export function effectLength(recipe: EffectRecipe): number {
  return Math.max(0, ...recipe.layers.map((layer) => layer.start + layer.attack + layer.decay));
}

/** The most one effect's layers may add up to before the master gain (see the budget above). */
const EFFECT_HEADROOM = 1;

/**
 * The factor that keeps `recipe` inside the budget: 1 when the sum of its layers' peaks fits,
 * less when it would not (a safety net; every recipe here fits).
 */
export function effectScale(recipe: EffectRecipe): number {
  const peak = recipe.layers.reduce((sum, layer) => sum + layer.gain, 0);
  return Math.min(1, EFFECT_HEADROOM / peak);
}
