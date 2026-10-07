import ListPagination from '@/components/ListViews/ListPagination.vue'
import { DEFAULT_PAGE_LENGTH } from '@/composables/pageLength'
import { mountComponent } from '../helpers/mount'

/**
 * The pagination bar sits under every list in the app and does its own page
 * arithmetic from the resource's start / page_length_count / total_count.
 */
function mountBar({
  total = 100,
  pageSize = 10,
  start = 0,
  rowCount,
  loading = false,
} = {}) {
  return mountComponent(ListPagination, {
    props: {
      label: 'deals',
      list: {
        loading,
        data: {
          total_count: total,
          page_length_count: pageSize,
          start,
          row_count: rowCount ?? Math.min(pageSize, Math.max(0, total - start)),
        },
      },
    },
  })
}

/**
 * The rendered page list in document order. Ellipses are spans, not buttons,
 * so both selectors are needed to see the compact layout as a reader does.
 */
const pageButtons = (wrapper) =>
  wrapper.findAll('.pg-page, .pg-ellipsis').map((b) => b.text())

describe('ListPagination', () => {
  describe('the counts line', () => {
    it('reports the visible range and the total', () => {
      expect(mountBar({ total: 100, pageSize: 10, start: 0 }).text()).toContain(
        'Showing 1 to 10 of 100 deals',
      )
    })

    it('offsets the range on a later page', () => {
      expect(
        mountBar({ total: 100, pageSize: 10, start: 30 }).text(),
      ).toContain('Showing 31 to 40 of 100')
    })

    it('shows a short final page correctly', () => {
      expect(
        mountBar({ total: 95, pageSize: 10, start: 90, rowCount: 5 }).text(),
      ).toContain('Showing 91 to 95 of 95')
    })

    it('starts from 0, not 1, when there is nothing', () => {
      // "Showing 1 to 0 of 0" would be nonsense.
      expect(
        mountBar({ total: 0, pageSize: 10, start: 0, rowCount: 0 }).text(),
      ).toContain('Showing 0 to 0 of 0')
    })
  })

  describe('page list', () => {
    it('lists every page when there are few', () => {
      expect(pageButtons(mountBar({ total: 50, pageSize: 10 }))).toEqual([
        '1',
        '2',
        '3',
        '4',
        '5',
      ])
    })

    it('lists all seven without eliding', () => {
      expect(pageButtons(mountBar({ total: 70, pageSize: 10 }))).toHaveLength(7)
    })

    it('elides the tail when near the start', () => {
      // 1 2 … 20
      const labels = pageButtons(
        mountBar({ total: 200, pageSize: 10, start: 0 }),
      )
      expect(labels[0]).toBe('1')
      expect(labels).toContain('…')
      expect(labels[labels.length - 1]).toBe('20')
    })

    it('elides both sides in the middle', () => {
      // 1 … 9 10 11 … 20
      const labels = pageButtons(
        mountBar({ total: 200, pageSize: 10, start: 90 }),
      )
      expect(labels).toEqual(['1', '…', '9', '10', '11', '…', '20'])
    })

    it('elides the head when near the end', () => {
      const labels = pageButtons(
        mountBar({ total: 200, pageSize: 10, start: 190 }),
      )
      expect(labels[0]).toBe('1')
      expect(labels[labels.length - 1]).toBe('20')
      expect(labels).toContain('19')
    })

    it('marks the current page as active', () => {
      const wrapper = mountBar({ total: 100, pageSize: 10, start: 20 })
      expect(wrapper.find('.pg-page-active').text()).toBe('3')
    })
  })

  describe('the nav is hidden when there is nowhere to go', () => {
    // It used to render regardless: first/prev/next/last permanently disabled
    // plus a lone "1" that navigates to the page you are already on. Five dead
    // controls under every short list.
    const nav = (w) => w.findAll('.pg-nav .pg-btn')

    it('renders no page controls for a single page', () => {
      expect(nav(mountBar({ total: 4, pageSize: 20 }))).toHaveLength(0)
      expect(pageButtons(mountBar({ total: 4, pageSize: 20 }))).toEqual([])
    })

    it('renders none for an empty list either', () => {
      expect(nav(mountBar({ total: 0, pageSize: 10 }))).toHaveLength(0)
    })

    it('renders them as soon as a second page exists', () => {
      // The boundary: 11 rows at 10 per page.
      expect(nav(mountBar({ total: 11, pageSize: 10 })).length).toBeGreaterThan(
        0,
      )
      expect(pageButtons(mountBar({ total: 11, pageSize: 10 }))).toEqual([
        '1',
        '2',
      ])
    })

    it('keeps the range summary on a single page', () => {
      // The count still tells you something; the dead arrows did not.
      expect(mountBar({ total: 4, pageSize: 20 }).text()).toContain(
        'Showing 1 to 4 of 4 deals',
      )
    })

    it('keeps the page-size selector on a single page', () => {
      // Changing the size is still a meaningful action with one page of rows.
      expect(
        mountBar({ total: 4, pageSize: 20 }).find('.pg-select').exists(),
      ).toBe(true)
    })
  })

  describe('navigating', () => {
    it('emits the requested page', async () => {
      // 50/10 = 5 pages, so every page is listed and index maps to page number.
      const wrapper = mountBar({ total: 50, pageSize: 10, start: 0 })
      await wrapper.findAll('.pg-page')[2].trigger('click')
      expect(wrapper.emitted('pageChange')[0]).toEqual([3])
    })

    it('jumps to the last page from the elided tail', async () => {
      const wrapper = mountBar({ total: 100, pageSize: 10, start: 0 })
      const buttons = wrapper.findAll('.pg-page')
      await buttons[buttons.length - 1].trigger('click')
      expect(wrapper.emitted('pageChange')[0]).toEqual([10])
    })

    it('steps forward and back with the arrows', async () => {
      const wrapper = mountBar({ total: 100, pageSize: 10, start: 30 })
      const [first, prev] = wrapper.findAll('.pg-icon-btn')
      await prev.trigger('click')
      expect(wrapper.emitted('pageChange')[0]).toEqual([3])
      await first.trigger('click')
      expect(wrapper.emitted('pageChange')[1]).toEqual([1])
    })

    it('disables the back arrows on the first page', () => {
      const wrapper = mountBar({ total: 100, pageSize: 10, start: 0 })
      const [first, prev] = wrapper.findAll('.pg-icon-btn')
      expect(first.attributes('disabled')).toBeDefined()
      expect(prev.attributes('disabled')).toBeDefined()
    })

    it('disables the forward arrows on the last page', () => {
      const wrapper = mountBar({ total: 100, pageSize: 10, start: 90 })
      const icons = wrapper.findAll('.pg-icon-btn')
      expect(icons[2].attributes('disabled')).toBeDefined()
      expect(icons[3].attributes('disabled')).toBeDefined()
    })

    it('does not re-emit the page you are already on', async () => {
      const wrapper = mountBar({ total: 100, pageSize: 10, start: 0 })
      await wrapper.find('.pg-page-active').trigger('click')
      expect(wrapper.emitted('pageChange')).toBeUndefined()
    })

    it('ignores clicks while the list is loading', async () => {
      // Otherwise a double click queues two fetches for different pages.
      const wrapper = mountBar({
        total: 50,
        pageSize: 10,
        start: 0,
        loading: true,
      })
      await wrapper.findAll('.pg-page')[2].trigger('click')
      expect(wrapper.emitted('pageChange')).toBeUndefined()
    })
  })

  describe('page size', () => {
    it('offers the default sizes, including the default itself', () => {
      // 20 replaced 25: the select's value falls back to DEFAULT_PAGE_LENGTH,
      // and a native <select> whose value matches no <option> renders blank —
      // which is why the size control used to look empty on load.
      const wrapper = mountBar()
      const values = wrapper.findAll('option').map((o) => o.element.value)
      expect(values).toEqual(['10', '20', '50', '100'])
      expect(values).toContain(String(DEFAULT_PAGE_LENGTH))
    })

    it('emits the new size as a number', async () => {
      const wrapper = mountBar({ total: 100, pageSize: 10 })
      const select = wrapper.find('select')
      await select.setValue('50')
      expect(wrapper.emitted('pageSizeChange')[0]).toEqual([50])
    })

    it('does not emit when the size is unchanged', async () => {
      const wrapper = mountBar({ total: 100, pageSize: 10 })
      await wrapper.find('select').setValue('10')
      expect(wrapper.emitted('pageSizeChange')).toBeUndefined()
    })
  })

  // Notes renders this as a standalone rounded card; every list page renders it
  // attached to the bottom of the table. The prop default is what decides that
  // for the pages, none of which pass it.
  describe('which shape it takes', () => {
    it('is the table-attached bar unless asked otherwise', () => {
      const wrapper = mountComponent(ListPagination, {
        props: { list: {}, label: 'deals' },
      })
      expect(wrapper.find('.crm-list-pagination').classes()).not.toContain(
        'pg-card',
      )
    })

    it('is a standalone card when asked', () => {
      const wrapper = mountComponent(ListPagination, {
        props: { list: {}, label: 'notes', card: true },
      })
      expect(wrapper.find('.crm-list-pagination').classes()).toContain(
        'pg-card',
      )
    })
  })

  describe('resilience', () => {
    it('renders with an empty resource rather than throwing', () => {
      const wrapper = mountComponent(ListPagination, {
        props: { list: {}, label: 'deals' },
      })
      expect(wrapper.text()).toContain('Showing 0 to 0 of 0')
    })
  })
})
