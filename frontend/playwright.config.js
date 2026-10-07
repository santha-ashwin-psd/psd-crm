import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests, against a real Frappe bench.
 *
 * These are deliberately few and deliberately whole-journey. The 5,515 unit
 * tests already cover component logic in isolation; what they cannot reach is
 * the wiring — routing, auth, the real API contract, and whether a page that
 * mounts in happy-dom also mounts against the built bundle. That is what these
 * are for, so a spec here should fail for a reason no unit test could catch.
 *
 * Prerequisites (see e2e/README.md):
 *   redis-server config/redis_cache.conf --daemonize yes
 *   redis-server config/redis_queue.conf --daemonize yes
 *   bench serve --port 8001
 *
 * `webServer` is deliberately NOT configured. Playwright would start and stop
 * the bench per run, and a Frappe boot is slow enough that it would dominate
 * the suite — and killing a bench mid-run can leave redis and the workers in a
 * state the next run inherits. The stack is a prerequisite, and the check below
 * fails with a readable message rather than a connection refused.
 */
const BASE_URL = process.env.CRM_E2E_URL || 'http://127.0.0.1:8001'

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.js',
  // A real browser against a real server is not a unit test; give it room, but
  // not so much that a hung request looks like a slow one.
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    // The dev bench is http and self-signed-adjacent; don't fail on that.
    ignoreHTTPSErrors: true,
  },

  projects: [
    // Logs in once through the real login UI and saves the cookies. Everything
    // downstream reuses them, so the login form is exercised exactly once
    // rather than at the top of every spec.
    { name: 'setup', testMatch: /auth\.setup\.js/ },
    {
      name: 'chromium',
      testIgnore: /login\.spec\.js/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },
    // The login spec runs LAST, in its own project.
    //
    // It signs the same user in from a fresh context, and Frappe hands out a
    // new session when it does — which retires the one `setup` saved. Running
    // it first left every later spec holding a cookie the server had stopped
    // honouring: pages still rendered from the shell, but API-backed things
    // (the create dialog's field layout, most visibly) silently did nothing.
    // Nothing reported an auth error, which is what made it look like a broken
    // button rather than a dead session.
    {
      name: 'login',
      testMatch: /login\.spec\.js/,
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['chromium'],
    },
  ],
})
