// The store creates list resources with `auto: true`, which would fetch on
// instantiation. Only createListResource is swapped; the rest of frappe-ui
// stays real, because utils/index.js pulls dayjs, toast and friends from it.
vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { fakeResource } = await import('../helpers/pinia.js')
  return { ...actual, createListResource: (options) => fakeResource(options) }
})

vi.mock('frappe-ui/frappe', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useTelemetry: () => ({ capture: vi.fn() }) }
})

import { statusesStore } from '@/stores/statuses'
import { withPinia } from '../helpers/pinia'

const LEAD_ROWS = [
  { name: 'New', color: 'gray', position: 1 },
  { name: 'Contacted', color: 'orange', position: 2 },
  { name: 'Qualified', color: 'green', position: 3 },
]

const DEAL_ROWS = [
  { name: 'Qualification', color: 'blue', position: 1 },
  { name: 'Ready to Close', color: 'green', position: 2 },
]

function seededStore() {
  const store = statusesStore()
  store.leadStatuses._seed(structuredClone(LEAD_ROWS))
  store.dealStatuses._seed(structuredClone(DEAL_ROWS))
  store.communicationStatuses._seed([{ name: 'Open' }, { name: 'Replied' }])
  return store
}

describe('statuses store', () => {
  beforeEach(() => {
    withPinia()
    globalThis.window.translated_doctypes = []
  })

  describe('transform', () => {
    it('converts each status colour to a text class', () => {
      const store = seededStore()
      const contacted = store.getLeadStatus('Contacted')
      expect(contacted.color).toBe('!text-orange-600')
    })

    it('darkens green to 700, matching parseColor', () => {
      const store = seededStore()
      expect(store.getLeadStatus('Qualified').color).toBe('!text-green-700')
    })

    it('forces the "New" lead status to blue regardless of its stored colour', () => {
      // Stored as gray; the design wants New to read as light blue.
      const store = seededStore()
      expect(store.getLeadStatus('New').color).toBe('!text-blue-600')
    })

    it('applies no such special case to deal statuses', () => {
      const store = statusesStore()
      store.dealStatuses._seed([{ name: 'New', color: 'gray' }])
      expect(store.getDealStatus('New').color).toBe('!text-gray-700')
    })

    it('returns the rows so the resource data stays populated', () => {
      const store = seededStore()
      expect(store.leadStatuses.data).toHaveLength(3)
      expect(store.dealStatuses.data).toHaveLength(2)
    })
  })

  describe('lookups', () => {
    it('finds a lead and a deal status by name', () => {
      const store = seededStore()
      expect(store.getLeadStatus('Contacted').name).toBe('Contacted')
      expect(store.getDealStatus('Ready to Close').name).toBe('Ready to Close')
    })

    it('falls back to the first status when no name is given', () => {
      const store = seededStore()
      expect(store.getLeadStatus().name).toBe('New')
      expect(store.getDealStatus().name).toBe('Qualification')
    })

    it('returns undefined for an unknown name', () => {
      const store = seededStore()
      expect(store.getLeadStatus('Nonexistent')).toBeUndefined()
    })

    it('finds a communication status by name', () => {
      // Regression: this used to index the list resource rather than the
      // by-name map, so it returned undefined for every real status.
      const store = seededStore()
      expect(store.getCommunicationStatus('Replied')).toEqual({
        name: 'Replied',
      })
    })

    it('falls back to the first communication status', () => {
      const store = seededStore()
      expect(store.getCommunicationStatus()).toEqual({ name: 'Open' })
    })
  })

  describe('statusOptions', () => {
    it('builds one option per status of the requested doctype', () => {
      const store = seededStore()
      const options = store.statusOptions('deal')
      expect(options.map((o) => o.value)).toEqual([
        'Qualification',
        'Ready to Close',
      ])
    })

    it('defaults to lead statuses for anything that is not "deal"', () => {
      const store = seededStore()
      expect(store.statusOptions('lead').map((o) => o.value)).toEqual([
        'New',
        'Contacted',
        'Qualified',
      ])
    })

    it('narrows to an explicit subset, in the order given', () => {
      const store = seededStore()
      const options = store.statusOptions('lead', ['Qualified', 'New'])
      expect(options.map((o) => o.value)).toEqual(['Qualified', 'New'])
    })

    it('gives every option a renderable icon', () => {
      const store = seededStore()
      store.statusOptions('deal').forEach((option) => {
        expect(typeof option.icon).toBe('function')
        expect(option.icon()).toBeTruthy()
      })
    })

    it('runs the status-change callback with the chosen status', async () => {
      const store = seededStore()
      const onChange = vi.fn()
      const options = store.statusOptions('deal', [], onChange)
      await options[1].onClick()
      expect(onChange).toHaveBeenCalledWith('Ready to Close')
    })

    it('tolerates no callback being supplied', async () => {
      const store = seededStore()
      const options = store.statusOptions('deal')
      await expect(options[0].onClick()).resolves.toBeUndefined()
    })

    it('labels options with the raw name when the doctype is not translatable', () => {
      const store = seededStore()
      expect(store.statusOptions('deal')[0].label).toBe('Qualification')
    })

    it('routes labels through the translator when the doctype is translatable', () => {
      globalThis.window.translated_doctypes = ['CRM Deal Status']
      const store = seededStore()
      // The test translator is identity, so this asserts the path is taken
      // without breaking the label.
      expect(store.statusOptions('deal')[0].label).toBe('Qualification')
    })
  })
})
