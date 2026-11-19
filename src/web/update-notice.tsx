// "A new version is ready": a compact pill near the bottom of the screen, above a game's bottom row,
// so it covers none of the corner buttons and moves nothing (the page is exactly one screen). Nothing reloads until the player presses Reload.
import type { ReactElement } from 'react';
import { useServiceWorker } from './use-service-worker.ts';

const CSS = `
.update-notice {
  position: fixed;
  z-index: 40;
  left: 50%;
  /* Above a game's bottom row (its 44px buttons and the screen's margin), clear of its corners. */
  bottom: calc(max(10px, env(safe-area-inset-bottom)) + 3.75rem);
  box-sizing: border-box;
  width: max-content;
  max-width: calc(100vw - 24px);
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: 0.25rem 0.75rem;
  padding: 0.25rem 0.25rem 0.25rem 1rem;
  border-radius: 1.5rem;
  background: #111;
  color: #fff;
  font-family: system-ui, sans-serif;
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.3);
  transform: translateX(-50%);
}
.update-notice p { margin: 0; }
.update-notice button {
  min-height: 44px;
  font: inherit;
  padding: 0.5rem 1rem;
  border: 2px solid #fff;
  border-radius: 999px;
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
