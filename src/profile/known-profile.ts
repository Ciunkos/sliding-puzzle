// The profiles this device has loaded from the server, one record per nickname key, so a profile
// that was opened here before can open again without a connection. Storage can be missing or
// throw, and its content is never trusted: every read is parsed.
import { z } from 'zod';
import { nicknameKey, nicknameSchema } from './index.ts';

const PREFIX = 'sliding-puzzle:profile:';

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

const knownProfileSchema = z.object({
  id: z.number().int().positive().optional(),
  nickname: nicknameSchema,
});

/** What the device keeps of a profile: enough to play it, in the server's casing. */
export type KnownProfile = z.infer<typeof knownProfileSchema>;

/** The browser's localStorage, or undefined when it is absent or access itself throws. */
function defaultStorage(): KeyValueStorage | undefined {
  try {
    const storage: KeyValueStorage | undefined = globalThis.localStorage;
    return storage;
  } catch {
    return undefined;
  }
}

function parse(raw: string | null | undefined): unknown {
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

export function loadKnownProfile(
  nickname: string,
  storage: KeyValueStorage | undefined = defaultStorage(),
): KnownProfile | undefined {
  try {
    const key = nicknameKey(nickname);
    const parsed = knownProfileSchema.safeParse(parse(storage?.getItem(PREFIX + key)));
    if (!parsed.success || nicknameKey(parsed.data.nickname) !== key) return undefined;
    return parsed.data;
  } catch {
    return undefined;
  }
}

export function saveKnownProfile(
  profile: KnownProfile,
  storage: KeyValueStorage | undefined = defaultStorage(),
): void {
  const parsed = knownProfileSchema.safeParse(profile);
  if (!parsed.success) return;
  try {
    const { id, nickname } = parsed.data;
    storage?.setItem(PREFIX + nicknameKey(nickname), JSON.stringify({ id, nickname }));
  } catch {
    // Storage is a convenience: a failed write must not break the game.
  }
}
