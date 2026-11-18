// Client entry: the puzzle's client-side feature (its screen). Logic lives in plain .ts files.
import { type ReactElement, useMemo } from 'react';
import {
  type ClientFeature,
  createGameApi,
  type GameSession,
  useGameSession,
} from '../game/client.tsx';
import { BoardView } from './board-view.tsx';
import {
  type PuzzleMove,
  type PuzzleOptions,
  type PuzzleState,
  puzzleDefinition,
} from './definition.ts';
import * as styles from './styles.ts';
import { solvedText, statusText } from './view-model.ts';

/** A stable value: the session restarts when its options change. */
const NEW_GAME: PuzzleOptions = {};

type Session = GameSession<PuzzleState, PuzzleMove>;

function Game({ session }: { session: Session }): ReactElement | null {
  const { game, busy, message } = session;
  if (game === undefined) return message === undefined ? <p>Loading…</p> : null;
  return (
    <>
      <p data-testid="moves">{statusText(game)}</p>
      <BoardView
        game={game}
        busy={busy}
        onMove={(tile) => {
          session.move({ tile });
        }}
      />
      {game.finished ? (
        <div data-testid="solved-banner" role="status" style={styles.banner}>
          {solvedText(game)}
        </div>
      ) : null}
    </>
  );
}

function Controls({ session }: { session: Session }): ReactElement {
  return (
    <div style={styles.controls}>
      <button
        type="button"
        data-testid="new-game"
        disabled={session.busy}
        style={styles.button}
        onClick={session.start}
      >
        New game
      </button>
      <button
        type="button"
        data-testid="reset"
        disabled={session.busy}
        style={styles.button}
        onClick={session.reset}
      >
        Reset
      </button>
    </div>
  );
}

function PuzzleScreen(props: { nickname: string; apiBase: string }): ReactElement {
  // Memoised: the session restarts when its api changes.
  const api = useMemo(() => createGameApi(puzzleDefinition, props.apiBase), [props.apiBase]);
  const session = useGameSession(api, props.nickname, NEW_GAME);
  return (
    <main style={styles.page}>
      <h1>Sliding puzzle</h1>
      <Game session={session} />
      {session.message ? (
        <p role="alert" data-testid="game-error" style={styles.error}>
          {session.message}
        </p>
      ) : null}
      <Controls session={session} />
    </main>
  );
}

export const puzzle: ClientFeature = {
  id: puzzleDefinition.id,
  title: 'Sliding puzzle',
  Screen: PuzzleScreen,
};
