// Client entry: the puzzle's client-side feature (its screen). Logic lives in plain .ts files.
// The shell (src/web) renders the page's <main> and <h1>; this screen is a section inside it.
import { type ReactElement, useId, useMemo, useState } from 'react';
import {
  type BestResult,
  type ClientFeature,
  createGameApi,
  type GameSession,
  isNewPersonalBest,
  type SavedGame,
  useGameSession,
} from '../game/client.tsx';
import { BoardView } from './board-view.tsx';
import {
  type PuzzleMove,
  type PuzzleOptions,
  type PuzzleState,
  puzzleDefinition,
} from './definition.ts';
import { type Size, SIZES, sizeOf } from './rules.ts';
import { css } from './styles.ts';
import { useAnnouncement } from './use-announcement.ts';
import { useNow } from './use-now.ts';
import { useSavingHint } from './use-saving-hint.ts';
import {
  bestOf,
  formatElapsed,
  resultLine,
  resultText,
  sizeLabel,
  solvedText,
  statusText,
} from './view-model.ts';

type Session = GameSession<PuzzleState, PuzzleMove>;
type Game = SavedGame<PuzzleState>;

/** The size of a new game when none is on screen yet. */
const DEFAULT_SIZE: Size = 4;

/**
 * Moves, play time and the "Saving…" hint (once saving takes a while), on one line of fixed height. The timer is plain text,
 * outside the live region, so it is never read out on its own.
 */
function Status(props: { game: Game | undefined; elapsed: number; saving: boolean }): ReactElement {
  const { game } = props;
  return (
    <div className="sp-status">
      {game === undefined ? null : (
        <p className="sp-counts">
          <span data-testid="moves">{statusText(game)}</span>
          <time data-testid="timer" className="sp-timer">
            {formatElapsed(props.elapsed)}
          </time>
        </p>
      )}
      <p data-testid="saving" className="sp-saving">
        {props.saving ? 'Saving…' : ''}
      </p>
    </div>
  );
}

/** The win, in the line under the board: the board stays fully visible in its solved colours. */
function Win(props: { game: Game; elapsed: number; newBest: boolean }): ReactElement {
  return (
    <div className="sp-win">
      <p data-testid="solved-banner" className="sp-banner">
        {solvedText(props.game)}
      </p>
      <p data-testid="result" className="sp-result">
        {resultText(props.elapsed, props.newBest)}
      </p>
    </div>
  );
}

/** The board, or a square of the same size while the game loads. */
function Stage(props: { session: Session }): ReactElement {
  const { game, message } = props.session;
  if (game === undefined) {
    return (
      <div className="sp-board sp-placeholder" data-testid="board-placeholder">
        {message === undefined ? 'Loading…' : null}
      </div>
    );
  }
  return (
    <div className="sp-stage">
      {/* Keyed by size: a new size gets new tiles instead of sliding them out of the old board. */}
      <BoardView
        key={game.state.board.length}
        game={game}
        onMove={(tile) => {
          props.session.move({ tile });
        }}
      />
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
 * The line under the board, its height always reserved: the engine's `message` (the error, or else
 * the notice: one sentence, shown once), the win, or how to play. `game-error` names the message
 * whatever it holds (e2e reads it); `game-notice` marks a notice.
 */
function Below(props: { session: Session; elapsed: number }): ReactElement {
  const { game, message, notice, results } = props.session;
  return (
    <div className="sp-below">
      {message === undefined ? null : <MessageLine message={message} notice={notice} />}
      {game?.finished === true ? (
        <Win game={game} elapsed={props.elapsed} newBest={isNewPersonalBest(results, game)} />
      ) : null}
      {message === undefined && game?.finished !== true ? (
        <p className="sp-howto">Tap a tile next to the gap, swipe, or use the arrow keys.</p>
      ) : null}
    </div>
  );
}

/**
 * Busy controls stay focusable (aria-disabled); the session ignores a request while one runs. A
 * finished game cannot be reset (the engine refuses it), so Reset is unavailable and says why.
 */
function Controls(props: { session: Session; onNewGame: () => void }): ReactElement {
  const { session } = props;
  const hintId = useId();
  const finished = session.game?.finished === true;
  return (
    <div className="sp-row">
      <button
        type="button"
        data-testid="new-game"
        className="sp-button"
        aria-disabled={session.busy}
        onClick={props.onNewGame}
      >
        New game
      </button>
      <button
        type="button"
        data-testid="reset"
        className={finished ? 'sp-button sp-unavailable' : 'sp-button'}
        aria-disabled={session.busy || finished}
        aria-describedby={finished ? hintId : undefined}
        onClick={() => {
          if (!finished) session.reset();
        }}
      >
        Reset
      </button>
      <span id={hintId} className="sp-visually-hidden">
        Start a new game to play again.
      </span>
    </div>
  );
}

function SizeChoice(props: {
  current: Size | undefined;
  busy: boolean;
  onPick: (size: Size) => void;
}): ReactElement {
  const labelId = useId();
  const hintId = useId();
  return (
    <div className="sp-sizes" role="group" aria-labelledby={labelId} aria-describedby={hintId}>
      <span id={labelId} className="sp-label">
        Board size
      </span>
      <div className="sp-row">
        {SIZES.map((size) => (
          <button
            key={size}
            type="button"
            data-testid={`size-${String(size)}`}
            className="sp-button"
            aria-pressed={size === props.current}
            aria-disabled={props.busy}
            onClick={() => {
              props.onPick(size);
            }}
          >
            {sizeLabel(size)}
          </button>
        ))}
      </div>
      <p id={hintId} className="sp-hint">
        Picking a size starts a new game in place of this one.
      </p>
    </div>
  );
}

/** The best results on this board size; nothing at all until there is one. */
function Best(props: {
  game: Game | undefined;
  results: readonly BestResult[];
}): ReactElement | null {
  const labelId = useId();
  const { game } = props;
  const size = game === undefined ? undefined : sizeOf(game.state.board);
  if (game === undefined || size === undefined) return null;
  const best = bestOf(props.results, puzzleDefinition.variant(game.state));
  if (best.length === 0) return null;
  return (
    <div className="sp-best">
      <p id={labelId} className="sp-label">
        Best on {sizeLabel(size)}
      </p>
      <ol data-testid="best-list" aria-labelledby={labelId}>
        {best.map((result) => (
          <li key={`${result.finishedAt}-${String(result.moves)}`}>{resultLine(result)}</li>
        ))}
      </ol>
    </div>
  );
}

/** The play time to show: ticking once a second while a started game is open. */
function usePlayTime(session: Session): number {
  const { game } = session;
  const playing = game !== undefined && !game.finished && game.moves > 0;
  return session.elapsedMs(useNow(playing));
}

function PuzzleScreen(props: { nickname: string; apiBase: string }): ReactElement {
  // Memoised: the session restarts when its api changes.
  const api = useMemo(() => createGameApi(puzzleDefinition, props.apiBase), [props.apiBase]);
  // One object for the whole screen: the session restarts when the options' identity changes, and
  // reads them when a game starts, so the size is written into it just before each start.
  const [options] = useState<PuzzleOptions>(() => ({}));
  const session = useGameSession(api, props.nickname, options);
  const announced = useAnnouncement(session.game);
  const elapsed = usePlayTime(session);
  const saving = useSavingHint(session.syncing);
  const current = session.game === undefined ? undefined : sizeOf(session.game.state.board);
  const startGame = (size: Size) => {
    if (session.busy) return;
    options.size = size;
    session.start();
  };
  return (
    // No heading of its own: the shell has the page's <h1>, the profile bar the one <h2>.
    <section className="sp-puzzle" aria-label="Puzzle">
      <style>{css}</style>
      <Status game={session.game} elapsed={elapsed} saving={saving} />
      <Stage session={session} />
      <Below session={session} elapsed={elapsed} />
      <Controls
        session={session}
        onNewGame={() => {
          startGame(current ?? DEFAULT_SIZE);
        }}
      />
      <SizeChoice current={current} busy={session.busy} onPick={startGame} />
      <Best game={session.game} results={session.results} />
      <p role="status" data-testid="announcer" className="sp-visually-hidden">
        {announced}
      </p>
    </section>
  );
}

export const puzzle: ClientFeature = {
  id: puzzleDefinition.id,
  title: 'Sliding puzzle',
  Screen: PuzzleScreen,
};
