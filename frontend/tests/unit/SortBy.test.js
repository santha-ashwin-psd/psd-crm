const resources = vi.hoisted(() => ({ options: [] }))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  return {
    ...actual,
    createResource: (options) =>
      reactive({
        ...options,
        get data() {
          return resources.options
        },
        fetch: vi.fn(),
        reload: vi.fn(),
      }),
  }
})

// useSortable reaches for a real DOM node by id and installs Sortable on it;
// the component only ever calls stop()/start() on the handle it gets back.
vi.mock('@vueuse/integrations/useSortable', () => ({
  useSortable: () => ({ start: vi.fn(), stop: vi.fn() }),
}))

import SortBy from '@/components/SortBy.vue'
import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'

const OPTIONS = [
  { fieldname: 'modified', label: 'Last Modified' },
  { fieldname: 'creation', label: 'Created On' },
  { fieldname: 'lead_name', label: 'Name' },
  { fieldname: 'status', label: 'Status' },
]

const mountSort = (orderBy = '') =>
  mountComponent(SortBy, {
    props: {
      doctype: 'CRM Lead',
      modelValue: {
        data: { params: { order_by: orderBy } },
        params: { order_by: orderBy },
      },
    },
    global: {
      stubs: {
        Popover: { template: '<div><slot name="target" :togglePopover="() => {}" /></div>' },
        Autocomplete: true,
        Draggable: true,
      },
    },
  })

describe('SortBy', () => {
  beforeEach(() => {
    resources.options = OPTIONS
  })

  describe('reading the current sort off the list', () => {
    it('parses a single sort into a field and direction', () => {
      const wrapper = mountSort('creation desc')
      expect(Array.from(wrapper.vm.sortValues)).toEqual([
        { fieldname: 'creation', direction: 'desc' },
      ])
    })

    it('parses several sorts in order', () => {
      // Order is the sort precedence, so it has to survive the round trip.
      const wrapper = mountSort('status asc, creation desc')
      expect(Array.from(wrapper.vm.sortValues)).toEqual([
        { fieldname: 'status', direction: 'asc' },
        { fieldname: 'creation', direction: 'desc' },
      ])
    })

    it('treats the default sort as no sort at all', () => {
      // `modified desc` is what the backend applies when nothing is chosen —
      // showing it as a user sort would imply the user picked it.
      expect(mountSort('modified desc').vm.sortValues.size).toBe(0)
      expect(mountSort('  modified desc  ').vm.sortValues.size).toBe(0)
    })

    it('is empty when the list has no sort', () => {
      expect(mountSort('').vm.sortValues.size).toBe(0)
    })

    it('is empty until the options arrive', () => {
      resources.options = null
      expect(mountSort('creation desc').vm.sortValues.size).toBe(0)
    })
  })

  describe('the field picker', () => {
    it('offers everything when nothing is sorted', () => {
      expect(mountSort().vm.options).toHaveLength(OPTIONS.length)
    })

    it('drops fields already sorted on', () => {
      const wrapper = mountSort('status asc')
      expect(wrapper.vm.options.map((o) => o.fieldname)).not.toContain('status')
    })

    it('offers nothing once every field is used', () => {
      const all = OPTIONS.map((o) => `${o.fieldname} asc`).join(', ')
      expect(mountSort(all).vm.options).toHaveLength(0)
    })
  })

  describe('the button label', () => {
    it('reads Sort when nothing is applied', () => {
      expect(mountSort().vm.getSortLabel()).toBe('Sort')
    })

    it('shows the first sort field by its human label', () => {
      expect(mountSort('creation desc').vm.getSortLabel()).toBe('Created On')
    })

    it('names the first field when several are sorted', () => {
      expect(mountSort('status asc, creation desc').vm.getSortLabel()).toBe(
        'Status',
      )
    })

    it('falls back to the fieldname when the option is unknown', () => {
      // A saved view can reference a field that is no longer sortable.
      expect(mountSort('gone_field asc').vm.getSortLabel()).toBe('gone_field')
    })
  })

  describe('building the order_by string', () => {
    const convert = (wrapper, rows) => wrapper.vm.convertToString(new Set(rows))

    it('joins field and direction', () => {
      expect(
        convert(mountSort(), [{ fieldname: 'creation', direction: 'desc' }]),
      ).toBe('creation desc')
    })

    it('comma-separates several and leaves no trailing comma', () => {
      expect(
        convert(mountSort(), [
          { fieldname: 'status', direction: 'asc' },
          { fieldname: 'creation', direction: 'desc' },
        ]),
      ).toBe('status asc, creation desc')
    })

    it('produces an empty string for no sorts', () => {
      expect(convert(mountSort(), [])).toBe('')
    })
  })

  describe('editing sorts', () => {
    it('adds a field ascending by default', async () => {
      const wrapper = mountSort()
      wrapper.vm.setSort(OPTIONS[1])
      await nextTick()
      expect(wrapper.emitted('update').at(-1)[0]).toBe('creation asc')
    })

    it('ignores an empty pick', async () => {
      const wrapper = mountSort()
      wrapper.vm.setSort(null)
      await nextTick()
      expect(wrapper.emitted('update')).toBeUndefined()
    })

    it('keeps the direction when the field is swapped', async () => {
      // Changing which field you sort by should not silently flip asc/desc.
      const wrapper = mountSort('status desc')
      wrapper.vm.updateSort(OPTIONS[1], 0)
      await nextTick()
      expect(wrapper.emitted('update').at(-1)[0]).toBe('creation desc')
    })

    it('removes one sort and keeps the rest', async () => {
      const wrapper = mountSort('status asc, creation desc')
      wrapper.vm.removeSort(0)
      await nextTick()
      expect(wrapper.emitted('update').at(-1)[0]).toBe('creation desc')
    })

    it('clears everything and closes the popover', async () => {
      const close = vi.fn()
      const wrapper = mountSort('status asc, creation desc')
      wrapper.vm.clearSort(close)
      await nextTick()
      expect(wrapper.emitted('update').at(-1)[0]).toBe('')
      expect(close).toHaveBeenCalled()
    })
  })
})
