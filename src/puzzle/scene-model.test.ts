import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import fc from 'fast-check';
import {
  approach,
  badgeShown,
  cameraDistance,
  CANVAS_UNITS,
  cornerAt,
  glowAt,
  RIM_UNITS,
  cellCentre,
  celebrationLift,
  easeOut,
  MAX_TILT_DEG,
  orientationTilt,
  pointerTilt,
  slideAt,
  SLIDE_EASING,
  SLIDE_MS,
  tileUv,
  tiltChanged,
} from './scene-model.ts';

/** A board 400 px wide at (100, 50) on the page. */
const RECT = { left: 100, top: 50, width: 400, height: 400 };

describe('cellCentre', () => {
  test('a 4x4 board puts cell 0 top-left and cell 15 bottom-right of the unit square', () => {
    assert.deepEqual(
      [cellCentre(0, 4), cellCentre(15, 4)],
      [
        { x: -0.375, y: 0.375 },
        { x: 0.375, y: -0.375 },
      ],
    );
  });

  test('the middle cell of a 3x3 board is the centre and cell 23 of a 5x5 is bottom row, 4th column', () => {
    assert.deepEqual(
      [cellCentre(4, 3), cellCentre(23, 5)],
      [
        { x: 0, y: 0 },
        { x: 0.20000000000000007, y: -0.4 },
      ],
    );
  });
});

describe('easeOut', () => {
  test('eases out: half the time covers seven eighths of the way, and it stays in 0..1', () => {
    assert.deepEqual(
      [easeOut(-1), easeOut(0), easeOut(0.5), easeOut(1), easeOut(2)],
      [0, 0, 0.875, 1, 1],
    );
  });
});

// The spring, by hand: damping z = 0.7 and w = 0.033 rad/ms give a damped frequency
// w_d = w * sqrt(1 - z^2) = 0.02357 rad/ms. It peaks at pi / w_d = 133.3 ms, past its cell by
// e^(-z * pi / sqrt(1 - z^2)) = e^(-3.0795) = 4.6%. At 50 ms, 1 - e^(-1.155) * (cos 1.1785 +
// 0.98 * sin 1.1785) = 1 - 0.315 * 1.288 = 0.594 of the way.
const OVERSHOOT = 1.046;
/** Hand-worked values are good to about this much. */
const CLOSE = 0.002;

describe('SLIDE_MS and SLIDE_EASING', () => {
  test('the DOM board slides for the 300 ms of the spring, sampled in 30 steps from 0 to exactly 1', () => {
    assert.ok(SLIDE_EASING.startsWith('linear(0, '));
    assert.ok(SLIDE_EASING.endsWith(', 1)'));
    assert.deepEqual([SLIDE_MS, SLIDE_EASING.split(', ').length], [300, 31]);
  });

  test('the CSS easing overshoots like the spring: its largest point is 4.6% past the end', () => {
    const points = Array.from(SLIDE_EASING.slice('linear('.length, -1).split(', '), Number);

    assert.ok(Math.abs(Math.max(...points) - OVERSHOOT) <= CLOSE);
  });
});

describe('slideAt', () => {
  const FROM = { x: 0, y: 0 };
  const TO = { x: 0.25, y: 0 };
  const SLIDE = { from: FROM, to: TO, start: 1000 };

  test('50 ms in, halfway to its landing, a slide is 59% of the way and lifted at its highest', () => {
    const at = slideAt(SLIDE, 1050);

    assert.ok(Math.abs(at.x - 0.25 * 0.594) <= CLOSE * 0.25);
    assert.deepEqual([at.y, at.lift, at.done], [0, 0.01, false]);
  });

  test('a slide before its start has not moved and one 300 ms (SLIDE_MS) in is done, resting on the tray', () => {
    const before = slideAt(SLIDE, 990);
    const after = slideAt(SLIDE, 1000 + SLIDE_MS);

    assert.deepEqual(
      [before, after],
      [
        { x: 0, y: 0, lift: 0, done: false },
        { x: 0.25, y: 0, lift: 0, done: true },
      ],
    );
  });

  test('at its peak, 133 ms in, a landed slide is 4.6% of the way past its cell and rests on the tray', () => {
    const at = slideAt(SLIDE, 1133.3);

    assert.ok(Math.abs(at.x - 0.25 * OVERSHOOT) <= CLOSE * 0.25);
    assert.deepEqual([at.lift, at.done], [0, false]);
  });

  test('on the way to its landing a slide rises and comes down the same: its lift is symmetric', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 100, noNaN: true }), (t) => {
        const lift = slideAt(SLIDE, 1000 + t).lift - slideAt(SLIDE, 1100 - t).lift;
        assert.ok(Math.abs(lift) < 1e-12);
      }),
    );
  });

  test('a slide moves forward without ever falling back until its peak at 133 ms', () => {
    const time = fc.double({ min: 0, max: 133, noNaN: true });
    fc.assert(
      fc.property(time, time, (a, b) => {
        assert.ok(
          slideAt(SLIDE, 1000 + Math.min(a, b)).x <= slideAt(SLIDE, 1000 + Math.max(a, b)).x,
        );
      }),
    );
  });

  test('a tile sliding down half the board is, 50 ms in, 59% of the way down from y = 0.25', () => {
    const at = slideAt({ from: { x: 0.25, y: 0.25 }, to: { x: 0.25, y: -0.25 }, start: 0 }, 50);

    assert.ok(Math.abs(at.y - (0.25 - 0.5 * 0.594)) <= CLOSE * 0.5);
  });

  test('a tile sliding down a column never leaves it', () => {
    const down = { from: { x: 0.25, y: 0.25 }, to: { x: 0.25, y: -0.25 }, start: 0 };
    fc.assert(
      fc.property(fc.double({ min: -50, max: 400, noNaN: true }), (t) => {
        assert.equal(slideAt(down, t).x, 0.25);
      }),
    );
  });

  test('a slide given twice the time is, 100 ms in, where the usual one is at 50 ms: 59%, at its highest', () => {
    const at = slideAt(SLIDE, 1100, 600);

    assert.ok(Math.abs(at.x - 0.25 * 0.594) <= CLOSE * 0.25);
    assert.deepEqual([at.lift, at.done], [0.01, false]);
  });

  test('a slide of no duration (reduced motion) is done at once', () => {
    assert.deepEqual(slideAt(SLIDE, 1000, 0), { x: 0.25, y: 0, lift: 0, done: true });
  });
});

describe('badgeShown', () => {
  test('a picture tile shows its number badge when badges are on, and the missing corner never does', () => {
    assert.deepEqual(
      [
        badgeShown(15, 4, true),
        badgeShown(15, 4, false),
        badgeShown(16, 4, true),
        badgeShown(9, 3, true),
      ],
      [true, false, false, false],
    );
  });
});

describe('pointerTilt', () => {
  test('a pointer over the centre of the board leaves it flat', () => {
    assert.deepEqual(pointerTilt(300, 250, RECT), { x: 0, y: 0 });
  });

  test('a pointer at the right edge turns the board half the maximum toward it', () => {
    assert.deepEqual(pointerTilt(500, 250, RECT), { x: 0, y: 3 });
  });

  test('a pointer far below and to the left is clamped to the maximum along its direction', () => {
    assert.deepEqual(pointerTilt(-9700, 10_250, RECT), {
      x: 4.242640687119285,
      y: -4.242640687119285,
    });
  });

  test('wherever the pointer is, the tilt never exceeds the maximum', () => {
    const coordinate = fc.double({ min: -1e6, max: 1e6, noNaN: true });
    fc.assert(
      fc.property(coordinate, coordinate, (x, y) => {
        const tilt = pointerTilt(x, y, RECT);
        assert.ok(Math.hypot(tilt.x, tilt.y) <= MAX_TILT_DEG + 1e-9);
      }),
    );
  });
});

describe('orientationTilt', () => {
  test('the phone as it was when tilt was enabled leaves the board flat', () => {
    assert.deepEqual(orientationTilt({ beta: 40, gamma: -5 }, { beta: 40, gamma: -5 }), {
      x: 0,
      y: 0,
    });
  });

  test('tipping the phone 15 degrees to the right turns the board half the maximum', () => {
    assert.deepEqual(orientationTilt({ beta: 40, gamma: 10 }, { beta: 40, gamma: -5 }), {
      x: 0,
      y: 3,
    });
  });

  test('a phone that gave no reading when tilt was enabled stays flat', () => {
    assert.deepEqual(orientationTilt({ beta: 60, gamma: 20 }, { beta: null, gamma: null }), {
      x: 0,
      y: 0,
    });
  });

  test('a missing reading (no sensor) leaves the board flat', () => {
    assert.deepEqual(orientationTilt({ beta: null, gamma: null }, { beta: 40, gamma: 0 }), {
      x: 0,
      y: 0,
    });
  });

  test('any reading stays within the maximum tilt', () => {
    const angle = fc.double({ min: -180, max: 180, noNaN: true });
    fc.assert(
      fc.property(angle, angle, angle, angle, (beta, gamma, baseBeta, baseGamma) => {
        const tilt = orientationTilt({ beta, gamma }, { beta: baseBeta, gamma: baseGamma });
        assert.ok(Math.hypot(tilt.x, tilt.y) <= MAX_TILT_DEG + 1e-9);
      }),
    );
  });
});

describe('tiltChanged', () => {
  test('a change smaller than a quarter of a degree is sensor noise, a larger one is a change', () => {
    const still = { x: 1, y: 1 };

    assert.deepEqual(
      [
        tiltChanged(still, { x: 1.2, y: 0.9 }),
        tiltChanged(still, { x: 1.25, y: 1 }),
        tiltChanged(still, { x: 1.3, y: 1 }),
      ],
      [false, true, true],
    );
  });
});

describe('approach', () => {
  test('one time constant covers about 63% of the way', () => {
    assert.equal(approach(0, 10, 80, 80), 6.321205588285577);
  });

  test('a value within a hundredth of a degree of its target lands on it', () => {
    assert.equal(approach(4.995, 5, 1, 80), 5);
  });

  test('easing never overshoots its target', () => {
    const value = fc.double({ min: -10, max: 10, noNaN: true });
    fc.assert(
      fc.property(value, value, fc.double({ min: 0, max: 1000, noNaN: true }), (from, to, dt) => {
        const next = approach(from, to, dt, 80);
        assert.ok(Math.abs(to - next) <= Math.abs(to - from));
      }),
    );
  });
});

describe('celebrationLift', () => {
  test('the top-left tile pops first: at 200 ms it is at its highest, the bottom-right has not started', () => {
    assert.deepEqual([celebrationLift(0, 4, 200), celebrationLift(15, 4, 200)], [0.06, 0]);
  });

  test('a tile one diagonal step further in starts 60 ms later', () => {
    // Cell 5 of a 4x4 board is in row 1, column 1: two steps, so it peaks at 120 + 200 ms
    assert.deepEqual([celebrationLift(5, 4, 320), celebrationLift(5, 4, 120)], [0.06, 0]);
  });

  test('a quarter into its pop a tile is lifted 71% of the height, and it lands exactly at 400 ms', () => {
    assert.deepEqual(
      [celebrationLift(0, 4, 100), celebrationLift(0, 4, 400)],
      [0.04242640687119285, 0],
    );
  });

  test('after the celebration every tile rests on the tray again', () => {
    assert.deepEqual([celebrationLift(0, 4, 1500), celebrationLift(24, 5, 1500)], [0, 0]);
  });
});

describe('tileUv', () => {
  test('in a 4x4 picture tile 1 shows the top-left quarter-square and tile 16 the bottom-right', () => {
    // Texture coordinates grow upwards: the top row starts at v = 0.75
    assert.deepEqual(
      [tileUv(1, 4), tileUv(16, 4)],
      [
        { u: 0, v: 0.75, size: 0.25 },
        { u: 0.75, v: 0, size: 0.25 },
      ],
    );
  });

  test('in a 3x3 picture tile 5 shows the middle ninth', () => {
    assert.deepEqual(tileUv(5, 3), {
      u: 0.3333333333333333,
      v: 0.3333333333333333,
      size: 0.3333333333333333,
    });
  });
});

describe('cameraDistance', () => {
  test('a camera with a 90 degree view sees a canvas twice the board at the distance of the board width', () => {
    assert.equal(cameraDistance(600, 300, 90), 1.0000000000000002);
  });
});

describe('proportions of the scene', () => {
  test('a board 1000 px wide with a 25 px border has a rim of 25/950 and a canvas of 1070/950 grid widths', () => {
    assert.deepEqual([RIM_UNITS, CANVAS_UNITS], [0.026315789473684213, 1.1263157894736844]);
  });
});

describe('glowAt', () => {
  test('the glow rises to its peak halfway through 900 ms and is gone before and after', () => {
    assert.deepEqual(
      [glowAt(0), glowAt(225), glowAt(450), glowAt(900), glowAt(-5)],
      [0, 0.2474873734152916, 0.35, 0, 0],
    );
  });
});

describe('cornerAt', () => {
  test('the missing corner starts invisible above its place and ends in place, fully shown', () => {
    assert.deepEqual(
      [cornerAt(0), cornerAt(600)],
      [
        { opacity: 0, drop: 0.08 },
        { opacity: 1, drop: 0 },
      ],
    );
  });

  test('halfway through its 600 ms the corner is seven eighths there', () => {
    assert.deepEqual(cornerAt(300), { opacity: 0.875, drop: 0.01 });
  });
});
