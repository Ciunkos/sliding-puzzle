import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Actions, Line, MenuButton, resetUnlessFinished, Status, WinCard } from './hud.tsx';

const NONE = () => undefined;
const OFFLINE = 'You are offline. Your moves will be saved when you are back.';

/** Static HTML, one element per line, with React's generated ids made readable. */
function markup(element: ReactElement): string {
  return renderToStaticMarkup(element)
    .replaceAll(/_R_\w+_/g, 'id')
    .replaceAll('><', '>\n<');
}

describe('MenuButton', () => {
  test('the menu button is named Menu and says whether its dialog is open', () => {
    const closed = markup(<MenuButton open={false} onOpen={NONE} />);
    const open = markup(<MenuButton open onOpen={NONE} />);

    assert.match(
      closed,
      /^<button type="button" data-testid="menu-button" class="sp-button sp-icon-button sp-menu-button" aria-haspopup="dialog" aria-expanded="false">/,
    );
    assert.match(closed, /<span class="sp-visually-hidden">Menu<\/span>/);
    assert.match(open, /aria-expanded="true"/);
  });
});

describe('Status', () => {
  test('the moves and the time are one line, with a dot between them hidden from readers', () => {
    const html = markup(<Status moves="Moves: 3" time="0:41" saving={false} />);

    assert.equal(
      html,
      `<div class="sp-status">
<p class="sp-counts">
<span data-testid="moves">Moves: 3</span>
<span class="sp-dot" aria-hidden="true">·</span>
<time data-testid="timer" class="sp-timer">0:41</time>
</p>
<p data-testid="saving" class="sp-saving">
</p>
</div>`,
    );
  });

  test('before the game loads only the saving hint is there, and it can say Saving…', () => {
    const html = markup(<Status moves={undefined} time="0:00" saving />);

    assert.equal(
      html,
      `<div class="sp-status">
<p data-testid="saving" class="sp-saving">Saving…</p>
</div>`,
    );
  });
});

describe('Line', () => {
  test('an open game without a message says how to play, the keys in a part a touch screen hides', () => {
    const html = markup(
      <Line message={undefined} notice={undefined} finished={false} moved={false} />,
    );

    assert.equal(
      html,
      `<div class="sp-line">
<p class="sp-howto">Tap or drag a tile next to the gap<span class="sp-howto-keys">, or use the arrow keys</span>.</p>
</div>`,
    );
  });

  test('a notice is plain text in place of how to play', () => {
    const html = markup(<Line message={OFFLINE} notice={OFFLINE} finished={false} moved={false} />);

    assert.equal(
      html,
      `<div class="sp-line">
<div data-testid="game-error">
<p data-testid="game-notice" class="sp-notice">You are offline. Your moves will be saved when you are back.</p>
</div>
</div>`,
    );
  });

  test('after the first move how to play fades out, keeping its place', () => {
    const html = markup(<Line message={undefined} notice={undefined} finished={false} moved />);

    assert.match(html, /<p class="sp-howto sp-faded">Tap or drag a tile next to the gap/);
  });

  test('an error that is not the notice is an alert', () => {
    const html = markup(
      <Line message="Could not save." notice={OFFLINE} finished={false} moved={false} />,
    );

    assert.match(html, /<p role="alert" class="sp-error">Could not save\.<\/p>/);
    assert.doesNotMatch(html, /sp-howto/);
  });

  test('a finished game keeps the line empty, and a notice still shows there', () => {
    const empty = markup(<Line message={undefined} notice={undefined} finished moved={false} />);
    const notice = markup(<Line message={OFFLINE} notice={OFFLINE} finished moved={false} />);

    assert.equal(empty, '<div class="sp-line">\n</div>');
    assert.match(notice, /data-testid="game-notice"/);
  });
});

describe('Actions', () => {
  test('New game comes before Reset, so Tab goes from the board to New game', () => {
    const html = markup(<Actions busy={false} finished={false} onNewGame={NONE} onReset={NONE} />);

    assert.equal(
      html,
      `<div class="sp-actions">
<button type="button" data-testid="new-game" class="sp-button sp-primary sp-new-game" aria-disabled="false">New game</button>
<button type="button" data-testid="reset" class="sp-button sp-reset" aria-disabled="false">Reset</button>
<span id="id" class="sp-visually-hidden">Start a new game to play again.</span>
</div>`,
    );
  });

  test('while busy both actions are aria-disabled but stay focusable', () => {
    const html = markup(<Actions busy finished={false} onNewGame={NONE} onReset={NONE} />);

    assert.match(html, /data-testid="new-game"[^>]*aria-disabled="true"/);
    assert.match(html, /data-testid="reset" class="sp-button sp-reset" aria-disabled="true">/);
  });

  test('a finished game makes Reset unavailable, and it says why', () => {
    const html = markup(<Actions busy={false} finished onNewGame={NONE} onReset={NONE} />);

    assert.match(
      html,
      /data-testid="reset" class="sp-button sp-reset sp-unavailable" aria-disabled="true" aria-describedby="id">Reset/,
    );
  });
});

describe('WinCard', () => {
  test('the win card shows the banner, the result and Play again', () => {
    const html = markup(
      <WinCard
        banner="Solved in 12 moves!"
        result="Time 0:41 · New best!"
        busy={false}
        onPlayAgain={NONE}
      />,
    );

    assert.equal(
      html,
      `<div class="sp-win-card" data-testid="win">
<p data-testid="solved-banner" class="sp-banner">Solved in 12 moves!</p>
<p data-testid="result" class="sp-result">Time 0:41 · New best!</p>
<button type="button" data-testid="play-again" class="sp-button sp-primary" aria-disabled="false">Play again</button>
</div>`,
    );
  });

  test('Play again is aria-disabled while a request runs', () => {
    const html = markup(<WinCard banner="Solved!" result="Time 0:01" busy onPlayAgain={NONE} />);

    assert.match(
      html,
      /data-testid="play-again" class="sp-button sp-primary" aria-disabled="true"/,
    );
  });
});

describe('resetUnlessFinished', () => {
  test('a click on Reset resets an open game', () => {
    const calls: string[] = [];
    const click = resetUnlessFinished(false, () => calls.push('reset'));

    click();

    assert.deepEqual(calls, ['reset']);
  });

  test('a click on Reset of a finished game does nothing', () => {
    const calls: string[] = [];
    const click = resetUnlessFinished(true, () => calls.push('reset'));

    click();

    assert.deepEqual(calls, []);
  });
});
