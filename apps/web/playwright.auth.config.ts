import { defineConfig, devices } from "@playwright/test";
const port = 53281;
export default defineConfig({
  testDir: "./e2e-auth",
  timeout: 45_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["line"], ["html", { open: "never", outputFolder: "playwright-auth-report" }]],
  outputDir: "test-results-auth",
  use: { baseURL: `http://127.0.0.1:${port}`, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "auth-chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `${JSON.stringify(process.execPath)} ../../node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    env: { VITE_DEMO_MODE: "false", VITE_NEON_AUTH_URL: "https://auth.example.test/neondb/auth", VITE_API_URL: `http://127.0.0.1:${port}/test-api` },
  },
});
