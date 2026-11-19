import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import fc from 'fast-check';
import {
  BAR_SECONDS,
  frequencyOf,
  LOOP_BARS,
  melody,
  musicBar,
  pads,
  ROOM,
  VOICES,
} from './music-model.ts';

const PAD = { time: 0, duration: 7.5, gain: 0.06, voice: 'pad' };
/** D3 A3 E4: the tonic without its third. */
const PAD_I = [
  { ...PAD, frequency: 146.83 },
  { ...PAD, frequency: 220 },
  { ...PAD, frequency: 329.63 },
];
/** B2 F#3 D4. */
const PAD_VI = [
  { ...PAD, frequency: 123.47 },
  { ...PAD, frequency: 185 },
  { ...PAD, frequency: 293.66 },
];
/** Two half-bar notes, the first one stressed, each ringing 0.8 s past the next onset. */
const PHRASE_END_ON_D5 = [
  { time: 0, frequency: 587.33, duration: 2.675, gain: 0.24, voice: 'pluck' },
  { time: 1.875, frequency: 587.33, duration: 2.675, gain: 0.2, voice: 'pluck' },
];
/** E4 on V, then F#4 on the way to the A4 that starts the next bar. */
const PHRASE_END_E4_TO_FS4 = [
  { time: 0, frequency: 329.63, duration: 2.675, gain: 0.24, voice: 'pluck' },
  { time: 1.875, frequency: 369.99, duration: 2.675, gain: 0.2, voice: 'pluck' },
];

/** Seed 1 draws onsets 0, 4 and 6 around A4; the inner note steps down to F#4. */
const SEED_1_BAR_0 = [
  { time: 0, frequency: 440, duration: 2.675, gain: 0.24, voice: 'pluck' },
  { time: 1.875, frequency: 369.99, duration: 1.7375, gain: 0.2, voice: 'pluck' },
  { time: 2.8125, frequency: 440, duration: 1.7375, gain: 0.2, voice: 'pluck' },
];
/** Seed 2 draws onsets 0 and 5: the off-beat note is softer. */
const SEED_2_BAR_0 = [
  { time: 0, frequency: 440, duration: 3.14375, gain: 0.24, voice: 'pluck' },
  { time: 2.34375, frequency: 440, duration: 2.20625, gain: 0.16, voice: 'pluck' },
];

/** G2 D3 A3: the turn starts on the subdominant. */
const PAD_IV = [
  { ...PAD, frequency: 98 },
  { ...PAD, frequency: 146.83 },
  { ...PAD, frequency: 220 },
];
/** The second arch peaks higher: F#5 on vi, stepping down to E5 towards D5. */
const PHRASE_END_FS5_TO_E5 = [
  { time: 0, frequency: 739.99, duration: 2.675, gain: 0.24, voice: 'pluck' },
  { time: 1.875, frequency: 659.26, duration: 2.675, gain: 0.2, voice: 'pluck' },
];

const seeds = fc.integer({ min: 0, max: 2 ** 31 - 1 });
const bars = fc.integer({ min: 0, max: 10_000 });

describe('music', () => {
  test('MIDI notes are tuned to A 440 and rounded to a hundredth of a hertz', () => {
    assert.deepEqual([frequencyOf(69), frequencyOf(57), frequencyOf(74)], [440, 220, 587.33]);
  });

  test('the loop opens with the tonic pad held for two bars, then rests a bar', () => {
    assert.deepEqual(pads(0), PAD_I);
    assert.deepEqual(pads(1), []);
  });

  test('the second chord is the relative minor', () => {
    assert.deepEqual(pads(2), PAD_VI);
  });

  test('the fourth bar ends the phrase on two long D5s whatever the seed', () => {
    fc.assert(
      fc.property(seeds, (seed) => {
        assert.deepEqual(melody(seed, 3), PHRASE_END_ON_D5);
      }),
    );
  });

  test('the second half of the loop turns to the subdominant', () => {
    assert.deepEqual(pads(16), PAD_IV);
  });

  test('the twelfth bar, in the higher second arch, falls from F#5 to E5', () => {
    assert.deepEqual(melody(1, 11), PHRASE_END_FS5_TO_E5);
  });

  test('the eighth bar walks up from E4 towards the next bar', () => {
    assert.deepEqual(melody(1, 7), PHRASE_END_E4_TO_FS4);
  });

  test('the last bar of the loop leads back into the first the same way', () => {
    assert.deepEqual(melody(1, LOOP_BARS - 1), PHRASE_END_E4_TO_FS4);
  });

  test('a bar inside a phrase starts on a chord tone and its rhythm comes from the seed', () => {
    assert.deepEqual(melody(1, 0), SEED_1_BAR_0);
    assert.deepEqual(melody(2, 0), SEED_2_BAR_0);
  });

  test('the piece repeats every 32 bars, and a negative bar is a bar of the loop', () => {
    fc.assert(
      fc.property(seeds, bars, (seed, bar) => {
        assert.deepEqual(musicBar(seed, bar + LOOP_BARS), musicBar(seed, bar));
        assert.deepEqual(musicBar(seed, bar - LOOP_BARS * 3), musicBar(seed, bar));
      }),
    );
  });

  test('the same seed and bar always give the same notes, pads first', () => {
    fc.assert(
      fc.property(seeds, bars, (seed, bar) => {
        assert.deepEqual(musicBar(seed, bar), [...pads(bar), ...melody(seed, bar)]);
        assert.deepEqual(musicBar(seed, bar), musicBar(seed, bar));
      }),
    );
  });

  test('every note is gentle: 90 to 900 Hz, quiet, inside its bar and of a real length', () => {
    fc.assert(
      fc.property(seeds, bars, fc.nat(), (seed, bar, pick) => {
        const notes = musicBar(seed, bar);
        const note = notes[pick % notes.length];
        assert.ok(note);
        assert.deepEqual(
          [note.frequency >= 90, note.frequency <= 900, note.gain > 0, note.gain <= 0.24],
          [true, true, true, true],
        );
        assert.deepEqual(
          [note.time >= 0, note.time < BAR_SECONDS, note.duration >= 1, note.duration <= 7.5],
          [true, true, true, true],
        );
      }),
    );
  });

  test('a bar plays two to four melody notes: sparse, never silent', () => {
    fc.assert(
      fc.property(seeds, bars, (seed, bar) => {
        const count = melody(seed, bar).length;
        assert.deepEqual([count >= 2, count <= 4], [true, true]);
      }),
    );
  });

  test('bars join without a leap: from one bar into the next is at most a fifth', () => {
    fc.assert(
      fc.property(seeds, bars, (seed, bar) => {
        const last = melody(seed, bar).at(-1);
        const first = melody(seed, bar + 1)[0];
        assert.ok(last);
        assert.ok(first);
        assert.ok(
          Math.max(last.frequency, first.frequency) / Math.min(last.frequency, first.frequency) <=
            1.5,
        );
      }),
    );
  });

  test('the voices are soft and detuned, the room long and mostly dry', () => {
    assert.deepEqual(VOICES, {
      pluck: { wave: 'triangle', attack: 0.006, detuneCents: 5, brightness: 2400, darkness: 600 },
      pad: { wave: 'triangle', attack: 1.6, release: 2.4, detuneCents: 7 },
    });
    assert.deepEqual(ROOM, { seconds: 3.2, fade: 3, wet: 0.35, dry: 0.75, lowpass: 2200 });
  });
});
