// The tiles of the 3D board: a wooden cube (its top and sides cut from the plank, end grain at its
// ends), a face (its piece of the same plank, or the picture), the number burned or inlaid into it
// (a view of the number atlas), an optional number badge and a contact shadow, and how the skin
// paints them. Every tile shares the same few images through texture views, so no tile paints a
// canvas of its own. three.js wiring, named use-*.ts with the other browser wiring.
import {
  type BufferGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  type Texture,
  Vector2,
} from 'three';
import type { Size } from './rules.ts';
import { badgeShown, tileUv } from './scene-model.ts';
import { bodyGeometry, faceGeometry, type TileSizes } from './use-three-parts.ts';
import { badgeFace, type NumberAtlas, type PlankTextures, WINDOW_SHARE } from './use-tile-faces.ts';
import { grainWindow, windowTransform, type WoodTheme } from './wood.ts';

export interface TileObject {
  tile: number;
  group: Group;
  /** The cube's sides: end grain at its two ends, then its top and long sides. */
  body: Mesh<BufferGeometry, MeshStandardMaterial[]>;
  face: Mesh<BufferGeometry, MeshStandardMaterial>;
  /** The number, burned or inlaid: drawn white in the atlas, tinted by its material's colour. */
  number: Mesh<BufferGeometry, MeshStandardMaterial>;
  /** The face's own piece of plank, shown when no picture is. */
  wood: { map: Texture; normalMap: Texture; roughnessMap: Texture };
  badge: Mesh<BufferGeometry, MeshBasicMaterial>;
  shadow: Mesh<BufferGeometry, MeshBasicMaterial>;
  /** The cube's own textures (views of shared images), freed with it. */
  owned: Texture[];
  /** Its number badge, drawn the first time a picture with numbers is shown. */
  badgeMap?: Texture;
}

/** The wood every tile of one board is cut from. */
export interface TileWood {
  theme: WoodTheme;
  textures: PlankTextures;
  numbers: NumberAtlas;
  seed: number;
  endGrain: Texture;
}

/** Geometry and wood shared by every tile of one board. */
export interface TileKit {
  sizes: TileSizes;
  body: BufferGeometry;
  face: BufferGeometry;
  badge: BufferGeometry;
  shadow: BufferGeometry;
  shadowMap: Texture;
  wood: TileWood;
}

export function tileKit(sizes: TileSizes, shadowMap: Texture, wood: TileWood): TileKit {
  const badge = new PlaneGeometry(sizes.face * 0.3, sizes.face * 0.3);
  return {
    sizes,
    body: bodyGeometry(sizes),
    face: faceGeometry(sizes.face),
    badge,
    shadow: new PlaneGeometry(sizes.body * 1.3, sizes.body * 1.3),
    shadowMap,
    wood,
  };
}

/** A view of `texture` showing cube `tile`'s window, for a surface whose middle `inner` is the face. */
function windowOf(texture: Texture, wood: TileWood, tile: number, inner: number): Texture {
  const view = texture.clone();
  const at = windowTransform(grainWindow(wood.seed, tile, WINDOW_SHARE), WINDOW_SHARE, inner);
  view.offset.set(at.offset.x, at.offset.y);
  view.repeat.set(at.repeat.x, at.repeat.y);
  return view;
}

function bodyMaterials(
  tile: number,
  kit: TileKit,
): { materials: MeshStandardMaterial[]; owned: Texture[] } {
  const { wood, sizes } = kit;
  const inner = sizes.face / sizes.body;
  const owned = [
    windowOf(wood.textures.map, wood, tile, inner),
    windowOf(wood.textures.normalMap, wood, tile, inner),
    windowOf(wood.textures.roughnessMap, wood, tile, inner),
  ];
  const [map, normalMap, roughnessMap] = owned;
  const grain = new MeshStandardMaterial({
    map,
    normalMap,
    roughnessMap,
    normalScale: new Vector2(0.35, 0.35),
  });
  const end = new MeshStandardMaterial({ map: wood.endGrain, roughness: 0.8 });
  const shade = grainWindow(wood.seed, tile, WINDOW_SHARE).shade;
  grain.color.setScalar(shade);
  end.color.setScalar(shade);
  return { materials: [end, end, grain, grain, grain, grain], owned };
}

/** A view of the number atlas showing `tile`'s cell. */
function numberView(texture: Texture, atlas: NumberAtlas, tile: number): Texture {
  const view = texture.clone();
  const col = (tile - 1) % atlas.grid;
  const row = Math.floor((tile - 1) / atlas.grid);
  view.offset.set(col / atlas.grid, 1 - (row + 1) / atlas.grid);
  view.repeat.set(1 / atlas.grid, 1 / atlas.grid);
  return view;
}

function faceParts(tile: number, kit: TileKit) {
  const { wood } = kit;
  const woodMaps = {
    map: windowOf(wood.textures.map, wood, tile, 1),
    normalMap: windowOf(wood.textures.normalMap, wood, tile, 1),
    roughnessMap: windowOf(wood.textures.roughnessMap, wood, tile, 1),
  };
  const face = new Mesh(
    kit.face,
    new MeshStandardMaterial({ ...woodMaps, normalScale: new Vector2(0.35, 0.35) }),
  );
  face.material.color.setScalar(grainWindow(wood.seed, tile, WINDOW_SHARE).shade);
  face.position.z = 0.0006;
  face.receiveShadow = true;
  const numberMaps = {
    map: numberView(wood.numbers.map, wood.numbers, tile),
    normalMap: numberView(wood.numbers.normalMap, wood.numbers, tile),
  };
  const number = new Mesh(
    kit.face,
    new MeshStandardMaterial({
      ...numberMaps,
      transparent: true,
      depthWrite: false,
      roughness: 0.9,
      normalScale: new Vector2(0.8, 0.8),
    }),
  );
  number.position.z = 0.0009;
  return {
    face,
    number,
    woodMaps,
    owned: [...Object.values(woodMaps), ...Object.values(numberMaps)],
  };
}

export function createTile(tile: number, kit: TileKit): TileObject {
  const group = new Group();
  const { materials, owned } = bodyMaterials(tile, kit);
  const body = new Mesh(kit.body, materials);
  body.castShadow = true;
  body.receiveShadow = true;
  const top = faceParts(tile, kit);
  const badge = new Mesh(
    kit.badge,
    new MeshBasicMaterial({ transparent: true, toneMapped: false }),
  );
  const corner = kit.sizes.face * 0.5 - kit.sizes.face * 0.19;
  badge.position.set(-corner, corner, 0.0012);
  badge.visible = false;
  group.add(body, top.face, top.number, badge);
  const shadow = new Mesh(
    kit.shadow,
    new MeshBasicMaterial({
      map: kit.shadowMap,
      transparent: true,
      depthWrite: false,
      opacity: 0.45,
    }),
  );
  return {
    ...{ tile, group, body, face: top.face, number: top.number, wood: top.woodMaps },
    ...{ badge, shadow, owned: [...owned, ...top.owned] },
  };
}

/** What a skin paints on the tiles. */
export type Paint =
  | { kind: 'numbers'; wood: TileWood; won: boolean }
  | { kind: 'picture'; wood: TileWood; picture: Texture | undefined; badges: boolean };

/** A tile's badge, drawn once per board (the board's runtime frees it with the rest). */
function cachedBadge(object: TileObject): Texture {
  object.badgeMap ??= badgeFace(object.tile);
  return object.badgeMap;
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

function dropSlice(object: TileObject): void {
  const map = object.face.material.map;
  if (map?.userData.slice === true) map.dispose();
}

function showWood(object: TileObject): void {
  dropSlice(object);
  object.face.material.map = object.wood.map;
}

function paintPicture(object: TileObject, size: Size, paint: Paint & { kind: 'picture' }): void {
  const previous = object.face.material.map;
  if (previous !== null && previous.source === paint.picture?.source) return;
  showWood(object);
  if (paint.picture !== undefined)
    object.face.material.map = pictureSlice(paint.picture, object.tile, size);
}

export function paintTile(object: TileObject, size: Size, paint: Paint): void {
  const { theme } = paint.wood;
  if (paint.kind === 'numbers') {
    showWood(object);
    const [r, g, b] = paint.won ? theme.inkWon : theme.ink;
    object.number.material.color.setRGB(r / 255, g / 255, b / 255, SRGBColorSpace);
    object.badge.visible = false;
  } else {
    paintPicture(object, size, paint);
    object.badge.material.map = cachedBadge(object);
    object.badge.visible = badgeShown(object.tile, size, paint.badges);
  }
  object.number.visible = paint.kind === 'numbers';
  // The win's glow brightens the face's own colours instead of washing them out with white.
  object.face.material.emissiveMap = object.face.material.map;
  object.face.material.needsUpdate = true;
  object.badge.material.needsUpdate = true;
}

/** Frees the tile's own textures; its materials and geometry go with the rest of the scene. */
export function disposeTile(object: TileObject): void {
  dropSlice(object);
  for (const texture of object.owned) texture.dispose();
  object.badgeMap?.dispose();
}
