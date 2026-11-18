// The objects of the 3D board: tray, tiles, lights, confetti. three.js wiring only, named use-*.ts
// with the other browser wiring (the mutation run skips use-*.ts; nothing here can be judged
// without a GPU). Where things stand and move is decided in scene-model.ts.
import {
  DirectionalLight,
  DoubleSide,
  ExtrudeGeometry,
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
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CONFETTI_COLOURS } from './confetti.ts';
import type { Size } from './rules.ts';
import { RIM_UNITS } from './scene-model.ts';
import type { Palette } from './use-tile-faces.ts';

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
  /** Width of its printed face. */
  face: number;
  thickness: number;
}

/** The gap matches the DOM tile's padding of 1% of the board (styles.ts). */
export function tileSizes(size: Size): TileSizes {
  const cell = 1 / size;
  const body = cell - 0.02;
  return { cell, body, face: body * 0.94, thickness: cell * 0.2 };
}

/** A square face with rounded corners whose texture coordinates run 0..1 across it. */
export function faceGeometry(width: number): ShapeGeometry {
  const geometry = new ShapeGeometry(roundedRect(new Shape(), 0, 0, 1, 1, 0.09), 6);
  geometry.translate(-0.5, -0.5, 0);
  geometry.scale(width, width, 1);
  return geometry;
}

export function bodyGeometry(sizes: TileSizes): RoundedBoxGeometry {
  const geometry = new RoundedBoxGeometry(
    sizes.body,
    sizes.body,
    sizes.thickness,
    3,
    Math.min(sizes.body * 0.09, sizes.thickness * 0.45),
  );
  geometry.translate(0, 0, -sizes.thickness / 2);
  return geometry;
}

/** The tray: a base, a floor a tile's thickness below the tile tops, and a raised rim. */
export function trayGroup(palette: Palette, floor: Texture, thickness: number): Group {
  const outer = 0.5 + RIM_UNITS;
  const group = new Group();
  const base = new Mesh(
    new RoundedBoxGeometry(outer * 2, outer * 2, 0.04, 3, 0.02),
    new MeshStandardMaterial({ color: palette.rim, roughness: 0.55 }),
  );
  base.position.z = -thickness - 0.02;
  const floorMesh = new Mesh(
    new PlaneGeometry(1.001, 1.001),
    new MeshStandardMaterial({ map: floor, roughness: 0.9 }),
  );
  floorMesh.position.z = -thickness + 0.0005;
  const frame = roundedRect(new Shape(), -outer, -outer, outer * 2, outer * 2, 0.03);
  frame.holes.push(roundedRect(new Shape(), -0.5, -0.5, 1, 1, 0.012));
  const rimGeometry = new ExtrudeGeometry(frame, {
    depth: thickness * 0.62,
    bevelEnabled: true,
    bevelThickness: thickness * 0.15,
    bevelSize: RIM_UNITS * 0.25,
    bevelSegments: 3,
    curveSegments: 6,
  });
  const rim = new Mesh(
    rimGeometry,
    new MeshStandardMaterial({ color: palette.rim, roughness: 0.45 }),
  );
  rim.position.z = -thickness;
  group.add(base, floorMesh, rim);
  return group;
}

/** A soft key light from the top left, a fill from the right, and sky light. */
export function lights(): Group {
  const group = new Group();
  const key = new DirectionalLight(0xffffff, 1.7);
  key.position.set(-1.2, 1.6, 2.4);
  const fill = new DirectionalLight(0xdfe8ff, 0.55);
  fill.position.set(1.5, -1, 1.2);
  group.add(new HemisphereLight(0xffffff, 0x8090a8, 1.1), key, fill);
  return group;
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

/** The confetti colours as numbers three.js reads. */
export const CONFETTI_HEX: readonly number[] = CONFETTI_COLOURS;
