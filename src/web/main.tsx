/// <reference types="vite/client" />
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app.tsx';

// The only place that reads Vite's env: BASE_URL is the configured base, e.g. /sliding-puzzle/.
const BASE = import.meta.env.BASE_URL;
const API_BASE = `${BASE}api`;
/** The offline worker runs on the production build only: in development it would cache Vite's files. */
const SERVICE_WORKER_URL = import.meta.env.PROD ? `${BASE}sw.js` : undefined;

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
      />
    </StrictMode>,
  );
}
