import { defineConfig, devices } from '@playwright/test';

/**
 * Screenshot capture, kept separate from the test config on purpose: it writes
 * files into the repository, so it must never run as part of the quality gates.
 * It uses its own storage namespace so a capture run cannot touch E2E state.
 */

const PORT = Number(process.env.SHOTS_PORT ?? 3101);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tools/screenshots',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    // A fixed scale keeps the committed images the same size between runs.
    deviceScaleFactor: 1,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run build && npx next start --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 240_000,
    stdout: 'ignore',
    env: {
      NEXT_PUBLIC_GROWTHOS_STORAGE_NAMESPACE: 'growthos.screenshots',
    },
  },
});
