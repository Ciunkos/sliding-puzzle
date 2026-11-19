// The background music as data: a slow generative piece in D major pentatonic, 64 beats a minute,
// four beats a bar, a 32-bar loop (two minutes). A pad holds a chord for two bars; a soft pluck
// plays a sparse melody that walks from one bar's chord tone to the next bar's, so bars join
// without leaps and the loop's last bar leads back into its first. Phrases of four bars end on two
// long notes. Everything is a pure function of a seed and a bar index; use-sound.ts plays it.
import { createRng } from './rng.ts';

export type MusicVoice = 'pluck' | 'pad';

/** One note; `time` in seconds from the start of its bar, `gain` before the music bus level. */
export interface NoteEvent {
  time: number;
  frequency: number;
  duration: number;
  gain: number;
  voice: MusicVoice;
}

export const BEAT_SECONDS = 0.9375;
export const BAR_SECONDS = 4 * BEAT_SECONDS;
export const LOOP_BARS = 32;
const EIGHTH = BEAT_SECONDS / 2;
const EIGHTHS_PER_BAR = 8;

/** How each voice sounds: oscillator, envelope (seconds), detune between its two oscillators. */
export const VOICES = {
  pluck: { wave: 'triangle', attack: 0.006, detuneCents: 5, brightness: 2400, darkness: 600 },
  pad: { wave: 'triangle', attack: 1.6, release: 2.4, detuneCents: 7 },
} as const;

/** The room: a generated impulse response and the low-pass the music goes through first. */
export const ROOM = { seconds: 3.2, fade: 3, wet: 0.35, dry: 0.75, lowpass: 2200 } as const;

/** D major pentatonic from D4 to A5, as MIDI notes; the melody moves by index into this list. */
const SCALE = [62, 64, 66, 69, 71, 74, 76, 78, 81] as const;

type Chord = 'I' | 'vi' | 'IV' | 'V';

/** Open voicings without thirds that clash: D A E, B F# D, G D A, A E B. */
const VOICINGS: Record<Chord, readonly number[]> = {
  I: [50, 57, 64],
  vi: [47, 54, 62],
  IV: [43, 50, 57],
  V: [45, 52, 59],
};

/** The scale indices that belong to each chord: where a bar's melody starts. */
const CHORD_TONES: Record<Chord, readonly number[]> = {
  I: [0, 1, 3, 5, 6, 8],
  vi: [2, 4, 5, 7],
  IV: [0, 3, 5, 8],
  V: [1, 3, 4, 6, 8],
};

/** One chord per two bars: an 8-bar verse twice, then a 16-bar turn that ends on V. */
const PROGRESSION: readonly Chord[] = [
  ...(['I', 'vi', 'IV', 'V', 'I', 'vi', 'IV', 'V'] as const),
  ...(['IV', 'I', 'vi', 'V', 'IV', 'I', 'IV', 'V'] as const),
];

/** How high each bar of an 8-bar phrase starts: an arch, the second one higher and lower. */
const ARCHES = [
  [3, 4, 5, 6, 5, 4, 3, 2],
  [4, 5, 6, 7, 6, 5, 3, 1],
] as const;

/** Onsets in eighths. The last bar of every four plays the phrase end instead. */
const RHYTHMS = [
  [0, 3, 6],
  [0, 2, 5],
  [0, 4, 6],
  [0, 3, 4, 6],
  [0, 5],
] as const;
const PHRASE_END = [0, 4] as const;

const PAD_GAIN = 0.06;
const RING = 0.8;

/** The bar inside the loop, for any whole number. */
function inLoop(bar: number): number {
  return ((Math.trunc(bar) % LOOP_BARS) + LOOP_BARS) % LOOP_BARS;
}

function chordOf(bar: number): Chord {
  return PROGRESSION[Math.floor(inLoop(bar) / 2)] ?? 'I';
}

/** Hz, rounded to a hundredth so the data stays readable. */
export function frequencyOf(midi: number): number {
  return Math.round(440 * 2 ** ((midi - 69) / 12) * 100) / 100;
}

/** The chord tone nearest to this bar's height in its arch; the lower one on a tie. */
function startIndex(bar: number): number {
  const loopBar = inLoop(bar);
  const arch = ARCHES[Math.floor(loopBar / 8) % ARCHES.length] ?? ARCHES[0];
  const height = arch[loopBar % 8] ?? 0;
  const tones = CHORD_TONES[chordOf(bar)];
  return tones.reduce((best, tone) =>
    Math.abs(tone - height) < Math.abs(best - height) ? tone : best,
  );
}

/** A number in [0, 1) that depends only on the seed, the bar and the slot. */
function draw(seed: number, bar: number, slot: number): number {
  return createRng(Math.imul(seed, 0x9e3779b1) ^ Math.imul(inLoop(bar) + 1, 0x85ebca77) ^ slot)();
}

function rhythmOf(seed: number, bar: number): readonly number[] {
  if (inLoop(bar) % 4 === 3) return PHRASE_END;
  return RHYTHMS[Math.floor(draw(seed, bar, 0) * RHYTHMS.length)] ?? PHRASE_END;
}

/** Louder on the downbeat, softer off the beat. */
function accent(slot: number): number {
  if (slot === 0) return 0.24;
  return slot % 2 === 0 ? 0.2 : 0.16;
}

/** An inner note steps to the scale tone above or below the line, so the melody moves. */
function neighbour(value: number): number {
  return value < 0.5 ? -1 : 1;
}

/** The pitch of note `k` of `count`: on the way from this bar's start to the next bar's. */
function indexOf(seed: number, bar: number, k: number, count: number): number {
  const from = startIndex(bar);
  const line = Math.round(from + ((startIndex(bar + 1) - from) * k) / count);
  const inner = k > 0 && k < count - 1;
  const step = inner ? neighbour(draw(seed, bar, k)) : 0;
  return Math.min(SCALE.length - 1, Math.max(0, line + step));
}

/** The pluck notes of `bar`. */
export function melody(seed: number, bar: number): NoteEvent[] {
  const rhythm = rhythmOf(seed, bar);
  return rhythm.map((slot, k) => ({
    time: slot * EIGHTH,
    frequency: frequencyOf(SCALE[indexOf(seed, bar, k, rhythm.length)] ?? SCALE[0]),
    duration: ((rhythm[k + 1] ?? EIGHTHS_PER_BAR) - slot) * EIGHTH + RING,
    gain: accent(slot),
    voice: 'pluck',
  }));
}

/** The pad chord, held for two bars, starting on every even bar. */
export function pads(bar: number): NoteEvent[] {
  if (inLoop(bar) % 2 === 1) return [];
  return VOICINGS[chordOf(bar)].map((midi) => ({
    time: 0,
    frequency: frequencyOf(midi),
    duration: 2 * BAR_SECONDS,
    gain: PAD_GAIN,
    voice: 'pad',
  }));
}

/** Every note of `bar` (any whole number; the piece loops every LOOP_BARS bars). */
export function musicBar(seed: number, bar: number): NoteEvent[] {
  return [...pads(bar), ...melody(seed, bar)];
}
