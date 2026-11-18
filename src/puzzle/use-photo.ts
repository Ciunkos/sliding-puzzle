// Turns a chosen file into the stored photo: read in the browser, cropped to its centred square,
// scaled down and encoded as a JPEG data URL. Nothing is uploaded. The decisions (crop, size,
// limits, messages) are in photo.ts; this file only drives the image and canvas APIs.
import {
  checkPhotoFile,
  cropSquare,
  fitsStorage,
  outputSide,
  PHOTO_QUALITIES,
  type PhotoProblem,
} from './photo.ts';

export class PhotoError extends Error {
  readonly problem: PhotoProblem;

  constructor(problem: PhotoProblem) {
    super(problem);
    this.problem = problem;
  }
}

async function decode(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } catch {
    throw new PhotoError('unreadable');
  } finally {
    // The decoded image keeps its pixels; the object URL is no longer needed.
    URL.revokeObjectURL(url);
  }
}

function encode(canvas: HTMLCanvasElement): string {
  for (const quality of PHOTO_QUALITIES) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (fitsStorage(dataUrl)) return dataUrl;
  }
  throw new PhotoError('not-kept');
}

/** The photo as a square JPEG data URL of at most 1024 pixels a side, or a PhotoError. */
export async function photoFromFile(file: File): Promise<string> {
  const problem = checkPhotoFile(file);
  if (problem !== undefined) throw new PhotoError(problem);
  const image = await decode(file);
  const crop = cropSquare(image.naturalWidth, image.naturalHeight);
  if (crop.side === 0) throw new PhotoError('unreadable');
  const side = outputSide(crop.side);
  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side;
  const context = canvas.getContext('2d');
  if (context === null) throw new PhotoError('unreadable');
  context.drawImage(image, crop.x, crop.y, crop.side, crop.side, 0, 0, side, side);
  return encode(canvas);
}
