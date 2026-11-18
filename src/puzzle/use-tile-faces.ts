// Textures of the 3D board, drawn once on 2D canvases with the system font: number faces, number
// badges, the soft shadow under a tile and the tray floor; and a picture loaded into a canvas.
// Named use-*.ts with the other browser wiring: it needs a DOM canvas, so node tests cannot run it
// (the mutation run skips use-*.ts). Every number that decides a position is in scene-model.ts.
import { CanvasTexture, SRGBColorSpace, type Texture } from 'three';

export interface Palette {
  tile: string;
  tileSide: string;
  text: string;
  won: string;
  wonSide: string;
  well: string;
  rim: string;
  pictureSide: string;
}

export const LIGHT_PALETTE: Palette = {
  tile: '#1f4fb8',
  tileSide: '#163a8a',
  text: '#ffffff',
  won: '#13703a',
  wonSide: '#0d5029',
  well: '#9eabbe',
  rim: '#d3dbe6',
  pictureSide: '#f3eee4',
};

export const DARK_PALETTE: Palette = {
  tile: '#3566d6',
  tileSide: '#2449a3',
  text: '#ffffff',
  won: '#1c8a4a',
  wonSide: '#126032',
  well: '#121924',
  rim: '#3a4559',
  pictureSide: '#d9d3c7',
};

const FONT_STACK = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

function canvasOf(side: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side;
  // A CPU canvas: it is drawn once and uploaded, so a GPU canvas would only add a read-back.
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (ctx === null) throw new Error('No 2D canvas');
  return { canvas, ctx };
}

function textureOf(canvas: HTMLCanvasElement): CanvasTexture {
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** A tile's face: its colour, a soft top light, and the number in the middle. */
export function numberFace(tile: number, side: number, fill: string, text: string): CanvasTexture {
  const { canvas, ctx } = canvasOf(side);
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, side, side);
  const sheen = ctx.createLinearGradient(0, 0, 0, side);
  sheen.addColorStop(0, 'rgba(255,255,255,0.10)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
  sheen.addColorStop(1, 'rgba(0,0,0,0.10)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, side, side);
  ctx.font = `700 ${String(Math.round(side * 0.5))}px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillText(String(tile), side / 2, side * 0.53 + side * 0.015);
  ctx.fillStyle = text;
  ctx.fillText(String(tile), side / 2, side * 0.53);
  return textureOf(canvas);
}

/** A round badge with the tile's number, shown on picture tiles when numbers are on. */
export function badgeFace(tile: number): CanvasTexture {
  const side = 128;
  const { canvas, ctx } = canvasOf(side);
  ctx.beginPath();
  ctx.arc(side / 2, side / 2, side / 2 - 4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(17,17,17,0.82)';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.stroke();
  ctx.font = `700 ${String(tile > 9 ? 58 : 70)}px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(tile), side / 2, side / 2 + 4);
  return textureOf(canvas);
}

/** A soft dark blob: the shadow a tile casts on the tray floor. */
export function shadowTexture(): Texture {
  const side = 128;
  const { canvas, ctx } = canvasOf(side);
  ctx.filter = 'blur(10px)';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.roundRect(24, 24, side - 48, side - 48, 14);
  ctx.fill();
  const texture = new CanvasTexture(canvas);
  return texture;
}

/** The tray floor: its colour, darker toward the rim, as if the rim shades it. */
export function floorTexture(well: string): CanvasTexture {
  const side = 256;
  const { canvas, ctx } = canvasOf(side);
  ctx.fillStyle = well;
  ctx.fillRect(0, 0, side, side);
  const edges: [number, number, number, number][] = [
    [0, 0, 0, 24],
    [0, side, 0, side - 24],
    [0, 0, 24, 0],
    [side, 0, side - 24, 0],
  ];
  for (const [x0, y0, x1, y1] of edges) {
    const shade = ctx.createLinearGradient(x0, y0, x1, y1);
    shade.addColorStop(0, 'rgba(0,0,0,0.35)');
    shade.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, side, side);
  }
  return textureOf(canvas);
}

/** The picture at `url` (an SVG or the stored photo) drawn into a square canvas texture. */
export async function pictureTexture(url: string, side: number): Promise<CanvasTexture> {
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  await image.decode();
  const { canvas, ctx } = canvasOf(side);
  ctx.drawImage(image, 0, 0, side, side);
  const texture = textureOf(canvas);
  texture.generateMipmaps = true;
  return texture;
}
