/**
 * Playwright config for the Roam CLS regression suite.
 *
 * Two projects:
 *   chromium-mobile  — iPhone 13 viewport (390x844), touch UA
 *   desktop          — Chromium 1280x800
 *
 * Locally: run `npm run dev` first (port 3000), then `npm run test:cls`.
 *          Override with ROAM_BASE_URL if you want to point at a built preview.
 *
 * CI: the webServer block starts `vite preview` automatically (requires a prior
 *     `npm run build` step in the workflow — see .github/workflows/cls-regression.yml).
 */

import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

// Local dev server is on 3000 (see vite.config.ts server.port).
// CI always tests the built preview on 4173.
const defaultURL = isCI ? 'http://localhost:4173' : 'http://localhost:3000';
const baseURL = process.env.ROAM_BASE_URL ?? defaultURL;

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',

  // CLS measurement is sensitive to system load — run sequentially to avoid
  // competing layout activity across parallel test processes.
  fullyParallel: false,
  workers: 1,

  // Timeout generous enough to cover lazy-chunk loads + measurement windows.
  timeout: 60_000,
  expect: { timeout: 10_000 },

  retries: isCI ? 1 : 0,

  reporter: isCI ? 'github' : 'html',

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Disable service workers — they can buffer resources and mask real CLS.
    serviceWorkers: 'block',
  },

  projects: [
    {
      name: 'chromium-mobile',
      use: {
        // iPhone 13: 390x844 logical pixels, touch UA, deviceScaleFactor 3.
        ...devices['iPhone 13'],
      },
    },
    {
      name: 'desktop',
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 800 },
      },
    },
  ],

  // In CI: spin up `vite preview` automatically (build must already exist).
  // reuseExistingServer:false ensures a fresh server on each CI run.
  // Locally this block is omitted so the developer's `npm run dev` is used.
  ...(isCI
    ? {
        webServer: {
          command: 'npm run preview',
          url: 'http://localhost:4173',
          reuseExistingServer: false,
          timeout: 120_000,
        },
      }
    : {}),
});
