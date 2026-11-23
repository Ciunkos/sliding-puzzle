import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import fc from 'fast-check';
import { grid } from '../test-support/grid.ts';
import { scriptedRng } from '../test-support/scripted-rng.ts';
import {
  createDust,
  dustAt,
  dustOpacity,
  edgeFade,
  IMPACT_MS,
  nudgeDirection,
  SETTLE_MS,
  shakeAt,
  springAt,
  springEasing,
  squashAt,
  wiggleAt,
} from './effects.ts';

// Worked by hand from the formulas in effects.ts.
// The spring, 1 - e^(-z w t) (cos(w_d t) + z w / w_d sin(w_d t)) with z = 0.7, w = 0.033 rad/ms:
// w_d = 0.02357 rad/ms, so it crosses 1 at (pi - atan(1 / 0.98)) / w_d = 99.5 ms (the landing),
// peaks at pi / w_d = 133.3 ms, 4.6% past (e^-3.0795), and at 50 ms has gone 0.594 of the way.
const OVERSHOOT = 1.046;
/** Hand-worked values are good to about this much. */
const CLOSE = 0.002;
const TIME = fc.double({ min: -1000, max: 2000, noNaN: true });
const STRENGTH = fc.double({ min: 0, max: 1, noNaN: true });

describe('springAt', () => {
  test('in its first instants the spring never falls back: 3.41e-13 ms in is not past 5.68e-13 ms', () => {
    // The times of the counterexample fast-check found for the slide in scene-model.test.ts
    // (5.1e-13 and 2.8e-13 ms after a start at 1000 ms, as the subtraction leaves them).
    assert.ok(springAt(3.410605131648481e-13) <= springAt(5.684341886080801e-13));
  });

  test('a microsecond in, the spring has gone omega squared t squared over 2, to 1e-9', () => {
    // 0.033^2 * 0.001^2 / 2 = 5.445e-10; the next term, -zeta omega^3 t^3 / 3, is 1e-14 of it.
    assert.ok(Math.abs(springAt(0.001) - 5.445e-10) < 5.445e-10 * 1e-4);
  });

  test('a spring slide has not started at or before 0 ms and is exactly there from 300 ms on', () => {
    assert.deepEqual(
      [springAt(-20), springAt(0), springAt(SETTLE_MS), springAt(1000)],
      [0, 0, 1, 1],
    );
  });

  test('50 ms in a slide is 59% of the way, it lands at about 100 ms, and peaks 4.6% past at 133 ms', () => {
    assert.ok(Math.abs(springAt(50) - 0.594) <= CLOSE);
    assert.ok(Math.abs(springAt(IMPACT_MS) - 1) <= CLOSE);
    assert.ok(Math.abs(springAt(133.3) - OVERSHOOT) <= CLOSE);
  });

  test('until its peak the spring only moves forward', () => {
    const time = fc.double({ min: 0, max: 133, noNaN: true });
    fc.assert(
      fc.property(time, time, (a, b) => {
        // Near 0 ms the spring is 1 minus a decay times a sway that are both almost exactly 1:
        // the subtraction cancels to about 1e-16 of rounding noise. Forward within 1e-12.
        assert.ok(springAt(Math.min(a, b)) <= springAt(Math.max(a, b)) + 1e-12);
      }),
    );
  });

  test('once landed the spring stays within its overshoot: never back below 99.5% nor past 4.6%', () => {
    fc.assert(
      fc.property(fc.double({ min: IMPACT_MS, max: 1000, noNaN: true }), (t) => {
        assert.ok(springAt(t) >= 0.995);
        assert.ok(springAt(t) <= OVERSHOOT + CLOSE);
      }),
    );
  });
});

describe('springEasing', () => {
  test('the CSS easing of 6 steps has 7 points, from 0 to exactly 1', () => {
    const easing = springEasing(6);

    assert.ok(easing.startsWith('linear(0, '));
    assert.ok(easing.endsWith(', 1)'));
    assert.equal(easing.split(', ').length, 7);
  });

  test('its points are the spring rounded to thousandths: 50 ms is 0.594, the 150 ms point is past 1', () => {
    const points = Array.from(springEasing(6).slice('linear('.length, -1).split(', '), Number);

    assert.equal(points[1], 0.594);
    assert.ok(Math.max(...points) > 1);
    assert.ok(Math.max(...points) <= OVERSHOOT);
  });
});

describe('squashAt', () => {
  test('a cube is not squashed before it lands nor from 180 ms after landing on', () => {
    assert.deepEqual(
      [squashAt(50), squashAt(IMPACT_MS), squashAt(IMPACT_MS + 180), squashAt(400)],
      [0, 0, 0, 0],
    );
  });

  test('a sixth into the squash a cube is pressed by 0.14 x (5/6)^2, and halfway it stretches by 0.14 / 4', () => {
    // At k = 1/6, sin(3 pi k) = 1: 0.14 x 25/36 = 0.0972. At k = 1/2, sin = -1: -0.14 x 1/4.
    assert.ok(Math.abs(squashAt(IMPACT_MS + 30) - 0.0972) <= 0.0001);
    assert.ok(Math.abs(squashAt(IMPACT_MS + 90) + 0.035) <= 1e-12);
  });
});

describe('shakeAt', () => {
  test('the camera is still before a kick and exactly still again from 260 ms on', () => {
    assert.deepEqual(
      [shakeAt(-1, 0.01), shakeAt(0, 0.01), shakeAt(260, 0.01), shakeAt(999, 0.01)],
      [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ],
    );
  });

  test('a kick never throws the camera further than its strength', () => {
    fc.assert(
      fc.property(TIME, STRENGTH, (t, strength) => {
        const at = shakeAt(t, strength);
        assert.ok(Math.max(Math.abs(at.x), Math.abs(at.y)) <= strength);
      }),
    );
  });

  test('from halfway (130 ms) on, a kick has died down to a quarter of its strength: (1 - 1/2)^2', () => {
    fc.assert(
      fc.property(fc.double({ min: 130, max: 2000, noNaN: true }), STRENGTH, (t, strength) => {
        const at = shakeAt(t, strength);
        assert.ok(Math.max(Math.abs(at.x), Math.abs(at.y)) <= strength / 4);
      }),
    );
  });

  test('a kick twice as strong shakes twice as far', () => {
    fc.assert(
      fc.property(TIME, STRENGTH, (t, strength) => {
        assert.ok(Math.abs(shakeAt(t, strength * 2).x - shakeAt(t, strength).x * 2) <= 1e-12);
      }),
    );
  });

  test('just after a kick the camera is already moving', () => {
    assert.ok(shakeAt(10, 0.01).x > 0);
  });
});

describe('createDust', () => {
  test('a mote drawn from middle values starts mid-edge and drifts neither way', () => {
    const [mote] = createDust(scriptedRng([0.5, 0.5, 0.5, 0.5, 0.5]), 1);

    assert.ok(mote);
    assert.deepEqual([mote.along, mote.drift], [0, 0]);
  });

  test('the lowest draws make a slow small mote at one end, drifting the other way', () => {
    const [mote] = createDust(scriptedRng([0, 0, 0, 0, 0]), 1);

    assert.deepEqual(mote, { along: -0.5, ahead: 0.04, drift: -0.06, rise: 0.05, size: 0.6 });
  });

  test('the highest draws make a fast big mote at the other end, drifting this way', () => {
    const [mote] = createDust(scriptedRng([1, 1, 1, 1, 1]), 1);

    assert.ok(mote);
    assert.deepEqual([mote.along, mote.drift, mote.size], [0.5, 0.06, 1.2]);
  });
});

describe('dustAt', () => {
  const MOTE = { along: 0.2, ahead: 1, drift: 0.5, rise: 2, size: 1 };

  test('one time constant (160 ms) in, a mote has gone 0.16 s x (1 - 1/e) = 0.101 at each speed', () => {
    const at = dustAt(MOTE, 160);

    assert.ok(Math.abs(at.ahead - 0.1011) <= 0.0001);
    assert.ok(at.across === at.ahead / 2);
    assert.ok(at.z === at.ahead * 2);
  });

  test('a mote grows from half its size: at 160 ms of 520 it is 0.5 + 160/520 = 0.808 of it', () => {
    assert.ok(Math.abs(dustAt(MOTE, 160).scale - 0.8077) <= 0.0001);
  });

  test('a mote is not there before its landing nor once the puff is over', () => {
    assert.deepEqual(
      [dustAt(MOTE, 0), dustAt(MOTE, 520)],
      [
        { across: 0, ahead: 0, z: 0, scale: 0 },
        { across: 0, ahead: 0, z: 0, scale: 0 },
      ],
    );
  });
});

describe('dustOpacity', () => {
  test('a puff is not there at its landing, is at a quarter halfway, and is gone at 520 ms', () => {
    assert.deepEqual([dustOpacity(0), dustOpacity(260), dustOpacity(520)], [0, 0.25, 0]);
  });

  test('a puff fades in over 60 ms: at 30 ms half of (1 - 30/520)^2, at 60 ms all of (23/26)^2', () => {
    assert.ok(Math.abs(dustOpacity(30) - 0.444) <= 0.001);
    assert.ok(Math.abs(dustOpacity(60) - 0.7825) <= 0.0001);
  });
});

describe('edgeFade', () => {
  test('a mote well inside the drawing is its full size, at or past its edge it is gone', () => {
    assert.deepEqual([edgeFade(0.5, 0.66), edgeFade(0.66, 0.66), edgeFade(0.7, 0.66)], [1, 0, 0]);
  });

  test('halfway through the last 0.05 before the edge a mote is half its size', () => {
    assert.ok(Math.abs(edgeFade(0.625, 0.65) - 0.5) < 1e-9);
  });
});

describe('wiggleAt', () => {
  test('a blocked cube is exactly still before it is tapped and from 380 ms on', () => {
    assert.deepEqual(
      [wiggleAt(-1), wiggleAt(0), wiggleAt(380), wiggleAt(999)],
      [
        { push: 0, turn: 0 },
        { push: 0, turn: 0 },
        { push: 0, turn: 0 },
        { push: 0, turn: 0 },
      ],
    );
  });

  test('an eighth of the way in, the cube is pushed furthest toward the gap: 0.012 x (7/8)^2', () => {
    assert.ok(Math.abs(wiggleAt(47.5).push - 0.0091875) <= 1e-12);
    assert.ok(wiggleAt(47.5).turn > 0);
  });

  test('a wiggle never pushes further than 0.012 nor turns further than 0.05 radians', () => {
    fc.assert(
      fc.property(TIME, (t) => {
        assert.ok(Math.abs(wiggleAt(t).push) <= 0.012);
        assert.ok(Math.abs(wiggleAt(t).turn) <= 0.05);
      }),
    );
  });
});

describe('nudgeDirection', () => {
  const BOARD = grid`
    1 2 3
    4 _ 5
    6 7 8
  `;

  test('a corner cube with the gap one step right and one down tries to go right first', () => {
    assert.deepEqual(nudgeDirection(BOARD, 1, 3), { x: 1, y: 0 });
  });

  test('a cube two rows below the gap tries to go up, and one left of it tries to go right', () => {
    const far = grid`
      1 _ 3
      4 2 5
      6 7 8
    `;

    assert.deepEqual(
      [nudgeDirection(far, 7, 3), nudgeDirection(BOARD, 4, 3), nudgeDirection(BOARD, 5, 3)],
      [
        { x: 0, y: 1 },
        { x: 1, y: 0 },
        { x: -1, y: 0 },
      ],
    );
  });

  test('a cube in the row above the gap tries to go down, and the gap or a missing tile goes nowhere', () => {
    assert.deepEqual(
      [nudgeDirection(BOARD, 2, 3), nudgeDirection(BOARD, 0, 3), nudgeDirection(BOARD, 9, 3)],
      [
        { x: 0, y: -1 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ],
    );
  });
});
