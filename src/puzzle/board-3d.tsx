// The 3D board: a picture of the same state as the DOM board, drawn under its buttons. Loaded as
// its own chunk (React.lazy in client.tsx), so three.js is never in the first download. It takes
// no input at all: hidden from assistive technology and from the pointer.
import type { ReactElement } from 'react';
import { type Board3DProps, useThreeBoard } from './use-three-board.ts';

export default function Board3D(props: Board3DProps): ReactElement {
  const ref = useThreeBoard(props);
  return <div ref={ref} className="sp-scene" data-testid="scene" aria-hidden="true" />;
}
