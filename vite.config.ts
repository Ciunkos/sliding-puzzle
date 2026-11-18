import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin, type Rolldown } from 'vite';
import {
  BASE,
  classify,
  HASHED_ASSETS,
  pathHeaders,
  SERVICE_WORKER_PATH,
} from './src/server/paths.ts';

/** dist/web is the Workers static-assets directory: URL paths mirror file paths under it. */
const ASSETS_DIR = 'dist/web';
const OUT_DIR = `${ASSETS_DIR}${BASE}`;

/** One `_headers` rule: the path, then its headers indented. */
function headersRule(path: string, headers: Record<string, string>): string {
  return [path, ...Object.entries(headers).map(([name, value]) => `  ${name}: ${value}`)].join(
    '\n',
  );
}

/** The same headers the Node server sets (src/server/paths.ts), as Cloudflare rules. */
const HEADERS = `${[
  headersRule(`${HASHED_ASSETS}*`, pathHeaders(HASHED_ASSETS)),
  headersRule(SERVICE_WORKER_PATH, pathHeaders(SERVICE_WORKER_PATH)),
].join('\n')}\n`;

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

type OutputBundle = Rolldown.OutputBundle;
type OutputChunk = Rolldown.OutputChunk;

/** The entry chunk of index.html and every chunk it imports statically: what the page needs at once. */
function shellChunks(bundle: OutputBundle): OutputChunk[] {
  const chunks = Object.values(bundle).filter((file) => file.type === 'chunk');
  const byName = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const found = new Map<string, OutputChunk>();
  const visit = (chunk: OutputChunk | undefined) => {
    if (chunk === undefined || found.has(chunk.fileName)) return;
    found.set(chunk.fileName, chunk);
    chunk.imports.forEach((name) => {
      visit(byName.get(name));
    });
  };
  visit(chunks.find((chunk) => chunk.isEntry && chunk.name === 'index'));
  return [...found.values()];
}

/** The shell's URLs: the page, its static chunks and their CSS. Lazy chunks are cached on first use. */
function shellUrls(bundle: OutputBundle): string[] {
  const files = shellChunks(bundle).flatMap((chunk) => [
    chunk.fileName,
    ...(chunk.viteMetadata?.importedCss ?? []),
  ]);
  return [BASE, ...[...new Set(files)].sort().map((file) => `${BASE}/${file}`)];
}

/**
 * Builds src/server/sw.ts as sw.js next to the page and writes the shell's URLs and a version into
 * it. The version hashes the URLs (they carry content hashes) and the page itself.
 */
function serviceWorker(): Plugin {
  return {
    name: 'service-worker',
    apply: 'build',
    writeBundle(_options, bundle) {
      const page = bundle['index.html'];
      const urls = shellUrls(bundle);
      const hash = createHash('sha256').update(urls.join(' '));
      if (page?.type === 'asset') hash.update(page.source);
      const file = `${OUT_DIR}/sw.js`;
      const source = readFileSync(file, 'utf8');
      if (!source.includes('__SW_PRECACHE__') || !source.includes('__SW_VERSION__')) {
        throw new Error('sw.js: the __SW_PRECACHE__ or __SW_VERSION__ placeholder is missing');
      }
      const built = source
        .replaceAll('__SW_PRECACHE__', urls.join(' '))
        .replaceAll('__SW_VERSION__', hash.digest('hex').slice(0, 12));
      writeFileSync(file, built);
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
  plugins: [react(), workersAssets(), serviceWorker(), sameRoutesInDev()],
  // Prepare three.js when the dev server starts. Otherwise Vite bundles it on first use and
  // reloads the page, which lands in the middle of whatever a player or a test was doing.
  optimizeDeps: { include: ['three'] },
  server: {
    proxy: { '/sliding-puzzle/api': process.env.API_URL ?? 'http://localhost:8787' },
  },
  build: {
    outDir: '../../dist/web/sliding-puzzle',
    emptyOutDir: true,
    rolldownOptions: {
      input: {
        index: fileURLToPath(new URL('src/web/index.html', import.meta.url)),
        sw: fileURLToPath(new URL('src/server/sw.ts', import.meta.url)),
      },
      // The worker keeps one name: browsers look for updates at the URL it was registered with.
      output: {
        entryFileNames: (chunk) => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js'),
      },
    },
  },
});
