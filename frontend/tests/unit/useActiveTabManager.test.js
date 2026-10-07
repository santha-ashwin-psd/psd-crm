// vue-router is mocked through a hoisted holder so each test can install a
// fresh reactive route; the composable calls useRoute() at invocation time,
// which is after beforeEach has swapped it in.
const h = vi.hoisted(() => ({ route: null, router: null }))

vi.mock('vue-router', () => ({
  useRoute: () => h.route,
  useRouter: () => h.router,
}))

import { useActiveTabManager } from '@/composables/useActiveTabManager'
import { ref, reactive, nextTick } from 'vue'

const TABS = [
  { name: 'Activity' },
  { name: 'Emails' },
  { name: 'Comments' },
  { name: 'Data' },
]

const STORAGE_KEY = 'test-active-tab'

function setup({ hash = '', tabs = TABS } = {}) {
  h.route = reactive({ hash })
  h.router = {
    push: vi.fn((to) => {
      h.route.hash = to.hash
    }),
  }
  const tabsRef = ref(tabs)
  return { ...useActiveTabManager(tabsRef, STORAGE_KEY), tabsRef }
}

describe('useActiveTabManager', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('choosing the initial tab', () => {
    it('uses the tab named in the url hash', () => {
      const { tabIndex } = setup({ hash: '#emails' })
      expect(tabIndex.value).toBe(1)
    })

    it('matches the hash case-insensitively', () => {
      // Tab names are title case ("Emails"); hashes are lower case.
      const { tabIndex } = setup({ hash: '#comments' })
      expect(tabIndex.value).toBe(2)
    })

    it('falls back to the first tab for an unknown hash', () => {
      const { tabIndex } = setup({ hash: '#nosuchtab' })
      expect(tabIndex.value).toBe(0)
    })

    it('uses the last visited tab from storage when there is no hash', () => {
      localStorage.setItem(STORAGE_KEY, 'data')
      const { tabIndex } = setup()
      expect(tabIndex.value).toBe(3)
    })

    it('prefers the hash over the stored tab', () => {
      localStorage.setItem(STORAGE_KEY, 'data')
      const { tabIndex } = setup({ hash: '#emails' })
      expect(tabIndex.value).toBe(1)
    })

    it('falls back to the first tab when the stored tab no longer exists', () => {
      localStorage.setItem(STORAGE_KEY, 'whatsapp')
      const { tabIndex } = setup()
      expect(tabIndex.value).toBe(0)
    })

    it('defaults to the first tab with neither hash nor storage', () => {
      // useStorage seeds 'activity', which happens to be the first tab.
      const { tabIndex } = setup()
      expect(tabIndex.value).toBe(0)
    })
  })

  describe('changeTabTo', () => {
    it('moves to the named tab', () => {
      const { tabIndex, changeTabTo } = setup()
      changeTabTo('data')
      expect(tabIndex.value).toBe(3)
    })

    it('ignores an unknown tab name', () => {
      const { tabIndex, changeTabTo } = setup({ hash: '#emails' })
      changeTabTo('nosuchtab')
      expect(tabIndex.value).toBe(1)
    })
  })

  describe('syncing with the url', () => {
    it('pushes the hash when the tab index changes', async () => {
      const { tabIndex } = setup({ hash: '#activity' })
      tabIndex.value = 2
      await nextTick()
      expect(h.router.push).toHaveBeenCalledWith(
        expect.objectContaining({ hash: '#comments' }),
      )
    })

    it('does not push when the hash already matches', async () => {
      const { tabIndex } = setup({ hash: '#activity' })
      tabIndex.value = 0
      await nextTick()
      expect(h.router.push).not.toHaveBeenCalled()
    })

    it('follows a hash change made elsewhere, such as the back button', async () => {
      const { tabIndex } = setup({ hash: '#activity' })
      h.route.hash = '#data'
      await nextTick()
      expect(tabIndex.value).toBe(3)
    })

    it('lands on the first tab when the url hash is unknown', async () => {
      const { tabIndex } = setup({ hash: '#emails' })
      h.route.hash = '#nosuchtab'
      await nextTick()
      expect(tabIndex.value).toBe(0)
    })

    it('ignores an emptied hash rather than resetting the tab', async () => {
      const { tabIndex } = setup({ hash: '#data' })
      h.route.hash = ''
      await nextTick()
      expect(tabIndex.value).toBe(3)
    })
  })

  describe('remembering the last visited tab', () => {
    it('writes the tab to storage, debounced', async () => {
      const { tabIndex } = setup({ hash: '#activity' })
      tabIndex.value = 1
      await nextTick()
      // The write is debounced by 300ms, so nothing lands immediately.
      vi.advanceTimersByTime(400)
      await nextTick()
      expect(localStorage.getItem(STORAGE_KEY)).toContain('emails')
    })
  })

  describe('when the tab list changes', () => {
    it('recomputes the active tab', async () => {
      const { tabIndex, tabsRef } = setup({ hash: '#data' })
      expect(tabIndex.value).toBe(3)
      // Drop the Data tab; the hash no longer resolves, so it falls to 0.
      tabsRef.value = [{ name: 'Activity' }, { name: 'Emails' }]
      await nextTick()
      expect(tabIndex.value).toBe(0)
    })
  })
})
