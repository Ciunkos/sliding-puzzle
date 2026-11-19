// The 3D board's frame-rate state that outlives one runtime: the quality level this device settled
// on (kept in localStorage, validated by frame-model.ts's schema), and the latest readout for the
// `?fps` panel. Browser wiring, named use-*.ts: it needs localStorage and lives for the page.
import {
  type FrameReadout,
  parseStoredQuality,
  QUALITY_KEY,
  type Quality,
  sessionQuality,
  type StoredQuality,
  storedQuality,
} from './frame-model.ts';

/** This visit's level: read once (counting the visit), then stepped down by runtimes as they measure. */
let level: Quality | undefined;

function stored(): StoredQuality | undefined {
  try {
    return parseStoredQuality(localStorage.getItem(QUALITY_KEY));
  } catch {
    // Storage blocked (a private window, say): start at full quality every visit.
    return undefined;
  }
}

function store(next: StoredQuality): void {
  try {
    localStorage.setItem(QUALITY_KEY, storedQuality(next));
  } catch {
    // Not kept: the next visit measures again.
  }
}

/** The level to build a board at: this visit's, decided once from what the device remembers. */
export function qualityNow(): Quality {
  if (level === undefined) {
    const session = sessionQuality(stored());
    store(session.store);
    level = session.level;
  }
  return level;
}

/** A runtime stepped down: later boards of this visit start there, and the device remembers it. */
export function rememberQuality(next: Quality): void {
  level = next;
  store({ level: next, visits: 0 });
}

let latest: FrameReadout | undefined;
const listeners = new Set<() => void>();

/** The runtime's readout (only with `?fps`): kept and passed to the panel. */
export function publishStats(stats: FrameReadout): void {
  latest = stats;
  for (const listener of listeners) listener();
}

export function subscribeStats(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function latestStats(): FrameReadout | undefined {
  return latest;
}
