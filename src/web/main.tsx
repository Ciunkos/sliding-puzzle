/// <reference types="vite/client" />
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app.tsx';

// The only place that reads Vite's env: BASE_URL is the configured base, e.g. /sliding-puzzle/.
const API_BASE = `${import.meta.env.BASE_URL}api`;

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App apiBase={API_BASE} />
    </StrictMode>,
  );
}
