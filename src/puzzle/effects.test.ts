import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import fc from 'fast-check';
import { grid } from '../test-support/grid.ts';
import { scriptedRng } from '../test-support/scripted-rng.ts';
import {
  createDust,
  dustAt,
  dustOpacity,
  IMPACT_MS,
  nudgeDirection,
  SETTLE_MS,
  shakeAt,
  springAt,
  springEasing,
  squashAt,
  wiggleAt,
} from './effects.ts';

// Known answers: the damped spring 1 - e^(-zwt) (cos(w_d t) + zw/w_d sin(w_d t)) with z = 0.7 and
// w = 0.033 rad/ms, and the other curves from their doc comments, run as one-off scripts outside
// this code base (node -e).

describe('springAt', () => {
  test('a spring slide has not started at or before 0 ms and is exactly there from 300 ms on', () => {
    assert.deepEqual(
      [springAt(-20), springAt(0), springAt(SETTLE_MS), springAt(1000)],
      [0, 0, 1, 1],
    );
  });

  test('50 ms in a slide is 59% of the way, and it reaches its cell at about 100 ms: the landing', () => {
    assert.deepEqual([springAt(50), springAt(IMPACT_MS)], [0.5941631645525889, 1.0014562863767889]);
  });

  test('the spring overshoots by 4.6% at 133 ms, then swings back below 1 before it settles', () => {
    assert.deepEqual(
      [springAt(133), springAt(200), springAt(299)],
      [1.0459855490676904, 1.0096482700521556, 0.9985986249682282],
    );
  });

  test('whatever the time, a slide never goes back past its start nor more than 5% past its cell', () => {
    fc.assert(
      fc.property(fc.double({ min: -1e4, max: 1e4, noNaN: true }), (t) => {
        assert.ok(springAt(t) >= 0);
        assert.ok(springAt(t) <= 1.05);
      }),
    );
  });
});

describe('springEasing', () => {
  test('the CSS easing samples the spring in equal steps, overshoot included, ending at exactly 1', () => {
    assert.equal(springEasing(6), 'linear(0, 0.594, 1.001, 1.041, 1.01, 0.998, 1)');
  });
});

describe('squashAt', () => {
  test('a cube is not squashed before it lands nor after 180 ms of landing', () => {
    assert.deepEqual(
      [squashAt(50), squashAt(IMPACT_MS), squashAt(280), squashAt(400)],
      [0, 0, 0, 0],
    );
  });

  test('a landed cube squashes by a tenth, stretches back by 3.5%, and settles', () => {
    assert.deepEqual(
      [squashAt(130), squashAt(190), squashAt(250)],
      [0.09722222222222224, -0.035, 0.0038888888888888875],
    );
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

  test('10 ms after a kick the camera is thrown out, and halfway it swings at a quarter of the strength', () => {
    assert.deepEqual(
      [shakeAt(10, 0.01), shakeAt(130, 0.01)],
      [
        { x: 0.008908637069315764, y: 0.007242297611200844 },
        { x: -0.0023228100318359243, y: -0.0019049589597975834 },
      ],
    );
  });

  test('a stronger kick shakes in proportion, and no kick does not shake', () => {
    assert.deepEqual([shakeAt(10, 0.02).x, shakeAt(10, 0).x], [0.017817274138631527, 0]);
  });
});

describe('createDust', () => {
  test('a mote drawn from middle values starts mid-edge and drifts straight ahead at mid speed', () => {
    const [mote] = createDust(scriptedRng([0.5, 0.5, 0.5, 0.5, 0.5]), 1);

    assert.deepEqual(mote, {
      along: 0,
      ahead: 0.09,
      drift: 0,
      rise: 0.1,
      size: 0.8999999999999999,
    });
  });

  test('the lowest draws make a slow small mote at one end, drifting the other way', () => {
    const [mote] = createDust(scriptedRng([0, 0, 0, 0, 0]), 1);

    assert.deepEqual(mote, { along: -0.5, ahead: 0.04, drift: -0.06, rise: 0.05, size: 0.6 });
  });
});

describe('dustAt', () => {
  const MOTE = { along: 0.2, ahead: 1, drift: 0.5, rise: 2, size: 1 };

  test('one time constant (160 ms) in, a mote has gone 63% of its 0.16 s of travel and grown', () => {
    assert.deepEqual(dustAt(MOTE, 160), {
      across: 0.05056964470628461,
      ahead: 0.10113928941256922,
      z: 0.20227857882513844,
      scale: 0.8076923076923077,
    });
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
  test('a puff fades in over 60 ms, is at a quarter halfway, and is gone at 520 ms', () => {
    assert.deepEqual(
      [dustOpacity(0), dustOpacity(30), dustOpacity(260), dustOpacity(520)],
      [0, 0.44397189349112426, 0.25, 0],
    );
  });
});

describe('wiggleAt', () => {
  test('a blocked cube lurches and turns at once, and is exactly still from 380 ms on', () => {
    assert.deepEqual(
      [wiggleAt(95 / 3), wiggleAt(380), wiggleAt(-1)],
      [
        { push: 0.00873242282149309, turn: 0.042013888888888885 },
        { push: 0, turn: 0 },
        { push: 0, turn: 0 },
      ],
    );
  });

  test('an eighth of the way in the cube is pushed furthest toward the gap', () => {
    assert.deepEqual(wiggleAt(47.5), { push: 0.0091875, turn: 0.027068931467297525 });
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
