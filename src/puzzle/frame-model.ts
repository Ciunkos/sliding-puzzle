// The 3D board's frame rate as numbers: how big a drawing buffer to draw, whether frames sit on a
// system cap (30 in iOS Low Power Mode, 60, 120), when to step the quality down, the stored level,
// and the readout's lines. Plain functions of frame intervals; the runtime measures them.
import { z } from 'zod';

/** 0 full; 1 a smaller shadow map; 2 no shadow map (contact shadows only); 3 lower resolution. */
export type Quality = 0 | 1 | 2 | 3;

/** Where the level a device settled on is kept between visits. */
export const QUALITY_KEY = 'sliding-puzzle:quality';

/** The widest drawing buffer per level, in device pixels (the board is square). */
const MAX_SIDE: readonly number[] = [2048, 2048, 2048, 640];
/** More than twice the CSS resolution is not worth its cost on a board this size. */
const MAX_RATIO = 2;

/**
 * The pixel ratio to draw a board `cssPx` wide at, on a screen of ratio `dpr`, at quality `level`:
 * the screen's ratio, at most 2, and at most the level's widest buffer.
 */
export function renderScale(cssPx: number, dpr: number, level: Quality): number {
  const side = MAX_SIDE[level] ?? 640;
  // A phone's 430 px board at a ratio of 3 draws at 2 (860 px); a retina desktop at its full 2.
  return Math.min(dpr, MAX_RATIO, side / Math.max(1, cssPx));
}

/** The value at share `p` (0..1, below 1) of `values` sorted, 0 for none. */
function percentile(values: readonly number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(p * sorted.length)] ?? 0;
}

/** Caps a browser may hold frames at, fastest first. */
const CAPS = [120, 60, 30] as const;
export type Cap = (typeof CAPS)[number];

/** Within this share of a cap's period, a frame is on the cap. */
const ON_CAP = 0.15;
/** This share of the frames on the cap makes it a cap. */
const STEADY = 0.9;

function onCap(intervals: readonly number[], cap: Cap): boolean {
  const period = 1000 / cap;
  const near = intervals.filter((ms) => Math.abs(ms - period) <= period * ON_CAP).length;
  return intervals.length > 0 && near >= intervals.length * STEADY;
}

/** The rate frames are held at, when they sit steadily on 120, 60 or 30 per second. */
export function detectCap(intervals: readonly number[]): Cap | undefined {
  return CAPS.find((cap) => onCap(intervals, cap));
}

/** Fewer frames than this say nothing about the frame rate. */
const MIN_FRAMES = 30;
/** Below this many frames a second the motion judders: worth a cheaper picture. */
const GOOD_FPS = 50;

/**
 * The quality to draw at next, from the intervals of frames drawn while tiles moved. Frames that
 * sit steadily on a cap stay: on budget at 60 or 120, and at 30 the system holds them there (Low
 * Power Mode), so a cheaper picture would not help. Otherwise only the effective rate counts: below
 * 50 fps (45 on a 60 Hz screen shows a third of its frames twice) steps down one level; a fast
 * screen missing some refreshes (90 on 120 Hz) is fine. It never steps up: later visits retry.
 */
export function nextQuality(level: Quality, intervals: readonly number[]): Quality {
  if (intervals.length < MIN_FRAMES || detectCap(intervals) !== undefined) return level;
  return frameStats(intervals).fps < GOOD_FPS ? stepDown(level) : level;
}

function stepDown(level: Quality): Quality {
  return level >= 3 ? 3 : ((level + 1) as Quality);
}

/** What the device remembers: the level it held, and visits since it last tried a better one. */
export interface StoredQuality {
  level: Quality;
  visits: number;
}

/** Every this many visits the device tries one level better (and keeps it if the frames allow). */
const RETRY_EVERY = 5;

/**
 * The level a visit starts at, and what to store for it: a new device starts at full quality; a
 * known one where it was, except every fifth visit, which tries one level better. So a device that
 * needs a cheaper level does not swing between two every visit.
 */
export function sessionQuality(stored: StoredQuality | undefined): {
  level: Quality;
  store: StoredQuality;
} {
  if (stored === undefined) return { level: 0, store: { level: 0, visits: 1 } };
  const visits = stored.visits + 1;
  if (stored.level > 0 && visits >= RETRY_EVERY) {
    const level = (stored.level - 1) as Quality;
    return { level, store: { level, visits: 0 } };
  }
  return { level: stored.level, store: { level: stored.level, visits } };
}

const storedSchema = z.object({
  level: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  visits: z.number().int().min(0),
});

/** What the device remembers, read back: undefined for nothing, broken JSON or bad values. */
export function parseStoredQuality(raw: string | null): StoredQuality | undefined {
  try {
    // Nothing stored parses as broken JSON.
    const parsed = storedSchema.safeParse(JSON.parse(raw ?? ''));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/** What the device remembers, as stored. */
export function storedQuality(stored: StoredQuality): string {
  return JSON.stringify({ level: stored.level, visits: stored.visits });
}

/** The intervals from the end of `intervals` that make up the last `ms` milliseconds. */
export function recent(intervals: readonly number[], ms: number): number[] {
  let total = 0;
  let from = intervals.length;
  while (from > 0 && total < ms) {
    from -= 1;
    total += intervals[from] ?? 0;
  }
  return intervals.slice(from);
}

/** Frames per second, the median and the worst frame time of `intervals`. */
export function frameStats(intervals: readonly number[]): {
  fps: number;
  median: number;
  worst: number;
} {
  if (intervals.length === 0) return { fps: 0, median: 0, worst: 0 };
  const total = intervals.reduce((sum, ms) => sum + ms, 0);
  return {
    fps: (1000 * intervals.length) / total,
    median: percentile(intervals, 0.5),
    worst: Math.max(...intervals),
  };
}

/** Whether the page's address (`search`, as in location.search) asks for the readout: `?fps`. */
export function fpsWanted(search: string): boolean {
  return new URLSearchParams(search).has('fps');
}

/** What the readout shows. */
export interface FrameReadout {
  fps: number;
  median: number;
  worst: number;
  width: number;
  height: number;
  level: Quality;
  cap: Cap | undefined;
  renderer: string;
}

/** The readout's lines, rounded for reading. */
export function fpsLines(stats: FrameReadout): string[] {
  return [
    `${String(Math.round(stats.fps))} fps (drawing every frame)`,
    `frame ${stats.median.toFixed(1)} ms, worst ${stats.worst.toFixed(1)} ms`,
    `${String(stats.width)} x ${String(stats.height)} px, quality ${String(stats.level)}`,
    stats.cap === undefined ? 'no cap' : `capped at ${String(stats.cap)}`,
    stats.renderer,
  ];
}
