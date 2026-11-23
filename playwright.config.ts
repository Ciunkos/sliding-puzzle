import { defineConfig, devices } from '@playwright/test';

// Isolated ports and a throwaway SQLite file, so e2e never touches `npm run dev` data.
const API_PORT = 8788;
const WEB_PORT = 5174;
/** The built app (`npm run build`) on the Node server, for the `app` project. */
const APP_PORT = 8794;
/** The built app on `wrangler dev` (the Worker, local D1, no login), for the `worker` project. */
const WORKER_PORT = 8797;
/** The Worker's local D1 and other state: its own folder, never the `npm run worker:dev` one. */
const WORKER_STATE = '.e2e/wrangler-state';

// GitHub's runners have no GPU, and a software renderer logs and times differently. With
// E2E_SOFTWARE_GL=1 (npm run test:e2e:nogpu) the browser draws WebGL in software here too, so a
// failure that only a GPU-less machine shows is found before the push.
const SOFTWARE_GL =
  process.env.E2E_SOFTWARE_GL === '1'
    ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
    : [];

export default defineConfig({
  testDir: 'e2e',
  // The tests are long flows of many steps (README, Tests), not one check each; on a runner
  // without a GPU a flow takes a few times longer than here, so each gets two minutes.
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${String(WEB_PORT)}`,
    trace: 'retain-on-failure',
    // The full Chromium in its new headless mode, for the 3D board: WebGL2 runs on the GPU when
    // there is one (SwiftShader otherwise). The default headless shell also has WebGL2, but it
    // composites the canvas by reading it back, and logs "GPU stall due to ReadPixels" warnings.
    launchOptions: { channel: 'chromium', args: SOFTWARE_GL },
  },
  projects: [
    {
      name: 'phone',
      testIgnore: ['app.spec.ts', 'worker.spec.ts'],
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'desktop',
      testIgnore: ['app.spec.ts', 'worker.spec.ts'],
      use: { ...devices['Desktop Chrome'] },
    },
    // The installed app: the production build with its service worker, on the Node server.
    {
      name: 'app',
      testMatch: 'app.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${String(APP_PORT)}` },
    },
    // The rehearsal of a deploy: the same build on the Worker runtime with D1, as Cloudflare runs it.
    {
      name: 'worker',
      testMatch: 'worker.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${String(WORKER_PORT)}` },
    },
  ],
  webServer: [
    {
      command: `rm -f .e2e/e2e.db* && PORT=${String(API_PORT)} DB_PATH=.e2e/e2e.db ENABLE_TEST_ROUTES=1 node src/server/node.ts`,
      url: `http://localhost:${String(API_PORT)}/sliding-puzzle/api/health`,
      reuseExistingServer: false,
    },
    {
      command: `API_URL=http://localhost:${String(API_PORT)} npx vite --port ${String(WEB_PORT)} --strictPort`,
      url: `http://localhost:${String(WEB_PORT)}/sliding-puzzle`,
      reuseExistingServer: false,
    },
    {
      command: `npm run build && rm -f .e2e/app.db* && PORT=${String(APP_PORT)} DB_PATH=.e2e/app.db ENABLE_TEST_ROUTES=1 node src/server/node.ts`,
      url: `http://localhost:${String(APP_PORT)}/sliding-puzzle/api/health`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      // Every migration on an empty local D1, then the Worker. wrangler needs no login for this.
      command: [
        'npm run build',
        `rm -rf ${WORKER_STATE}`,
        `npx wrangler d1 migrations apply sliding-puzzle --local --persist-to ${WORKER_STATE}`,
        `npx wrangler dev --port ${String(WORKER_PORT)} --persist-to ${WORKER_STATE} --show-interactive-dev-session=false`,
      ].join(' && '),
      url: `http://localhost:${String(WORKER_PORT)}/sliding-puzzle/api/health`,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
