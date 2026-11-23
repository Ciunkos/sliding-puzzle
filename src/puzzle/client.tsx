// Client entry: the puzzle's client-side feature (its screen). Logic lives in plain .ts files.
// The shell (src/web) renders the page's <main> and <h1>; this screen fills <main>: the board as
// large as the screen allows, the HUD in its corners (hud.tsx) and everything else in the menu
// (menu.tsx), with the page's own part of it (`shellMenu`) at the top.
import {
  Component,
  lazy,
  memo,
  type ReactElement,
  type ReactNode,
  type RefObject,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
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
import { soundChanged } from './events.ts';
import { FpsPanel } from './fps-panel.tsx';
import { Actions, Line, MenuButton, Status, WinCard } from './hud.tsx';
import { LookControls } from './look-controls.tsx';
import {
  pictureDescription,
  sceneNote,
  type SceneStatus,
  sceneSkin,
  tiltMode,
} from './look-model.ts';
import { BestResults, Menu, MenuSection, SizeChoice } from './menu.tsx';
import { paletteStyle } from './palettes.ts';
import { shownSkin } from './preferences.ts';
import { type Size, sizeOf } from './rules.ts';
import { SoundButton, SoundSettings } from './sound-button.tsx';
import { css } from './styles.ts';
import { useAnnouncement } from './use-announcement.ts';
import { type DragView } from './use-board-input.ts';
import { useGameEvents, useSkinEvents } from './use-feature-events.ts';
import { FPS_FLAG } from './use-fps-flag.ts';
import { type LookChoices, useLook } from './use-look.ts';
import { useMedia } from './use-media.ts';
import { useMenu } from './use-menu.ts';
import { useNow } from './use-now.ts';
import { type OrientationTilt, useOrientationTilt } from './use-orientation-tilt.ts';
import { useQuietOnline } from './use-quiet-online.ts';
import { useSavingHint } from './use-saving-hint.ts';
import { type SceneSurface, useSceneSurface } from './use-scene-surface.ts';
import { type Shake, useShake } from './use-shake.ts';
import { type Sound, useSound } from './use-sound.ts';
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

/** A tile to wiggle because it could not move; a new serial wiggles it again. */
type Nudge = { tile: number; serial: number } | undefined;

/** What the board hands back: a move, or a tap or key that moved nothing. */
interface BoardHandlers {
  nudge: Nudge;
  onBlocked: (tile: number | undefined) => void;
}

/**
 * The tile held by a drag, as the stage needs it (data-held): set when it is taken and let go, and
 * with a commit, never per move. The 3D board's cube follows the finger by itself (pullScene).
 */
function useStageHeld() {
  const [held, setHeld] = useState<number | undefined>(undefined);
  const onDrag = useCallback((next: DragView | undefined) => {
    setHeld(next?.tile);
  }, []);
  return { held, onDrag };
}

/**
 * The board's handlers, the same functions across renders (the board is drawn again only when
 * what it draws changes, board-view.tsx), each calling the latest session and nudge.
 */
function useBoardHandlers(session: Session, board: BoardHandlers) {
  const latest = useRef({ session, board });
  latest.current = { session, board };
  const onMove = useCallback((tile: number) => {
    latest.current.session.move({ tile });
  }, []);
  const onBlocked = useCallback((tile: number | undefined) => {
    latest.current.board.onBlocked(tile);
  }, []);
  return { onMove, onBlocked };
}

interface StageProps {
  game: Game | undefined;
  message: string | undefined;
  look: BoardLook;
  scene: SceneProps | undefined;
  shake: Shake;
  /** The stage element: the shake is cleared on it once it has played (use-shake.ts). */
  stageRef: RefObject<HTMLDivElement | null>;
  nudge: Nudge;
  onMove: (tile: number) => void;
  onBlocked: (tile: number | undefined) => void;
}

/** The board, or a square of the same size while the game loads; the 3D board under it. */
function StageDraw(props: StageProps): ReactElement {
  const { game, message, nudge } = props;
  const { held, onDrag } = useStageHeld();
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
    // data-held: the held tile the 3D board is given (e2e checks it goes with the move).
    <div ref={props.stageRef} className="sp-stage" data-shake={props.shake} data-held={held}>
      {props.scene === undefined ? null : <Scene3D scene={{ ...props.scene, nudge }} game={game} />}
      {/* Keyed by size: a new size gets new tiles instead of sliding them out of the old board. */}
      <BoardView
        key={game.state.board.length}
        game={game}
        look={props.look}
        nudge={nudge}
        onBlocked={props.onBlocked}
        onDrag={onDrag}
        onMove={props.onMove}
      />
    </div>
  );
}

/** What the stage draws of a game: a game saved again (a new version, the clock) draws nothing new. */
function drawnGame(game: Game | undefined): string {
  if (game === undefined) return '';
  return [game.startedAt, game.moves, game.finished, game.state.board.join()].join('|');
}

/**
 * What the 3D board is drawn with; its onReady and onLost only set the screen's state, so a new
 * function doing the same is not a change.
 */
function drawnScene(scene: SceneProps | undefined): unknown[] {
  if (scene === undefined) return [];
  return [scene.surface, JSON.stringify([scene.skin, scene.dark, scene.reducedMotion, scene.tilt])];
}

const STAGE_SAME = ['message', 'shake', 'stageRef', 'nudge', 'onMove', 'onBlocked'] as const;

function sameStage(a: StageProps, b: StageProps): boolean {
  const [aSurface, aLooks] = drawnScene(a.scene);
  const [bSurface, bLooks] = drawnScene(b.scene);
  return (
    drawnGame(a.game) === drawnGame(b.game) &&
    JSON.stringify(a.look) === JSON.stringify(b.look) &&
    aSurface === bSurface &&
    aLooks === bLooks &&
    STAGE_SAME.every((name) => a[name] === b[name])
  );
}

/** The stage renders only when what it draws changes: not for the HUD's text, the hint or a save. */
const Stage = memo(StageDraw, sameStage);

/** The board in the middle of the screen, as large as fits. */
function Arena(props: {
  session: Session;
  look: BoardLook;
  scene: SceneProps | undefined;
  board: BoardHandlers;
}): ReactElement {
  const { session } = props;
  const { game } = session;
  const stage = useRef<HTMLDivElement>(null);
  const { onMove, onBlocked } = useBoardHandlers(session, props.board);
  const shake = useShake(
    game === undefined
      ? undefined
      : {
          startedAt: game.startedAt,
          size: game.state.board.length,
          moves: game.moves,
          finished: game.finished,
        },
    stage,
  );
  return (
    <div className="sp-arena">
      <Stage
        game={game}
        message={session.message}
        look={props.look}
        scene={props.scene}
        shake={shake}
        stageRef={stage}
        nudge={props.board.nudge}
        onMove={onMove}
        onBlocked={onBlocked}
      />
    </div>
  );
}

/** The best results on this board size, as lines; none until there is one. */
function bestLines(session: Session): { title: string; lines: string[] } {
  const { game } = session;
  const size = game === undefined ? undefined : sizeOf(game.state.board);
  if (game === undefined || size === undefined) return { title: '', lines: [] };
  const best = bestOf(session.results, puzzleDefinition.variant(game.state));
  return { title: `Best on ${sizeLabel(size)}`, lines: best.map(resultLine) };
}

/**
 * The play time, ticking once a second while a started game is open: its own small component, so
 * a tick renders this text and nothing else of the screen.
 */
function PlayClock(props: { session: Session }): ReactElement {
  const { game } = props.session;
  const playing = game !== undefined && !game.finished && game.moves > 0;
  return <>{formatElapsed(props.session.elapsedMs(useNow(playing)))}</>;
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

/**
 * `hasGame`: a game is on screen. The 3D board's surface is held only while there is one, so the
 * next profile's game (the screen stays, the game goes and comes) gets a fresh surface.
 */
function useScreenLook(choices: LookChoices, hasGame: boolean): ScreenLook {
  const { look, photo } = choices;
  const state = useSceneState(look.scene3d && hasGame);
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

/** The game's state and the things it does, for the screen. */
function usePuzzle(props: ScreenProps) {
  // Memoised: the session restarts when its api changes.
  const api = useMemo(() => createGameApi(puzzleDefinition, props.apiBase), [props.apiBase]);
  // One object for the whole screen: the session restarts when the options' identity changes, and
  // reads them when a game starts, so the size is written into it just before each start.
  const [options] = useState<PuzzleOptions>(() => ({}));
  const session = useGameSession(api, props.nickname, options);
  // Read when an event is reported (a solved game's time), not as a clock that renders the screen.
  const requestedNewGame = useGameEvents(
    session.game,
    () => session.elapsedMs(Date.now()),
    props.onEvent,
  );
  const current = session.game === undefined ? undefined : sizeOf(session.game.state.board);
  const startGame = (size: Size) => {
    if (session.busy) return;
    options.size = size;
    requestedNewGame();
    session.start();
  };
  return { session, current, startGame };
}

type Puzzle = ReturnType<typeof usePuzzle>;
type MenuState = ReturnType<typeof useMenu>;

/** What the player's actions do beyond the game itself: their sound, the wiggle, the menu. */
function actionsOf(props: ScreenProps, puzzle: Puzzle, sound: Sound, menu: MenuState) {
  // One sound per action, and only for an action that happens: none while a request runs.
  const pressed = (action: () => void) => () => {
    if (puzzle.session.busy) return;
    sound.play('press');
    action();
  };
  return {
    newGame: pressed(() => {
      puzzle.startGame(puzzle.current ?? DEFAULT_SIZE);
    }),
    reset: pressed(puzzle.session.reset),
    pickSize: (size: Size) => {
      if (puzzle.session.busy) return;
      menu.close({ quiet: true });
      sound.play('press');
      puzzle.startGame(size);
    },
    openMenu: () => {
      if (!menu.open) sound.play('menu-open');
      menu.show();
    },
    toggleSound: () => {
      // Muted now means on after the toggle.
      props.onEvent?.(soundChanged(sound.preferences.muted));
      sound.toggleMuted();
    },
  };
}

type Actions = ReturnType<typeof actionsOf>;

/** The wiggle of a tile that could not move, and its knock. */
/** How long a wiggle lasts (styles.ts), with a little to spare: then it is over. */
const NUDGE_MS = 320;

/**
 * The wiggle of a tile that could not move, and its knock. The wiggle is cleared once it has played
 * and when another game or size comes, so nothing replays it (a remounted board, 3D switched off).
 */
function useNudge(sound: Sound, game: Game | undefined): BoardHandlers {
  const [nudge, setNudge] = useState<Nudge>(undefined);
  const serial = useRef(0);
  useEffect(() => {
    setNudge(undefined);
  }, [game?.startedAt, game?.state.board.length]);
  useEffect(() => {
    if (nudge === undefined) return undefined;
    const timer = setTimeout(() => {
      setNudge(undefined);
    }, NUDGE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [nudge]);
  return {
    nudge,
    onBlocked: (tile) => {
      sound.play('blocked');
      serial.current += 1;
      if (tile !== undefined) setNudge({ tile, serial: serial.current });
    },
  };
}

/** The menu's content: the game's options first, then the page's own part (`shellMenu`). */
function MenuContent(props: {
  shellMenu: ReactNode;
  puzzle: Puzzle;
  sound: Sound;
  choices: LookChoices;
  screen: ScreenLook;
  onPickSize: (size: Size) => void;
}): ReactElement {
  const { puzzle, sound } = props;
  const best = bestLines(puzzle.session);
  return (
    <>
      <SizeChoice current={puzzle.current} busy={puzzle.session.busy} onPick={props.onPickSize} />
      <MenuSection title="Board look">
        <Look choices={props.choices} screen={props.screen} />
      </MenuSection>
      <MenuSection title="Sound">
        <SoundSettings
          preferences={sound.preferences}
          onToggleEffects={sound.toggleEffects}
          onToggleMusic={sound.toggleMusic}
        />
      </MenuSection>
      <BestResults title={best.title} lines={best.lines} />
      <div className="sp-menu-shell">{props.shellMenu}</div>
    </>
  );
}

type MenuPanelProps = Parameters<typeof MenuContent>[0] & { open: boolean; menu: MenuState };

/** The menu dialog and its content. */
function MenuPanelDraw(props: MenuPanelProps): ReactElement {
  const { menu } = props;
  return (
    <Menu dialogRef={menu.dialog} onClose={menu.close}>
      <MenuContent
        shellMenu={props.shellMenu}
        puzzle={props.puzzle}
        sound={props.sound}
        choices={props.choices}
        screen={props.screen}
        onPickSize={props.onPickSize}
      />
    </Menu>
  );
}

/**
 * Whether a closed menu would show the same: the board size, the best results, the look, the
 * sound switches and the page's own part. A move of the game behind it changes none of these.
 */
function sameClosedMenu(a: MenuPanelProps, b: MenuPanelProps): boolean {
  return (
    a.puzzle.current === b.puzzle.current &&
    bestLines(a.puzzle.session).lines.join() === bestLines(b.puzzle.session).lines.join() &&
    JSON.stringify(a.choices.look) === JSON.stringify(b.choices.look) &&
    a.choices.photo === b.choices.photo &&
    a.choices.photoNote === b.choices.photoNote &&
    a.sound.preferences === b.sound.preferences &&
    a.shellMenu === b.shellMenu
  );
}

/**
 * Closed, the menu is not on screen and takes no input: it renders when it opens (showModal and
 * the open state come in one event) or when something it shows changed, not on every move of the
 * game behind it, so its content is never stale.
 */
const MenuPanel = memo(MenuPanelDraw, (a, b) => !a.open && !b.open && sameClosedMenu(a, b));

/** The top corners and centre: the menu button, moves and time, and the sound button. */
function TopBar(props: {
  menu: MenuState;
  session: Session;
  sound: Sound;
  actions: Actions;
}): ReactElement {
  const { menu, session } = props;
  const saving = useSavingHint(session.syncing);
  return (
    <div className="sp-top">
      <MenuButton buttonRef={menu.button} open={menu.open} onOpen={props.actions.openMenu} />
      <Status
        moves={session.game === undefined ? undefined : statusText(session.game)}
        time={<PlayClock session={session} />}
        saving={saving}
      />
      <SoundButton muted={props.sound.preferences.muted} onToggle={props.actions.toggleSound} />
    </div>
  );
}

/** Everything on the screen itself, around and on the board. */
function Hud(props: {
  menu: MenuState;
  puzzle: Puzzle;
  screen: ScreenLook;
  sound: Sound;
  actions: Actions;
  board: BoardHandlers;
}): ReactElement {
  const { session } = props.puzzle;
  const { actions } = props;
  return (
    <div className="sp-screen">
      <TopBar menu={props.menu} session={session} sound={props.sound} actions={actions} />
      <Arena
        session={session}
        look={props.screen.board}
        scene={props.screen.scene}
        board={props.board}
      />
      <Won session={session} onPlayAgain={actions.newGame} />
      <BottomBar session={session} actions={actions} />
    </div>
  );
}

/**
 * The win card, once the game is solved: in the line's place under the board (free once solved),
 * so it never covers the solved picture. After the board in the DOM, so Tab reaches it next.
 */
function Won(props: { session: Session; onPlayAgain: () => void }) {
  const { game } = props.session;
  if (game?.finished !== true) return null;
  return <WonCard session={props.session} game={game} onPlayAgain={props.onPlayAgain} />;
}

/** The card itself: it reads the time once when it appears (a solved game's time stands still). */
function WonCard(props: { session: Session; game: Game; onPlayAgain: () => void }) {
  const { results, busy } = props.session;
  const elapsed = props.session.elapsedMs(useNow(false));
  return (
    <WinCard
      banner={solvedText(props.game)}
      result={resultText(elapsed, isNewPersonalBest(results, props.game))}
      busy={busy}
      onPlayAgain={props.onPlayAgain}
    />
  );
}

/** The line under the board and the two actions in the bottom corners. */
function BottomBar(props: { session: Session; actions: Actions }): ReactElement {
  const { session, actions } = props;
  const finished = session.game?.finished === true;
  return (
    <>
      <Line
        message={session.message}
        notice={session.notice}
        finished={finished}
        moved={(session.game?.moves ?? 0) > 0}
      />
      <Actions
        busy={session.busy}
        finished={finished}
        onNewGame={actions.newGame}
        onReset={actions.reset}
      />
    </>
  );
}

/** The look choices, with the press sound on picking a picture. */
function useSoundedLook(nickname: string, sound: Sound): LookChoices {
  const choices = useLook(nickname);
  return {
    ...choices,
    onPickSkin: (event) => {
      sound.play('press');
      choices.onPickSkin(event);
    },
  };
}

/** Everything the screen is made of. */
function useScreen(props: ScreenProps) {
  const puzzle = usePuzzle(props);
  const sound = useSound(puzzle.session.game);
  const choices = useSoundedLook(props.nickname, sound);
  const screen = useScreenLook(choices, puzzle.session.game !== undefined);
  const menu = useMenu(() => {
    sound.play('menu-close');
  });
  useSkinEvents(choices.look.skin, props.nickname, props.onEvent);
  // Another profile is another game: the menu that switched to it closes.
  useEffect(() => {
    menu.close();
  }, [props.nickname]);
  const actions = actionsOf(props, puzzle, sound, menu);
  const board = useNudge(sound, puzzle.session.game);
  return { puzzle, sound, choices, screen, menu, actions, board };
}

function PuzzleScreen(props: ScreenProps): ReactElement {
  const { puzzle, sound, choices, screen, menu, actions, board } = useScreen(props);
  const announced = useAnnouncement(puzzle.session.game);
  return (
    // No heading of its own: the shell has the page's <h1>; the menu and the profile have theirs.
    // The page behind the board takes the picture's colours (palettes.ts).
    <section className="sp-puzzle" aria-label="Puzzle" style={paletteStyle(screen.board.skin)}>
      <style>{css}</style>
      <Hud
        menu={menu}
        puzzle={puzzle}
        screen={screen}
        sound={sound}
        actions={actions}
        board={board}
      />
      <MenuPanel
        open={menu.open}
        menu={menu}
        shellMenu={props.shellMenu}
        puzzle={puzzle}
        sound={sound}
        choices={choices}
        screen={screen}
        onPickSize={actions.pickSize}
      />
      <p role="status" data-testid="announcer" className="sp-visually-hidden">
        {announced}
      </p>
      {/* The `?fps` readout, only with ?fps in the address when the page opened. */}
      {FPS_FLAG ? <FpsPanel /> : null}
    </section>
  );
}

export const puzzle: ClientFeature = {
  id: puzzleDefinition.id,
  title: 'Sliding puzzle',
  Screen: PuzzleScreen,
};
