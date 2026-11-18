// Remembers the last nickname used in this browser. Storage can be missing or throw, so every access is guarded.
import { nicknameSchema } from './index.ts';

export const LAST_NICKNAME_KEY = 'sliding-puzzle:last-nickname';

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** The browser's localStorage, or undefined when it is absent or access itself throws. */
function defaultStorage(): KeyValueStorage | undefined {
  try {
    const storage: KeyValueStorage | undefined = globalThis.localStorage;
    return storage;
  } catch {
    return undefined;
  }
}

export function loadLastNickname(
  storage: KeyValueStorage | undefined = defaultStorage(),
): string | undefined {
  try {
    const raw = storage?.getItem(LAST_NICKNAME_KEY);
    if (raw === null || raw === undefined) return undefined;
    const parsed = nicknameSchema.safeParse(raw);
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function saveLastNickname(
  nickname: string,
  storage: KeyValueStorage | undefined = defaultStorage(),
): void {
  const parsed = nicknameSchema.safeParse(nickname);
  if (!parsed.success) return;
  try {
    storage?.setItem(LAST_NICKNAME_KEY, parsed.data);
  } catch {
    // Storage is a convenience: a failed write must not break the game.
  }
}
