import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

const viteCommand = `${JSON.stringify(process.execPath)} ../../node_modules/vite/bin/vite.js`;
const portBase = Number(process.env.PLAYWRIGHT_PORT_BASE || 51873);
const outputDir = process.env.PLAYWRIGHT_OUTPUT_DIR || "test-results";
const htmlOutputDir = process.env.PLAYWRIGHT_HTML_OUTPUT_DIR || "playwright-report";
const edgeInstalled = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
].some(existsSync);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  timeout: 60_000,
  retries: process.env.CI ? 2 : 0,
  workers: Number(process.env.PLAYWRIGHT_WORKERS || 4),
  outputDir,
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never", outputFolder: htmlOutputDir }]]
    : "line",
  use: {
    baseURL: `http://127.0.0.1:${portBase}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    ...(edgeInstalled
      ? [
          {
            name: "edge",
            use: { ...devices["Desktop Edge"], channel: "msedge" },
          },
        ]
      : []),
  ],
  webServer: [
    {
      command: `${viteCommand} --host 127.0.0.1 --port ${portBase} --strictPort`,
      url: `http://127.0.0.1:${portBase}`,
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_DEMO_MODE: "true",
        VITE_NEON_AUTH_URL: "https://example.invalid/neondb/auth",
      },
    },
    {
      command: `${viteCommand} --host 127.0.0.1 --port ${portBase + 1} --strictPort`,
      url: `http://127.0.0.1:${portBase + 1}`,
      reuseExistingServer: !process.env.CI,
      env: { VITE_DEMO_MODE: "false", VITE_NEON_AUTH_URL: "" },
    },
  ],
});
