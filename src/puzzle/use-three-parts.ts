// The objects of the 3D board: tray, tiles, lights, confetti, dust. three.js wiring only, named
// use-*.ts with the other browser wiring (the mutation run skips use-*.ts; nothing here can be
// judged without a GPU). Where things stand and move is decided in scene-model.ts and effects.ts.
import {
  AmbientLight,
  Color,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  type Texture,
  Vector2,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CONFETTI_COLOURS } from './confetti.ts';
import type { Size } from './rules.ts';
import { RIM_UNITS } from './scene-model.ts';
import type { PlankTextures } from './use-tile-faces.ts';
import { rimWindow } from './wood.ts';

/** A rounded rectangle path from (x, y), `w` x `h`, corner radius `r`. */
function roundedRect(shape: Shape, x: number, y: number, w: number, h: number, r: number): Shape {
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}

/** Sizes of one board's tiles in world units. */
export interface TileSizes {
  cell: number;
  /** Width of a tile's body (the cell less the gap around it). */
  body: number;
  /** Width of its flat top, inside the bevel: the printed face. */
  face: number;
  /** Radius of the bevel round the cube's edges. */
  bevel: number;
  thickness: number;
}

/** The gap matches the DOM tile's padding of 1% of the board (styles.ts). Chunky cubes. */
export function tileSizes(size: Size): TileSizes {
  const cell = 1 / size;
  const body = cell - 0.02;
  const thickness = cell * 0.34;
  const bevel = Math.min(body * 0.1, thickness * 0.42);
  return { cell, body, face: body - bevel * 1.7, bevel, thickness };
}

/** A square face with rounded corners whose texture coordinates run 0..1 across it. */
export function faceGeometry(width: number): ShapeGeometry {
  const geometry = new ShapeGeometry(roundedRect(new Shape(), 0, 0, 1, 1, 0.06), 6);
  geometry.translate(-0.5, -0.5, 0);
  geometry.scale(width, width, 1);
  return geometry;
}

/**
 * A cube with rounded edges, its top at z = 0, in two groups: its two ends (+x and -x, end grain,
 * material 0) and the rest (material 1). Two draws a cube instead of one per side.
 */
export function bodyGeometry(sizes: TileSizes): RoundedBoxGeometry {
  const geometry = new RoundedBoxGeometry(sizes.body, sizes.body, sizes.thickness, 4, sizes.bevel);
  geometry.translate(0, 0, -sizes.thickness / 2);
  const sides = geometry.groups.map((group) => ({ ...group }));
  const ends = sides.slice(0, 2).reduce((count, group) => count + group.count, 0);
  const rest = sides.slice(2).reduce((count, group) => count + group.count, 0);
  geometry.clearGroups();
  geometry.addGroup(sides[0]?.start ?? 0, ends, 0);
  geometry.addGroup(sides[2]?.start ?? ends, rest, 1);
  return geometry;
}

/**
 * The soft shadow right under each cube, all cubes in one draw; placed every frame. Each shadow's
 * opacity is its instance colour's red (a lifted cube's shadow pales): the shadow texture is
 * black, so the colour only scales its alpha.
 */
export function contactShadows(
  count: number,
  width: number,
  map: Texture,
): InstancedMesh<PlaneGeometry, MeshBasicMaterial> {
  const material = new MeshBasicMaterial({
    map,
    transparent: true,
    depthWrite: false,
    opacity: 0.45,
  });
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      '#include <color_fragment>\n#ifdef USE_COLOR\n\tdiffuseColor.a *= vColor.r;\n#endif',
    );
  };
  material.customProgramCacheKey = () => 'contact-shadow-alpha';
  const mesh = new InstancedMesh(new PlaneGeometry(width, width), material, count);
  // A colour per instance from the start, so the shader is built with it.
  const full = new Color(1, 1, 1);
  for (let i = 0; i < count; i++) mesh.setColorAt(i, full);
  mesh.frustumCulled = false;
  return mesh;
}

/** What the tray is made of: a plank's maps for the frame and the felt's for the floor. */
export interface TrayLook {
  wood: PlankTextures;
  felt: { map: Texture; normalMap: Texture };
  shadow: Texture;
}

function woodMaterial(wood: PlankTextures, roughness: number): MeshStandardMaterial {
  return new MeshStandardMaterial({
    ...wood,
    roughness,
    normalScale: new Vector2(0.5, 0.5),
  });
}

/** One plank of the frame, `length` long along x: its grain runs along it (rimWindow, rail `at`). */
function rimPlank(
  look: TrayLook,
  size: { length: number; width: number; height: number },
  at: number,
): Mesh {
  const strip = rimWindow(size.width, at);
  const view = (texture: Texture) => {
    const copy = texture.clone();
    copy.repeat.set(strip.repeat.x, strip.repeat.y);
    copy.offset.set(strip.offset.x, strip.offset.y);
    return copy;
  };
  const material = new MeshStandardMaterial({
    map: view(look.wood.map),
    normalMap: view(look.wood.normalMap),
    roughnessMap: view(look.wood.roughnessMap),
    normalScale: new Vector2(0.5, 0.5),
  });
  const radius = Math.min(size.width * 0.22, size.height * 0.25);
  const plank = new Mesh(
    new RoundedBoxGeometry(size.length, size.width, size.height, 4, radius),
    material,
  );
  plank.castShadow = true;
  plank.receiveShadow = true;
  return plank;
}

/** The frame: four planks, their grain along each side, the long ones across the short ones' ends. */
function trayRim(look: TrayLook, outer: number, thickness: number): Group {
  const height = thickness * 0.85;
  const width = outer - 0.5;
  const middle = 0.5 + width / 2;
  const group = new Group();
  const sides: [number, number, number, number][] = [
    [0, middle, 0, outer * 2],
    [0, -middle, 0, outer * 2],
    [middle, 0, Math.PI / 2, 1 + width],
    [-middle, 0, Math.PI / 2, 1 + width],
  ];
  sides.forEach(([x, y, turn, length], i) => {
    const plank = rimPlank(look, { length, width, height }, i);
    plank.position.set(x, y, -thickness + height / 2);
    plank.rotation.z = turn;
    group.add(plank);
  });
  return group;
}

/** The tray: a soft shadow on the page, a wooden base, a felt floor and a raised wooden rim. */
export function trayGroup(look: TrayLook, thickness: number): Group {
  // The frame reaches past the DOM border into the scene's margin: a sturdier tray, still inside
  // the canvas (CANVAS_UNITS / 2 = 0.563).
  const outer = 0.5 + RIM_UNITS + 0.016;
  const group = new Group();
  const drop = new Mesh(
    new PlaneGeometry(outer * 2 + 0.06, outer * 2 + 0.06),
    new MeshBasicMaterial({ map: look.shadow, transparent: true, depthWrite: false, opacity: 0.7 }),
  );
  drop.position.set(0.008, -0.012, -thickness - 0.045);
  const base = new Mesh(
    new RoundedBoxGeometry(outer * 2, outer * 2, 0.04, 3, 0.02),
    woodMaterial(look.wood, 1),
  );
  base.position.z = -thickness - 0.02;
  const floor = new Mesh(
    new PlaneGeometry(1.001, 1.001),
    new MeshStandardMaterial({ ...look.felt, roughness: 1, normalScale: new Vector2(0.6, 0.6) }),
  );
  floor.position.z = -thickness + 0.0005;
  floor.receiveShadow = true;
  group.add(drop, base, floor, trayRim(look, outer, thickness));
  return group;
}

/** The lights' looks per theme: warm in both, lower and amber in the dark. */
export interface LightLook {
  key: number;
  keyIntensity: number;
  sky: number;
  ground: number;
  skyIntensity: number;
  rim: number;
}

export interface Lights {
  group: Group;
  key: DirectionalLight;
  base: number;
}

/** A warm key light from the top left that casts soft shadows, a rim light, sky and fill. */
export function lights(look: LightLook): Lights {
  const group = new Group();
  const key = new DirectionalLight(look.key, look.keyIntensity);
  key.position.set(-1.1, 1.5, 2.6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  const cam = key.shadow.camera;
  cam.left = -0.66;
  cam.right = 0.66;
  cam.top = 0.66;
  cam.bottom = -0.66;
  cam.near = 1.6;
  cam.far = 4.6;
  key.shadow.radius = 5;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.004;
  const rim = new DirectionalLight(look.rim, 0.9);
  rim.position.set(1.6, 1.9, 0.7);
  const fill = new DirectionalLight(0xffeedd, 0.3);
  fill.position.set(1.2, -1.4, 1.4);
  // The key light's target turns with the board too (it stays at the board's centre).
  group.add(
    key.target,
    new HemisphereLight(look.sky, look.ground, look.skyIntensity),
    new AmbientLight(look.key, 0.08),
    key,
    rim,
    fill,
  );
  return { group, key, base: look.keyIntensity };
}

/** One quad per confetti piece, all drawn in one call, hidden until a win. */
export function confettiMesh(count: number): InstancedMesh {
  const mesh = new InstancedMesh(
    new PlaneGeometry(0.034, 0.018),
    new MeshBasicMaterial({ side: DoubleSide, toneMapped: false }),
    count,
  );
  mesh.frustumCulled = false;
  mesh.visible = false;
  return mesh;
}

/** One soft sprite per mote of dust, faced to the camera, hidden until a cube lands. */
export function dustMesh(
  count: number,
  map: Texture,
  colour: number,
): InstancedMesh<PlaneGeometry, MeshBasicMaterial> {
  const mesh = new InstancedMesh(
    new PlaneGeometry(0.06, 0.06),
    new MeshBasicMaterial({ map, color: colour, transparent: true, depthWrite: false }),
    count,
  );
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.renderOrder = 2;
  return mesh;
}

/** The confetti colours as numbers three.js reads. */
export const CONFETTI_HEX: readonly number[] = CONFETTI_COLOURS;
