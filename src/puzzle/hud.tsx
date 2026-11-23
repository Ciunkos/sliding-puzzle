// The game's heads-up display around the board: the menu button and the moves in the top corners,
// the line under the board, the two actions in the bottom corners, and the win card over the board.
// Presentational: every text and handler comes from the screen (client.tsx). Nothing here takes
// room that something appearing later would need, so nothing ever moves (styles.ts).
import { type ReactElement, type ReactNode, type Ref, useId } from 'react';

/** The top-left corner: opens the menu (a dialog with the profile and every option). */
export function MenuButton(props: {
  buttonRef?: Ref<HTMLButtonElement>;
  open: boolean;
  onOpen: () => void;
}): ReactElement {
  return (
    <button
      ref={props.buttonRef}
      type="button"
      data-testid="menu-button"
      className="sp-button sp-icon-button sp-menu-button"
      aria-haspopup="dialog"
      aria-expanded={props.open}
      onClick={props.onOpen}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22">
        <path d="M4 6.5h16M4 12h16M4 17.5h16" />
      </svg>
      <span className="sp-visually-hidden">Menu</span>
    </button>
  );
}

/**
 * Top centre: moves and play time, and under them the "Saving…" hint (once saving takes a while),
 * which floats so it never moves anything. The timer is plain text, outside the live region, so it
 * is never read out on its own. Nothing but the hint before the game has loaded.
 */
export function Status(props: {
  moves: string | undefined;
  /** The play time: text, or the small component that keeps it ticking. */
  time: ReactNode;
  saving: boolean;
}): ReactElement {
  return (
    <div className="sp-status">
      {props.moves === undefined ? null : (
        <p className="sp-counts">
          <span data-testid="moves">{props.moves}</span>
          <span className="sp-dot" aria-hidden="true">
            ·
          </span>
          <time data-testid="timer" className="sp-timer">
            {props.time}
          </time>
        </p>
      )}
      <p data-testid="saving" className="sp-saving">
        {props.saving ? 'Saving…' : ''}
      </p>
    </div>
  );
}

/** An error is an alert; a notice (offline, changed elsewhere) is plain text. */
function MessageLine(props: { message: string; notice: string | undefined }): ReactElement {
  return (
    <div data-testid="game-error">
      {props.message === props.notice ? (
        <p data-testid="game-notice" className="sp-notice">
          {props.notice}
        </p>
      ) : (
        <p role="alert" className="sp-error">
          {props.message}
        </p>
      )}
    </div>
  );
}

/**
 * The line under the board, its height always kept: the engine's message (the error, or else the
 * notice), or how to play while a game is open. `game-error` names the message whatever it holds
 * (e2e reads it); `game-notice` marks a notice. A finished game has the win card instead; after
 * the first move how to play fades out.
 */
export function Line(props: {
  message: string | undefined;
  notice: string | undefined;
  finished: boolean;
  /** A move was made: how to play fades out (styles.ts), its place kept. */
  moved: boolean;
}): ReactElement {
  return (
    <div className="sp-line">
      {props.message === undefined ? null : (
        <MessageLine message={props.message} notice={props.notice} />
      )}
      {props.message === undefined && !props.finished ? (
        <p className={props.moved ? 'sp-howto sp-faded' : 'sp-howto'}>
          Tap a tile next to the gap, swipe, or use the arrow keys.
        </p>
      ) : null}
    </div>
  );
}

/** Reset's click: resets an open game, and does nothing for a finished one (it is unavailable). */
export function resetUnlessFinished(finished: boolean, onReset: () => void): () => void {
  return () => {
    if (!finished) onReset();
  };
}

/**
 * The bottom corners: New game (right) and Reset (left), in this DOM order so Tab goes from the
 * board to New game. Busy buttons stay focusable (aria-disabled); the session ignores a request
 * while one runs. A finished game cannot be reset (the engine refuses it), so Reset is unavailable
 * and says why.
 */
export function Actions(props: {
  busy: boolean;
  finished: boolean;
  onNewGame: () => void;
  onReset: () => void;
}): ReactElement {
  const hintId = useId();
  const { finished } = props;
  return (
    <div className="sp-actions">
      <button
        type="button"
        data-testid="new-game"
        className="sp-button sp-primary sp-new-game"
        aria-disabled={props.busy}
        onClick={props.onNewGame}
      >
        New game
      </button>
      <button
        type="button"
        data-testid="reset"
        className={finished ? 'sp-button sp-reset sp-unavailable' : 'sp-button sp-reset'}
        aria-disabled={props.busy || finished}
        aria-describedby={finished ? hintId : undefined}
        onClick={resetUnlessFinished(finished, props.onReset)}
      >
        Reset
      </button>
      <span id={hintId} className="sp-visually-hidden">
        Start a new game to play again.
      </span>
    </div>
  );
}

/** The win: a card that springs in over the board, which stays visible in its solved colours. */
export function WinCard(props: {
  banner: string;
  result: string;
  busy: boolean;
  onPlayAgain: () => void;
}): ReactElement {
  return (
    <div className="sp-win-card" data-testid="win">
      <p data-testid="solved-banner" className="sp-banner">
        {props.banner}
      </p>
      <p data-testid="result" className="sp-result">
        {props.result}
      </p>
      <button
        type="button"
        data-testid="play-again"
        className="sp-button sp-primary"
        aria-disabled={props.busy}
        onClick={props.onPlayAgain}
      >
        Play again
      </button>
    </div>
  );
}
