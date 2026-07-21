import path from "path";

import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const authFile = path.join(__dirname, "playwright/.auth/user.json");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : [["html", { open: "never" }]],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}-{projectName}{ext}",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: process.env.CI ? "retain-on-failure" : "off",
    locale: "fr-FR",
    colorScheme: "light",
    channel: "chromium",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts$/ },
    {
      name: "desktop-1440",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, storageState: authFile },
      dependencies: ["setup"],
      testIgnore: [/auth\.setup\.ts$/, /\.public\.spec\.ts$/],
    },
    {
      name: "tablet-768",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 768, height: 1024 },
        hasTouch: true,
        storageState: authFile,
      },
      dependencies: ["setup"],
      testIgnore: [/auth\.setup\.ts$/, /\.public\.spec\.ts$/],
    },
    {
      name: "mobile-390",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        storageState: authFile,
      },
      dependencies: ["setup"],
      testIgnore: [/auth\.setup\.ts$/, /\.public\.spec\.ts$/],
    },
    {
      name: "public-desktop-1440",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      testMatch: /\.public\.spec\.ts$/,
    },
    {
      name: "public-tablet-768",
      use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 }, hasTouch: true },
      testMatch: /\.public\.spec\.ts$/,
    },
    {
      name: "public-mobile-390",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
      },
      testMatch: /\.public\.spec\.ts$/,
    },
  ],
  webServer: {
    command: "npx tsx scripts/start-dev-e2e.ts",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
