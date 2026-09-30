import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;
const isCI = !!process.env.CI;
// `pnpm test:e2e:prod` tests a production build (`pnpm build` first) like CI does.
const useProdBuild = isCI || !!process.env.E2E_PROD;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  // One retry: on a production build the suite is stable (0 failures in 214 stress runs),
  // so a second retry would only hide a real flake.
  retries: isCI ? 1 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    // Signs the seeded user in once and saves the session for tests that only need to be signed in.
    { name: "setup", testMatch: /.*\.setup\.ts/ },
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, dependencies: ["setup"] },
  ],
  webServer: {
    // CI and `test:e2e:prod` test the production build; otherwise reuse a running dev server.
    // The prod build never reuses a server: a stale one could be serving another build.
    // Call next directly: "pnpm start" leaves next-server running and Playwright hangs on exit.
    command: useProdBuild ? `next start --port ${PORT}` : `next dev --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !useProdBuild,
    timeout: 120_000,
    // Merged over process.env. Turns on "Suggest with AI" (read at runtime, so the CI
    // build needs no rebuild); the decompose route is mocked in the browser by the
    // specs, so the model is never called and no AI Gateway key is needed.
    env: { AI_DECOMPOSITION_ENABLED: "true" },
  },
});
