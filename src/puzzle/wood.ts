// Wood as numbers: seeded noise, the growth rings and fibres of a flat-sawn plank, and the colours,
// bumps and gloss they make. Plain functions of a seed and a point, so the same seed always grows
// the same plank; use-tile-faces.ts paints them onto canvases once and keeps them.

export type Rgb = readonly [number, number, number];

/** A 32-bit hash of a lattice point, as a number in [0, 1). */
export function latticeAt(seed: number, ix: number, iy: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1274126177)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smoothstep of `t` between `edge0` and `edge1`, clamped to 0..1. */
export function smoothstep(edge0: number, edge1: number, t: number): number {
  const k = Math.min(1, Math.max(0, (t - edge0) / (edge1 - edge0)));
  return k * k * (3 - 2 * k);
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Value noise in [0, 1): the lattice hashes, blended smoothly between the integer points. */
export function noiseAt(seed: number, x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smoothstep(0, 1, x - ix);
  const fy = smoothstep(0, 1, y - iy);
  const bottom = mix(latticeAt(seed, ix, iy), latticeAt(seed, ix + 1, iy), fx);
  const top = mix(latticeAt(seed, ix, iy + 1), latticeAt(seed, ix + 1, iy + 1), fx);
  return mix(bottom, top, fy);
}

/** Two octaves of noise, the second twice as fine and half as strong, in [0, 1). */
export function fbmAt(seed: number, x: number, y: number): number {
  return (noiseAt(seed, x, y) * 2 + noiseAt(seed + 1, x * 2, y * 2)) / 3;
}

/**
 * How late in its year the wood at `phase` (0..1 across one growth ring) grew: light early wood
 * for the first half, darkening toward the dense late wood, then a sharp edge to the next ring.
 */
export function ringProfile(phase: number): number {
  return smoothstep(0.5, 0.94, phase) * (1 - smoothstep(0.965, 1, phase));
}

/** A kind of wood: its early and late colours, how many rings cross a plank, how they wander. */
export interface Species {
  early: Rgb;
  late: Rgb;
  /** Growth rings per plank width at the pith's depth. */
  rings: number;
  /** How far the rings wander, in plank widths. */
  warp: number;
  /** How strongly the fine fibres show. */
  fibre: number;
  /** Roughness of the early wood; late wood is glossier. */
  roughness: number;
}

/**
 * The wood of a plank (`seed`) at (`x`, `y`) in plank widths, the grain running along x: how dark
 * it is (`tone`, 0 early to 1 late) and how high it stands (`height`, 0..1). A flat-sawn cut: the
 * plank's face crosses the rings at a slant, so they draw long arches.
 */
export function woodAt(
  species: Species,
  seed: number,
  x: number,
  y: number,
): { tone: number; height: number } {
  const wander = fbmAt(seed, x * 1.6, y * 3) - 0.5;
  const across = y - 0.5 + wander * species.warp;
  const depth = 0.22 + 0.1 * x + (noiseAt(seed + 4, x * 0.8, y * 0.6) - 0.5) * 0.08;
  // Rings are never quite even: a little noise in their spacing.
  const jitter = noiseAt(seed + 5, x * 2.5, y * 18) - 0.5;
  const phase = Math.hypot(across, depth) * species.rings + wander * 1.5 + jitter * 0.45;
  const late = ringProfile(phase - Math.floor(phase));
  const fibre = noiseAt(seed + 7, x * 5, y * 320) * 0.6 + noiseAt(seed + 8, x * 14, y * 900) * 0.4;
  // Pores: short dark flecks along the grain, most in the late wood.
  const pore = smoothstep(0.72, 0.9, noiseAt(seed + 9, x * 60, y * 1100)) * (0.4 + late * 0.6);
  const figure = noiseAt(seed + 3, x * 1.1, y * 1.6) - 0.5;
  const tone = late * 0.7 + (fibre - 0.5) * species.fibre + figure * 0.3 + pore * 0.35;
  return {
    tone: Math.min(1, Math.max(0, tone)),
    height: late * 0.45 + fibre * 0.4 - pore * 0.5,
  };
}

/** The colour of wood of `tone`, between its early and late colours. */
export function woodColour(species: Species, tone: number): Rgb {
  return [
    Math.round(mix(species.early[0], species.late[0], tone)),
    Math.round(mix(species.early[1], species.late[1], tone)),
    Math.round(mix(species.early[2], species.late[2], tone)),
  ];
}

/** A grey 0..255 for a roughness map: late wood is glossier than early wood. */
export function roughnessAt(species: Species, tone: number): number {
  return Math.round(Math.min(1, Math.max(0, species.roughness - tone * 0.18)) * 255);
}

/**
 * A normal map's colour for a surface whose height rises `dx` per pixel to the right and `dy` per
 * pixel up, exaggerated `strength` times: flat is (128, 128, 255).
 */
export function normalColour(dx: number, dy: number, strength: number): Rgb {
  const nx = -dx * strength;
  const ny = -dy * strength;
  const length = Math.hypot(nx, ny, 1);
  const channel = (n: number) => Math.round(((n / length) * 0.5 + 0.5) * 255);
  return [channel(nx), channel(ny), channel(1)];
}

/** Which part of the plank a cube is cut from, which way it lies, and how light its piece is. */
export interface GrainWindow {
  /** Left and top of the piece, in plank widths. */
  x: number;
  y: number;
  /** Mirrored left to right, and top to bottom. */
  flip: boolean;
  upend: boolean;
  /** A brightness for the whole piece, 0.9..1.06: no two cubes are quite the same colour. */
  shade: number;
}

/**
 * The part of the plank cube `tile` is cut from: a square `share` of the plank wide that stays on
 * the plank, lying one of four ways. Each tile of a seed differs.
 */
export function grainWindow(seed: number, tile: number, share: number): GrainWindow {
  return {
    x: latticeAt(seed, tile, 1) * (1 - share),
    y: latticeAt(seed, tile, 2) * (1 - share),
    flip: latticeAt(seed, tile, 3) < 0.5,
    upend: latticeAt(seed, tile, 4) < 0.5,
    shade: 0.9 + latticeAt(seed, tile, 5) * 0.16,
  };
}

function luminance(colour: Rgb): number {
  const linear = colour.map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0);
}

/** The WCAG contrast ratio of two colours: 1 (the same) to 21 (black on white). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

/** The woods and colours of one theme: the cubes, the tray, the numbers and the felt. */
export interface WoodTheme {
  tile: Species;
  tray: Species;
  /** The numbers, burned into light wood or inlaid pale into dark wood; and on a win. */
  ink: Rgb;
  inkWon: Rgb;
  felt: Rgb;
  numbers: 'burned' | 'inlaid';
}

/** Light: maple cubes with burned numbers in a walnut tray on green felt. */
export const LIGHT_WOOD: WoodTheme = {
  tile: {
    early: [226, 176, 118],
    late: [180, 118, 62],
    rings: 70,
    warp: 0.1,
    fibre: 0.42,
    roughness: 0.6,
  },
  tray: {
    early: [112, 70, 42],
    late: [48, 27, 15],
    rings: 48,
    warp: 0.12,
    fibre: 0.5,
    roughness: 0.48,
  },
  ink: [30, 14, 4],
  inkWon: [4, 34, 14],
  felt: [28, 78, 60],
  numbers: 'burned',
};

/** Dark: walnut cubes with pale inlaid numbers in an ebony tray on wine felt, under warm light. */
export const DARK_WOOD: WoodTheme = {
  tile: {
    early: [120, 82, 54],
    late: [50, 30, 18],
    rings: 56,
    warp: 0.11,
    fibre: 0.46,
    roughness: 0.55,
  },
  tray: {
    early: [50, 36, 28],
    late: [15, 10, 7],
    rings: 44,
    warp: 0.14,
    fibre: 0.5,
    roughness: 0.42,
  },
  ink: [250, 232, 196],
  inkWon: [170, 240, 180],
  felt: [86, 26, 36],
  numbers: 'inlaid',
};

/**
 * Texture offset and repeat that show a cube's window of the plank (`win`, `share` wide, its y
 * from the plank's top) on a surface whose middle `inner` share is the face that shows it exactly:
 * the cube's top and bevel then carry on the grain of the face. Texture y grows upwards.
 */
export function windowTransform(
  win: { x: number; y: number; flip: boolean; upend: boolean },
  share: number,
  inner: number,
): { offset: { x: number; y: number }; repeat: { x: number; y: number } } {
  const scale = share / inner;
  const margin = (share * (1 - inner)) / (2 * inner);
  const x = win.flip ? win.x + share + margin : win.x - margin;
  const y = win.upend ? 1 - win.y + margin : 1 - win.y - share - margin;
  return {
    offset: { x, y },
    repeat: { x: win.flip ? -scale : scale, y: win.upend ? -scale : scale },
  };
}
