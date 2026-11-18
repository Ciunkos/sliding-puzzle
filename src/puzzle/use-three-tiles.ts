// The tiles of the 3D board: a body, a printed face, an optional number badge and a soft shadow,
// and how the skin paints them. three.js wiring, named use-*.ts with the other browser wiring.
import {
  type BufferGeometry,
  type CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  type Texture,
} from 'three';
import type { Size } from './rules.ts';
import { tileUv } from './scene-model.ts';
import { bodyGeometry, faceGeometry, type TileSizes } from './use-three-parts.ts';
import { badgeFace, numberFace, type Palette } from './use-tile-faces.ts';

export interface TileObject {
  tile: number;
  group: Group;
  body: Mesh<BufferGeometry, MeshStandardMaterial>;
  face: Mesh<BufferGeometry, MeshStandardMaterial>;
  badge: Mesh<BufferGeometry, MeshBasicMaterial>;
  shadow: Mesh<BufferGeometry, MeshBasicMaterial>;
}

/** Geometry shared by every tile of one board. */
export interface TileKit {
  sizes: TileSizes;
  body: BufferGeometry;
  face: BufferGeometry;
  badge: BufferGeometry;
  shadow: BufferGeometry;
  shadowMap: Texture;
}

export function tileKit(sizes: TileSizes, shadowMap: Texture): TileKit {
  const badge = new PlaneGeometry(sizes.face * 0.3, sizes.face * 0.3);
  return {
    sizes,
    body: bodyGeometry(sizes),
    face: faceGeometry(sizes.face),
    badge,
    shadow: new PlaneGeometry(sizes.body * 1.5, sizes.body * 1.5),
    shadowMap,
  };
}

export function createTile(tile: number, kit: TileKit): TileObject {
  const group = new Group();
  const body = new Mesh(kit.body, new MeshStandardMaterial({ roughness: 0.38 }));
  const face = new Mesh(kit.face, new MeshStandardMaterial({ roughness: 0.42 }));
  face.position.z = 0.0008;
  const badge = new Mesh(
    kit.badge,
    new MeshBasicMaterial({ transparent: true, toneMapped: false }),
  );
  const corner = kit.sizes.face * 0.5 - kit.sizes.face * 0.19;
  badge.position.set(-corner, corner, 0.0016);
  badge.visible = false;
  group.add(body, face, badge);
  const shadow = new Mesh(
    kit.shadow,
    new MeshBasicMaterial({
      map: kit.shadowMap,
      transparent: true,
      depthWrite: false,
      opacity: 0.6,
    }),
  );
  return { tile, group, body, face, badge, shadow };
}

/** What a skin paints on the tiles. */
export type Paint =
  | { kind: 'numbers'; palette: Palette; won: boolean }
  | { kind: 'picture'; palette: Palette; picture: Texture | undefined; badges: boolean };

/** Number faces are drawn once per number, colour and canvas size, and kept. */
const numberCache = new Map<string, CanvasTexture>();
const badgeCache = new Map<number, CanvasTexture>();

function cachedNumber(tile: number, side: number, fill: string, text: string): CanvasTexture {
  const key = `${String(tile)}:${String(side)}:${fill}:${text}`;
  const cached = numberCache.get(key) ?? numberFace(tile, side, fill, text);
  numberCache.set(key, cached);
  return cached;
}

function cachedBadge(tile: number): CanvasTexture {
  const cached = badgeCache.get(tile) ?? badgeFace(tile);
  badgeCache.set(tile, cached);
  return cached;
}

/** A face texture's side in pixels: sharper for the bigger tiles of small boards. */
function faceSide(size: Size): number {
  return size === 3 ? 512 : 256;
}

function paintNumbers(object: TileObject, size: Size, palette: Palette, won: boolean): void {
  const fill = won ? palette.won : palette.tile;
  object.face.material.map = cachedNumber(object.tile, faceSide(size), fill, palette.text);
  object.body.material.color.set(won ? palette.wonSide : palette.tileSide);
  object.badge.visible = false;
}

/** A tile's own view of the shared picture: the same image, offset to its square. */
function pictureSlice(picture: Texture, tile: number, size: Size): Texture {
  const slice = picture.clone();
  const uv = tileUv(tile, size);
  slice.offset.set(uv.u, uv.v);
  slice.repeat.set(uv.size, uv.size);
  slice.userData = { slice: true };
  return slice;
}

function paintPicture(object: TileObject, size: Size, paint: Paint & { kind: 'picture' }): void {
  const previous = object.face.material.map;
  if (previous !== null && previous.source === paint.picture?.source) return;
  if (previous?.userData.slice === true) previous.dispose();
  object.face.material.map =
    paint.picture === undefined ? null : pictureSlice(paint.picture, object.tile, size);
  object.face.material.color.set(
    paint.picture === undefined ? paint.palette.pictureSide : '#ffffff',
  );
  object.body.material.color.set(paint.palette.pictureSide);
}

export function paintTile(object: TileObject, size: Size, paint: Paint): void {
  if (paint.kind === 'numbers') {
    if (object.face.material.map?.userData.slice === true) object.face.material.map.dispose();
    object.face.material.color.set('#ffffff');
    paintNumbers(object, size, paint.palette, paint.won);
  } else {
    paintPicture(object, size, paint);
    object.badge.material.map = cachedBadge(object.tile);
    object.badge.visible = paint.badges;
  }
  // The win's glow brightens the face's own colours instead of washing them out with white.
  object.face.material.emissiveMap = object.face.material.map;
  object.face.material.needsUpdate = true;
  object.badge.material.needsUpdate = true;
}

export function disposeTile(object: TileObject): void {
  object.body.material.dispose();
  object.face.material.dispose();
  object.badge.material.dispose();
  object.shadow.material.dispose();
}
