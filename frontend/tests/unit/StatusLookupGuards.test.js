/**
 * `getDealStatus(name)` returns `dealStatusesByName[name]`, and that map is a
 * bare `reactive({})` filled in by the list resource's `transform`. Until the
 * fetch lands it is empty, so *every* lookup returns `undefined` — and a deal
 * whose status was renamed or removed in settings returns `undefined` forever.
 *
 * The deal *list* views already allowed for that with `?.`; the deal *detail*
 * views did not, so the same data rendered fine in one place and threw in the
 * other. See B118 in the report.
 */
vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { fakeResource } = await import('../helpers/pinia.js')
  return {
    ...actual,
    createResource: (o) => fakeResource(o),
    createListResource: (o) => fakeResource(o),
  }
})

vi.mock('frappe-ui/frappe', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useTelemetry: () => ({ capture: vi.fn() }) }
})

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { statusesStore } from '@/stores/statuses'
import { withPinia } from '../helpers/pinia'

const read = (rel) => readFileSync(resolve(process.cwd(), 'src', rel), 'utf8')

const DEAL_STATUSES = [
  { name: 'Qualification', color: 'blue', position: 1, type: 'Ongoing' },
  { name: 'Lost', color: 'red', position: 9, type: 'Lost' },
]

describe('looking a status up', () => {
  beforeEach(() => withPinia())

  it('finds one that exists', () => {
    const store = statusesStore()
    store.dealStatuses._seed(DEAL_STATUSES)
    expect(store.getDealStatus('Lost').type).toBe('Lost')
  })

  it('returns nothing for a status the list does not have', () => {
    // A status renamed or deleted in settings leaves existing deals pointing
    // at a name that no longer resolves.
    const store = statusesStore()
    store.dealStatuses._seed(DEAL_STATUSES)
    expect(store.getDealStatus('Archived')).toBeUndefined()
  })

  it('returns nothing before the list has been fetched', () => {
    // The map is filled in by `transform`, so it is empty until then — and
    // nothing makes the deal page wait for it.
    const store = statusesStore()
    expect(store.getDealStatus('Qualification')).toBeUndefined()
  })

  describe('with no name given', () => {
    it('falls back to the first status', () => {
      const store = statusesStore()
      store.dealStatuses._seed(DEAL_STATUSES)
      expect(store.getDealStatus().name).toBe('Qualification')
    })

    it('does not throw when the list is still empty', () => {
      // Regression: `dealStatuses.data[0].name` on the `initialData: []` value.
      const store = statusesStore()
      expect(() => store.getDealStatus()).not.toThrow()
      expect(store.getDealStatus()).toBeUndefined()
    })

    it('does the same for leads and communications', () => {
      const store = statusesStore()
      expect(() => store.getLeadStatus()).not.toThrow()
      expect(() => store.getCommunicationStatus()).not.toThrow()
    })
  })
})

describe('every caller allows for a status that does not resolve', () => {
  // Both the `.color` reads (in templates) and the `.type` comparisons.
  const HAZARD = /getDealStatus\([^)]*\)\.(color|type|name)/g

  const CALLERS = [
    'pages/Deal.vue',
    'pages/MobileDeal.vue',
    'pages/Deals.vue',
    'pages/Contact.vue',
    'pages/MobileContact.vue',
    'pages/Organization.vue',
    'pages/MobileOrganization.vue',
    'components/Modals/DealModal.vue',
    'components/Modals/ConvertToDealModal.vue',
  ]

  it('finds the call sites it is meant to be checking', () => {
    const total = CALLERS.reduce(
      (n, f) => n + (read(f).match(/getDealStatus\(/g) || []).length,
      0,
    )
    expect(total).toBeGreaterThanOrEqual(13)
  })

  it.each(CALLERS)('%s', (rel) => {
    const src = read(rel)
    const hazards = [...src.matchAll(HAZARD)].map(
      (m) => `${rel}:${src.slice(0, m.index).split('\n').length} — ${m[0]}`,
    )
    expect(hazards).toEqual([])
  })
})

describe('the Lost-reason prompt', () => {
  // `setLostReason` decides between saving straight away and asking for a
  // reason. Every branch turns on `getDealStatus(...)?.type`, so an
  // unresolvable status has to fall the safe way: save, do not block the user
  // behind a modal about a status the app cannot classify.
  it('treats an unresolvable status as not-Lost', () => {
    withPinia()
    const store = statusesStore()
    expect(store.getDealStatus('Archived')?.type !== 'Lost').toBe(true)
    expect(store.getDealStatus('Archived')?.type === 'Lost').toBe(false)
  })
})
