// What this browser wants to hear: sound effects, the music, and the corner button's mute over
// both. Kept in localStorage only, like the look (preferences.ts). Storage is passed in; every
// read is validated, every access may throw.
import { z } from 'zod';

export interface SoundPreferences {
  effects: boolean;
  music: boolean;
  /** The corner button: silences everything without losing the two choices below it. */
  muted: boolean;
}

export const DEFAULT_SOUND: SoundPreferences = { effects: true, music: true, muted: false };

type SoundStorage = Pick<Storage, 'getItem' | 'setItem'>;

const SOUND_KEY = 'sliding-puzzle:sound';

/** Each field falls back on its own, so one bad value does not lose the other choices. */
const soundSchema = z.object({
  effects: z.boolean().catch(DEFAULT_SOUND.effects),
  music: z.boolean().catch(DEFAULT_SOUND.music),
  muted: z.boolean().catch(DEFAULT_SOUND.muted),
});

export function readSound(storage: SoundStorage): SoundPreferences {
  try {
    return soundSchema.parse(JSON.parse(String(storage.getItem(SOUND_KEY))));
  } catch {
    return DEFAULT_SOUND;
  }
}

/** Best effort: a choice that cannot be kept is still used for this visit. */
export function writeSound(storage: SoundStorage, preferences: SoundPreferences): void {
  try {
    storage.setItem(SOUND_KEY, JSON.stringify(preferences));
  } catch {
    // Storage is full or blocked: nothing to do.
  }
}

/** Effects play only when they are on and nothing is muted; the same for the music. */
export function audible(preferences: SoundPreferences): { effects: boolean; music: boolean } {
  return {
    effects: preferences.effects && !preferences.muted,
    music: preferences.music && !preferences.muted,
  };
}
