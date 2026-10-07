vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { fakeResource } = await import('../helpers/pinia.js')
  return { ...actual, createResource: (options) => fakeResource(options) }
})

// The real router module builds every route and guard on import.
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }))
vi.mock('@/router', () => ({ default: router }))

import { sessionStore } from '@/stores/session'
import { withPinia } from '../helpers/pinia'

/** Set the user_id cookie the store reads at creation. */
function setSessionCookie(value) {
  document.cookie = `user_id=${value}`
}

function clearCookies() {
  document.cookie.split('; ').forEach((c) => {
    const name = c.split('=')[0]
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`
  })
}

describe('session store', () => {
  beforeEach(() => {
    clearCookies()
    withPinia()
    router.replace.mockClear()
  })

  afterEach(() => {
    clearCookies()
  })

  describe('resolving the session user', () => {
    it('reads the user_id cookie', () => {
      setSessionCookie('alice@example.com')
      expect(sessionStore().user).toBe('alice@example.com')
    })

    it('treats Guest as not logged in', () => {
      // Frappe sets user_id=Guest for anonymous sessions; that is not a user.
      setSessionCookie('Guest')
      const store = sessionStore()
      expect(store.user).toBeNull()
      expect(store.isLoggedIn).toBe(false)
    })

    it('has no user when the cookie is absent', () => {
      const store = sessionStore()
      expect(store.user).toBeNull()
      expect(store.isLoggedIn).toBe(false)
    })

    it('is logged in when a real user is present', () => {
      setSessionCookie('alice@example.com')
      expect(sessionStore().isLoggedIn).toBe(true)
    })
  })

  describe('login', () => {
    it('adopts the new session user, clears the form and goes to the dashboard', () => {
      const store = sessionStore()
      expect(store.user).toBeNull()

      setSessionCookie('bob@example.com')
      store.login.options.onSuccess()

      expect(store.user).toBe('bob@example.com')
      expect(store.login.reset).toHaveBeenCalled()
      expect(router.replace).toHaveBeenCalledWith({ name: 'Dashboard' })
    })

    it('throws a readable message on failure', () => {
      // The component surfaces this text, so it must not leak a raw API error.
      const store = sessionStore()
      expect(() => store.login.options.onError()).toThrow(
        'Invalid Email or Password',
      )
    })

    it('does not route on a failed login', () => {
      const store = sessionStore()
      expect(() => store.login.options.onError()).toThrow()
      expect(router.replace).not.toHaveBeenCalled()
    })
  })

  describe('logout', () => {
    it('clears the user', () => {
      setSessionCookie('alice@example.com')
      const store = sessionStore()
      expect(store.isLoggedIn).toBe(true)

      store.logout.options.onSuccess()

      expect(store.user).toBeNull()
      expect(store.isLoggedIn).toBe(false)
    })
  })
})
