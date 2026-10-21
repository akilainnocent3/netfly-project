import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end suite. Expects the stack running (`docker compose up`) with the
 * demo catalog seeded. Playback specs skip themselves when no video is ready
 * (e.g. S3 not configured yet).
 */
// Playwright's bundled Chromium has no H.264/AAC: set NETFLY_E2E_CHANNEL=chrome to run the playback specs.
const channel = process.env.NETFLY_E2E_CHANNEL || undefined;

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-setup.ts",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.NETFLY_CLIENT_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], channel, viewport: { width: 1440, height: 900 } }, testIgnore: /(mobile|profiles|priority)\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
    // Profiles flips a global flag (every viewer then sees the gate): run it after everything else.
    {
      name: "profiles",
      use: { ...devices["Desktop Chrome"], channel, viewport: { width: 1440, height: 900 } },
      testMatch: /profiles\.spec\.ts/,
      dependencies: ["desktop", "mobile"],
    },
    // Boosts a title for everyone: also isolated, after profiles.
    {
      name: "priority",
      use: { ...devices["Desktop Chrome"], channel, viewport: { width: 1440, height: 900 } },
      testMatch: /priority\.spec\.ts/,
      dependencies: ["profiles"],
    },
  ],
});
