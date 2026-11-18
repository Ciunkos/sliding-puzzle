// "A new version is ready": a small bar at the bottom of the screen, over nothing important and
// without moving the page. Nothing reloads until the player presses Reload.
import type { ReactElement } from 'react';
import { useServiceWorker } from './use-service-worker.ts';

const CSS = `
.update-notice {
  position: fixed;
  inset: auto 0 0;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 0.5rem 1rem;
  padding: 0.5rem 1rem calc(0.5rem + env(safe-area-inset-bottom));
  background: #111;
  color: #fff;
}
.update-notice p { margin: 0; }
/* Room at the end of the page, so the bar never hides its last controls. */
.update-spacer { height: 5rem; }
.update-notice button {
  min-height: 44px;
  font: inherit;
  padding: 0.5rem 1rem;
  border: 2px solid #fff;
  border-radius: 6px;
  background: #fff;
  color: #111;
  cursor: pointer;
}
.update-notice button:focus-visible { outline: 3px solid #8ab4ff; outline-offset: 2px; }
@media (prefers-color-scheme: dark) {
  .update-notice { background: #e8ecf3; color: #0a0d14; }
  .update-notice button { border-color: #0a0d14; background: #0a0d14; color: #e8ecf3; }
  .update-notice button:focus-visible { outline-color: #1d4ed8; }
}
`;

/** `url` is the service worker script, or undefined (development) for no service worker at all. */
export function UpdateNotice(props: { url: string | undefined }): ReactElement {
  const { offer, reload } = useServiceWorker(props.url);
  // The live region is always there, so screen readers announce the bar when it appears.
  return (
    <div role="status">
      {offer ? (
        <>
          <style>{CSS}</style>
          <div className="update-spacer" />
          <div className="update-notice" data-testid="update-notice">
            <p>A new version is ready.</p>
            <button type="button" data-testid="update-reload" onClick={reload}>
              Reload
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
