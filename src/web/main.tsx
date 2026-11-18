/// <reference types="vite/client" />
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { type Analytics, ANALYTICS_OFF, startAnalytics } from './analytics.ts';
import { App } from './app.tsx';
import { forwardFeatureEvents } from './feature-events.ts';

// The only place that reads Vite's env: BASE_URL is the configured base, e.g. /sliding-puzzle/.
const BASE = import.meta.env.BASE_URL;
const API_BASE = `${BASE}api`;
/** The offline worker runs on the production build only: in development it would cache Vite's files. */
const SERVICE_WORKER_URL = import.meta.env.PROD ? `${BASE}sw.js` : undefined;

/** Usage statistics once started; until then, and whenever they are off, events go nowhere. */
let analytics: Analytics = ANALYTICS_OFF;
/** What the game screens report, through the allowlist in feature-events.ts. */
const onFeatureEvent = forwardFeatureEvents((event) => {
  analytics.track(event);
});

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      {/* The browser's one source of randomness: generated nicknames. */}
      <App
        apiBase={API_BASE}
        base={BASE}
        random={Math.random}
        serviceWorkerUrl={SERVICE_WORKER_URL}
        onEvent={onFeatureEvent}
      />
    </StrictMode>,
  );
}

// Usage statistics (ciunkos.com only, and only when the player allows it). Nothing waits for them,
// and a failure only means nothing is counted. The page's own moments are sent from here.
void startAnalytics(BASE).then((started) => {
  analytics = started;
  started.track({ name: 'page_view', properties: {} });
  window.addEventListener('appinstalled', () => {
    started.track({ name: 'app_installed', properties: {} });
  });
});
