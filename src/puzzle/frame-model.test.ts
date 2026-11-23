import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import fc from 'fast-check';
import { repeated } from '../test-support/scripted-rng.ts';
import {
  detectCap,
  firstFrameShift,
  frameLead,
  holdCap,
  fpsLines,
  fpsWanted,
  frameStats,
  nextQuality,
  parseStoredQuality,
  recent,
  renderScale,
  sessionQuality,
  storedQuality,
} from './frame-model.ts';

/** Frame intervals in ms: steady at a 30, 60 and 120 Hz cap. */
const AT_30 = repeated([33.3], 40);
const AT_60 = repeated([16.7], 40);
const AT_120 = repeated([8.3], 40);
/** 45 fps on a 60 Hz display: every third frame shown twice (16.7, 16.7, 33.3, ...), 39 frames. */
const JANKY = repeated([16.7, 16.7, 33.3], 13);
/** 108 fps on a 144 Hz display: every third frame a refresh late (6.9, 6.9, 13.9 ms). */
const AT_108_ON_144 = repeated([6.9, 6.9, 13.9], 13);
/** 90 fps on a 120 Hz display: every third frame a refresh late (8.3, 8.3, 16.7 ms). */
const AT_90_ON_120 = repeated([8.3, 8.3, 16.7], 13);
/** Steady, but slower than any cap: 45 ms a frame (22 fps). */
const SLOW = repeated([45], 40);
/** A readout of a phone at 60 fps, one level down. */
const READOUT = {
  fps: 59.6,
  median: 16.7,
  worst: 33.4,
  width: 860,
  height: 860,
  level: 1,
  cap: 60,
  renderer: 'Apple GPU',
} as const;

describe('renderScale', () => {
  test('a phone board 430 px wide at a pixel ratio of 3 draws at ratio 2: 860 px, under the 2048 px cap', () => {
    assert.equal(renderScale(430, 3, 0), 2);
  });

  test('a desktop board 720 px wide on a retina screen draws at its full ratio 2', () => {
    assert.equal(renderScale(720, 2, 0), 2);
  });

  test('a board 1100 px wide on a retina screen is capped to 2048 device pixels', () => {
    assert.ok(Math.abs(1100 * renderScale(1100, 2, 0) - 2048) < 1e-9);
  });

  test('at the lowest quality the cap is 640 px: the phone board draws 640 device pixels wide', () => {
    assert.ok(Math.abs(430 * renderScale(430, 3, 3) - 640) < 1e-9);
  });

  test('a screen of ratio 1 draws at ratio 1, and a board of no width does not divide by zero', () => {
    assert.deepEqual([renderScale(400, 1, 0), renderScale(0, 2, 0)], [1, 2]);
  });

  test('whatever the board and screen, the drawing buffer is never wider than 2048 device pixels', () => {
    const css = fc.integer({ min: 1, max: 4000 });
    fc.assert(
      fc.property(css, fc.double({ min: 0.5, max: 4, noNaN: true }), (width, dpr) => {
        assert.ok(width * renderScale(width, dpr, 0) <= 2048 + 1e-9);
      }),
    );
  });
});

describe('detectCap', () => {
  test('steady frames at 33.3, 16.7 and 8.3 ms are a 30, 60 and 120 Hz cap', () => {
    assert.deepEqual([detectCap(AT_30), detectCap(AT_60), detectCap(AT_120)], [30, 60, 120]);
  });

  test('frames that miss, or are steady between caps, are no cap', () => {
    assert.deepEqual(
      [detectCap(JANKY), detectCap(SLOW), detectCap([])],
      [undefined, undefined, undefined],
    );
  });

  test('nine frames in ten on the cap are enough for a cap, with a little jitter', () => {
    assert.deepEqual(
      [detectCap([...repeated([16.7], 9), 30]), detectCap([16.2, 17.1, 16.7, 16.6, 16.9])],
      [60, 60],
    );
  });
});

describe('holdCap', () => {
  test('a cap once seen holds while three frames in four still sit on it', () => {
    assert.equal(holdCap(60, [...repeated([16.7], 8), 25, 30]), 60);
  });

  test('without a cap yet, or when frames leave it, the cap is what the frames show', () => {
    assert.deepEqual(
      [holdCap(undefined, AT_60), holdCap(60, JANKY), holdCap(60, AT_30)],
      [60, undefined, 30],
    );
  });
});

describe('frameLead', () => {
  test('one frame ahead is the usual frame time: 1000/60 ms when nothing is known yet', () => {
    assert.ok(Math.abs(frameLead([]) - 1000 / 60) < 1e-9);
  });

  test('the median of recent frames, kept between a 144 Hz and a 30 Hz frame', () => {
    assert.equal(frameLead([8, 8.5, 9]), 8.5);
    assert.ok(Math.abs(frameLead([2, 3, 4]) - 1000 / 144) < 1e-9);
    assert.ok(Math.abs(frameLead([90, 95, 99]) - 1000 / 30) < 1e-9);
  });
});

describe('firstFrameShift', () => {
  test('an input whose first frame comes at once, or even stamped earlier, starts one frame back', () => {
    assert.deepEqual([firstFrameShift(1000, 1002, 16), firstFrameShift(1000, 996, 16)], [-14, -20]);
  });

  test('an input whose first frame comes a frame or more later already shows motion: no shift', () => {
    assert.deepEqual([firstFrameShift(1000, 1016, 16), firstFrameShift(1000, 1040, 16)], [0, 0]);
  });
});

describe('nextQuality', () => {
  test('a steady 30 fps is a system cap (Low Power Mode): lowering the quality would not help', () => {
    assert.deepEqual([nextQuality(0, AT_30), nextQuality(1, AT_30)], [0, 1]);
  });

  test('a steady 60 or 120 fps is on budget: the quality stays', () => {
    assert.deepEqual([nextQuality(0, AT_60), nextQuality(2, AT_120)], [0, 2]);
  });

  test('a fast screen missing some refreshes is still well above 50 fps: 108 on 144 Hz, 90 on 120 Hz stay', () => {
    assert.deepEqual([nextQuality(0, AT_108_ON_144), nextQuality(0, AT_90_ON_120)], [0, 0]);
  });

  test('45 fps on a 60 Hz screen (a third of the frames shown twice) steps down, never past the lowest', () => {
    assert.deepEqual(
      [nextQuality(0, JANKY), nextQuality(2, JANKY), nextQuality(3, JANKY)],
      [1, 3, 3],
    );
  });

  test('steady frames slower than 50 fps that are no cap step the quality down', () => {
    assert.equal(nextQuality(1, SLOW), 2);
  });

  test('exactly 50 fps (20 ms frames) between caps is just good enough', () => {
    assert.equal(nextQuality(0, repeated([20], 40)), 0);
  });

  test('30 frames are enough to judge, fewer are not', () => {
    assert.deepEqual(
      [nextQuality(0, JANKY.slice(0, 30)), nextQuality(0, JANKY.slice(0, 29))],
      [1, 0],
    );
  });
});

describe('sessionQuality', () => {
  test('a new device starts at full quality and counts its first visit', () => {
    assert.deepEqual(sessionQuality(undefined), { level: 0, store: { level: 0, visits: 1 } });
  });

  test('a known device starts where it was and counts the visit', () => {
    assert.deepEqual(
      [sessionQuality({ level: 2, visits: 1 }), sessionQuality({ level: 0, visits: 4 })],
      [
        { level: 2, store: { level: 2, visits: 2 } },
        { level: 0, store: { level: 0, visits: 5 } },
      ],
    );
  });

  test('every fifth visit tries one level better, and keeps it unless the frames step it down again', () => {
    assert.deepEqual(sessionQuality({ level: 2, visits: 4 }), {
      level: 1,
      store: { level: 1, visits: 0 },
    });
  });
});

describe('parseStoredQuality and storedQuality', () => {
  test('a stored level and visit count read back as they were written', () => {
    assert.deepEqual(
      [
        parseStoredQuality(storedQuality({ level: 2, visits: 3 })),
        storedQuality({ level: 1, visits: 0 }),
      ],
      [{ level: 2, visits: 3 }, '{"level":1,"visits":0}'],
    );
  });

  test('nothing stored, broken JSON, or a level or count out of range is nothing', () => {
    assert.deepEqual(
      [
        parseStoredQuality(null),
        parseStoredQuality('{'),
        parseStoredQuality('{"level":4,"visits":0}'),
        parseStoredQuality('{"level":"1","visits":0}'),
        parseStoredQuality('{"level":1,"visits":-1}'),
      ],
      [undefined, undefined, undefined, undefined, undefined],
    );
  });
});

describe('recent', () => {
  test('the last second of frames is taken from the end until it adds up to 1000 ms', () => {
    assert.deepEqual(recent([500, 400, 300, 200, 100], 1000), [400, 300, 200, 100]);
  });

  test('fewer frames than a second are all kept', () => {
    assert.deepEqual(recent([100, 200], 1000), [100, 200]);
  });
});

describe('frameStats', () => {
  test('four frames of 10, 20, 20 and 50 ms are 40 fps, a median of 20 ms and a worst of 50', () => {
    assert.deepEqual(frameStats([10, 20, 20, 50]), { fps: 40, median: 20, worst: 50 });
  });

  test('the median comes from the frames in order of length, whatever order they came in', () => {
    assert.deepEqual(frameStats([50, 20, 10, 20]), { fps: 40, median: 20, worst: 50 });
  });

  test('no frames are no rate', () => {
    assert.deepEqual(frameStats([]), { fps: 0, median: 0, worst: 0 });
  });
});

describe('fpsWanted', () => {
  test('the readout is wanted with ?fps in the address, alone or among other parameters', () => {
    assert.deepEqual(
      [
        fpsWanted('?fps'),
        fpsWanted('?a=1&fps'),
        fpsWanted('?fps=1'),
        fpsWanted(''),
        fpsWanted('?fpsx'),
      ],
      [true, true, true, false, false],
    );
  });
});

describe('fpsLines', () => {
  test('the readout says the rate, frame times, buffer, quality, cap and renderer', () => {
    assert.deepEqual(fpsLines(READOUT), [
      '60 fps (drawing every frame)',
      'frame 16.7 ms, worst 33.4 ms',
      '860 x 860 px, quality 1',
      'capped at 60',
      'Apple GPU',
    ]);
  });

  test('frames that hold no cap say so', () => {
    assert.equal(fpsLines({ ...READOUT, cap: undefined })[3], 'no cap');
  });
});
