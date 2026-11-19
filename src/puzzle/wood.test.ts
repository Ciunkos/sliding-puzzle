import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import fc from 'fast-check';
import {
  contrastRatio,
  DARK_WOOD,
  fbmAt,
  grainWindow,
  latticeAt,
  LIGHT_WOOD,
  noiseAt,
  normalColour,
  rgbCss,
  ringProfile,
  roughnessAt,
  smoothstep,
  woodAt,
  woodColour,
  windowTransform,
} from './wood.ts';

// Known answers: the hash, noise and plank formulas from their doc comments, run as one-off
// scripts outside this code base (node -e).

/** A plain species for colour and gloss: early (100, 10, 0), late (200, 41, 0). */
const PLAIN = {
  early: [100, 10, 0],
  late: [200, 41, 0],
  rings: 10,
  warp: 0,
  fibre: 0,
  roughness: 0.6,
} as const;
const WHITE = [255, 255, 255] as const;
const BLACK = [0, 0, 0] as const;
const unit = fc.double({ min: 0, max: 1, noNaN: true });
const coordinate = fc.double({ min: -1000, max: 1000, noNaN: true });

describe('latticeAt', () => {
  test('lattice points hash to their known values, and seed 0 at the origin hashes to 0', () => {
    assert.deepEqual(
      [latticeAt(0, 0, 0), latticeAt(1, 0, 0), latticeAt(1, 1, 1), latticeAt(7, 3, -2)],
      [0, 0.22772923135198653, 0.3774544163607061, 0.24221124313771725],
    );
  });

  test('every lattice hash is in 0..1', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), fc.integer(), (seed, x, y) => {
        assert.ok(latticeAt(seed, x, y) >= 0);
        assert.ok(latticeAt(seed, x, y) < 1);
      }),
    );
  });
});

describe('smoothstep', () => {
  test('it is 0 below its first edge, 1 past its second, and a half halfway between them', () => {
    assert.deepEqual(
      [
        smoothstep(0.5, 0.94, 0.2),
        smoothstep(0.5, 0.94, 0.72),
        smoothstep(0.5, 0.94, 3),
        smoothstep(0, 1, 0.25),
      ],
      [0, 0.5, 1, 0.15625],
    );
  });
});

describe('noiseAt', () => {
  test('on a lattice point noise is the hash there, and in the middle of a cell the mean of its corners', () => {
    // Corners of cell (0, 0) for seed 1: 0.2277..., 0.9722..., 0.7495..., 0.3774...
    assert.deepEqual(
      [noiseAt(1, 0, 0), noiseAt(1, 1, 1), noiseAt(1, 0.5, 0.5)],
      [0.22772923135198653, 0.3774544163607061, 0.5817389114527032],
    );
  });

  test('noise anywhere stays in 0..1', () => {
    fc.assert(
      fc.property(fc.integer(), coordinate, coordinate, (seed, x, y) => {
        assert.ok(noiseAt(seed, x, y) >= 0);
        assert.ok(noiseAt(seed, x, y) < 1);
      }),
    );
  });
});

describe('fbmAt', () => {
  test('two octaves blend two thirds of the coarse noise with a third of the fine', () => {
    assert.equal(fbmAt(1, 0.25, 0.75), 0.5952593759599646);
  });
});

describe('ringProfile', () => {
  test('early wood is light, the wood darkens toward the end of the ring, then the next ring starts light', () => {
    assert.deepEqual(
      [ringProfile(0), ringProfile(0.3), ringProfile(0.72), ringProfile(0.95), ringProfile(1)],
      [0, 0, 0.5, 1, 0],
    );
  });
});

describe('woodAt', () => {
  test('a plank grows the same wood at the same point every time, and another seed grows other wood', () => {
    assert.deepEqual(
      [woodAt(LIGHT_WOOD.tile, 1907, 0.3, 0.6), woodAt(LIGHT_WOOD.tile, 1908, 0.3, 0.6)],
      [
        { tone: 0.3223589320614264, height: 0.4172308497074071 },
        { tone: 0.6023959233646765, height: 0.6483494398194647 },
      ],
    );
  });

  test('another point of the same plank is lighter early wood', () => {
    assert.deepEqual(woodAt(LIGHT_WOOD.tile, 1907, 0.71, 0.13), {
      tone: 0.05041729635834389,
      height: 0.2601687393156522,
    });
  });

  test('anywhere on any plank the tone stays in 0..1', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1e6 }), unit, unit, (seed, x, y) => {
        const { tone } = woodAt(DARK_WOOD.tile, seed, x, y);
        assert.ok(tone >= 0);
        assert.ok(tone <= 1);
      }),
    );
  });
});

describe('woodColour', () => {
  test('tone 0 is the early colour, 1 the late one, and a half is between them, rounded', () => {
    assert.deepEqual(
      [woodColour(PLAIN, 0), woodColour(PLAIN, 1), woodColour(PLAIN, 0.5)],
      [
        [100, 10, 0],
        [200, 41, 0],
        [150, 26, 0],
      ],
    );
  });
});

describe('roughnessAt', () => {
  test('early wood has the species roughness and late wood is 0.18 glossier, as greys out of 255', () => {
    assert.deepEqual([roughnessAt(PLAIN, 0), roughnessAt(PLAIN, 1)], [153, 107]);
  });

  test('roughness stays within the map: never above white nor below black', () => {
    const rough = { ...PLAIN, roughness: 1.2 };
    const glossy = { ...PLAIN, roughness: 0.1 };

    assert.deepEqual([roughnessAt(rough, 0), roughnessAt(glossy, 1)], [255, 0]);
  });
});

describe('normalColour', () => {
  test('a flat surface faces straight out, and a slope tilts the normal away from where it rises', () => {
    assert.deepEqual(
      [normalColour(0, 0, 3), normalColour(1, 0, 1), normalColour(0, -1, 1), normalColour(1, 1, 2)],
      [
        [128, 128, 255],
        [37, 128, 218],
        [128, 218, 218],
        [43, 43, 170],
      ],
    );
  });
});

describe('grainWindow', () => {
  test('two different cubes of a board are cut from different places of the plank', () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.integer({ min: 1, max: 35 }),
        fc.integer({ min: 1, max: 35 }),
        (seed, a, b) => {
          fc.pre(a !== b);
          assert.notDeepEqual(grainWindow(seed, a, 0.42), grainWindow(seed, b, 0.42));
        },
      ),
    );
  });

  test('a window always stays on the plank', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: 1, max: 35 }), unit, (seed, tile, share) => {
        const win = grainWindow(seed, tile, share);
        assert.ok(Math.min(win.x, win.y) >= 0);
        assert.ok(Math.max(win.x, win.y) + share <= 1);
      }),
    );
  });

  test('a cube is never more than 10% darker nor 6% lighter than the plank', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: 1, max: 35 }), (seed, tile) => {
        const { shade } = grainWindow(seed, tile, 0.42);
        assert.ok(shade >= 0.9);
        assert.ok(shade < 1.06);
      }),
    );
  });

  test('cubes lie different ways: mirrored or not, upended or not', () => {
    const first = grainWindow(1907, 1, 0.42);
    const second = grainWindow(1907, 2, 0.42);
    const third = grainWindow(1907, 3, 0.42);

    assert.deepEqual(
      [first.flip, first.upend, second.flip, second.upend, third.flip, third.upend],
      [true, false, true, true, false, true],
    );
  });
});

describe('windowTransform', () => {
  const WIN = { x: 0.1, y: 0.2, flip: false, upend: false };

  test('a face that is the whole surface shows its window as it is, texture y growing up', () => {
    assert.deepEqual(windowTransform(WIN, 0.4, 1), {
      offset: { x: 0.1, y: 0.4 },
      repeat: { x: 0.4, y: 0.4 },
    });
  });

  test('around a face of 80% of the surface the grain carries on a margin of 0.05 each side', () => {
    assert.deepEqual(windowTransform(WIN, 0.4, 0.8), {
      offset: { x: 0.05000000000000002, y: 0.35000000000000003 },
      repeat: { x: 0.5, y: 0.5 },
    });
  });

  test('a mirrored, upended window runs backwards from its far corner', () => {
    assert.deepEqual(windowTransform({ ...WIN, flip: true, upend: true }, 0.4, 0.8), {
      offset: { x: 0.55, y: 0.8500000000000001 },
      repeat: { x: -0.5, y: -0.5 },
    });
  });
});

describe('contrastRatio', () => {
  test('black on white is 21 to 1 either way round, and a colour on itself is 1', () => {
    assert.deepEqual(
      [
        contrastRatio(BLACK, WHITE),
        contrastRatio(WHITE, BLACK),
        contrastRatio(PLAIN.early, PLAIN.early),
      ],
      [21, 21, 1],
    );
  });

  test('burned numbers on light maple read at AA contrast (4.5) on both its early and late wood', () => {
    assert.ok(contrastRatio(LIGHT_WOOD.ink, LIGHT_WOOD.tile.early) >= 4.5);
    assert.ok(contrastRatio(LIGHT_WOOD.ink, LIGHT_WOOD.tile.late) >= 4.5);
    assert.ok(contrastRatio(LIGHT_WOOD.inkWon, LIGHT_WOOD.tile.late) >= 4.5);
  });

  test('pale inlaid numbers on walnut read at AA contrast (4.5) on both its early and late wood', () => {
    assert.ok(contrastRatio(DARK_WOOD.ink, DARK_WOOD.tile.early) >= 4.5);
    assert.ok(contrastRatio(DARK_WOOD.ink, DARK_WOOD.tile.late) >= 4.5);
    assert.ok(contrastRatio(DARK_WOOD.inkWon, DARK_WOOD.tile.early) >= 4.5);
  });
});

describe('rgbCss', () => {
  test('a colour becomes CSS for a canvas, opaque unless told otherwise', () => {
    assert.deepEqual(
      [rgbCss([1, 2, 3]), rgbCss([1, 2, 3], 0.5)],
      ['rgb(1 2 3 / 1)', 'rgb(1 2 3 / 0.5)'],
    );
  });
});
