// The player's look choices, kept in this browser's localStorage (preferences.ts decides what is
// stored and how it is read back). Handlers read the chosen skin from the button's data-skin, so
// the controls (look-controls.tsx) only bind them.
import { type ChangeEvent, type MouseEvent, useState } from 'react';
import { z } from 'zod';
import { photoMessage } from './photo.ts';
import {
  type Look,
  readPhoto,
  readStoredLook,
  removePhoto,
  SKIN_IDS,
  startLook,
  writeLook,
  writePhoto,
} from './preferences.ts';
import { PhotoError, photoFromFile } from './use-photo.ts';

type LookStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Storage that keeps nothing, for a browser that blocks localStorage altogether. */
const NO_STORAGE: LookStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

function storage(): LookStorage {
  try {
    return typeof localStorage === 'undefined' ? NO_STORAGE : localStorage;
  } catch {
    return NO_STORAGE;
  }
}

const skinSchema = z.enum(SKIN_IDS);

export interface LookChoices {
  look: Look;
  photo: string | undefined;
  /** A quiet sentence about the last photo that could not be used. */
  photoNote: string | undefined;
  onPickSkin: (event: MouseEvent<HTMLElement>) => void;
  onToggle3d: () => void;
  onToggleNumbers: () => void;
  onPhotoFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemovePhoto: () => void;
}

/**
 * The look chosen in this browser, or the nickname's start look until there is a choice. The first
 * change keeps the whole look, so from then on it is this browser's choice for every profile.
 */
function useStoredLook(nickname: string): [Look, (change: Partial<Look>) => void] {
  const [chosen, setChosen] = useState<Look | undefined>(() => readStoredLook(storage()));
  const look = chosen ?? startLook(nickname);
  const update = (change: Partial<Look>) => {
    setChosen((current) => {
      const next = { ...(current ?? startLook(nickname)), ...change };
      writeLook(storage(), next);
      return next;
    });
  };
  return [look, update];
}

type PhotoChoices = Pick<LookChoices, 'photo' | 'photoNote' | 'onPhotoFile' | 'onRemovePhoto'>;

function usePhoto(update: (change: Partial<Look>) => void): PhotoChoices {
  const [photo, setPhoto] = useState(() => readPhoto(storage()));
  const [photoNote, setPhotoNote] = useState<string | undefined>(undefined);
  const keep = async (file: File) => {
    try {
      const dataUrl = await photoFromFile(file);
      if (!writePhoto(storage(), dataUrl)) throw new PhotoError('not-kept');
      setPhoto(dataUrl);
      setPhotoNote(undefined);
      update({ skin: 'photo' });
    } catch (error) {
      setPhotoNote(photoMessage(error instanceof PhotoError ? error.problem : 'unreadable'));
    }
  };
  return {
    photo,
    photoNote,
    onPhotoFile: (event) => {
      const input = event.currentTarget;
      const file = input.files?.[0];
      input.value = '';
      if (file !== undefined) void keep(file);
    },
    onRemovePhoto: () => {
      removePhoto(storage());
      setPhoto(undefined);
      setPhotoNote(undefined);
      // Back to plain numbers: an explicit step back, the same whichever profile is open.
      update({ skin: 'numbers' });
    },
  };
}

/** The look for `nickname`'s screen (the nickname picks the start picture). */
export function useLook(nickname: string): LookChoices {
  const [look, update] = useStoredLook(nickname);
  return {
    look,
    ...usePhoto(update),
    onPickSkin: (event) => {
      const skin = skinSchema.safeParse(event.currentTarget.dataset.skin);
      if (skin.success) update({ skin: skin.data });
    },
    onToggle3d: () => {
      update({ scene3d: !look.scene3d });
    },
    onToggleNumbers: () => {
      update({ numbers: !look.numbers });
    },
  };
}
