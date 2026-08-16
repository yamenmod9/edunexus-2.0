import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end config. Assumes both servers are already running:
 *   backend  python -m flask --app wsgi run --port 5055
 *   frontend npm run dev
 *
 * They are not started here on purpose - the Flask dev server needs the local
 * database seeded with a form, which is a setup step a human does once rather
 * than something a test run should be doing implicitly.
 *
 * Start the backend with AUTH_RATE_LIMIT_ATTEMPTS raised. These specs register
 * a fresh account per test, which legitimately exceeds the production limit of
 * 10 auth attempts per 5 minutes per IP:
 *
 *   AUTH_RATE_LIMIT_ATTEMPTS=1000 python -m flask --app wsgi run --port 5055
 *
 * Without it the later tests get 429s and fail at registration, which looks
 * like a UI bug and is not one.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
