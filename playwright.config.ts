import { defineConfig, devices } from '@playwright/test';

// Isolated ports and a throwaway SQLite file, so e2e never touches `npm run dev` data.
const API_PORT = 8788;
const WEB_PORT = 5174;
/** The built app (`npm run build`) on the Node server, for the `app` project. */
const APP_PORT = 8794;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${String(WEB_PORT)}`,
    trace: 'retain-on-failure',
    // The full Chromium in its new headless mode, for the 3D board: WebGL2 runs on the GPU when
    // there is one (SwiftShader otherwise). The default headless shell also has WebGL2, but it
    // composites the canvas by reading it back, and logs "GPU stall due to ReadPixels" warnings.
    launchOptions: { channel: 'chromium' },
  },
  projects: [
    { name: 'phone', testIgnore: 'app.spec.ts', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', testIgnore: 'app.spec.ts', use: { ...devices['Desktop Chrome'] } },
    // The installed app: the production build with its service worker, on the Node server.
    {
      name: 'app',
      testMatch: 'app.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${String(APP_PORT)}` },
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
  ],
});
