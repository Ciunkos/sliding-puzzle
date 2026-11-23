import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import fc from 'fast-check';
import { grid } from '../test-support/grid.ts';
import {
  effectLength,
  effectRecipe,
  effectScale,
  gameSounds,
  MIX,
  SOUND_EFFECTS,
} from './sound-model.ts';

const START = '2026-01-01T00:00:00.000Z';
const LATER = '2026-01-01T00:05:00.000Z';
const OPEN = grid`
  1 2 3
  4 5 6
  7 _ 8
`;
const ONE_MOVE_ON = grid`
  1 2 3
  4 _ 6
  7 5 8
`;
const TWO_MOVES_ON = grid`
  1 2 3
  _ 4 6
  7 5 8
`;
const SOLVED = grid`
  1 2 3
  4 5 6
  7 8 _
`;

function game(board: readonly number[], moves: number, finished: boolean, startedAt: string) {
  return { state: { board }, moves, finished, startedAt };
}

const QUICK = { start: 0, attack: 0.002 };

/** The wooden clack of the first move: a band-passed click, a low thump and a falling body. */
const SLIDE_0 = {
  layers: [
    {
      kind: 'noise',
      filter: 'bandpass',
      frequency: 1900,
      q: 1.6,
      ...QUICK,
      decay: 0.04,
      gain: 0.45,
    },
    {
      kind: 'noise',
      filter: 'lowpass',
      frequency: 700,
      q: 0.7,
      ...QUICK,
      decay: 0.025,
      gain: 0.14,
    },
    {
      kind: 'tone',
      wave: 'sine',
      frequency: 240,
      endFrequency: 204,
      ...QUICK,
      decay: 0.09,
      gain: 0.3,
    },
    {
      kind: 'tone',
      wave: 'sine',
      frequency: 662,
      endFrequency: 662,
      ...QUICK,
      decay: 0.035,
      gain: 0.07,
    },
  ],
  duck: true,
  vibrate: [8],
};

const BODY_RING = { kind: 'tone', wave: 'sine', ...QUICK, decay: 0.09, gain: 0.3 };
const BODIES_1_TO_4 = [
  { ...BODY_RING, frequency: 226, endFrequency: 192.1 },
  { ...BODY_RING, frequency: 254, endFrequency: 215.9 },
  { ...BODY_RING, frequency: 232, endFrequency: 197.2 },
  { ...BODY_RING, frequency: 262, endFrequency: 222.7 },
];
const CLICK_1_OVERTONE_4 = [
  { kind: 'noise', filter: 'bandpass', frequency: 1750, q: 1.6, ...QUICK, decay: 0.04, gain: 0.45 },
  {
    kind: 'tone',
    wave: 'sine',
    frequency: 723,
    endFrequency: 723,
    ...QUICK,
    decay: 0.035,
    gain: 0.07,
  },
];

const BLOCKED = {
  layers: [
    {
      kind: 'noise',
      filter: 'lowpass',
      frequency: 420,
      q: 0.8,
      start: 0,
      attack: 0.003,
      decay: 0.05,
      gain: 0.14,
    },
    {
      kind: 'tone',
      wave: 'sine',
      frequency: 150,
      endFrequency: 128,
      start: 0,
      attack: 0.003,
      decay: 0.08,
      gain: 0.18,
    },
  ],
  duck: true,
  vibrate: [],
};

const RUN = { kind: 'tone', wave: 'triangle', attack: 0.004, decay: 0.9, gain: 0.15 };
const CHORD = { kind: 'tone', wave: 'sine', start: 0.62, attack: 0.01 };
const WIN = {
  layers: [
    { ...RUN, frequency: 587.33, endFrequency: 587.33, start: 0.1 },
    { ...RUN, frequency: 739.99, endFrequency: 739.99, start: 0.2 },
    { ...RUN, frequency: 880, endFrequency: 880, start: 0.3 },
    { ...RUN, frequency: 1174.66, endFrequency: 1174.66, start: 0.42 },
    { ...CHORD, frequency: 293.66, endFrequency: 293.66, decay: 1.6, gain: 0.12 },
    { ...CHORD, frequency: 587.33, endFrequency: 587.33, decay: 1.8, gain: 0.1 },
    { ...CHORD, frequency: 739.99, endFrequency: 739.99, decay: 1.8, gain: 0.09 },
    { ...CHORD, frequency: 880, endFrequency: 880, decay: 1.8, gain: 0.09 },
  ],
  duck: true,
  vibrate: [10, 60, 10],
};

const TICK = {
  kind: 'noise',
  filter: 'highpass',
  frequency: 3500,
  q: 0.7,
  ...QUICK,
  decay: 0.012,
  gain: 0.025,
};
const PRESS = {
  layers: [
    {
      kind: 'tone',
      wave: 'sine',
      frequency: 720,
      endFrequency: 480,
      ...QUICK,
      decay: 0.06,
      gain: 0.12,
    },
    TICK,
  ],
  duck: false,
  vibrate: [],
};
const MENU_OPEN = {
  layers: [
    {
      kind: 'tone',
      wave: 'sine',
      frequency: 520,
      endFrequency: 820,
      ...QUICK,
      decay: 0.06,
      gain: 0.11,
    },
    TICK,
  ],
  duck: false,
  vibrate: [],
};
const MENU_CLOSE = {
  layers: [
    {
      kind: 'tone',
      wave: 'sine',
      frequency: 820,
      endFrequency: 520,
      ...QUICK,
      decay: 0.06,
      gain: 0.11,
    },
    TICK,
  ],
  duck: false,
  vibrate: [],
};

const NOTE = { kind: 'tone', wave: 'sine', attack: 0.002, decay: 0.07, gain: 0.12 };
const TOGGLE_ON = {
  layers: [
    { ...NOTE, frequency: 660, endFrequency: 660, start: 0 },
    { ...NOTE, frequency: 990, endFrequency: 990, start: 0.06 },
  ],
  duck: false,
  vibrate: [],
};
const TOGGLE_OFF = {
  layers: [
    { ...NOTE, frequency: 990, endFrequency: 990, start: 0 },
    { ...NOTE, frequency: 660, endFrequency: 660, start: 0.06 },
  ],
  duck: false,
  vibrate: [],
};

const CLICK = { kind: 'noise', filter: 'bandpass', q: 1.4, attack: 0.002, decay: 0.03, gain: 0.14 };
const BODY = { kind: 'tone', wave: 'sine', attack: 0.002, decay: 0.06, gain: 0.1 };
const SHUFFLE = {
  layers: [
    { ...CLICK, frequency: 1600, start: 0 },
    { ...BODY, frequency: 200, endFrequency: 170, start: 0 },
    { ...CLICK, frequency: 2100, start: 0.055 },
    { ...BODY, frequency: 230, endFrequency: 195.5, start: 0.055 },
    { ...CLICK, frequency: 1800, start: 0.11 },
    { ...BODY, frequency: 210, endFrequency: 178.5, start: 0.11 },
    { ...CLICK, frequency: 2300, start: 0.17 },
    { ...BODY, frequency: 250, endFrequency: 212.5, start: 0.17 },
  ],
  duck: true,
  vibrate: [],
};

const effects = fc.constantFrom(...SOUND_EFFECTS);
const variations = fc.integer({ min: -10_000, max: 10_000 });

describe('gameSounds', () => {
  test('the first game shown (a page load) makes no sound', () => {
    assert.deepEqual(gameSounds(undefined, game(OPEN, 3, false, START)), []);
  });

  test('one tile sliding makes a slide varied by the new move count', () => {
    const cues = gameSounds(game(OPEN, 3, false, START), game(ONE_MOVE_ON, 4, false, START));

    assert.deepEqual(cues, [{ effect: 'slide', variation: 4 }]);
  });

  test('the slide that solves the puzzle is followed by the win', () => {
    const cues = gameSounds(game(OPEN, 9, false, START), game(SOLVED, 10, true, START));

    assert.deepEqual(cues, [
      { effect: 'slide', variation: 10 },
      { effect: 'win', variation: 10 },
    ]);
  });

  test('a new game or a reset (a new start time) shuffles', () => {
    const cues = gameSounds(game(SOLVED, 10, true, START), game(OPEN, 0, false, LATER));

    assert.deepEqual(cues, [{ effect: 'shuffle', variation: 0 }]);
  });

  test('a jump of several moves (the server catching up) is silent', () => {
    const cues = gameSounds(game(OPEN, 3, false, START), game(TWO_MOVES_ON, 5, false, START));

    assert.deepEqual(cues, []);
  });

  test('the same board shown again is silent, also when it is solved', () => {
    const open = gameSounds(game(OPEN, 3, false, START), game(OPEN, 3, false, START));
    const solved = gameSounds(game(SOLVED, 4, true, START), game(SOLVED, 4, true, START));

    assert.deepEqual([open, solved], [[], []]);
  });

  test('a game that turns solved without a visible slide still wins', () => {
    const cues = gameSounds(game(SOLVED, 4, false, START), game(SOLVED, 4, true, START));

    assert.deepEqual(cues, [{ effect: 'win', variation: 4 }]);
  });
});

describe('effectRecipe', () => {
  test('the slide is a wooden clack: noise click, thump and a falling low body, with a tick', () => {
    assert.deepEqual(effectRecipe('slide', 0), SLIDE_0);
  });

  test('the next four moves clack on other woods, each body falling by 15 %', () => {
    const bodies = [
      effectRecipe('slide', 1).layers[2],
      effectRecipe('slide', 2).layers[2],
      effectRecipe('slide', 3).layers[2],
      effectRecipe('slide', 4).layers[2],
    ];

    assert.deepEqual(bodies, BODIES_1_TO_4);
  });

  test('the next four moves click higher or lower and ring their overtone with the body', () => {
    const clicks = [effectRecipe('slide', 1).layers[0], effectRecipe('slide', 4).layers[3]];

    assert.deepEqual(clicks, CLICK_1_OVERTONE_4);
  });

  test('the woods repeat every five moves, and a negative count clacks like its size', () => {
    fc.assert(
      fc.property(variations, (variation) => {
        assert.deepEqual(
          effectRecipe('slide', variation),
          effectRecipe('slide', Math.abs(variation) % 5),
        );
      }),
    );
  });

  test('a blocked move is a dull low knock, quieter than a slide and without a tick', () => {
    assert.deepEqual(effectRecipe('blocked', 7), BLOCKED);
  });

  test('the win rises through D major and resolves on a held chord, with a double tick', () => {
    assert.deepEqual(effectRecipe('win', 12), WIN);
  });

  test('a button press is a soft falling pop that leaves the music alone', () => {
    assert.deepEqual(effectRecipe('press', 3), PRESS);
  });

  test('the menu pops up when it opens and down when it closes', () => {
    assert.deepEqual(effectRecipe('menu-open', 0), MENU_OPEN);
    assert.deepEqual(effectRecipe('menu-close', 0), MENU_CLOSE);
  });

  test('a switch turned on steps up a fifth and turned off steps down', () => {
    assert.deepEqual(effectRecipe('toggle-on', 0), TOGGLE_ON);
    assert.deepEqual(effectRecipe('toggle-off', 0), TOGGLE_OFF);
  });

  test('a shuffle rattles four quick light clacks', () => {
    assert.deepEqual(effectRecipe('shuffle', 0), SHUFFLE);
  });
});

describe('effect levels and lengths', () => {
  test('no effect needs taming: each fits the headroom at full level', () => {
    fc.assert(
      fc.property(effects, variations, (effect, variation) => {
        assert.equal(effectScale(effectRecipe(effect, variation)), 1);
      }),
    );
  });

  test('a recipe louder than the headroom is scaled down to it: 1 of 1.5 is two thirds', () => {
    const [click, thump] = effectRecipe('slide', 0).layers;
    assert.ok(click);
    assert.ok(thump);
    const layers = [
      { ...click, gain: 1 },
      { ...thump, gain: 0.5 },
    ];

    assert.equal(effectScale({ layers, duck: false, vibrate: [] }), 0.6666666666666666);
  });

  test('an effect lasts until its latest layer has faded: the clack 92 ms, the win 2.43 s', () => {
    assert.equal(effectLength(effectRecipe('slide', 0)), 0.092);
    assert.equal(effectLength(effectRecipe('win', 0)), 2.43);
  });

  test('the mix keeps the music well under the effects and ramps every change', () => {
    assert.deepEqual(MIX, {
      master: 0.8,
      effects: 1,
      music: 0.12,
      duck: 0.55,
      duckAttack: 0.02,
      duckRelease: 0.35,
      muteRamp: 0.03,
      musicFade: 0.6,
    });
  });
});

/** The gap at the left of the top row: a push from the right end moves two blocks left. */
const ROW_GAP_LEFT = grid`
  _ 1 2
  3 4 5
  6 7 8
`;
const ROW_PUSHED_TWO = grid`
  1 2 _
  3 4 5
  6 7 8
`;
const COLUMN_GAP_TOP = grid`
  _ 2 3
  1 5 6
  4 7 8
`;
const COLUMN_PUSHED_TWO = grid`
  1 2 3
  4 5 6
  _ 7 8
`;
const FOUR_GAP_LEFT = grid`
   _  1  2  3
   4  5  6  7
   8  9 10 11
  12 13 14 15
`;
const FOUR_PUSHED_THREE = grid`
   1  2  3  _
   4  5  6  7
   8  9 10 11
  12 13 14 15
`;
const FIVE_GAP_LEFT = grid`
   _  1  2  3  4
   5  6  7  8  9
  10 11 12 13 14
  15 16 17 18 19
  20 21 22 23 24
`;
const FIVE_PUSHED_FOUR = grid`
   1  2  3  4  _
   5  6  7  8  9
  10 11 12 13 14
  15 16 17 18 19
  20 21 22 23 24
`;
/** The gap two cells on along the row, but the blocks between not shifted one each. */
const ROW_SCRAMBLED = grid`
  2 1 _
  3 4 5
  6 7 8
`;

describe('gameSounds, a row pushed', () => {
  test('a row of two pushed in one go is one push of two blocks', () => {
    const cues = gameSounds(
      game(ROW_GAP_LEFT, 3, false, START),
      game(ROW_PUSHED_TWO, 5, false, START),
    );

    assert.deepEqual(cues, [{ effect: 'push', variation: 5, count: 2 }]);
  });

  test('a column of two pushed up is a push too', () => {
    const cues = gameSounds(
      game(COLUMN_GAP_TOP, 0, false, START),
      game(COLUMN_PUSHED_TWO, 2, false, START),
    );

    assert.deepEqual(cues, [{ effect: 'push', variation: 2, count: 2 }]);
  });

  test('pushes of three and four blocks are one push each, counting the blocks', () => {
    assert.deepEqual(
      [
        gameSounds(game(FOUR_GAP_LEFT, 0, false, START), game(FOUR_PUSHED_THREE, 3, false, START)),
        gameSounds(game(FIVE_GAP_LEFT, 0, false, START), game(FIVE_PUSHED_FOUR, 4, false, START)),
      ],
      [[{ effect: 'push', variation: 3, count: 3 }], [{ effect: 'push', variation: 4, count: 4 }]],
    );
  });

  test('the gap moved along a row with the blocks not each shifted by one is silent', () => {
    const cues = gameSounds(
      game(ROW_GAP_LEFT, 3, false, START),
      game(ROW_SCRAMBLED, 5, false, START),
    );

    assert.deepEqual(cues, []);
  });
});

/** The push of two blocks on the first wood: the slide's clack, lower and longer, and one tick. */
const PUSH_2 = {
  layers: [
    {
      kind: 'noise',
      filter: 'bandpass',
      frequency: 1710,
      q: 1.6,
      ...QUICK,
      decay: 0.04,
      gain: 0.36,
    },
    {
      kind: 'noise',
      filter: 'lowpass',
      frequency: 600,
      q: 0.7,
      ...QUICK,
      decay: 0.035,
      gain: 0.16,
    },
    {
      kind: 'tone',
      wave: 'sine',
      frequency: 192,
      endFrequency: 163.2,
      ...QUICK,
      decay: 0.12,
      gain: 0.28,
    },
    {
      kind: 'tone',
      wave: 'sine',
      frequency: 530,
      endFrequency: 530,
      ...QUICK,
      decay: 0.035,
      gain: 0.05,
    },
    {
      kind: 'noise',
      filter: 'bandpass',
      frequency: 2090,
      q: 2,
      start: 0.018,
      attack: 0.002,
      decay: 0.012,
      gain: 0.045,
    },
  ],
  duck: true,
  vibrate: [12],
};

describe('effectRecipe, a push', () => {
  test('a push of two is the clack with a lower, longer body and one short tick after it', () => {
    assert.deepEqual(effectRecipe('push', 0, 2), PUSH_2);
  });

  test('a longer push is lower and heavier, with a tick per block after the first, three at most', () => {
    const [, , body] = effectRecipe('push', 0, 4).layers;
    assert.ok(body);

    assert.deepEqual(
      [
        body.frequency,
        body.decay,
        effectRecipe('push', 0, 4).layers.length,
        effectRecipe('push', 0, 6).layers.length,
      ],
      [168, 0.16, 7, 7],
    );
  });

  test('every push fits the headroom without scaling', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 50 }),
        fc.integer({ min: 2, max: 25 }),
        (variation, count) => effectScale(effectRecipe('push', variation, count)) === 1,
      ),
    );
  });

  test('every push is over within a fifth of a second', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 50 }),
        fc.integer({ min: 2, max: 25 }),
        (variation, count) => effectLength(effectRecipe('push', variation, count)) <= 0.2,
      ),
    );
  });
});
