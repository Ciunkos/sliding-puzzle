// Client entry: the puzzle's client-side feature (its screen). Logic lives in plain .ts files.
// The shell (src/web) renders the page's <main> and <h1>; this screen is a section inside it.
import { type ReactElement, useId, useMemo, useState } from 'react';
import {
  type ClientFeature,
  createGameApi,
  type GameSession,
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
import { sizeLabel, solvedText, statusText } from './view-model.ts';

type Session = GameSession<PuzzleState, PuzzleMove>;
type Game = SavedGame<PuzzleState>;

/** The size of a new game when none is on screen yet. */
const DEFAULT_SIZE: Size = 4;

/**
 * The status line. Today: the move count. When the engine ships them, the timer (`elapsedMs`) and
 * the "Saving…" hint (`syncing`) go in the second slot, and `notice` below the board.
 */
function Status({ game }: { game: Game | undefined }): ReactElement {
  return (
    <div className="sp-status">
      {game === undefined ? null : <p data-testid="moves">{statusText(game)}</p>}
      <p data-testid="status-extra" />
    </div>
  );
}

/** The board, or a square of the same size while the game loads (so nothing shifts). */
function Play({ session }: { session: Session }): ReactElement {
  const { game, message } = session;
  if (game === undefined) {
    return (
      <div className="sp-board sp-placeholder" data-testid="board-placeholder">
        {message === undefined ? 'Loading…' : null}
      </div>
    );
  }
  return (
    <>
      {/* Keyed by size: a new size gets new tiles instead of sliding them out of the old board. */}
      <BoardView
        key={game.state.board.length}
        game={game}
        onMove={(tile) => {
          session.move({ tile });
        }}
      />
      {game.finished ? (
        <p data-testid="solved-banner" className="sp-banner">
          {solvedText(game)}
        </p>
      ) : null}
    </>
  );
}

/** Busy controls stay focusable (aria-disabled); the session ignores a request while one runs. */
function Controls(props: { session: Session; onNewGame: () => void }): ReactElement {
  const { session } = props;
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
        className="sp-button"
        aria-disabled={session.busy}
        onClick={session.reset}
      >
        Reset
      </button>
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

function PuzzleScreen(props: { nickname: string; apiBase: string }): ReactElement {
  // Memoised: the session restarts when its api changes.
  const api = useMemo(() => createGameApi(puzzleDefinition, props.apiBase), [props.apiBase]);
  // One object for the whole screen: the session restarts when the options' identity changes, and
  // reads them when a game starts, so the size is written into it just before each start.
  const [options] = useState<PuzzleOptions>(() => ({}));
  const session = useGameSession(api, props.nickname, options);
  const announced = useAnnouncement(session.game);
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
      <Status game={session.game} />
      <Play session={session} />
      {session.message ? (
        <p role="alert" data-testid="game-error" className="sp-error">
          {session.message}
        </p>
      ) : null}
      <Controls
        session={session}
        onNewGame={() => {
          startGame(current ?? DEFAULT_SIZE);
        }}
      />
      <SizeChoice current={current} busy={session.busy} onPick={startGame} />
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
