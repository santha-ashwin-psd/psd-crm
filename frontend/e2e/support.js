/**
 * Shared bits for the end-to-end specs.
 *
 * The credential is hard-coded on purpose. It belongs to a user that exists
 * only on the local dev bench (`e2e@crm.test`, created by
 * `e2e/seed-user.py`), has no access to anything real, and the suite is
 * useless without a login it can perform unattended. Override with
 * CRM_E2E_USER / CRM_E2E_PASSWORD if your bench differs.
 */
export const USER = process.env.CRM_E2E_USER || 'e2e@crm.test'
export const PASSWORD = process.env.CRM_E2E_PASSWORD || 'e2e-playwright-local'

export const STORAGE_STATE = 'e2e/.auth/user.json'

/**
 * Drive the real login form.
 *
 * It is a two-step form: the email is submitted first, and the password field
 * only appears afterwards. Doing this through the UI rather than by posting to
 * `/api/method/login` is the point — it is the one place the login page itself
 * gets exercised.
 */
export async function logIn(page, { user = USER, password = PASSWORD } = {}) {
  await page.goto('/login?redirect-to=%2Fcrm')

  await page.locator('#email-input').fill(user)
  await page.locator('#email-btn').click()

  // The password field exists in the DOM from the start and is revealed, so
  // waiting for visibility is what tells us step one was accepted.
  const password_input = page.locator('#password-input')
  await password_input.waitFor({ state: 'visible' })
  await password_input.fill(password)
  await page.locator('#login-btn').click()
}

/**
 * Wait for the CRM SPA to have actually rendered, not merely navigated.
 *
 * `waitForURL` returns as soon as the URL matches, which for a single-page app
 * is before Vue has mounted anything — assertions that follow it race the first
 * paint. The sidebar is the cheapest thing that only exists once the shell is
 * up.
 */
export async function waitForApp(page) {
  // Deliberately not asserting a URL. `/crm` only serves the shell; the router
  // runs with base `/`, so the address immediately becomes `/dashboard` or
  // whichever route the app chooses. Waiting on the shell rendering is both
  // more robust and closer to what "the app is up" actually means.
  await page.locator('#app').waitFor({ state: 'attached' })
  // The sidebar entries are <button>s that push a route, not <a>s — worth
  // stating, because `getByRole('link')` finds nothing and the resulting
  // timeout looks like the app failed to load rather than like a bad selector.
  await sidebarItem(page, 'Deals').waitFor({ state: 'visible', timeout: 30_000 })
}

/** A top-level sidebar entry, by its visible label. */
export function sidebarItem(page, name) {
  return page.getByRole('button', { name, exact: true }).first()
}
