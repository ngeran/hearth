import { defineConfig, devices } from "@playwright/test";

const isCi = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  reporter: isCi ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://127.0.0.1:8787",
    locale: "en-US",
    trace: "on-first-retry",
  },
  webServer: {
    command: "pnpm preview",
    url: "http://127.0.0.1:8787/api/v1/health",
    reuseExistingServer: !isCi,
    timeout: 120_000,
  },
  projects: [
    {
      name: "phone",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 360, height: 800 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      },
    },
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 900 },
      },
    },
  ],
});
