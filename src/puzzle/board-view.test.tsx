import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SavedGame } from '../game/index.ts';
import { grid } from '../test-support/grid.ts';
import type { PuzzleState } from './index.ts';
import { type BoardLook, BoardView, nudgeOf, sameBoardProps, Tiles } from './board-view.tsx';

/** A 3x3 board with the blank in the middle: tiles 2, 4, 6 and 8 can slide into it. */
const BLANK_IN_THE_MIDDLE = grid`
  3 2 1
  4 _ 6
  7 8 5
`;
/** One move (tile 24) away from solved: tiles 19, 23 and 24 can slide into the blank. */
const TWENTY_FOUR_RIGHT = grid`
   1  2  3  4  5
   6  7  8  9 10
  11 12 13 14 15
  16 17 18 19 20
  21 22 23  _ 24
`;

function savedGame(board: readonly number[], finished: boolean): SavedGame<PuzzleState> {
  return {
    state: { board },
    initial: { board },
    moves: 1,
    finished,
    version: 2,
    startedAt: '2026-01-01T00:00:00.000Z',
    finishedAt: null,
  };
}

const NUMBERS_LOOK = {
  skin: 'numbers',
  picture: undefined,
  layered: false,
  describedBy: undefined,
} as const;

const PICTURE = {
  skin: 'cat',
  picture: { url: 'cat.svg', badges: true },
  layered: false,
  describedBy: 'about-cat',
} as const;

/** Static HTML, one element per line. */
function markup(game: SavedGame<PuzzleState>, look?: BoardLook): string {
  return renderToStaticMarkup(
    <BoardView game={game} onMove={() => undefined} look={look} />,
  ).replaceAll('><', '>\n<');
}

const THIRD = 'width:calc(100% / 3);height:calc(100% / 3)';
const CELLS_OF_THE_3X3_GAME = `<div data-testid="tile-blank" class="sp-blank" style="${THIRD};transform:translate(100%, 100%)">
</div>
<button type="button" class="sp-tile" data-testid="tile-1" data-tile="1" aria-label="Tile 1" aria-disabled="true" tabindex="-1" style="${THIRD};transform:translate(200%, 0%)">
<span class="sp-face">1</span>
</button>
<button type="button" class="sp-tile" data-testid="tile-2" data-tile="2" aria-label="Tile 2" aria-disabled="false" tabindex="0" style="${THIRD};transform:translate(100%, 0%)">
<span class="sp-face">2</span>
</button>
<button type="button" class="sp-tile" data-testid="tile-3" data-tile="3" aria-label="Tile 3" aria-disabled="true" tabindex="-1" style="${THIRD};transform:translate(0%, 0%)">
<span class="sp-face">3</span>
</button>
<button type="button" class="sp-tile" data-testid="tile-4" data-tile="4" aria-label="Tile 4" aria-disabled="false" tabindex="-1" style="${THIRD};transform:translate(0%, 100%)">
<span class="sp-face">4</span>
</button>
<button type="button" class="sp-tile" data-testid="tile-5" data-tile="5" aria-label="Tile 5" aria-disabled="true" tabindex="-1" style="${THIRD};transform:translate(200%, 200%)">
<span class="sp-face">5</span>
</button>
<button type="button" class="sp-tile" data-testid="tile-6" data-tile="6" aria-label="Tile 6" aria-disabled="false" tabindex="-1" style="${THIRD};transform:translate(200%, 100%)">
<span class="sp-face">6</span>
</button>
<button type="button" class="sp-tile" data-testid="tile-7" data-tile="7" aria-label="Tile 7" aria-disabled="true" tabindex="-1" style="${THIRD};transform:translate(0%, 200%)">
<span class="sp-face">7</span>
</button>
<button type="button" class="sp-tile" data-testid="tile-8" data-tile="8" aria-label="Tile 8" aria-disabled="false" tabindex="-1" style="${THIRD};transform:translate(100%, 200%)">
<span class="sp-face">8</span>
</button>
</div>`;

describe('BoardView', () => {
  test('the board is a group named "Sliding puzzle" that carries its cells in data-board', () => {
    const html = markup(savedGame(BLANK_IN_THE_MIDDLE, false));

    assert.match(html, /^<div data-testid="board" role="group" aria-label="Sliding puzzle" /);
    assert.match(html, / data-board="3,2,1,4,0,6,7,8,5" class="sp-board sp-size-3">\n/);
  });

  test('a 3x3 game has one button per tile in number order, placed in its cell, movable or aria-disabled', () => {
    // Given the markup after its first line, the board's own <div>
    const cells = markup(savedGame(BLANK_IN_THE_MIDDLE, false)).split('\n').slice(1).join('\n');

    assert.equal(cells, CELLS_OF_THE_3X3_GAME);
  });

  test('a 5x5 tile is a fifth of the board, placed by its row and column', () => {
    const html = markup(savedGame(TWENTY_FOUR_RIGHT, false));

    assert.match(
      html,
      / data-board="1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,0,24" class="sp-board sp-size-5">/,
    );
    assert.match(
      html,
      /data-tile="24" aria-label="Tile 24" aria-disabled="false" tabindex="-1" style="width:calc\(100% \/ 5\);height:calc\(100% \/ 5\);transform:translate\(400%, 400%\)"/,
    );
    assert.match(
      html,
      /data-tile="1" aria-label="Tile 1" aria-disabled="true" tabindex="-1" style="width:calc\(100% \/ 5\);height:calc\(100% \/ 5\);transform:translate\(0%, 0%\)"/,
    );
  });

  test('on a 5x5 board exactly the tiles next to the blank can move', () => {
    const html = markup(savedGame(TWENTY_FOUR_RIGHT, false));

    assert.deepEqual(
      html.match(/data-tile="\d+"(?= aria-label="Tile \d+" aria-disabled="false")/g),
      ['data-tile="19"', 'data-tile="23"', 'data-tile="24"'],
    );
  });

  test('the board is one tab stop: the lowest tile that can move, the others out of the tab order', () => {
    const html = markup(savedGame(TWENTY_FOUR_RIGHT, false));

    assert.deepEqual(html.match(/data-tile="\d+"(?=[^>]* tabindex="0")/g), ['data-tile="19"']);
    // 23 tiles out of the tab order: the markup splits into 24 pieces around them
    assert.equal(html.split('tabindex="-1"').length, 24);
  });

  test('a finished game marks the board as won and no tile can move', () => {
    const html = markup(savedGame(TWENTY_FOUR_RIGHT, true));

    assert.match(html, / class="sp-board sp-size-5 sp-won">/);
    assert.doesNotMatch(html, /aria-disabled="false"/);
    assert.match(html, /<div data-testid="tile-blank" class="sp-blank" style="[^"]+">\n<\/div>/);
  });

  test('a board without a chosen look shows numbers and is described by nothing more', () => {
    const html = markup(savedGame(BLANK_IN_THE_MIDDLE, false));

    assert.match(html, /aria-label="Sliding puzzle" data-skin="numbers" data-board=/);
  });

  test('a picture skin names itself and its description on the board', () => {
    const html = markup(savedGame(BLANK_IN_THE_MIDDLE, false), PICTURE);

    assert.match(
      html,
      /^<div data-testid="board" role="group" aria-label="Sliding puzzle" aria-describedby="about-cat" data-skin="cat" data-board=/,
    );
  });

  test('a picture tile shows its square of the picture with a number badge, keeping its name', () => {
    const html = markup(savedGame(BLANK_IN_THE_MIDDLE, false), PICTURE);

    assert.match(
      html,
      /aria-label="Tile 6" aria-disabled="false" tabindex="-1" style="[^"]+">\n<span class="sp-face sp-picture" style="background-image:url\(&quot;cat.svg&quot;\);background-size:300% 300%;background-position:100% 50%">\n<span class="sp-badge">6<\/span>\n<\/span>/,
    );
  });

  test('with numbers switched off a picture tile has no badge', () => {
    const html = markup(savedGame(BLANK_IN_THE_MIDDLE, false), {
      ...PICTURE,
      picture: { url: 'cat.svg', badges: false },
    });

    assert.doesNotMatch(html, /sp-badge/);
  });

  test('a solved picture fills the gap with its missing corner', () => {
    const html = markup(savedGame(TWENTY_FOUR_RIGHT, true), {
      ...PICTURE,
      picture: { url: 'fish.svg', badges: true },
    });

    assert.match(
      html,
      /<div data-testid="tile-blank" class="sp-blank" style="[^"]+">\n<span class="sp-face sp-corner" style="background-image:url\(&quot;fish.svg&quot;\);background-size:500% 500%;background-position:100% 100%">/,
    );
  });

  test('an open game shows no corner, and a board drawn in 3D is marked as layered', () => {
    const html = markup(savedGame(TWENTY_FOUR_RIGHT, false), { ...PICTURE, layered: true });

    assert.doesNotMatch(html, /sp-corner/);
    assert.match(html, / class="sp-board sp-size-5 sp-layered">/);
  });
});

describe('nudgeOf', () => {
  test('only the nudged tile wiggles, and a new nudge of it plays the other wiggle', () => {
    assert.deepEqual(
      [
        nudgeOf(undefined, 4),
        nudgeOf({ tile: 4, serial: 1 }, 7),
        nudgeOf({ tile: 4, serial: 1 }, 4),
        nudgeOf({ tile: 4, serial: 2 }, 4),
      ],
      [undefined, undefined, 'b', 'a'],
    );
  });

  test('the nudged tile carries its wiggle in data-nudge', () => {
    const html = renderToStaticMarkup(
      <BoardView
        game={savedGame(BLANK_IN_THE_MIDDLE, false)}
        onMove={() => undefined}
        nudge={{ tile: 3, serial: 5 }}
      />,
    );

    assert.match(html, /data-testid="tile-3" data-tile="3" data-nudge="b" aria-label="Tile 3"/);
    assert.match(html, /data-testid="tile-1" data-tile="1" aria-label="Tile 1"/);
  });
});

describe('Tiles', () => {
  test('the held tile is marked held and drawn from its cell by its drag offset, only that tile', () => {
    const html = renderToStaticMarkup(
      <Tiles
        game={savedGame(BLANK_IN_THE_MIDDLE, false)}
        look={NUMBERS_LOOK}
        tabStop={4}
        nudge={undefined}
        held={4}
      />,
    );

    // Held: its own class, and drawn its drag offset (written later) from its cell; no other.
    assert.match(
      html,
      /class="sp-tile sp-held" data-testid="tile-4"[^>]*transform:translate\(calc\(0% \+ var\(--sp-drag-x, 0%\)\)/,
    );
    assert.equal(html.split('sp-held').length, 2);
  });
});

describe('sameBoardProps', () => {
  const NONE = () => undefined;
  const props = (change: Record<string, unknown>) => ({
    game: savedGame(BLANK_IN_THE_MIDDLE, false),
    onMove: NONE,
    look: PICTURE,
    nudge: { tile: 4, serial: 1 },
    ...change,
  });

  test('the same board drawn the same way needs no new render, whatever else changed in the game', () => {
    const synced = { ...savedGame(BLANK_IN_THE_MIDDLE, false), version: 3 };

    assert.equal(sameBoardProps(props({}), props({ game: synced, look: { ...PICTURE } })), true);
  });

  test('another board, a finished game, another look or a new nudge is drawn again', () => {
    assert.deepEqual(
      [
        sameBoardProps(props({}), props({ game: savedGame(TWENTY_FOUR_RIGHT, false) })),
        sameBoardProps(props({}), props({ game: savedGame(BLANK_IN_THE_MIDDLE, true) })),
        sameBoardProps(props({}), props({ look: { ...PICTURE, layered: true } })),
        sameBoardProps(props({}), props({ nudge: { tile: 4, serial: 2 } })),
      ],
      [false, false, false, false],
    );
  });

  test("a new handler is a new render: it is the owner's to keep handlers the same", () => {
    assert.equal(sameBoardProps(props({}), props({ onMove: () => undefined })), false);
  });
});
