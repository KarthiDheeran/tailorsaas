import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

if (existsSync(".env.test.local")) process.loadEnvFile(".env.test.local");
const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60000,
  expect: { timeout: 10000 },
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }], ["json", { outputFile: process.env.PLAYWRIGHT_JSON_OUTPUT_NAME ?? "test-results/browser-results.json" }]],
  use: {
    baseURL: externalBaseUrl ?? "http://localhost:3101",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    channel: "msedge",
  },
  webServer: externalBaseUrl ? undefined : {
    command: "node node_modules/next/dist/bin/next dev --port 3101",
    env: { NEXT_DIST_DIR: ".next-verification" },
    url: "http://localhost:3101/login",
    reuseExistingServer: true,
    timeout: 180000,
  },
});
