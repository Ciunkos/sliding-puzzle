// A direct line from the board's pointer handler to the 3D board's held cube, outside React: the
// cube moves in the very next frame, with no render in between. In the first bundle (it imports
// nothing), so the pointer handler can call it without loading the 3D board; the 3D board attaches
// to it while it is on screen. Browser wiring.

type Pull = (tile: number, progress: number | undefined) => void;

let pull: Pull | undefined;

/**
 * Puts the held cube `tile` `progress` (0..1) of the way from its cell to the gap. Call it from the
 * pointer handler as often as the pointer moves: the 3D board draws at most once a frame. Undefined
 * lets the cube go (it springs back from where it is). After a committed move, do not let go: the
 * move itself takes the cube on from where it is. Does nothing without a 3D board.
 */
export function pullScene(tile: number, progress: number | undefined): void {
  pull?.(tile, progress);
}

/** The 3D board on screen takes the pulls; the returned function lets go of the line. */
export function attachScenePull(next: Pull): () => void {
  pull = next;
  return () => {
    if (pull === next) pull = undefined;
  };
}
