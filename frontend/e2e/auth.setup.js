import { test as setup, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { logIn, waitForApp, STORAGE_STATE, USER } from './support.js'

/**
 * Log in once and save the session for every other spec.
 *
 * This runs as its own project that the browser project depends on, so a
 * failure here reports as "setup failed" rather than as every spec failing
 * separately with the same cause.
 */
setup('authenticate', async ({ page }) => {
  await logIn(page)
  await waitForApp(page)

  // Prove it is really this user's session before saving it. A saved
  // storage-state that is not actually authenticated would send every
  // downstream spec to the login page, and they would fail on their own
  // assertions rather than on the real reason.
  const who = await page.request.get('/api/method/frappe.auth.get_logged_user')
  expect(who.ok()).toBeTruthy()
  expect((await who.json()).message).toBe(USER)

  // A brand-new user lands on an onboarding overlay that covers the app and
  // forces the route to /dashboard, so every other spec would be testing the
  // overlay. Skipping it here is also what a real user does once — and it is
  // server-side state, so it stays skipped for later runs.
  const skipAll = page.getByRole('button', { name: 'Skip all' })
  if (await skipAll.isVisible().catch(() => false)) {
    await skipAll.click()
    await expect(skipAll).toBeHidden()
  }

  mkdirSync(dirname(STORAGE_STATE), { recursive: true })
  await page.context().storageState({ path: STORAGE_STATE })
})
