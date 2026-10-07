// The views resource fetches on creation (`auto: true`); only createResource
// is swapped so the rest of frappe-ui stays real.
vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { fakeResource } = await import('../helpers/pinia.js')
  return { ...actual, createResource: (options) => fakeResource(options) }
})

import { viewsStore } from '@/stores/views'
import { withPinia } from '../helpers/pinia'

const VIEWS = [
  { name: 'v-all', label: 'All Deals', type: 'list' },
  { name: 'v-pinned', label: 'My Pipeline', type: 'list', pinned: 1 },
  { name: 'v-public', label: 'Team Board', type: 'kanban', public: 1 },
  { name: 'v-default', label: 'Default', type: 'list', is_default: 1 },
  {
    name: 'v-standard',
    label: 'Standard List',
    type: 'list',
    is_standard: 1,
    dt: 'CRM Deal',
  },
]

function seededStore(rows = VIEWS) {
  const store = viewsStore()
  store.views._seed(structuredClone(rows))
  return store
}

describe('views store', () => {
  beforeEach(() => {
    withPinia()
  })

  describe('transform', () => {
    it('defaults a view with no type to list', () => {
      const store = seededStore([{ name: 'v-x', label: 'X' }])
      expect(store.getView('v-x').type).toBe('list')
    })

    it('keeps an explicit type', () => {
      const store = seededStore()
      expect(store.getView('v-public').type).toBe('kanban')
    })

    it('collects pinned and public views separately', () => {
      const store = seededStore()
      expect(store.getPinnedViews().map((v) => v.name)).toEqual(['v-pinned'])
      expect(store.getPublicViews().map((v) => v.name)).toEqual(['v-public'])
    })

    it('records the default view', () => {
      const store = seededStore()
      expect(store.getDefaultView().name).toBe('v-default')
    })

    it('indexes standard views by doctype and type', () => {
      const store = seededStore()
      expect(store.standardViews['CRM Deal list'].name).toBe('v-standard')
    })

    it('ignores a standard view with no doctype', () => {
      const store = seededStore([{ name: 'v-y', is_standard: 1, type: 'list' }])
      expect(Object.keys(store.standardViews)).toHaveLength(0)
    })

    it('resets the collections on refetch rather than appending', () => {
      // A reload must not double up the pinned list.
      const store = seededStore()
      store.views._seed(structuredClone(VIEWS))
      expect(store.getPinnedViews()).toHaveLength(1)
      expect(store.getPublicViews()).toHaveLength(1)
    })

    it('clears the default view when a refetch has none', () => {
      const store = seededStore()
      expect(store.getDefaultView()).not.toBeNull()
      store.views._seed([{ name: 'v-all', type: 'list' }])
      expect(store.getDefaultView()).toBeNull()
    })

    it('returns the rows so the resource stays populated', () => {
      const store = seededStore()
      expect(store.views.data).toHaveLength(VIEWS.length)
    })
  })

  describe('getView', () => {
    it('finds a view by name', () => {
      const store = seededStore()
      expect(store.getView('v-pinned').label).toBe('My Pipeline')
    })

    it('falls back to the standard view for a doctype when no name is given', () => {
      const store = seededStore()
      expect(store.getView(null, 'list', 'CRM Deal').name).toBe('v-standard')
    })

    it('defaults the type to list when resolving a standard view', () => {
      const store = seededStore()
      expect(store.getView(null, null, 'CRM Deal').name).toBe('v-standard')
    })

    it('returns null when no standard view matches the doctype', () => {
      const store = seededStore()
      expect(store.getView(null, 'list', 'CRM Lead')).toBeNull()
    })

    it('returns null when the type has no standard view', () => {
      const store = seededStore()
      expect(store.getView(null, 'kanban', 'CRM Deal')).toBeNull()
    })

    it('returns undefined for an unknown view name', () => {
      const store = seededStore()
      expect(store.getView('nope')).toBeUndefined()
    })

    it('returns undefined when given neither a name nor a doctype', () => {
      const store = seededStore()
      expect(store.getView(null, 'list')).toBeUndefined()
    })
  })

  describe('empty state', () => {
    it('returns empty arrays when nothing is pinned or public', () => {
      const store = seededStore([{ name: 'v-all', type: 'list' }])
      expect(store.getPinnedViews()).toEqual([])
      expect(store.getPublicViews()).toEqual([])
    })

    it('survives an empty payload', () => {
      const store = seededStore([])
      expect(store.getDefaultView()).toBeNull()
      expect(store.getPinnedViews()).toEqual([])
    })
  })

  describe('reload', () => {
    it('delegates to the resource', async () => {
      const store = seededStore()
      await store.reload()
      expect(store.views.reload).toHaveBeenCalled()
    })
  })
})
