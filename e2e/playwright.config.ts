import { defineConfig, devices } from "@playwright/test";

// The certification matrix (README): desktop Chromium, WebKit, Firefox.
// Every project runs the full battery; the pin/prepend gates are HARD gates —
// 0 jitter frames, <1px anchor shift — exactly the spike's verdict thresholds.
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false, // gates measure timing; avoid cross-test CPU noise
  workers: 1,
  timeout: 60_000,
  retries: 0,
  reporter: process.env["CI"]
    ? [["list"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    baseURL: "http://localhost:5199",
    viewport: { width: 1400, height: 900 },
  },
  webServer: {
    command: "npm run dev --workspace playground",
    url: "http://localhost:5199",
    reuseExistingServer: true,
    cwd: "..",
    timeout: 30_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
  ],
});
