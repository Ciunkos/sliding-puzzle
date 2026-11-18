import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import fc from 'fast-check';
import { grid } from '../test-support/grid.ts';
import { scriptedRng } from '../test-support/scripted-rng.ts';
import { celebrationSeed, CONFETTI_COLOURS, confettiAt, createConfetti } from './confetti.ts';

/** Draws for one piece: angle, speed, height, spin, colour, size. */
const HALF_DRAWS = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5];

const SOLVED_3 = grid`
  1 2 3
  4 5 6
  7 8 _
`;

describe('createConfetti', () => {
  test('a piece drawn from middle values flies straight left, mid speed, in the middle colour', () => {
    const [piece] = createConfetti(scriptedRng(HALF_DRAWS), 1);

    assert.deepEqual(piece, {
      angle: 3.141592653589793,
      speed: 0.9,
      rise: 1.6,
      spin: 0,
      colour: 3,
      scale: 0.75,
    });
  });

  test('the highest spin draw spins a piece 10 radians a second, the lowest draws are slowest and smallest', () => {
    const [piece] = createConfetti(scriptedRng([0, 0, 0, 1, 0, 0]), 1);

    assert.deepEqual(piece, { angle: 0, speed: 0.4, rise: 1, spin: 10, colour: 0, scale: 0.5 });
  });

  test('the same random draws always make the same burst', () => {
    const draws = fc.array(fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true }), {
      minLength: 60,
      maxLength: 60,
    });
    fc.assert(
      fc.property(draws, (values) => {
        assert.deepEqual(
          createConfetti(scriptedRng(values), 10),
          createConfetti(scriptedRng(values), 10),
        );
      }),
    );
  });

  test('any draw picks one of the colours of the palette', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true }), (draw) => {
        const [piece] = createConfetti(scriptedRng([0, 0, 0, 0, draw, 0]), 1);
        assert.ok(piece);
        assert.ok(Number.isInteger(piece.colour));
        assert.notEqual(CONFETTI_COLOURS[piece.colour], undefined);
      }),
    );
  });
});

describe('confettiAt', () => {
  const PIECE = { angle: 0, speed: 1, rise: 2, spin: 3, colour: 0, scale: 1 };

  test('at the start every piece is at the centre of the board, full size', () => {
    assert.deepEqual(confettiAt(PIECE, 0), { x: 0, y: 0, z: 0.05, turn: 0, scale: 1 });
  });

  test('half a second in a piece has flown out, risen and fallen back, still visible', () => {
    assert.deepEqual(confettiAt(PIECE, 500), {
      x: 0.5,
      y: 0,
      // 0.05 + 2 * 0.5 - 4.5 / 2 * 0.25, in floating point
      z: 0.48750000000000004,
      turn: 1.5,
      scale: 1,
    });
  });

  test('a faster piece flies further, and pieces shrink over the last half second', () => {
    const fast = { ...PIECE, speed: 2 };
    const upwards = { ...PIECE, angle: Math.PI / 2, speed: 2 };

    assert.deepEqual(
      [confettiAt(fast, 500).x, confettiAt(upwards, 500).y, confettiAt(PIECE, 1250).scale],
      [1, 1, 0.5],
    );
  });

  test('when the celebration ends the pieces have shrunk away', () => {
    assert.deepEqual(confettiAt(PIECE, 1500).scale, 0);
  });
});

// Known answers: 32-bit FNV-1a over the cells and then the moves, from its published definition,
// run as a one-off script outside this code base (node -e).
describe('celebrationSeed', () => {
  test('the seed is the FNV-1a hash of the board and the number of moves', () => {
    assert.deepEqual(
      [celebrationSeed(SOLVED_3, 12), celebrationSeed(SOLVED_3, 13)],
      [1145155873, 1128378254],
    );
  });
});
