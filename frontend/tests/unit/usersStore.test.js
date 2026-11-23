// The store fetches on creation (`auto: true`), routes on auth errors, and
// reads the session user. All three are stubbed; the rest of frappe-ui stays
// real because utils pulls dayjs and toast from it.
vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { fakeResource } = await import('../helpers/pinia.js')
  return { ...actual, createResource: (options) => fakeResource(options) }
})

const nav = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => nav }))

vi.mock('@/stores/session', () => ({
  sessionStore: () => ({ user: 'alice@example.com' }),
}))

import { usersStore } from '@/stores/users'
import { withPinia } from '../helpers/pinia'

const ALL_USERS = [
  {
    name: 'alice@example.com',
    email: 'alice@example.com',
    full_name: 'Alice Adams',
    role: 'System Manager',
  },
  {
    name: 'bob@example.com',
    email: 'bob@example.com',
    full_name: 'Bob Brown',
    role: 'Sales Manager',
  },
  {
    name: 'carol@example.com',
    email: 'carol@example.com',
    full_name: 'Carol Clark',
    role: 'Sales User',
    is_telephony_agent: 1,
  },
  {
    name: 'Administrator',
    email: 'admin@example.com',
    full_name: 'Administrator',
    role: 'System Manager',
  },
  {
    name: 'guest@example.com',
    email: 'guest@example.com',
    full_name: 'Guest',
    user_type: 'Website User',
  },
]

const CRM_USERS = [ALL_USERS[0], ALL_USERS[1]]

function seededStore() {
  const store = usersStore()
  store.users._seed([structuredClone(ALL_USERS), structuredClone(CRM_USERS)])
  return store
}

describe('users store', () => {
  beforeEach(() => {
    withPinia()
    nav.push.mockClear()
  })

  describe('normalising the payload', () => {
    it('indexes users by name', () => {
      const store = seededStore()
      expect(store.getUser('bob@example.com').full_name).toBe('Bob Brown')
    })

    it('also indexes Administrator by its email', () => {
      // Administrator's `name` is not an email, but comment authors and doc
      // owners reference it by email, so both keys must resolve.
      const store = seededStore()
      expect(store.getUser('Administrator').full_name).toBe('Administrator')
      expect(store.getUser('admin@example.com').full_name).toBe('Administrator')
    })

    it('falls back to email when a record has no name', () => {
      const store = usersStore()
      store.users._seed([[{ email: 'x@example.com' }], []])
      expect(store.getUser('x@example.com').name).toBe('x@example.com')
    })

    it('falls back to the identifier when full_name is blank', () => {
      const store = usersStore()
      store.users._seed([
        [{ name: 'y@example.com', email: 'y@example.com', full_name: '   ' }],
        [],
      ])
      expect(store.getUser('y@example.com').full_name).toBe('y@example.com')
    })

    it('drops null entries rather than crashing on them', () => {
      const store = usersStore()
      expect(() =>
        store.users._seed([[null, ALL_USERS[0], undefined], []]),
      ).not.toThrow()
      expect(store.users.data.allUsers).toHaveLength(1)
    })

    it('survives an empty payload', () => {
      const store = usersStore()
      store.users._seed([[], []])
      expect(store.users.data.allUsers).toEqual([])
    })
  })

  describe('getUser', () => {
    it('resolves the session user for no argument and for "sessionUser"', () => {
      const store = seededStore()
      expect(store.getUser().full_name).toBe('Alice Adams')
      expect(store.getUser('sessionUser').full_name).toBe('Alice Adams')
    })

    it('synthesises a stub for an unknown email', () => {
      // Comment authors and email recipients can reference people the fast
      // fetch never covered; the UI still needs something to render.
      const store = seededStore()
      const stub = store.getUser('zoe@example.com')
      expect(stub).toMatchObject({
        name: 'zoe@example.com',
        email: 'zoe@example.com',
        full_name: 'zoe',
        first_name: 'zoe',
        last_name: '',
        user_image: null,
        role: null,
      })
    })

    it('returns the same stub object on repeat calls', () => {
      const store = seededStore()
      expect(store.getUser('zoe@example.com')).toBe(
        store.getUser('zoe@example.com'),
      )
    })

    it('marks a disabled user as removed', () => {
      // get_user_info is the only source of `enabled`, and only for people
      // missing from the active list: removed users on old records.
      const store = usersStore()
      store.users._seed([
        [{ name: 'vin@example.com', full_name: 'Vinoth Kumar', enabled: 0 }],
        [],
      ])
      expect(store.getUser('vin@example.com').full_name).toBe(
        'Vinoth Kumar (removed)',
      )
    })
  })

  describe('role helpers', () => {
    it('identifies a System Manager as admin and manager', () => {
      const store = seededStore()
      expect(store.isAdmin('alice@example.com')).toBe(true)
      expect(store.isManager('alice@example.com')).toBe(true)
    })

    it('identifies a Sales Manager as manager but not admin', () => {
      const store = seededStore()
      expect(store.isAdmin('bob@example.com')).toBe(false)
      expect(store.isManager('bob@example.com')).toBe(true)
    })

    it('identifies a Sales User as neither', () => {
      const store = seededStore()
      expect(store.isAdmin('carol@example.com')).toBe(false)
      expect(store.isManager('carol@example.com')).toBe(false)
      expect(store.isSalesUser('carol@example.com')).toBe(true)
    })

    it('defaults to the session user when no email is passed', () => {
      const store = seededStore()
      expect(store.isAdmin()).toBe(true)
    })

    it('treats a synthesised stub as having no role', () => {
      const store = seededStore()
      expect(store.isAdmin('zoe@example.com')).toBe(false)
      expect(store.isManager('zoe@example.com')).toBe(false)
      expect(store.getUserRole('zoe@example.com')).toBeNull()
    })

    it('reads the telephony flag', () => {
      const store = seededStore()
      expect(store.isTelephonyAgent('carol@example.com')).toBe(1)
      expect(store.isTelephonyAgent('bob@example.com')).toBeUndefined()
    })

    it('recognises a website user', () => {
      const store = seededStore()
      expect(store.isWebsiteUser('guest@example.com')).toBe(true)
      expect(store.isWebsiteUser('alice@example.com')).toBe(false)
    })

    it('returns the role name', () => {
      const store = seededStore()
      expect(store.getUserRole('bob@example.com')).toBe('Sales Manager')
    })
  })

  describe('isCrmUser', () => {
    it('is truthy for someone in the CRM list', () => {
      const store = seededStore()
      expect(store.isCrmUser('bob@example.com')).toBeTruthy()
    })

    it('is falsy for someone outside it', () => {
      const store = seededStore()
      expect(store.isCrmUser('carol@example.com')).toBeFalsy()
    })

    it('defaults to the session user', () => {
      const store = seededStore()
      expect(store.isCrmUser()).toBeTruthy()
    })

    it('is falsy before the list has been fetched', () => {
      // The resource starts as `initialData: []`, so `data.crmUsers` is
      // undefined and the `?.` carries it. Failing closed is right: an
      // unconfirmed user is not a CRM user.
      const store = usersStore()
      expect(store.isCrmUser('bob@example.com')).toBeFalsy()
    })
  })

  describe('exposed lists', () => {
    it('serves allUsers from the fast fetch until the full one lands', () => {
      const store = seededStore()
      expect(store.allUsers).toHaveLength(ALL_USERS.length)
    })

    it('prefers the full list once it arrives', () => {
      const store = seededStore()
      store.usersFull._seed([[{ name: 'dan@example.com', full_name: 'Dan' }]])
      expect(store.allUsers).toHaveLength(1)
      expect(store.allUsers[0].name).toBe('dan@example.com')
    })

    it('upgrades an existing record rather than replacing it', () => {
      // Regression: a partial record has no full_name, so normalizeUser
      // fabricates one from the identifier — and a plain spread then
      // overwrote "Bob Brown" with "bob@example.com". Names displaying as
      // email addresses is exactly what that looks like in the UI.
      const store = seededStore()
      store.usersFull._seed([
        [{ name: 'bob@example.com', role: 'System Manager' }],
      ])
      const bob = store.getUser('bob@example.com')
      expect(bob.role).toBe('System Manager')
      expect(bob.full_name).toBe('Bob Brown')
    })

    it('still accepts a genuinely updated name', () => {
      // The guard must not freeze the name — a real rename has to land.
      const store = seededStore()
      store.usersFull._seed([
        [{ name: 'bob@example.com', full_name: 'Robert Brown' }],
      ])
      expect(store.getUser('bob@example.com').full_name).toBe('Robert Brown')
    })

    it('exposes the CRM-only list', () => {
      const store = seededStore()
      expect(store.crmUsers.map((u) => u.name)).toEqual([
        'alice@example.com',
        'bob@example.com',
      ])
    })
  })

  describe('auth failures', () => {
    it('redirects to login on an AuthenticationError', () => {
      const store = usersStore()
      store.users.options.onError({ exc_type: 'AuthenticationError' })
      expect(nav.push).toHaveBeenCalledWith('/login')
    })

    it('ignores other errors', () => {
      const store = usersStore()
      store.users.options.onError({ exc_type: 'ValidationError' })
      store.users.options.onError(null)
      expect(nav.push).not.toHaveBeenCalled()
    })
  })

  // The fast list is small and arrives first; the full list follows on browser
  // idle. Scheduling it is latched, and the latch is the whole point — the fast
  // list's onSuccess runs on every refresh, not just the first.
  describe('the background full-user fetch', () => {
    afterEach(() => vi.unstubAllGlobals())

    it('is scheduled once the fast list lands', () => {
      const idle = vi.fn()
      vi.stubGlobal('requestIdleCallback', idle)
      seededStore()
      expect(idle).toHaveBeenCalledTimes(1)
    })

    it('is not scheduled again when the fast list refreshes', () => {
      // Without the latch, a list that reloads on every navigation queues
      // another full-user fetch each time.
      const idle = vi.fn()
      vi.stubGlobal('requestIdleCallback', idle)
      const store = seededStore()
      store.users._seed([structuredClone(ALL_USERS), structuredClone(CRM_USERS)])
      store.users._seed([structuredClone(ALL_USERS), structuredClone(CRM_USERS)])
      expect(idle).toHaveBeenCalledTimes(1)
    })

    it('fetches the full list when the idle slot arrives', () => {
      let fire
      vi.stubGlobal('requestIdleCallback', (fn) => {
        fire = fn
      })
      const store = seededStore()
      fire()
      expect(store.usersFull.fetch).toHaveBeenCalled()
    })

    it('gives the idle callback a deadline', () => {
      // Left open-ended, a busy tab never reaches idle and the full list never
      // loads at all.
      const idle = vi.fn()
      vi.stubGlobal('requestIdleCallback', idle)
      seededStore()
      expect(idle).toHaveBeenCalledWith(expect.any(Function), { timeout: 5000 })
    })

    it('falls back to a timer where idle callbacks do not exist', () => {
      vi.stubGlobal('requestIdleCallback', undefined)
      const timer = vi.spyOn(globalThis, 'setTimeout')
      seededStore()
      expect(timer).toHaveBeenCalledWith(expect.any(Function), 2000)
      timer.mockRestore()
    })
  })
})
