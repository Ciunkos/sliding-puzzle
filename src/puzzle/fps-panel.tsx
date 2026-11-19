// The `?fps` readout: frames per second, frame times, drawing-buffer size, quality level and the
// cap the frames sit on, in a corner over the game. Mounted only on a visit that started with
// `?fps` (use-fps-flag.ts); then the 3D board draws every frame so there is something to measure.
// Hidden from assistive technology and from the pointer. The numbers come from the runtime
// (use-frame-quality.ts).
import { type CSSProperties, type ReactElement, useSyncExternalStore } from 'react';
import { type FrameReadout, fpsLines } from './frame-model.ts';
import { latestStats, subscribeStats } from './use-frame-quality.ts';

const BOX: CSSProperties = {
  position: 'fixed',
  right: 8,
  bottom: 8,
  zIndex: 1000,
  pointerEvents: 'none',
  margin: 0,
  padding: '6px 8px',
  borderRadius: 6,
  background: 'rgb(0 0 0 / 0.7)',
  color: '#fff',
  font: '11px/1.35 ui-monospace, monospace',
};

/** The readout of `stats`, a line each; before the first frames, a word that it is measuring. */
export function FpsReadout(props: { stats: FrameReadout | undefined }): ReactElement {
  const lines = props.stats === undefined ? ['measuring...'] : fpsLines(props.stats);
  return (
    <div aria-hidden="true" data-testid="fps-panel" style={BOX}>
      {lines.map((line) => (
        <div key={line}>{line}</div>
      ))}
    </div>
  );
}

/**
 * The runtime's live readout. Mount it only on a visit that started with `?fps`
 * (`{FPS_FLAG ? <FpsPanel /> : null}`, use-fps-flag.ts): unmounted, it costs nothing.
 */
export function FpsPanel(): ReactElement {
  const stats = useSyncExternalStore(subscribeStats, latestStats, () => undefined);
  return <FpsReadout stats={stats} />;
}
