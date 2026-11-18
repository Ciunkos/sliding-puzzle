// The 3D board's runtime: owns the renderer and the scene, takes the game's state (board, skin,
// tilt, solved) and draws one frame when asked. It never draws on its own: `frame()` says whether
// something still moves, and the hook (use-three-board.ts) only asks for another frame then.
// three.js wiring, named use-*.ts with the other browser wiring; the motion is scene-model.ts.
import {
  Color,
  Group,
  type InstancedMesh,
  NeutralToneMapping,
  Object3D,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  type Texture,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { celebrationSeed, type ConfettiPiece, confettiAt, createConfetti } from './confetti.ts';
import type { SceneSkin } from './look-model.ts';
import { createRng } from './rng.ts';
import type { Board, Size } from './rules.ts';
import {
  approach,
  CANVAS_UNITS,
  cameraDistance,
  CELEBRATION_MS,
  celebrationLift,
  cellCentre,
  cornerAt,
  glowAt,
  type Slide,
  SLIDE_MS,
  slideAt,
  type Tilt,
  type Vec2,
} from './scene-model.ts';
import { CONFETTI_HEX, confettiMesh, lights, tileSizes, trayGroup } from './use-three-parts.ts';
import {
  createTile,
  disposeTile,
  type Paint,
  paintTile,
  type TileObject,
  tileKit,
} from './use-three-tiles.ts';
import {
  DARK_PALETTE,
  floorTexture,
  LIGHT_PALETTE,
  pictureTexture,
  shadowTexture,
} from './use-tile-faces.ts';

export interface SceneRuntime {
  setBoard: (board: Board, finished: boolean, moves: number, now: number) => void;
  setSkin: (skin: SceneSkin, dark: boolean) => void;
  setTilt: (tilt: Tilt) => void;
  resize: (cssPx: number, dpr: number) => void;
  /** Draws one frame at `now`; true while something still moves. */
  frame: (now: number) => boolean;
  dispose: () => void;
}

const FOV = 26;
const TILT_TAU_MS = 90;
const CONFETTI_COUNT = 90;
const DEG = Math.PI / 180;

interface State {
  size: Size;
  board: Board | undefined;
  finished: boolean;
  rest: Map<number, Vec2>;
  slides: Map<number, Slide>;
  celebration: number | undefined;
  corner: number | undefined;
  confetti: ConfettiPiece[];
  tilt: Tilt;
  target: Tilt;
  last: number | undefined;
  skin: SceneSkin;
  dark: boolean;
  picture: Texture | undefined;
  skinVersion: number;
}

interface Parts {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  board: Group;
  tiles: TileObject[];
  corner: TileObject;
  confetti: InstancedMesh;
  thickness: number;
}

function createRenderer(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext): WebGLRenderer {
  // A board of another size reuses the context: undo the upload flags the last renderer left set.
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  const renderer = new WebGLRenderer({ canvas, context: gl, antialias: true, alpha: true });
  renderer.toneMapping = NeutralToneMapping;
  renderer.setClearColor(0x000000, 0);
  return renderer;
}

function environment(renderer: WebGLRenderer, scene: Scene): void {
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.25;
  pmrem.dispose();
}

function buildParts(
  canvas: HTMLCanvasElement,
  gl: WebGL2RenderingContext,
  size: Size,
  dark: boolean,
): Parts {
  const renderer = createRenderer(canvas, gl);
  const scene = new Scene();
  environment(renderer, scene);
  const camera = new PerspectiveCamera(FOV, 1, 0.05, 20);
  camera.position.z = cameraDistance(CANVAS_UNITS, 1, FOV);
  const sizes = tileSizes(size);
  const kit = tileKit(sizes, shadowTexture());
  const palette = dark ? DARK_PALETTE : LIGHT_PALETTE;
  const board = new Group();
  board.add(trayGroup(palette, floorTexture(palette.well), sizes.thickness));
  const tiles = Array.from({ length: size * size - 1 }, (_, i) => createTile(i + 1, kit));
  const corner = createTile(size * size, kit);
  corner.group.visible = false;
  const confetti = confettiMesh(CONFETTI_COUNT);
  for (const object of [...tiles, corner]) board.add(object.shadow, object.group);
  board.add(confetti);
  scene.add(board, lights());
  return { renderer, scene, camera, board, tiles, corner, confetti, thickness: sizes.thickness };
}

function newState(size: Size, dark: boolean): State {
  return {
    size,
    board: undefined,
    finished: false,
    rest: new Map(),
    slides: new Map(),
    celebration: undefined,
    corner: undefined,
    confetti: [],
    tilt: { x: 0, y: 0 },
    target: { x: 0, y: 0 },
    last: undefined,
    skin: { kind: 'numbers' },
    dark,
    picture: undefined,
    skinVersion: 0,
  };
}

/** Where a tile is shown now: mid-slide, or at rest. */
function shownAt(
  state: State,
  tile: number,
  now: number,
  slideMs: number,
): Vec2 & { lift: number } {
  const slide = state.slides.get(tile);
  const rest = state.rest.get(tile) ?? { x: 0, y: 0 };
  if (slide === undefined) return { ...rest, lift: 0 };
  const at = slideAt(slide, now, slideMs);
  if (at.done) state.slides.delete(tile);
  return at;
}

function placeTile(parts: Parts, object: TileObject, at: Vec2, lift: number): void {
  object.group.position.set(at.x, at.y, lift);
  object.shadow.position.set(
    at.x + 0.006 + lift * 0.4,
    at.y - 0.009 - lift * 0.5,
    -parts.thickness + 0.001,
  );
  object.shadow.scale.setScalar(1 + lift * 3);
  object.shadow.material.opacity = Math.max(0.15, 0.6 - lift * 4);
}

function celebrationTime(state: State, now: number): number {
  return state.celebration === undefined ? Infinity : now - state.celebration;
}

/** Places every tile for `now`; true while a slide is still running. */
function stepTiles(parts: Parts, state: State, now: number, slideMs: number): boolean {
  const t = celebrationTime(state, now);
  const glow = glowAt(t);
  for (const object of parts.tiles) {
    const at = shownAt(state, object.tile, now, slideMs);
    const index = state.board?.indexOf(object.tile) ?? 0;
    placeTile(parts, object, at, at.lift + celebrationLift(index, state.size, t));
    object.face.material.emissive.setScalar(glow);
  }
  return state.slides.size > 0;
}

function stepCorner(parts: Parts, state: State, now: number): boolean {
  const { corner } = parts;
  const show = state.corner !== undefined && state.skin.kind === 'picture';
  corner.group.visible = show;
  corner.shadow.visible = show;
  if (!show) return false;
  const t = now - (state.corner ?? now);
  const at = cornerAt(t);
  corner.face.material.transparent = at.opacity < 1;
  corner.face.material.opacity = at.opacity;
  corner.body.material.transparent = at.opacity < 1;
  corner.body.material.opacity = at.opacity;
  placeTile(parts, corner, cellCentre(state.size * state.size - 1, state.size), at.drop);
  return at.opacity < 1;
}

const dummy = new Object3D();

function stepConfetti(parts: Parts, state: State, now: number): boolean {
  const t = celebrationTime(state, now);
  const running = t < CELEBRATION_MS;
  parts.confetti.visible = running;
  if (!running) return false;
  state.confetti.forEach((piece, i) => {
    const at = confettiAt(piece, t);
    dummy.position.set(at.x, at.y, at.z);
    dummy.rotation.set(at.turn * 0.7, at.turn * 0.3, at.turn);
    dummy.scale.setScalar(at.scale);
    dummy.updateMatrix();
    parts.confetti.setMatrixAt(i, dummy.matrix);
  });
  parts.confetti.instanceMatrix.needsUpdate = true;
  return true;
}

function stepTilt(parts: Parts, state: State, dt: number): boolean {
  state.tilt = {
    x: approach(state.tilt.x, state.target.x, dt, TILT_TAU_MS),
    y: approach(state.tilt.y, state.target.y, dt, TILT_TAU_MS),
  };
  parts.board.rotation.set(state.tilt.x * DEG, state.tilt.y * DEG, 0);
  return state.tilt.x !== state.target.x || state.tilt.y !== state.target.y;
}

function startCelebration(
  parts: Parts,
  state: State,
  board: Board,
  moves: number,
  now: number,
): void {
  state.celebration = now;
  state.confetti = createConfetti(createRng(celebrationSeed(board, moves)), CONFETTI_COUNT);
  const colour = new Color();
  state.confetti.forEach((piece, i) => {
    parts.confetti.setColorAt(i, colour.setHex(CONFETTI_HEX[piece.colour] ?? 0xffffff));
  });
  if (parts.confetti.instanceColor !== null) parts.confetti.instanceColor.needsUpdate = true;
}

/** A tile whose cell changed slides there from where it is shown now. */
function moveTiles(state: State, board: Board, now: number): void {
  board.forEach((tile, index) => {
    if (tile === 0) return;
    const to = cellCentre(index, state.size);
    const known = state.rest.has(tile);
    const from = shownAt(state, tile, now, SLIDE_MS);
    state.rest.set(tile, to);
    if (known && (from.x !== to.x || from.y !== to.y))
      state.slides.set(tile, { from, to, start: now });
  });
}

function paintOf(state: State): Paint {
  const palette = state.dark ? DARK_PALETTE : LIGHT_PALETTE;
  if (state.skin.kind === 'numbers') return { kind: 'numbers', palette, won: state.finished };
  return { kind: 'picture', palette, picture: state.picture, badges: state.skin.badges };
}

function repaint(parts: Parts, state: State): void {
  const paint = paintOf(state);
  for (const object of [...parts.tiles, parts.corner]) paintTile(object, state.size, paint);
}

export interface RuntimeOptions {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  size: Size;
  dark: boolean;
  reducedMotion: boolean;
  /** Asks for a frame: the runtime calls it when a picture has loaded. */
  invalidate: () => void;
}

function disposeParts(parts: Parts, state: State): void {
  for (const object of [...parts.tiles, parts.corner]) disposeTile(object);
  parts.scene.traverse((object) => {
    if ('geometry' in object && object.geometry instanceof Object && 'dispose' in object.geometry) {
      (object.geometry as { dispose: () => void }).dispose();
    }
  });
  state.picture?.dispose();
  parts.scene.environment?.dispose();
  parts.renderer.dispose();
}

async function loadPicture(
  parts: Parts,
  state: State,
  url: string,
  invalidate: () => void,
): Promise<void> {
  const version = state.skinVersion;
  const texture = await pictureTexture(url, 1024).catch(() => undefined);
  if (version !== state.skinVersion) {
    texture?.dispose();
    return;
  }
  state.picture?.dispose();
  state.picture = texture;
  repaint(parts, state);
  invalidate();
}

function setSkin(
  parts: Parts,
  state: State,
  options: RuntimeOptions,
  skin: SceneSkin,
  dark: boolean,
): void {
  const before = state.skin;
  state.skin = skin;
  state.dark = dark;
  state.skinVersion += 1;
  const sameUrl = before.kind === 'picture' && skin.kind === 'picture' && before.url === skin.url;
  if (skin.kind === 'picture' && !sameUrl)
    void loadPicture(parts, state, skin.url, options.invalidate);
  repaint(parts, state);
}

/** When the missing corner starts to fade in: now on a win, at once when shown solved or without motion. */
function cornerStart(finished: boolean, celebrate: boolean, now: number): number | undefined {
  if (!finished) return undefined;
  return celebrate ? now : -Infinity;
}

function setBoard(
  parts: Parts,
  state: State,
  options: RuntimeOptions,
  board: Board,
  finished: boolean,
  moves: number,
  now: number,
): void {
  const wasOpen = state.board !== undefined && !state.finished;
  moveTiles(state, board, now);
  state.board = board;
  if (finished !== state.finished) {
    state.finished = finished;
    repaint(parts, state);
  }
  const celebrate = finished && wasOpen && !options.reducedMotion;
  state.corner = cornerStart(finished, celebrate, now);
  if (!finished) state.celebration = undefined;
  if (celebrate) startCelebration(parts, state, board, moves, now);
  if (options.reducedMotion) state.slides.clear();
}

export function createRuntime(options: RuntimeOptions): SceneRuntime {
  const parts = buildParts(options.canvas, options.gl, options.size, options.dark);
  const state = newState(options.size, options.dark);
  repaint(parts, state);
  return {
    setBoard: (board, finished, moves, now) => {
      setBoard(parts, state, options, board, finished, moves, now);
    },
    setSkin: (skin, dark) => {
      setSkin(parts, state, options, skin, dark);
    },
    setTilt: (tilt) => {
      state.target = options.reducedMotion ? { x: 0, y: 0 } : tilt;
    },
    resize: (cssPx, dpr) => {
      parts.renderer.setPixelRatio(Math.min(dpr, 2));
      parts.renderer.setSize(cssPx, cssPx, false);
    },
    frame: (now) => {
      const dt = Math.min(50, now - (state.last ?? now));
      const busy = [
        stepTiles(parts, state, now, options.reducedMotion ? 0 : SLIDE_MS),
        stepCorner(parts, state, now),
        stepConfetti(parts, state, now),
        stepTilt(parts, state, dt),
      ].some(Boolean);
      parts.renderer.render(parts.scene, parts.camera);
      state.last = busy ? now : undefined;
      return busy;
    },
    dispose: () => {
      disposeParts(parts, state);
    },
  };
}
