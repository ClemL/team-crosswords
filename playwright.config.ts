import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3200);

// One end-to-end happy path (§11). The server runs with the in-process store and a shortened
// cooldown; `npm run build` must run first unless E2E_DEV=1.
export default defineConfig({
  testDir: "e2e",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "android-chrome",
      use: {
        browserName: "chromium",
        viewport: { width: 360, height: 780 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: process.env.E2E_DEV ? `npx next dev -p ${PORT}` : `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/puzzles`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      XW_STORE: "memory",
      ADMIN_SEED_SECRET: "e2e-secret",
      XW_CONFIG_OVERRIDES: JSON.stringify({ cooldownMs: 1_500, rotationWarningMs: 1_500 }),
    },
  },
});
