// The player's choice about usage statistics, kept in this browser. Pure over the storage it is
// given; the browser's localStorage is passed in by analytics.ts.
import { z } from 'zod';

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const KEY = 'sliding-puzzle:usage-statistics';
const offSchema = z.literal('off');

/** True when the player switched statistics off; storage that cannot be read counts as off. */
export function readOptedOut(storage: PreferenceStorage): boolean {
  try {
    return offSchema.safeParse(storage.getItem(KEY)).success;
  } catch {
    return true;
  }
}

/** Best effort: a browser that blocks storage reads as off anyway. */
export function writeOptedOut(storage: PreferenceStorage, off: boolean): void {
  try {
    if (off) storage.setItem(KEY, 'off');
    else storage.removeItem(KEY);
  } catch {
    // Nothing to keep it in.
  }
}

export function usageLabel(off: boolean): string {
  return `Usage statistics: ${off ? 'off' : 'on'}`;
}
