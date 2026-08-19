import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

const viteCommand = `${JSON.stringify(process.execPath)} ../../node_modules/vite/bin/vite.js`;
const edgeInstalled = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
].some(existsSync);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "line",
  use: {
    baseURL: "http://127.0.0.1:51873",
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
      command: `${viteCommand} --host 127.0.0.1 --port 51873 --strictPort`,
      url: "http://127.0.0.1:51873",
      reuseExistingServer: false,
      env: {
        VITE_DEMO_MODE: "true",
        VITE_NEON_AUTH_URL: "https://example.invalid/neondb/auth",
      },
    },
    {
      command: `${viteCommand} --host 127.0.0.1 --port 51874 --strictPort`,
      url: "http://127.0.0.1:51874",
      reuseExistingServer: false,
      env: { VITE_DEMO_MODE: "false", VITE_NEON_AUTH_URL: "" },
    },
  ],
});
