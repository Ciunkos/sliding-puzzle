import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { classify } from './src/server/paths.ts';

/** dist/web is the Workers static-assets directory: URL paths mirror file paths under it. */
const ASSETS_DIR = 'dist/web';
/** Hashed file names never change content, so browsers may keep them for a year. */
const HEADERS = `/sliding-puzzle/assets/*
  Cache-Control: public, max-age=31536000, immutable
`;

/** Empties dist/web before a build (Vite only empties its outDir) and writes dist/web/_headers. */
function workersAssets(): Plugin {
  return {
    name: 'workers-assets',
    apply: 'build',
    buildStart() {
      rmSync(ASSETS_DIR, { recursive: true, force: true });
    },
    closeBundle() {
      mkdirSync(ASSETS_DIR, { recursive: true });
      writeFileSync(`${ASSETS_DIR}/_headers`, HEADERS);
    },
  };
}

/** The dev server answers the same paths as the Node and Worker entries (see src/server/paths.ts). */
function sameRoutesInDev(): Plugin {
  return {
    name: 'same-routes-in-dev',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://dev.local');
        const path = classify(url.pathname);
        if (path.kind === 'redirect') {
          res.writeHead(301, { location: `${path.to}${url.search}` }).end();
          return;
        }
        // Vite serves the shell at its base with a trailing slash; the canonical form has none.
        if (path.kind === 'shell') req.url = `/sliding-puzzle/${url.search}`;
        next();
      });
    },
  };
}

export default defineConfig({
  root: 'src/web',
  base: '/sliding-puzzle/',
  plugins: [react(), workersAssets(), sameRoutesInDev()],
  server: {
    proxy: { '/sliding-puzzle/api': process.env.API_URL ?? 'http://localhost:8787' },
  },
  build: { outDir: '../../dist/web/sliding-puzzle', emptyOutDir: true },
});
