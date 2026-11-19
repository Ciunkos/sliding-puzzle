// Whether this browser gets the 3D board, and the WebGL2 canvas it draws on. Checked after the
// first paint, only when the player wants 3D: no WebGL2 or a data saver means the flat board. The
// probe's context is the one the scene uses (three.js takes it as given), so there is no second
// context and no error to log when WebGL is missing. Turning 3D off frees the context at once.
import { useEffect, useState } from 'react';

export interface SceneSurface {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
}

/** Why there is no 3D board although the player wants one. */
export type NoScene = 'no-webgl' | 'save-data';

/**
 * The context: transparent over the page, no stencil. Multisampling only on screens below a pixel
 * ratio of 2, where edges would show steps: at 2 or more the pixels are small enough, and it was
 * a third of the frame time where WebGL runs without a GPU. The faster GPU where there are two
 * (on phones `low-power` may pick a slower path).
 */
function contextFor(pixelRatio: number): WebGLContextAttributes {
  return {
    alpha: true,
    antialias: pixelRatio < 2,
    depth: true,
    stencil: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
  };
}

/** navigator.connection is not in every browser (nor in TypeScript's DOM types). */
function savesData(): boolean {
  const connection: unknown = Reflect.get(navigator, 'connection');
  return (
    typeof connection === 'object' &&
    connection !== null &&
    Reflect.get(connection, 'saveData') === true
  );
}

function probe(): SceneSurface | NoScene {
  if (savesData()) return 'save-data';
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', contextFor(devicePixelRatio));
  return gl === null ? 'no-webgl' : { canvas, gl };
}

function release(surface: SceneSurface | NoScene | undefined): void {
  if (typeof surface !== 'object') return;
  surface.gl.getExtension('WEBGL_lose_context')?.loseContext();
}

/** The surface once probed (undefined before, or when not wanted), or why there is none. */
export function useSceneSurface(wanted: boolean): SceneSurface | NoScene | undefined {
  const [surface, setSurface] = useState<SceneSurface | NoScene | undefined>(undefined);
  useEffect(() => {
    if (!wanted) return undefined;
    let found: SceneSurface | NoScene | undefined;
    // After the first paint: the flat board shows at once, the 3D board joins it.
    const frame = requestAnimationFrame(() => {
      found = probe();
      setSurface(found);
    });
    return () => {
      cancelAnimationFrame(frame);
      release(found);
      setSurface(undefined);
    };
  }, [wanted]);
  return surface;
}
