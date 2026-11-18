import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SavedGame } from '../game/index.ts';
import { grid } from '../test-support/grid.ts';
import type { PuzzleState } from './index.ts';
import { BoardView } from './board-view.tsx';

/** One move (tile 12) away from solved: tiles 8, 11 and 12 can slide into the blank. */
const TWELVE_DOWN = grid`
   1  2  3  4
   5  6  7  8
   9 10 11  _
  13 14 15 12
`;

const GAME: SavedGame<PuzzleState> = {
  state: { board: TWELVE_DOWN },
  initial: { board: TWELVE_DOWN },
  moves: 1,
  finished: false,
  version: 2,
  startedAt: '2026-01-01T00:00:00.000Z',
  finishedAt: null,
};

/** Static HTML without inline styles, one element per line. */
function markup(busy: boolean): string {
  const html = renderToStaticMarkup(<BoardView game={GAME} busy={busy} onMove={() => undefined} />);
  return html.replaceAll(/ style="[^"]*"/g, '').replaceAll('><', '>\n<');
}

const CELLS_OF_OPEN_GAME = `<button type="button" data-testid="tile-1" disabled="">1</button>
<button type="button" data-testid="tile-2" disabled="">2</button>
<button type="button" data-testid="tile-3" disabled="">3</button>
<button type="button" data-testid="tile-4" disabled="">4</button>
<button type="button" data-testid="tile-5" disabled="">5</button>
<button type="button" data-testid="tile-6" disabled="">6</button>
<button type="button" data-testid="tile-7" disabled="">7</button>
<button type="button" data-testid="tile-8">8</button>
<button type="button" data-testid="tile-9" disabled="">9</button>
<button type="button" data-testid="tile-10" disabled="">10</button>
<button type="button" data-testid="tile-11">11</button>
<div data-testid="tile-blank">
</div>
<button type="button" data-testid="tile-13" disabled="">13</button>
<button type="button" data-testid="tile-14" disabled="">14</button>
<button type="button" data-testid="tile-15" disabled="">15</button>
<button type="button" data-testid="tile-12">12</button>
</div>`;

describe('BoardView', () => {
  test('the board is a group named "Sliding puzzle" that carries its cells in data-board', () => {
    const html = markup(false);

    assert.match(html, /^<div data-testid="board" role="group" aria-label="Sliding puzzle" /);
    assert.match(html, / data-board="1,2,3,4,5,6,7,8,9,10,11,0,13,14,15,12">\n/);
  });

  test('each tile is a button labelled with its number, enabled only next to the blank', () => {
    // Given the markup after its first line, the board's own <div>
    const cells = markup(false).split('\n').slice(1).join('\n');

    assert.equal(cells, CELLS_OF_OPEN_GAME);
  });

  test('while a move is being sent every tile is disabled', () => {
    const html = markup(true);

    assert.match(html, /data-testid="tile-8" disabled="">8</);
    assert.doesNotMatch(html, /data-testid="tile-\d+">/);
  });
});
