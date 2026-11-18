// Client entry: the puzzle's client-side feature (its screen). Logic lives in plain .ts files.
// The shell (src/web) renders the page's <main> and <h1>; this screen is a section inside it.
import {
  Component,
  lazy,
  type ReactElement,
  type ReactNode,
  Suspense,
  useEffect,
  useId,
  useMemo,
  useState,
} from 'react';
import {
  type BestResult,
  type ClientFeature,
  createGameApi,
  type GameSession,
  isNewPersonalBest,
  type SavedGame,
  useGameSession,
} from '../game/client.tsx';
import { type BoardLook, BoardView } from './board-view.tsx';
import {
  type PuzzleMove,
  type PuzzleOptions,
  type PuzzleState,
  puzzleDefinition,
} from './definition.ts';
import { LookControls } from './look-controls.tsx';
import {
  pictureDescription,
  sceneNote,
  type SceneStatus,
  sceneSkin,
  tiltMode,
} from './look-model.ts';
import { shownSkin } from './preferences.ts';
import { type Size, SIZES, sizeOf } from './rules.ts';
import { css } from './styles.ts';
import { useAnnouncement } from './use-announcement.ts';
import { useGameEvents, useSkinEvents } from './use-feature-events.ts';
import { type LookChoices, useLook } from './use-look.ts';
import { useMedia } from './use-media.ts';
import { useNow } from './use-now.ts';
import { type OrientationTilt, useOrientationTilt } from './use-orientation-tilt.ts';
import { useQuietOnline } from './use-quiet-online.ts';
import { useSavingHint } from './use-saving-hint.ts';
import { type SceneSurface, useSceneSurface } from './use-scene-surface.ts';
import type { Board3DProps } from './use-three-board.ts';
import {
  bestOf,
  formatElapsed,
  resultLine,
  resultText,
  sizeLabel,
  skinPicture,
  solvedText,
  statusText,
} from './view-model.ts';

/** Stands in for the 3D board when its chunk cannot load (offline before it was ever fetched). */
function SceneUnavailable(props: Board3DProps): ReactElement {
  const { onLost } = props;
  useEffect(() => {
    onLost();
  }, [onLost]);
  return <></>;
}

/**
 * The 3D board, its own chunk: three.js loads only when the 3D board is about to be drawn. A chunk
 * that cannot load is not an error to report: the flat board simply stays.
 */
const Board3D = lazy(() => import('./board-3d.tsx').catch(() => ({ default: SceneUnavailable })));

/** Any error in the 3D board (a failed chunk load, a scene error) brings back the flat board. */
class SceneBoundary extends Component<
  { onError: () => void; children: ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(): void {
    this.props.onError();
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

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

/** The 3D board as drawn for the screen: everything it needs except the game. */
type SceneProps = Omit<Board3DProps, 'board' | 'size' | 'finished' | 'moves'>;

/** The lazy 3D board for `game`, guarded: an error brings back the flat board. */
function Scene3D(props: { scene: SceneProps; game: Game }): ReactElement {
  const { scene, game } = props;
  return (
    <SceneBoundary onError={scene.onLost}>
      <Suspense fallback={null}>
        <Board3D
          {...scene}
          board={game.state.board}
          size={sizeOf(game.state.board) ?? DEFAULT_SIZE}
          finished={game.finished}
          moves={game.moves}
        />
      </Suspense>
    </SceneBoundary>
  );
}

/** The board, or a square of the same size while the game loads; the 3D board under it. */
function Stage(props: {
  session: Session;
  look: BoardLook;
  scene: SceneProps | undefined;
}): ReactElement {
  const { game, message } = props.session;
  if (game === undefined) {
    return (
      <div className="sp-stage">
        <div className="sp-board sp-placeholder" data-testid="board-placeholder">
          {message === undefined ? 'Loading…' : null}
        </div>
      </div>
    );
  }
  return (
    <div className="sp-stage">
      {props.scene === undefined ? null : <Scene3D scene={props.scene} game={game} />}
      {/* Keyed by size: a new size gets new tiles instead of sliding them out of the old board. */}
      <BoardView
        key={game.state.board.length}
        game={game}
        look={props.look}
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

function statusOf(surface: ReturnType<typeof useSceneSurface>): SceneStatus {
  if (surface === undefined) return 'waiting';
  return typeof surface === 'string' ? surface : 'shown';
}

/** How long the flat board stays alone before the 3D board's chunk is fetched. */
const CHUNK_DELAY_MS = 400;

/** The 3D board's state: wanted, probed, drawn (ready) or broken (failed). */
function useSceneState(wanted: boolean) {
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const surface = useSceneSurface(wanted && !failed);
  // A new surface (or none) has drawn nothing yet: the DOM board keeps its looks until it has.
  useEffect(() => {
    setReady(false);
  }, [surface]);
  const usable: SceneSurface | undefined =
    wanted && !failed && typeof surface === 'object' ? surface : undefined;
  const status = statusOf(surface);
  // The chunk is fetched once the flat board has been up for a moment and there is a network.
  const online = useQuietOnline(usable !== undefined, CHUNK_DELAY_MS);
  const loading = online ? usable : undefined;
  return {
    failed,
    setFailed,
    ready: ready && loading !== undefined,
    setReady,
    usable: loading,
    status,
  };
}

type SceneState = ReturnType<typeof useSceneState>;

function sceneProps(
  state: SceneState,
  drawn: Pick<SceneProps, 'skin' | 'dark' | 'reducedMotion' | 'tilt'>,
): SceneProps | undefined {
  if (state.usable === undefined) return undefined;
  return {
    ...drawn,
    surface: state.usable,
    onReady: () => {
      state.setReady(true);
    },
    onLost: () => {
      state.setFailed(true);
    },
  };
}

interface ScreenLook {
  board: BoardLook;
  scene: SceneProps | undefined;
  note: string | undefined;
  description: string | undefined;
  descriptionId: string;
  orientation: OrientationTilt;
  retry: () => void;
}

function useScreenLook(choices: LookChoices): ScreenLook {
  const { look, photo } = choices;
  const state = useSceneState(look.scene3d);
  const orientation = useOrientationTilt();
  const reducedMotion = useMedia('(prefers-reduced-motion: reduce)');
  const dark = useMedia('(prefers-color-scheme: dark)');
  const finePointer = useMedia('(hover: hover) and (pointer: fine)');
  const descriptionId = useId();
  const skin = shownSkin(look.skin, photo !== undefined);
  const picture = skinPicture(skin, photo);
  const description = pictureDescription(skin);
  const tilt = tiltMode({ reducedMotion, orientation: orientation.on, finePointer });
  const scene = sceneProps(state, {
    skin: sceneSkin(picture, look.numbers),
    dark,
    reducedMotion,
    tilt,
  });
  return {
    board: {
      skin,
      picture:
        state.ready || picture === undefined ? undefined : { url: picture, badges: look.numbers },
      layered: state.ready,
      describedBy: description === undefined ? undefined : descriptionId,
    },
    scene,
    note: sceneNote(look.scene3d, state.status, state.failed),
    description,
    descriptionId,
    orientation: state.ready && !reducedMotion ? orientation : { ...orientation, available: false },
    retry: () => {
      state.setFailed(false);
    },
  };
}

function Look(props: { choices: LookChoices; screen: ScreenLook }): ReactElement {
  const { choices, screen } = props;
  return (
    <>
      <LookControls
        {...choices}
        sceneNote={screen.note}
        tilt={screen.orientation.available ? { on: screen.orientation.on } : undefined}
        onToggle3d={() => {
          screen.retry();
          choices.onToggle3d();
        }}
        onToggleTilt={screen.orientation.toggle}
      />
      <p id={screen.descriptionId} className="sp-visually-hidden">
        {screen.description}
      </p>
    </>
  );
}

/** The screen's props, as the engine defines them for every game. */
type ScreenProps = Parameters<ClientFeature['Screen']>[0];

function PuzzleScreen(props: ScreenProps): ReactElement {
  // Memoised: the session restarts when its api changes.
  const api = useMemo(() => createGameApi(puzzleDefinition, props.apiBase), [props.apiBase]);
  // One object for the whole screen: the session restarts when the options' identity changes, and
  // reads them when a game starts, so the size is written into it just before each start.
  const [options] = useState<PuzzleOptions>(() => ({}));
  const session = useGameSession(api, props.nickname, options);
  const announced = useAnnouncement(session.game);
  const elapsed = usePlayTime(session);
  const saving = useSavingHint(session.syncing);
  const choices = useLook();
  const screen = useScreenLook(choices);
  const requestedNewGame = useGameEvents(session.game, elapsed, props.onEvent);
  useSkinEvents(choices.look.skin, props.onEvent);
  const current = session.game === undefined ? undefined : sizeOf(session.game.state.board);
  const startGame = (size: Size) => {
    if (session.busy) return;
    options.size = size;
    requestedNewGame();
    session.start();
  };
  return (
    // No heading of its own: the shell has the page's <h1>, the profile bar the one <h2>.
    <section className="sp-puzzle" aria-label="Puzzle">
      <style>{css}</style>
      <Status game={session.game} elapsed={elapsed} saving={saving} />
      <Stage session={session} look={screen.board} scene={screen.scene} />
      <Below session={session} elapsed={elapsed} />
      <Controls
        session={session}
        onNewGame={() => {
          startGame(current ?? DEFAULT_SIZE);
        }}
      />
      <SizeChoice current={current} busy={session.busy} onPick={startGame} />
      <Look choices={choices} screen={screen} />
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
