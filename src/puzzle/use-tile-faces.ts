// Textures of the 3D board, painted on 2D canvases once and kept: planks of wood (colour, normal and
// roughness from one height field, wood.ts), the end grain, the felt, an atlas of the numbers burned
// or inlaid into the cubes, number badges, soft shadows, dust, and a picture printed on wood.
// The pixel loops run in slices of a few milliseconds and yield to the browser in between, so
// building the board never blocks the page: every builder of a big map is async and cached.
// Named use-*.ts with the other browser wiring: it needs a DOM canvas, so node tests cannot run it
// (the mutation run skips use-*.ts). The numbers that decide how wood looks are in wood.ts.
import {
  CanvasTexture,
  ClampToEdgeWrapping,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three';
import {
  latticeAt,
  noiseAt,
  normalColour,
  type Rgb,
  ringProfile,
  roughnessAt,
  type Species,
  woodAt,
  woodColour,
} from './wood.ts';

const FONT_STACK = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
/** The longest a slice of pixel work runs before it yields to the browser. */
const SLICE_MS = 6;

/** Lets the browser run (input, paint) before the next slice. */
export function pause(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/** Runs `row` for every row, yielding to the browser whenever a slice has run SLICE_MS. */
async function eachRow(rows: number, row: (y: number) => void): Promise<void> {
  let start = performance.now();
  for (let y = 0; y < rows; y++) {
    row(y);
    if (performance.now() - start > SLICE_MS) {
      await pause();
      start = performance.now();
    }
  }
}

function canvasOf(
  width: number,
  height = width,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  // A CPU canvas: it is drawn once and uploaded, so a GPU canvas would only add a read-back.
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (ctx === null) throw new Error('No 2D canvas');
  return { canvas, ctx };
}

/** A texture of `canvas`: colour in sRGB, data (normals, roughness) as it is. */
function textureOf(canvas: HTMLCanvasElement, colour = true): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = colour ? SRGBColorSpace : NoColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function setPixel(data: Uint8ClampedArray, i: number, rgb: Rgb): void {
  data[i * 4] = rgb[0];
  data[i * 4 + 1] = rgb[1];
  data[i * 4 + 2] = rgb[2];
  data[i * 4 + 3] = 255;
}

/** Heights to normal-map colours, the edges clamped. Canvas rows grow down, so up is -1 row. */
function fillNormals(heights: Float32Array, side: number, strength: number, out: ImageData) {
  const at = (x: number, y: number) =>
    heights[Math.min(side - 1, Math.max(0, y)) * side + Math.min(side - 1, Math.max(0, x))] ?? 0;
  return eachRow(side, (y) => {
    for (let x = 0; x < side; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) / 2;
      const dy = (at(x, y - 1) - at(x, y + 1)) / 2;
      setPixel(out.data, y * side + x, normalColour(dx, dy, strength));
    }
  });
}

/** A plank's maps as textures, uploaded once per plank; the tray repeats them. */
export interface PlankTextures {
  map: Texture;
  normalMap: Texture;
  roughnessMap: Texture;
}

async function growPlank(species: Species, seed: number, side: number): Promise<PlankTextures> {
  const colour = canvasOf(side);
  const rough = canvasOf(side);
  const normal = canvasOf(side);
  const colourData = colour.ctx.createImageData(side, side);
  const roughData = rough.ctx.createImageData(side, side);
  const heights = new Float32Array(side * side);
  await eachRow(side, (y) => {
    for (let x = 0; x < side; x++) {
      const wood = woodAt(species, seed, x / side, y / side);
      const i = y * side + x;
      heights[i] = wood.height;
      setPixel(colourData.data, i, woodColour(species, wood.tone));
      const grey = roughnessAt(species, wood.tone);
      setPixel(roughData.data, i, [grey, grey, grey]);
    }
  });
  const normalData = normal.ctx.createImageData(side, side);
  await fillNormals(heights, side, 1.4 * (side / 512), normalData);
  colour.ctx.putImageData(colourData, 0, 0);
  await pause();
  rough.ctx.putImageData(roughData, 0, 0);
  await pause();
  normal.ctx.putImageData(normalData, 0, 0);
  const made = {
    map: textureOf(colour.canvas),
    normalMap: textureOf(normal.canvas, false),
    roughnessMap: textureOf(rough.canvas, false),
  };
  for (const texture of Object.values(made)) {
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
  }
  return made;
}

const planks = new Map<string, Promise<PlankTextures>>();

/**
 * The plank of `species` grown from `seed`, `side` pixels square, as textures: grown once, in
 * slices, then kept for every board of the session (they share it through texture views).
 */
export function plankOf(species: Species, seed: number, side: number): Promise<PlankTextures> {
  const key = `${JSON.stringify(species)}:${String(seed)}:${String(side)}`;
  const cached = planks.get(key) ?? growPlank(species, seed, side);
  planks.set(key, cached);
  return cached;
}

/** The share of a plank one cube's top is cut from. */
export const WINDOW_SHARE = 0.42;

/** An atlas of the numbers 1..count in a square grid: colour with alpha, and engraved normals. */
export interface NumberAtlas {
  map: Texture;
  normalMap: Texture;
  /** Cells per row and column. */
  grid: number;
}

/** How the numbers are cut: burned (a dark scorch, tinted ink) or inlaid (pale, with a dark seam). */
export type NumberStyle = 'burned' | 'inlaid';

function setNumberFont(ctx: CanvasRenderingContext2D, tile: number, cell: number): void {
  const size = tile > 9 ? 0.46 : 0.54;
  ctx.font = `800 ${String(Math.round(cell * size))}px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
}

/** One number in its cell, drawn white so the material's colour tints it to the ink (or win ink). */
function drawNumber(ctx: CanvasRenderingContext2D, tile: number, cell: number, style: NumberStyle) {
  const grid = Math.round(ctx.canvas.width / cell);
  const x = ((tile - 1) % grid) * cell + cell / 2;
  const y = Math.floor((tile - 1) / grid) * cell + cell * 0.54;
  setNumberFont(ctx, tile, cell);
  if (style === 'burned') {
    // A scorched halo round the burned number.
    ctx.shadowColor = 'rgb(255 255 255 / 0.5)';
    ctx.shadowBlur = cell * 0.035;
    ctx.fillStyle = 'rgb(255 255 255 / 0.9)';
    ctx.fillText(String(tile), x, y);
    ctx.shadowBlur = 0;
    return;
  }
  ctx.lineWidth = cell * 0.018;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgb(20 10 4 / 0.8)';
  ctx.strokeText(String(tile), x, y);
  ctx.fillStyle = '#fff';
  ctx.fillText(String(tile), x, y);
}

/** The engraving: the numbers' shapes, slightly soft, as heights sunk into the wood. */
async function engraving(count: number, cell: number, side: number): Promise<HTMLCanvasElement> {
  const mask = canvasOf(side);
  mask.ctx.filter = `blur(${String(Math.max(1, cell / 256))}px)`;
  mask.ctx.fillStyle = '#fff';
  for (let tile = 1; tile <= count; tile++) {
    const grid = Math.round(side / cell);
    setNumberFont(mask.ctx, tile, cell);
    mask.ctx.fillText(
      String(tile),
      ((tile - 1) % grid) * cell + cell / 2,
      Math.floor((tile - 1) / grid) * cell + cell * 0.54,
    );
    // Each blurred number costs a few milliseconds: let the page breathe between them.
    await pause();
  }
  const alpha = mask.ctx.getImageData(0, 0, side, side).data;
  const heights = new Float32Array(side * side);
  await eachRow(side, (y) => {
    for (let x = 0; x < side; x++)
      heights[y * side + x] = -((alpha[(y * side + x) * 4 + 3] ?? 0) / 255);
  });
  const normal = canvasOf(side);
  const out = normal.ctx.createImageData(side, side);
  await fillNormals(heights, side, 1.6 * (cell / 256), out);
  normal.ctx.putImageData(out, 0, 0);
  return normal.canvas;
}

async function drawAtlas(count: number, cell: number, style: NumberStyle): Promise<NumberAtlas> {
  const grid = Math.ceil(Math.sqrt(count));
  const side = grid * cell;
  const colour = canvasOf(side);
  for (let tile = 1; tile <= count; tile++) {
    drawNumber(colour.ctx, tile, cell, style);
    await pause();
  }
  const normal = await engraving(count, cell, side);
  return { map: textureOf(colour.canvas), normalMap: textureOf(normal, false), grid };
}

const atlases = new Map<string, Promise<NumberAtlas>>();

/** The numbers 1..`count`, `cell` pixels each, in `style`: drawn once, in slices, then kept. */
export function numberAtlas(count: number, cell: number, style: NumberStyle): Promise<NumberAtlas> {
  const key = `${String(count)}:${String(cell)}:${style}`;
  const cached = atlases.get(key) ?? drawAtlas(count, cell, style);
  atlases.set(key, cached);
  return cached;
}

const endGrains = new Map<string, CanvasTexture>();

/** The end grain of a cube's two ends: rings around a pith below the cube (small, so at once). */
export function endGrain(species: Species, seed: number): CanvasTexture {
  const key = `${JSON.stringify(species)}:${String(seed)}`;
  const cached = endGrains.get(key);
  if (cached !== undefined) return cached;
  const side = 64;
  const { canvas, ctx } = canvasOf(side);
  const data = ctx.createImageData(side, side);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const radius = Math.hypot(x / side - 0.5, y / side + 0.9);
      const phase = radius * species.rings * 0.7 + noiseAt(seed, x / 8, y / 8) * 0.5;
      const tone = ringProfile(phase - Math.floor(phase)) * 0.8 + 0.15;
      setPixel(data.data, y * side + x, woodColour(species, tone));
    }
  }
  ctx.putImageData(data, 0, 0);
  const texture = textureOf(canvas);
  endGrains.set(key, texture);
  return texture;
}

/** Felt's maps: its colour with a fine fuzz and a faint mottle, darker toward the rim. */
export interface FeltMaps {
  map: Texture;
  normalMap: Texture;
}

async function weaveFelt(felt: Rgb, seed: number): Promise<FeltMaps> {
  const side = 256;
  const colour = canvasOf(side);
  const data = colour.ctx.createImageData(side, side);
  const heights = new Float32Array(side * side);
  await eachRow(side, (y) => {
    for (let x = 0; x < side; x++) {
      const fuzz = noiseAt(seed, x / 1.2, y / 1.2);
      const mottle = noiseAt(seed + 1, x / 20, y / 20);
      const shade = 0.82 + fuzz * 0.2 + mottle * 0.1;
      heights[y * side + x] = fuzz;
      setPixel(data.data, y * side + x, [felt[0] * shade, felt[1] * shade, felt[2] * shade]);
    }
  });
  colour.ctx.putImageData(data, 0, 0);
  shadeEdges(colour.ctx, side, 0.4);
  const normal = canvasOf(side);
  const normalData = normal.ctx.createImageData(side, side);
  await fillNormals(heights, side, 0.6, normalData);
  normal.ctx.putImageData(normalData, 0, 0);
  return { map: textureOf(colour.canvas), normalMap: textureOf(normal.canvas, false) };
}

const felts = new Map<string, Promise<FeltMaps>>();

export function feltMaps(felt: Rgb, seed: number): Promise<FeltMaps> {
  const key = `${felt.join(',')}:${String(seed)}`;
  const cached = felts.get(key) ?? weaveFelt(felt, seed);
  felts.set(key, cached);
  return cached;
}

function shadeEdges(ctx: CanvasRenderingContext2D, side: number, strength: number): void {
  const reach = side * 0.06;
  const edges: [number, number, number, number][] = [
    [0, 0, 0, reach],
    [0, side, 0, side - reach],
    [0, 0, reach, 0],
    [side, 0, side - reach, 0],
  ];
  for (const [x0, y0, x1, y1] of edges) {
    const shade = ctx.createLinearGradient(x0, y0, x1, y1);
    shade.addColorStop(0, `rgb(0 0 0 / ${String(strength)})`);
    shade.addColorStop(1, 'rgb(0 0 0 / 0)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, side, side);
  }
}

/** A round badge with the tile's number, shown on picture tiles when numbers are on. */
export function badgeFace(tile: number): CanvasTexture {
  const side = 128;
  const { canvas, ctx } = canvasOf(side);
  ctx.beginPath();
  ctx.arc(side / 2, side / 2, side / 2 - 4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(28,16,8,0.86)';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(250,236,210,0.95)';
  ctx.stroke();
  ctx.font = `800 ${String(tile > 9 ? 58 : 70)}px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff8ea';
  ctx.fillText(String(tile), side / 2, side / 2 + 4);
  return textureOf(canvas);
}

/** A soft dark blob: the contact shadow under a cube, or under the whole tray. */
export function shadowTexture(inset = 24, blur = 10): Texture {
  const side = 128;
  const { canvas, ctx } = canvasOf(side);
  ctx.filter = `blur(${String(blur)}px)`;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.beginPath();
  ctx.roundRect(inset, inset, side - inset * 2, side - inset * 2, 14);
  ctx.fill();
  return new CanvasTexture(canvas);
}

/** A soft round mote of dust. */
export function dustTexture(): Texture {
  const side = 64;
  const { canvas, ctx } = canvasOf(side);
  const glow = ctx.createRadialGradient(side / 2, side / 2, 0, side / 2, side / 2, side / 2);
  glow.addColorStop(0, 'rgba(255,255,255,0.9)');
  glow.addColorStop(0.45, 'rgba(255,255,255,0.5)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, side, side);
  return textureOf(canvas);
}

/** One worn stretch of edge: a short light rub of varying strength. */
function rub(
  ctx: CanvasRenderingContext2D,
  from: [number, number],
  to: [number, number],
  wear: number,
): void {
  ctx.strokeStyle = `rgb(255 238 208 / ${String(wear)})`;
  ctx.beginPath();
  ctx.moveTo(from[0], from[1]);
  ctx.lineTo(to[0], to[1]);
  ctx.stroke();
}

/** The point `t` (0..1) along edge `edge` (top, right, bottom, left) of a square at (x, y). */
function edgePoint(x: number, y: number, span: number, edge: number, t: number): [number, number] {
  const corners: [number, number][] = [
    [x, y],
    [x + span, y],
    [x + span, y + span],
    [x, y + span],
  ];
  const from = corners[edge % 4] ?? [x, y];
  const to = corners[(edge + 1) % 4] ?? [x, y];
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
}

const RUBS_PER_EDGE = 12;

/** Rubs the edges of every cube's square a little lighter, unevenly, as if handled. */
function wearEdges(ctx: CanvasRenderingContext2D, side: number, size: number): void {
  const cell = side / size;
  const inset = cell * 0.012;
  const span = cell - inset * 2;
  ctx.lineWidth = cell * 0.018;
  ctx.lineCap = 'round';
  for (let index = 0; index < size * size; index++) {
    const x = (index % size) * cell + inset;
    const y = Math.floor(index / size) * cell + inset;
    for (let i = 0; i < RUBS_PER_EDGE * 4; i++) {
      const edge = Math.floor(i / RUBS_PER_EDGE);
      const a = (i % RUBS_PER_EDGE) / RUBS_PER_EDGE;
      const wear = Math.max(0, latticeAt(index, i, 77) - 0.5) * 0.36;
      rub(
        ctx,
        edgePoint(x, y, span, edge, a),
        edgePoint(x, y, span, edge, a + 1 / RUBS_PER_EDGE),
        wear,
      );
    }
  }
}

/**
 * The picture at `url` (an SVG or the stored photo) printed on wood (`grain`, the plank's colour)
 * in a square canvas: the grain shows through the ink, and each cube's square is worn at its edges.
 */
export async function pictureTexture(
  url: string,
  side: number,
  size: number,
  grain: Texture,
): Promise<CanvasTexture> {
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  await image.decode();
  const { canvas, ctx } = canvasOf(side);
  ctx.drawImage(image, 0, 0, side, side);
  await pause();
  const wood: unknown = grain.image;
  if (wood instanceof HTMLCanvasElement) {
    ctx.globalAlpha = 0.2;
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(wood, 0, 0, side, side);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  await pause();
  wearEdges(ctx, side, size);
  const texture = textureOf(canvas);
  texture.wrapS = ClampToEdgeWrapping;
  texture.generateMipmaps = true;
  return texture;
}
