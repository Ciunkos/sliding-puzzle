// The 3D board's runtime: owns the renderer and the scene, takes the game's state (board, skin,
// tilt, solved) and draws one frame when asked. It never draws on its own: `frame()` says whether
// something still moves, and the hook (use-three-board.ts) only asks for another frame then.
// three.js wiring, named use-*.ts with the other browser wiring; the motion is in scene-model.ts
// and effects.ts, the wood in wood.ts.
import {
  ACESFilmicToneMapping,
  Color,
  Group,
  type InstancedMesh,
  type MeshBasicMaterial,
  Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  type PlaneGeometry,
  Scene,
  BufferGeometry,
  Material,
  Texture,
  WebGLRenderer,
} from 'three';
import { celebrationSeed, type ConfettiPiece, confettiAt, createConfetti } from './confetti.ts';
import {
  createDust,
  DUST_MS,
  type DustMote,
  dustAt,
  dustOpacity,
  IMPACT_MS,
  LANDING_KICK,
  nudgeDirection,
  SHAKE_MS,
  shakeAt,
  squashAt,
  WIGGLE_MS,
  wiggleAt,
  WIN_KICK,
} from './effects.ts';
import {
  detectCap,
  type FrameReadout,
  frameStats,
  nextQuality,
  type Quality,
  recent,
  renderScale,
} from './frame-model.ts';
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
  adjacentToGap,
  cornerAt,
  dragAt,
  glowAt,
  grabOffsetAt,
  type Slide,
  SLIDE_MS,
  slideAt,
  type Tilt,
  type Vec2,
} from './scene-model.ts';
import {
  CONFETTI_HEX,
  confettiMesh,
  contactShadows,
  dustMesh,
  type LightLook,
  type Lights,
  lights,
  tileSizes,
  trayGroup,
} from './use-three-parts.ts';
import {
  createTile,
  disposeTile,
  type Paint,
  paintTile,
  type TileObject,
  type TileWood,
  tileKit,
} from './use-three-tiles.ts';
import {
  dustTexture,
  endGrain,
  type FeltMaps,
  feltMaps,
  numberAtlas,
  pause,
  type PlankTextures,
  pictureTexture,
  plankOf,
  shadowTexture,
} from './use-tile-faces.ts';
import { DARK_WOOD, LIGHT_WOOD, type WoodTheme } from './wood.ts';

export interface SceneRuntime {
  setBoard: (board: Board, finished: boolean, moves: number, now: number) => void;
  setSkin: (skin: SceneSkin, dark: boolean) => void;
  setTilt: (tilt: Tilt) => void;
  /** A tile the player tapped that cannot move: it wiggles toward the gap. */
  nudge: (tile: number, now: number) => void;
  /**
   * The player pulls `tile` from its cell toward the gap, `progress` (0..1) of the way: the cube
   * sits exactly there. Undefined lets go: it springs back from where it is, unless the board has
   * moved it meanwhile (a committed move slides on from the dragged place). Ignored without motion.
   */
  drag: (tile: number, progress: number | undefined, now: number) => void;
  resize: (cssPx: number, dpr: number) => void;
  /** Draws one frame at `now`; true while something still moves. */
  frame: (now: number) => boolean;
  dispose: () => void;
}

const FOV = 26;
const TILT_TAU_MS = 90;
const CONFETTI_COUNT = 140;
const DUST_COUNT = 24;
/** The puff in board widths is scaled up this much: it billows out of the gap and over the cubes. */
const DUST_BILLOW = 4;
const DEG = Math.PI / 180;
/** Seeds of the planks: fixed, so a board always shows the same wood. */
const TILE_SEED = 1907;
const TRAY_SEED = 2203;

/** One theme's woods and lights. */
interface Look {
  wood: WoodTheme;
  light: LightLook;
  dust: number;
}

const LIGHT_LOOK: Look = {
  wood: LIGHT_WOOD,
  light: {
    key: 0xfff0dc,
    keyIntensity: 2.4,
    sky: 0xfff3e2,
    ground: 0x7a5636,
    skyIntensity: 1.5,
    rim: 0xffe2bd,
  },
  dust: 0x9c876a,
};

const DARK_LOOK: Look = {
  wood: DARK_WOOD,
  light: {
    key: 0xffd6a0,
    keyIntensity: 2.6,
    sky: 0xffe0b8,
    ground: 0x3a2214,
    skyIntensity: 1.0,
    rim: 0xffc98a,
  },
  dust: 0xd8b48a,
};

interface Dust {
  start: number;
  origin: Vec2;
  ahead: Vec2;
  width: number;
  motes: DustMote[];
}

interface Kick {
  start: number;
  strength: number;
}

interface Nudge {
  start: number;
  way: Vec2;
}

interface State {
  size: Size;
  board: Board | undefined;
  finished: boolean;
  rest: Map<number, Vec2>;
  slides: Map<number, Slide>;
  nudges: Map<number, Nudge>;
  celebration: number | undefined;
  corner: number | undefined;
  confetti: ConfettiPiece[];
  dust: Dust | undefined;
  kick: Kick | undefined;
  tilt: Tilt;
  target: Tilt;
  last: number | undefined;
  skin: SceneSkin;
  picture: Texture | undefined;
  skinVersion: number;
  drag: Pull | undefined;
  /** Tiles springing back from a drag: no landing squash. */
  quiet: Set<number>;
  frames: FrameClock;
}

/** A cube the player pulls: how far, and where it was shown when grabbed (blended away). */
interface Pull {
  tile: number;
  progress: number;
  /** From the finger's place to where the cube was shown at the grab, its lift then, and when. */
  offset: Vec2;
  lift: number;
  since: number;
}

/** What the runtime knows about its own frames: timing, quality, the shadow map's freshness. */
interface FrameClock {
  level: Quality;
  /** The level the renderer is set up for; another one is applied in the next frame. */
  applied: Quality | undefined;
  css: number;
  dpr: number;
  /** The previous frame's time, and whether this frame follows it at once (a running loop). */
  last: number | undefined;
  chained: boolean;
  /** Recent frame intervals: all of them, and those drawn while cubes moved. */
  all: number[];
  moving: number[];
  /** Cubes moved in the last frame: the shadow map must be redrawn once more after they stop. */
  wasMoving: boolean;
  shadowsStale: boolean;
  statsAt: number;
  renderer: string | undefined;
}

interface Parts {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  rest: number;
  board: Group;
  tiles: TileObject[];
  corner: TileObject;
  confetti: InstancedMesh;
  dust: InstancedMesh<PlaneGeometry, MeshBasicMaterial>;
  contact: InstancedMesh<PlaneGeometry, MeshBasicMaterial>;
  lights: Lights;
  wood: TileWood;
  thickness: number;
  body: number;
}

function createRenderer(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext): WebGLRenderer {
  // A board of another size reuses the context: undo the upload flags the last renderer left set.
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  const renderer = new WebGLRenderer({ canvas, context: gl, antialias: true, alpha: true });
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  // Redrawn only in frames where a cube moved (frame()): the light turns with the board on tilt.
  renderer.shadowMap.autoUpdate = false;
  renderer.setClearColor(0x000000, 0);
  return renderer;
}

/** The textures a board needs, generated in slices (use-tile-faces.ts) and kept per theme. */
interface Assets {
  wood: TileWood;
  tray: PlankTextures;
  felt: FeltMaps;
}

/** A sharper atlas cell for the bigger tiles of small boards. */
function numberCell(size: Size): number {
  return size === 3 ? 384 : 256;
}

async function loadAssets(look: Look, size: Size): Promise<Assets> {
  const theme = look.wood;
  const textures = await plankOf(theme.tile, TILE_SEED, 768);
  const numbers = await numberAtlas(size * size - 1, numberCell(size), theme.numbers);
  const tray = await plankOf(theme.tray, TRAY_SEED, 512);
  const felt = await feltMaps(theme.felt, TRAY_SEED);
  const endGrainMap = endGrain(theme.tile, TILE_SEED);
  return {
    wood: { theme, textures, numbers, seed: TILE_SEED, endGrain: endGrainMap },
    tray,
    felt,
  };
}

function buildTiles(size: Size, wood: TileWood) {
  const sizes = tileSizes(size);
  const kit = tileKit(sizes, wood);
  const tiles = Array.from({ length: size * size - 1 }, (_, i) => createTile(i + 1, kit));
  const corner = createTile(size * size, kit);
  corner.group.visible = false;
  return { sizes, tiles, corner };
}

function buildParts(options: RuntimeOptions, look: Look, assets: Assets): Parts {
  const { canvas, gl, size } = options;
  const renderer = createRenderer(canvas, gl);
  const scene = new Scene();
  // Its world matrices are updated once a frame by followShadow, before the render.
  scene.matrixWorldAutoUpdate = false;
  const camera = new PerspectiveCamera(FOV, 1, 0.05, 20);
  const rest = cameraDistance(CANVAS_UNITS, 1, FOV);
  camera.position.z = rest;
  // Views of the cached images: this runtime owns (and frees) them, the images stay for the next.
  const wood = { ...assets.wood, endGrain: assets.wood.endGrain.clone() };
  const { sizes, tiles, corner } = buildTiles(size, wood);
  const board = new Group();
  const tray = {
    wood: {
      map: assets.tray.map.clone(),
      normalMap: assets.tray.normalMap.clone(),
      roughnessMap: assets.tray.roughnessMap.clone(),
    },
    felt: { map: assets.felt.map.clone(), normalMap: assets.felt.normalMap.clone() },
    shadow: shadowTexture(9, 5),
  };
  board.add(trayGroup(tray, sizes.thickness));
  const confetti = confettiMesh(CONFETTI_COUNT);
  const dust = dustMesh(DUST_COUNT, dustTexture(), look.dust);
  const contact = contactShadows(tiles.length + 1, sizes.body * 1.3, shadowTexture());
  for (const object of [...tiles, corner]) board.add(object.group);
  board.add(contact, confetti, dust);
  // The lights (and the key light's target) turn with the board: on a tilt the shadow map's
  // content stays valid and only its matrices follow (followShadow), so it is not redrawn.
  const light = lights(look.light);
  board.add(light.group);
  scene.add(board);
  return {
    ...{ renderer, scene, camera, rest, board, tiles, corner, confetti, dust, contact, wood },
    lights: light,
    thickness: sizes.thickness,
    body: sizes.body,
  };
}

function newState(size: Size, level: Quality): State {
  return {
    size,
    board: undefined,
    finished: false,
    rest: new Map(),
    slides: new Map(),
    nudges: new Map(),
    celebration: undefined,
    corner: undefined,
    confetti: [],
    dust: undefined,
    kick: undefined,
    tilt: { x: 0, y: 0 },
    target: { x: 0, y: 0 },
    last: undefined,
    skin: { kind: 'numbers' },
    picture: undefined,
    skinVersion: 0,
    drag: undefined,
    quiet: new Set(),
    frames: newClock(level),
  };
}

function newClock(level: Quality): FrameClock {
  return {
    ...{ level, applied: undefined, css: 0, dpr: 1, last: undefined, chained: false },
    ...{ all: [], moving: [], wasMoving: true, shadowsStale: true, statsAt: 0 },
    renderer: undefined,
  };
}

/** Where a tile is shown now: mid-slide, or at rest, and how squashed it is from landing. */
function shownAt(
  state: State,
  tile: number,
  now: number,
  slideMs: number,
): Vec2 & { lift: number; squash: number } {
  const slide = state.slides.get(tile);
  const rest = state.rest.get(tile) ?? { x: 0, y: 0 };
  if (state.drag?.tile === tile) return { ...draggedAt(state, rest, now), squash: 0 };
  if (slide === undefined || slideMs <= 0) return { ...rest, lift: 0, squash: 0 };
  const at = slideAt(slide, now, slideMs);
  if (at.done) {
    state.slides.delete(tile);
    state.quiet.delete(tile);
  }
  const squash = state.quiet.has(tile) ? 0 : squashAt(now - slide.start);
  return { ...at, squash };
}

/** Where the finger's pull puts a cube: its share of the way from its cell to the gap. */
function pulledTo(state: State, rest: Vec2, progress: number): Vec2 {
  const gap = state.board?.indexOf(0) ?? -1;
  if (gap < 0) return rest;
  return dragAt(rest, cellCentre(gap, state.size), progress);
}

/**
 * Where the dragged cube is: where the pull puts it, plus what is left of the grab's offset and
 * of the lift it had (a cube grabbed mid-slide comes down to the felt as it catches up).
 */
function draggedAt(state: State, rest: Vec2, now: number): Vec2 & { lift: number } {
  const pull = state.drag;
  if (pull === undefined) return { ...rest, lift: 0 };
  const at = pulledTo(state, rest, pull.progress);
  const left = grabOffsetAt(pull.offset, now - pull.since);
  const lift = grabOffsetAt({ x: pull.lift, y: 0 }, now - pull.since).x;
  return { x: at.x + left.x, y: at.y + left.y, lift };
}

/** The grabbed cube is still catching up with the finger. */
function catchingUp(state: State, now: number): boolean {
  const pull = state.drag;
  if (pull === undefined) return false;
  const left = grabOffsetAt(pull.offset, now - pull.since);
  return left.x !== 0 || left.y !== 0;
}

/** Where a blocked tile is pushed and how far it turns `now`; done nudges are dropped. */
function nudgeAt(state: State, tile: number, now: number): { x: number; y: number; turn: number } {
  const nudge = state.nudges.get(tile);
  if (nudge === undefined) return { x: 0, y: 0, turn: 0 };
  const t = now - nudge.start;
  if (t >= WIGGLE_MS) state.nudges.delete(tile);
  const at = wiggleAt(t);
  return { x: nudge.way.x * at.push, y: nudge.way.y * at.push, turn: at.turn };
}

/** A scratch object for building instance matrices. */
const dummy = new Object3D();

interface Pose {
  x: number;
  y: number;
  lift: number;
  squash: number;
  turn: number;
}

function placeTile(parts: Parts, object: TileObject, pose: Pose, slot: number): void {
  // A squash keeps the cube's bottom on the felt: its top comes down, it spreads a little.
  const height = 1 - pose.squash;
  object.group.position.set(pose.x, pose.y, pose.lift - parts.thickness * pose.squash);
  object.group.scale.set(1 + pose.squash * 0.3, 1 + pose.squash * 0.3, height);
  object.group.rotation.z = pose.turn;
  // Its contact shadow spreads and pales as it lifts (each shadow's opacity is its colour's red).
  dummy.position.set(
    pose.x + 0.004 + pose.lift * 0.4,
    pose.y - 0.006 - pose.lift * 0.5,
    -parts.thickness + 0.001,
  );
  dummy.rotation.set(0, 0, 0);
  dummy.scale.setScalar(object.group.visible ? 1 + pose.lift * 3 : 0);
  dummy.updateMatrix();
  parts.contact.setMatrixAt(slot, dummy.matrix);
  parts.contact.instanceMatrix.needsUpdate = true;
  parts.contact.setColorAt(slot, shade.setScalar(Math.max(0.12, 0.45 - pose.lift * 4) / 0.45));
  if (parts.contact.instanceColor !== null) parts.contact.instanceColor.needsUpdate = true;
}

/** A scratch colour for the contact shadows' opacities. */
const shade = new Color();

function celebrationTime(state: State, now: number): number {
  return state.celebration === undefined ? Infinity : now - state.celebration;
}

/** Places every tile for `now`; true while a slide or a wiggle is still running. */
function stepTiles(parts: Parts, state: State, now: number, slideMs: number): boolean {
  const t = celebrationTime(state, now);
  const glow = glowAt(t);
  parts.tiles.forEach((object, slot) => {
    const at = shownAt(state, object.tile, now, slideMs);
    const nudge = nudgeAt(state, object.tile, now);
    const index = state.board?.indexOf(object.tile) ?? 0;
    const lift = at.lift + celebrationLift(index, state.size, t);
    const pose = {
      x: at.x + nudge.x,
      y: at.y + nudge.y,
      lift,
      squash: at.squash,
      turn: nudge.turn,
    };
    placeTile(parts, object, pose, slot);
    object.face.material.emissive.setScalar(glow);
  });
  parts.lights.key.intensity = parts.lights.base * (1 + glow * 1.4);
  return state.slides.size > 0 || state.nudges.size > 0 || catchingUp(state, now);
}

function stepCorner(parts: Parts, state: State, now: number): boolean {
  const { corner } = parts;
  const show = state.corner !== undefined && state.skin.kind === 'picture';
  corner.group.visible = show;
  if (!show) {
    placeTile(parts, corner, { x: 0, y: 0, lift: 0, squash: 0, turn: 0 }, parts.tiles.length);
    return false;
  }
  const t = now - (state.corner ?? now);
  const at = cornerAt(t);
  corner.face.material.transparent = at.opacity < 1;
  corner.face.material.opacity = at.opacity;
  for (const material of corner.body.material) {
    material.transparent = at.opacity < 1;
    material.opacity = at.opacity;
  }
  const home = cellCentre(state.size * state.size - 1, state.size);
  placeTile(parts, corner, { ...home, lift: at.drop, squash: 0, turn: 0 }, parts.tiles.length);
  return at.opacity < 1;
}

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

/** The puff where a cube landed: motes drift ahead of its leading edge and rise into the light. */
function stepDust(parts: Parts, state: State, now: number): boolean {
  const dust = state.dust;
  const t = dust === undefined ? Infinity : now - dust.start;
  parts.dust.visible = dust !== undefined && t > 0 && t < DUST_MS;
  if (dust === undefined || t >= DUST_MS) {
    state.dust = undefined;
    return false;
  }
  const side = { x: -dust.ahead.y, y: dust.ahead.x };
  dust.motes.forEach((mote, i) => {
    const at = dustAt(mote, t);
    const along = mote.along * dust.width * 1.15 + at.across * DUST_BILLOW;
    dummy.position.set(
      dust.origin.x + dust.ahead.x * at.ahead * DUST_BILLOW + side.x * along,
      dust.origin.y + dust.ahead.y * at.ahead * DUST_BILLOW + side.y * along,
      0.003 + at.z * DUST_BILLOW,
    );
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(at.scale);
    dummy.updateMatrix();
    parts.dust.setMatrixAt(i, dummy.matrix);
  });
  parts.dust.instanceMatrix.needsUpdate = true;
  parts.dust.material.opacity = dustOpacity(t) * 0.9;
  return true;
}

/** The camera's kick; at rest it stands exactly where the DOM buttons line up with the tiles. */
function stepCamera(parts: Parts, state: State, now: number): boolean {
  const kick = state.kick;
  const t = kick === undefined ? Infinity : now - kick.start;
  const at = kick === undefined ? { x: 0, y: 0 } : shakeAt(t, kick.strength);
  parts.camera.position.set(at.x, at.y, parts.rest);
  if (t >= SHAKE_MS) state.kick = undefined;
  return state.kick !== undefined;
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
  state.kick = { start: now + IMPACT_MS, strength: WIN_KICK };
  state.confetti = createConfetti(createRng(celebrationSeed(board, moves)), CONFETTI_COUNT);
  const colour = new Color();
  state.confetti.forEach((piece, i) => {
    parts.confetti.setColorAt(i, colour.setHex(CONFETTI_HEX[piece.colour] ?? 0xffffff));
  });
  if (parts.confetti.instanceColor !== null) parts.confetti.instanceColor.needsUpdate = true;
}

/** The landing of the cube that slid into the old gap: a puff at its leading edge and a kick. */
function startLanding(
  parts: Parts,
  state: State,
  landing: { from: Vec2; to: Vec2; seed: number },
  now: number,
): void {
  const dx = landing.to.x - landing.from.x;
  const dy = landing.to.y - landing.from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return;
  const ahead = { x: dx / length, y: dy / length };
  const reach = parts.body / 2;
  state.dust = {
    start: now + IMPACT_MS,
    origin: { x: landing.to.x + ahead.x * reach, y: landing.to.y + ahead.y * reach },
    ahead,
    width: parts.body,
    motes: createDust(createRng(landing.seed), DUST_COUNT),
  };
  state.kick = { start: now + IMPACT_MS, strength: LANDING_KICK };
}

/** A tile whose cell changed slides there from where it is shown now; returns the one that filled the gap. */
function moveTiles(state: State, board: Board, now: number): number | undefined {
  const gap = state.board?.indexOf(0);
  let landed: number | undefined;
  board.forEach((tile, index) => {
    if (tile === 0) return;
    const to = cellCentre(index, state.size);
    const known = state.rest.has(tile);
    const from = shownAt(state, tile, now, SLIDE_MS);
    state.rest.set(tile, to);
    if (!known || (from.x === to.x && from.y === to.y)) return;
    state.slides.set(tile, { from, to, start: now });
    state.quiet.delete(tile);
    // A dragged cube that the move took: it slides on from where the finger left it.
    if (state.drag?.tile === tile) state.drag = undefined;
    if (index === gap) landed = tile;
  });
  return landed;
}

function paintOf(parts: Parts, state: State): Paint {
  const wood = parts.wood;
  if (state.skin.kind === 'numbers') return { kind: 'numbers', wood, won: state.finished };
  return { kind: 'picture', wood, picture: state.picture, badges: state.skin.badges };
}

function repaint(parts: Parts, state: State): void {
  const paint = paintOf(parts, state);
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
  /** True once the scene is no longer wanted: a build in progress stops and frees what it made. */
  cancelled: () => boolean;
  /** What the board shows first: a picture is loaded before the runtime is handed over. */
  skin: SceneSkin;
  /**
   * Called once the textures are ready, before the build touches the GL context: it resolves when
   * the context is free for this build (true), or false when the build should give up.
   */
  claim: () => Promise<boolean>;
  /** The quality level to start at (frame-model.ts). */
  quality: Quality;
  /** Told when the runtime steps its quality down, so the device can remember it. */
  onQuality: (level: Quality) => void;
  /** When set (the `?fps` readout), told about every half second how the frames go. */
  onStats: ((stats: FrameReadout) => void) | undefined;
}

/** The build is no longer wanted, or its context is gone (3D switched off, or the GPU reset). */
function given(options: RuntimeOptions): boolean {
  return options.cancelled() || options.gl.isContextLost();
}

/** Everything the scene's objects hold: materials, the textures they show, geometries. */
function heldBy(scene: Scene) {
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  const geometries = new Set<{ dispose: () => void }>();
  scene.traverse((object) => {
    const geometry: unknown = Reflect.get(object, 'geometry');
    if (geometry instanceof BufferGeometry) geometries.add(geometry);
    const material: unknown = Reflect.get(object, 'material');
    for (const one of Array.isArray(material) ? material : [material]) {
      if (one instanceof Material) materials.add(one as Material);
    }
  });
  for (const material of materials) {
    for (const value of Object.values(material))
      if (value instanceof Texture) textures.add(value as Texture);
  }
  return { materials, textures, geometries };
}

function disposeParts(parts: Parts, state: State): void {
  // A picture still loading is dropped (and freed) when it arrives.
  state.skinVersion += 1;
  for (const object of [...parts.tiles, parts.corner]) disposeTile(object);
  const held = heldBy(parts.scene);
  for (const texture of held.textures) texture.dispose();
  for (const material of held.materials) material.dispose();
  for (const geometry of held.geometries) geometry.dispose();
  state.picture?.dispose();
  state.picture = undefined;
  parts.renderer.dispose();
}

async function loadPicture(
  parts: Parts,
  state: State,
  url: string,
  invalidate: () => void,
): Promise<void> {
  const version = state.skinVersion;
  const texture = await pictureTexture(url, 1024, state.size, parts.wood.textures.map).catch(
    () => undefined,
  );
  if (version !== state.skinVersion) {
    texture?.dispose();
    return;
  }
  state.picture?.dispose();
  state.picture = texture;
  repaint(parts, state);
  invalidate();
}

/** Shows `skin`; a new picture loads in the background, and the promise says when it has. */
function setSkin(
  parts: Parts,
  state: State,
  options: RuntimeOptions,
  skin: SceneSkin,
): Promise<void> {
  const before = state.skin;
  state.skin = skin;
  state.skinVersion += 1;
  // The missing corner shows only with a picture: its shadow comes and goes with the skin.
  state.frames.shadowsStale = true;
  const sameUrl = before.kind === 'picture' && skin.kind === 'picture' && before.url === skin.url;
  const loading =
    skin.kind === 'picture' && !sameUrl
      ? loadPicture(parts, state, skin.url, options.invalidate)
      : Promise.resolve();
  repaint(parts, state);
  return loading;
}

/** When the missing corner starts to fade in: now on a win, at once when shown solved or without motion. */
function cornerStart(finished: boolean, celebrate: boolean, now: number): number | undefined {
  if (!finished) return undefined;
  return celebrate ? now : -Infinity;
}

/** Moves the tiles and, with motion, starts the landing of the one that filled the gap. */
function moveAndLand(parts: Parts, state: State, motion: boolean, update: BoardUpdate): void {
  const landed = moveTiles(state, update.board, update.now);
  const slide = landed === undefined ? undefined : state.slides.get(landed);
  if (!motion || slide === undefined) return;
  const seed = celebrationSeed(update.board, update.moves);
  startLanding(parts, state, { ...slide, seed }, update.now);
}

interface BoardUpdate {
  board: Board;
  finished: boolean;
  moves: number;
  now: number;
}

function setBoard(parts: Parts, state: State, options: RuntimeOptions, update: BoardUpdate): void {
  const { board, finished, moves, now } = update;
  // Without motion a move puts the cube in place at once, and a win drops the corner in: the
  // shadow map must follow even though nothing slides.
  state.frames.shadowsStale = true;
  const wasOpen = state.board !== undefined && !state.finished;
  const motion = !options.reducedMotion;
  moveAndLand(parts, state, motion, update);
  state.board = board;
  if (finished !== state.finished) {
    state.finished = finished;
    repaint(parts, state);
  }
  const celebrate = finished && wasOpen && motion;
  state.corner = cornerStart(finished, celebrate, now);
  if (!finished) state.celebration = undefined;
  if (celebrate) startCelebration(parts, state, board, moves, now);
  if (!motion) state.slides.clear();
}

function drag(
  state: State,
  options: RuntimeOptions,
  pull: { tile: number; progress: number | undefined },
  now: number,
): void {
  const { tile, progress } = pull;
  // No motion, or a tile that is not on this board (the gap, a stale number): nothing to pull.
  if (options.reducedMotion || !state.rest.has(tile)) return;
  state.frames.shadowsStale = true;
  if (progress !== undefined) {
    grab(state, tile, progress, now);
    return;
  }
  if (state.drag?.tile !== tile) return;
  const rest = state.rest.get(tile) ?? { x: 0, y: 0 };
  const at = draggedAt(state, rest, now);
  const from = { x: at.x, y: at.y };
  state.drag = undefined;
  // Let go before the move: back to its cell from where it is, without a landing.
  state.slides.set(tile, { from, to: rest, start: now });
  state.quiet.add(tile);
}

/**
 * Pulls `tile` `progress` of the way to the gap. Only a cube beside the gap can be pulled. A new
 * grab starts from where the cube is shown (mid-slide, say) and catches up with the finger.
 */
function grab(state: State, tile: number, progress: number, now: number): void {
  const board = state.board;
  if (board === undefined || !adjacentToGap(board, tile, state.size)) return;
  if (state.drag?.tile === tile) {
    state.drag = { ...state.drag, progress };
    return;
  }
  const shown = shownAt(state, tile, now, SLIDE_MS);
  const rest = state.rest.get(tile) ?? { x: 0, y: 0 };
  const finger = pulledTo(state, rest, progress);
  state.slides.delete(tile);
  state.quiet.delete(tile);
  const offset = { x: shown.x - finger.x, y: shown.y - finger.y };
  state.drag = { tile, progress, offset, lift: shown.lift, since: now };
}

/** Sizes the drawing buffer for the board's CSS width, the screen and the quality level. */
function fit(parts: Parts, state: State): void {
  const { css, dpr, level } = state.frames;
  if (css <= 0) return;
  parts.renderer.setPixelRatio(renderScale(css, dpr, level));
  parts.renderer.setSize(css, css, false);
}

/**
 * Sets the renderer up for the clock's level, in the frame about to be drawn (so no cleared canvas
 * shows): 0 a 1024 px shadow map, 1 a 512 px one, 2 none (stronger contact shadows), 3 also a
 * smaller drawing buffer. Turning the shadow map off recompiles the materials once.
 */
function applyQuality(parts: Parts, state: State): void {
  const clock = state.frames;
  if (clock.applied === clock.level) return;
  const { renderer } = parts;
  const shadows = clock.level < 2;
  if (renderer.shadowMap.enabled !== shadows) {
    renderer.shadowMap.enabled = shadows;
    for (const material of heldBy(parts.scene).materials) material.needsUpdate = true;
  }
  const side = clock.level === 0 ? 1024 : 512;
  const { shadow } = parts.lights.key;
  if (shadow.mapSize.x !== side) {
    shadow.mapSize.set(side, side);
    shadow.map?.dispose();
    shadow.map = null;
  }
  parts.contact.material.opacity = shadows ? 0.45 : 0.6;
  clock.applied = clock.level;
  clock.shadowsStale = true;
  fit(parts, state);
}

const KEPT_FRAMES = 240;
/** Frames drawn while cubes move, judged together for the quality (about a second at 60 fps). */
const JUDGED_FRAMES = 60;

function keep(list: number[], value: number, most: number): void {
  list.push(value);
  if (list.length > most) list.shift();
}

/**
 * The GPU's name for the readout. Chrome masks RENDERER as "WebKit WebGL" and gives the real name
 * through the debug extension; Firefox and Safari give it plainly (and Firefox warns about the
 * extension), so the extension is asked only when the name is masked.
 */
function rendererName(gl: WebGLRenderingContext | WebGL2RenderingContext): string {
  const plain = String(gl.getParameter(gl.RENDERER));
  if (plain !== 'WebKit WebGL') return plain;
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  return debug === null ? plain : String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL));
}

/** What the readout shows, from the last second of frames. */
function readout(parts: Parts, state: State): FrameReadout {
  const clock = state.frames;
  const last = recent(clock.all, 1000);
  const gl = parts.renderer.getContext();
  clock.renderer ??= rendererName(gl);
  return {
    ...frameStats(last),
    ...{ width: gl.drawingBufferWidth, height: gl.drawingBufferHeight },
    ...{ level: clock.level, cap: detectCap(last), renderer: clock.renderer },
  };
}

/** Keeps the frame's interval, judges the quality from frames of moving cubes, reports stats. */
function record(parts: Parts, state: State, options: RuntimeOptions, sample: FrameSample): void {
  const clock = state.frames;
  if (sample.interval !== undefined) {
    keep(clock.all, sample.interval, KEPT_FRAMES);
    if (sample.cubes) keep(clock.moving, sample.interval, JUDGED_FRAMES);
  }
  if (clock.moving.length >= JUDGED_FRAMES) {
    const next = nextQuality(clock.level, clock.moving);
    clock.moving = [];
    if (next !== clock.level) {
      clock.level = next;
      options.onQuality(next);
    }
  }
  if (options.onStats !== undefined && sample.now - clock.statsAt >= 500) {
    clock.statsAt = sample.now;
    options.onStats(readout(parts, state));
  }
}

interface FrameSample {
  now: number;
  /** Time since the frame before, when this frame followed it in a running loop. */
  interval: number | undefined;
  /** Cubes moved in this frame. */
  cubes: boolean;
}

function nudge(state: State, options: RuntimeOptions, tile: number, now: number): void {
  if (options.reducedMotion || state.board === undefined) return;
  const way = nudgeDirection(state.board, tile, state.size);
  state.nudges.set(tile, { start: now, way });
}

/**
 * Keeps the key light's shadow on the tilted board without redrawing it. The light and its target
 * turn with the board; the shadow camera's up turns with it too, so the light's whole view is the
 * board's turned rigidly: the map's depths still hold, and only its matrices are recomputed
 * (three does that itself only when it redraws the map).
 */
function followShadow(parts: Parts): void {
  const { key } = parts.lights;
  // Once a frame, here; the render does not repeat it (matrixWorldAutoUpdate is off).
  parts.scene.updateMatrixWorld();
  key.shadow.camera.up.set(0, 1, 0).applyQuaternion(parts.board.quaternion);
  key.shadow.updateMatrices(key);
}

/** Steps everything for `now`; whether anything still moves, and whether a cube moved. */
function step(parts: Parts, state: State, options: RuntimeOptions, now: number) {
  const dt = Math.min(50, now - (state.last ?? now));
  const tiles = stepTiles(parts, state, now, options.reducedMotion ? 0 : SLIDE_MS);
  const corner = stepCorner(parts, state, now);
  const celebrating = celebrationTime(state, now) < CELEBRATION_MS;
  const busy = [
    tiles,
    corner,
    stepConfetti(parts, state, now),
    stepDust(parts, state, now),
    stepCamera(parts, state, now),
    stepTilt(parts, state, dt),
  ].some(Boolean);
  return { busy, cubes: tiles || corner || celebrating || state.drag !== undefined };
}

function frame(parts: Parts, state: State, options: RuntimeOptions, now: number): boolean {
  const clock = state.frames;
  const interval = clock.chained && clock.last !== undefined ? now - clock.last : undefined;
  applyQuality(parts, state);
  const { busy, cubes } = step(parts, state, options, now);
  // The shadow map is redrawn only when a cube moved (and once more after it stopped); a tilt
  // only moves its matrices (followShadow).
  followShadow(parts);
  parts.renderer.shadowMap.needsUpdate = cubes || clock.wasMoving || clock.shadowsStale;
  clock.wasMoving = cubes;
  clock.shadowsStale = false;
  parts.renderer.render(parts.scene, parts.camera);
  record(parts, state, options, { now, interval, cubes });
  clock.last = now;
  clock.chained = busy || options.onStats !== undefined;
  state.last = busy ? now : undefined;
  return busy;
}

/** Whether every program `materials` need is compiled and linked, asked without blocking. */
function programsReady(parts: Parts, materials: Iterable<Material>): boolean {
  for (const material of materials) {
    // three's own record of the material: the program it compiled, which can say if it is linked.
    const held = parts.renderer.properties.get(material) as {
      currentProgram?: { isReady?: () => boolean };
    } | null;
    const program = held?.currentProgram;
    if (program?.isReady !== undefined && !program.isReady()) return false;
  }
  return true;
}

/**
 * Compiles the shaders an object at a time (the first of each kind builds its program), letting
 * the page run in between, then waits until the GPU has them linked without blocking on it. Gives
 * up (false) as soon as the build is no longer wanted: three's compileAsync would poll forever
 * on a lost context.
 */
async function compileInSlices(parts: Parts, options: RuntimeOptions): Promise<boolean> {
  const { renderer, scene, camera } = parts;
  const materials = new Set<Material>();
  for (const object of [...parts.board.children]) {
    for (const material of renderer.compile(object, camera, scene)) materials.add(material);
    await pause();
    if (given(options)) return false;
  }
  while (!programsReady(parts, materials)) {
    await pause();
    if (given(options)) return false;
  }
  return true;
}

/**
 * Uploads the textures one at a time, letting the page run in between: uploading them all in the
 * first frame would be one long task on a slow phone.
 */
async function uploadInSlices(parts: Parts, options: RuntimeOptions): Promise<boolean> {
  const images = new Map<unknown, Texture>();
  for (const texture of heldBy(parts.scene).textures) images.set(texture.source, texture);
  for (const texture of images.values()) {
    parts.renderer.initTexture(texture);
    await pause();
    if (given(options)) return false;
  }
  return true;
}

/** The GL half of a build: the first skin (its picture loaded), the shaders, the uploads. */
async function prepare(parts: Parts, state: State, options: RuntimeOptions): Promise<boolean> {
  await setSkin(parts, state, options, options.skin);
  if (given(options)) return false;
  return (await compileInSlices(parts, options)) && (await uploadInSlices(parts, options));
}

/**
 * Builds the scene without blocking the page: the textures are generated in slices, then, once
 * `claim` hands it the GL context, the shaders compile and the textures upload in slices too, and
 * only then is the runtime handed over. Undefined when the build was given up on (`cancelled`, or
 * the context was lost) on the way; whatever it had made on the GPU by then is freed at once.
 */
export async function createRuntime(options: RuntimeOptions): Promise<SceneRuntime | undefined> {
  const look = options.dark ? DARK_LOOK : LIGHT_LOOK;
  const assets = await loadAssets(look, options.size);
  if (given(options) || !(await options.claim()) || given(options)) return undefined;
  const parts = buildParts(options, look, assets);
  const state = newState(options.size, options.quality);
  if (await prepare(parts, state, options)) return runtimeOf(parts, state, options);
  disposeParts(parts, state);
  return undefined;
}

function runtimeOf(parts: Parts, state: State, options: RuntimeOptions): SceneRuntime {
  return {
    setBoard: (board, finished, moves, now) => {
      // A board of another size belongs to the scene being built to replace this one.
      if (board.length !== state.size * state.size) return;
      setBoard(parts, state, options, { board, finished, moves, now });
    },
    setSkin: (skin) => {
      void setSkin(parts, state, options, skin);
    },
    setTilt: (tilt) => {
      state.target = options.reducedMotion ? { x: 0, y: 0 } : tilt;
    },
    nudge: (tile, now) => {
      nudge(state, options, tile, now);
    },
    drag: (tile, progress, now) => {
      drag(state, options, { tile, progress }, now);
    },
    resize: (cssPx, dpr) => {
      state.frames.css = cssPx;
      state.frames.dpr = dpr;
      fit(parts, state);
    },
    frame: (now) => frame(parts, state, options, now),
    dispose: () => {
      disposeParts(parts, state);
    },
  };
}
