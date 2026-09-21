import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  // Three engines, because "it works" meant "it works in Chromium" for the
  // first eleven dispatches. Firefox and WebKit differ in focus behaviour,
  // form controls and layout rounding often enough that claiming
  // cross-browser support without running them would be a guess.
  //
  // Run one engine with E2E_BROWSER=firefox while iterating; the default is
  // all three.
  projects: (process.env.E2E_BROWSER
    ? [process.env.E2E_BROWSER]
    : ['chromium', 'firefox', 'webkit']
  ).map((name) => ({
    name,
    use: {
      ...devices[
        name === 'firefox'
          ? 'Desktop Firefox'
          : name === 'webkit'
            ? 'Desktop Safari'
            : 'Desktop Chrome'
      ],
    },
  })),
  webServer: {
    // E2E runs against a production build, not the dev server: dev-only HMR
    // traffic would otherwise show up as console errors, and the build is what
    // actually ships. The namespace env var is set for the build step too,
    // because NEXT_PUBLIC_* values are inlined at build time.
    command: `npm run build && npx next start --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    stdout: 'ignore',
    env: {
      NEXT_PUBLIC_GROWTHOS_STORAGE_NAMESPACE: 'growthos.e2e',
    },
  },
});
