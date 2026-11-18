// The pure parts of "use your own photo": which square to keep, how big to store it, and what to
// say when it cannot be used. Reading, decoding and drawing are in use-photo.ts.

/** The stored photo's side, in pixels: enough for a sharp 3D texture, small enough to keep. */
const MAX_SIDE = 1024;
/** Larger files are refused before they are read: decoding them could run a phone out of memory. */
const MAX_FILE_BYTES = 40 * 1024 * 1024;
/** The longest data URL kept in localStorage (about 1 MB), well under the usual 5 MB quota. */
export const PHOTO_MAX_CHARS = 1_400_000;
/** JPEG qualities tried in turn until the photo fits PHOTO_MAX_CHARS. */
export const PHOTO_QUALITIES = [0.85, 0.7, 0.55] as const;

const JPEG_DATA_URL = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/;

/** The largest centred square of a `width` x `height` image. */
export function cropSquare(width: number, height: number): { x: number; y: number; side: number } {
  const side = Math.min(width, height);
  return { x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), side };
}

/** The side of the stored square: the crop scaled down to MAX_SIDE, never up. */
export function outputSide(cropSide: number): number {
  return Math.min(MAX_SIDE, cropSide);
}

export type PhotoProblem = 'not-an-image' | 'too-big' | 'unreadable' | 'not-kept';

/** Whether a chosen file is worth reading. */
export function checkPhotoFile(file: { type: string; size: number }): PhotoProblem | undefined {
  if (!file.type.startsWith('image/')) return 'not-an-image';
  if (file.size > MAX_FILE_BYTES) return 'too-big';
  return undefined;
}

/** Only a JPEG data URL within PHOTO_MAX_CHARS is kept. */
export function fitsStorage(dataUrl: string): boolean {
  return dataUrl.length <= PHOTO_MAX_CHARS && JPEG_DATA_URL.test(dataUrl);
}

const MESSAGES: Record<PhotoProblem, string> = {
  'not-an-image': 'That file is not a picture. Choose a photo instead.',
  'too-big': 'That photo is too big. Choose one under 40 MB.',
  unreadable: 'That photo could not be opened. Try another one.',
  'not-kept': 'There is no room to keep that photo on this device.',
};

export function photoMessage(problem: PhotoProblem): string {
  return MESSAGES[problem];
}
