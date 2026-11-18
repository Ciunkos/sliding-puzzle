// Storage-shaped stand-ins for the browser's localStorage: one kept in memory, one that throws.
import type { QueueStorage } from '../game/client.tsx';

/** localStorage kept in memory, starting with `entries`. */
export function memoryStorage(entries: Record<string, string>): QueueStorage {
  const values = new Map(Object.entries(entries));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  };
}

/** Storage as in a private window or with site data blocked: every access throws. */
export const THROWING_STORAGE: QueueStorage = {
  getItem(): string | null {
    throw new Error('SecurityError: storage is disabled');
  },
  setItem(): void {
    throw new Error('QuotaExceededError');
  },
  removeItem(): void {
    throw new Error('SecurityError: storage is disabled');
  },
  key(): string | null {
    throw new Error('SecurityError: storage is disabled');
  },
  get length(): number {
    throw new Error('SecurityError: storage is disabled');
  },
};
