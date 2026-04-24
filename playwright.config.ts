import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for browser-level regression tests.
 *
 * These complement the Vitest suite (which covers API + pure logic):
 * - Vitest catches logic bugs in server code (scoring, email delivery, voice-token)
 * - Playwright catches React state machine bugs (useEffect deps, re-render races,
 *   auto-reconnect loops) that only manifest in a real browser
 *
 * Run: `npm run test:browser`
 * CI: runs against staging (set E2E_BASE_URL=https://staging.electricthinking.ai)
 * Local: runs against `npm run dev` at localhost:5000
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:5000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    // Mobile Safari (WebKit) catches iOS-specific bugs that only reproduce on
    // Safari's WebSocket + AudioContext behavior.
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 14"] },
    },
  ],
});
