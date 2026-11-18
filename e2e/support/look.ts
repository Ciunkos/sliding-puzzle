// Steps and locators of the board's look: the 3D board, the skin picker and the photo. No expected
// values are decided here.
import type { Page } from '@playwright/test';

/** The 3D board's wrapper: data-webgl="ready" once drawn, data-scene-board the board it shows. */
export const scene = (page: Page) => page.getByTestId('scene');
export const toggle3d = (page: Page) => page.getByTestId('toggle-3d');
export const skinButton = (page: Page, skin: string) => page.getByTestId(`skin-${skin}`);
export const photoNote = (page: Page) => page.getByTestId('photo-note');

/** Opens the picture picker (a disclosure that stays open) and picks `skin`. */
export async function pickSkin(page: Page, skin: string): Promise<void> {
  await page.getByTestId('skin-picker').locator('summary').click();
  await skinButton(page, skin).click();
}

/** Chooses a file for "Use your own photo", as the file picker would. */
export async function choosePhoto(
  page: Page,
  file: { name: string; mimeType: string; buffer: Buffer },
): Promise<void> {
  await page.getByTestId('skin-picker').locator('summary').click();
  await page.getByTestId('photo-input').setInputFiles(file);
}

/** Opens the picture picker and removes the stored photo. */
export async function removePhoto(page: Page): Promise<void> {
  await page.getByTestId('skin-picker').locator('summary').click();
  await page.getByTestId('remove-photo').click();
}

/** Makes the browser behave as one without WebGL: canvases give no WebGL context. */
export async function withoutWebGl(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const original: unknown = Reflect.get(HTMLCanvasElement.prototype, 'getContext');
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value(this: HTMLCanvasElement, type: string, ...rest: unknown[]): unknown {
        if (type.startsWith('webgl') || typeof original !== 'function') return null;
        return Reflect.apply(original, this, [type, ...rest]) as unknown;
      },
    });
  });
}
