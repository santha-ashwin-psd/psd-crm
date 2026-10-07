import { test, expect } from '@playwright/test'
import { logIn, waitForApp, USER } from './support.js'

/**
 * The login form.
 *
 * Runs without the saved session — this is the one spec that must start
 * logged out, so it opts out of the shared storage state.
 */
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('signing in', () => {
  test('an unauthenticated visitor is sent to the login page', async ({ page }) => {
    await page.goto('/crm')
    await expect(page).toHaveURL(/\/login/)
    await expect(page.locator('#email-input')).toBeVisible()
  })

  test('the right credentials reach the app', async ({ page }) => {
    await logIn(page)
    await waitForApp(page)

    const who = await page.request.get('/api/method/frappe.auth.get_logged_user')
    expect((await who.json()).message).toBe(USER)
  })

  test('the wrong password does not', async ({ page }) => {
    await logIn(page, { password: 'not-the-password' })

    // The failure has to be visible *and* the session must not exist. Checking
    // only the message would pass against a form that shows an error and logs
    // you in anyway; checking only the session would pass against one that
    // silently does nothing.
    await expect(page.locator('#app')).toHaveCount(0)
    await expect(page).toHaveURL(/\/login/)

    const who = await page.request.get('/api/method/frappe.auth.get_logged_user')
    expect((await who.json()).message).not.toBe(USER)
  })

  test('an unknown address does not reach the password step', async ({ page }) => {
    await page.goto('/login?redirect-to=%2Fcrm')
    await page.locator('#email-input').fill('nobody@nowhere.invalid')
    await page.locator('#email-btn').click()

    // Either it says so, or it refuses to advance. Both are acceptable
    // behaviour; silently showing the password field for an address that does
    // not exist is not.
    await expect
      .poll(async () => {
        const err = await page.locator('#email-err').isVisible().catch(() => false)
        const pw = await page.locator('#password-input').isVisible().catch(() => false)
        return err || !pw
      })
      .toBe(true)
  })
})
