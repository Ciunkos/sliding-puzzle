import { defineConfig, devices } from '@playwright/test';

// Isolated ports and a throwaway SQLite file, so e2e never touches `npm run dev` data.
const API_PORT = 8788;
const WEB_PORT = 5174;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${String(WEB_PORT)}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
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
  ],
});
