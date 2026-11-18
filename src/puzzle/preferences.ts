// How the board looks in this browser: the skin, the 3D board on or off, numbers on picture tiles,
// and the player's own photo. Display preferences, kept in localStorage only (never in the saved
// game, never sent anywhere). Storage is passed in; every read is validated, every access may throw.
import { z } from 'zod';
import { fitsStorage } from './photo.ts';
import { PICTURE_IDS } from './pictures.ts';

export const SKIN_IDS = ['numbers', ...PICTURE_IDS, 'photo'] as const;
export type SkinId = (typeof SKIN_IDS)[number];

export interface Look {
  skin: SkinId;
  /** The player wants the 3D board (it still needs WebGL2 and no data saver). */
  scene3d: boolean;
  /** Number badges on picture tiles. */
  numbers: boolean;
}

export const DEFAULT_LOOK: Look = { skin: 'numbers', scene3d: true, numbers: true };

type LookStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const LOOK_KEY = 'sliding-puzzle:look';
const PHOTO_KEY = 'sliding-puzzle:photo';

/** Each field falls back on its own, so one bad value does not lose the other choices. */
const lookSchema = z.object({
  skin: z.enum(SKIN_IDS).catch(DEFAULT_LOOK.skin),
  scene3d: z.boolean().catch(DEFAULT_LOOK.scene3d),
  numbers: z.boolean().catch(DEFAULT_LOOK.numbers),
});

/** The stored text; "null" when there is none, "" when storage cannot be read. */
function stored(storage: LookStorage, key: string): string {
  try {
    return String(storage.getItem(key));
  } catch {
    return '';
  }
}

export function readLook(storage: LookStorage): Look {
  try {
    return lookSchema.parse(JSON.parse(stored(storage, LOOK_KEY)));
  } catch {
    return DEFAULT_LOOK;
  }
}

/** Best effort: a look that cannot be kept is still used for this visit. */
export function writeLook(storage: LookStorage, look: Look): void {
  try {
    storage.setItem(LOOK_KEY, JSON.stringify(look));
  } catch {
    // Storage is full or blocked: nothing to do.
  }
}

/** The stored photo as a JPEG data URL, if there is a valid one. */
export function readPhoto(storage: LookStorage): string | undefined {
  const value = stored(storage, PHOTO_KEY);
  return fitsStorage(value) ? value : undefined;
}

/** Keeps the photo; false when it is not a JPEG data URL that fits, or storage refuses it. */
export function writePhoto(storage: LookStorage, dataUrl: string): boolean {
  if (!fitsStorage(dataUrl)) return false;
  try {
    storage.setItem(PHOTO_KEY, dataUrl);
    return true;
  } catch {
    return false;
  }
}

export function removePhoto(storage: LookStorage): void {
  try {
    storage.removeItem(PHOTO_KEY);
  } catch {
    // Blocked storage holds no photo anyway.
  }
}

/** The skin to show: the photo skin without a photo shows numbers. */
export function shownSkin(skin: SkinId, hasPhoto: boolean): SkinId {
  return skin === 'photo' && !hasPhoto ? 'numbers' : skin;
}
