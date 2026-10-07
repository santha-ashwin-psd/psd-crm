const api = vi.hoisted(() => ({
  route: null,
  push: null,
  views: {},
  standardViews: {},
  defaultView: null,
  reloadView: null,
  isManager: true,
  isMobileView: null,
  call: null,
  dialog: null,
  fields: [],
  resources: [],
  toast: null,
}))

vi.mock('vue-router', () => ({
  useRoute: () => api.route,
  useRouter: () => ({ push: api.push }),
}))

vi.mock('@/stores/views', () => ({
  viewsStore: () => ({
    reload: api.reloadView,
    getDefaultView: () => api.defaultView,
    getView: (view, type, doctype) => {
      if (!view && doctype) return api.standardViews[`${doctype} ${type || 'list'}`] || null
      return api.views[view] || null
    },
  }),
}))

vi.mock('@/stores/users', () => ({
  usersStore: () => ({ isManager: () => api.isManager }),
}))

vi.mock('@/stores/organizations', () => ({
  organizationsStore: () => ({ organizations: { reload: vi.fn() } }),
}))

vi.mock('@/stores/settings', () => ({
  getSettings: () => ({ brand: { favicon: '' } }),
}))

vi.mock('@/stores/global', () => ({
  globalStore: () => ({
    $dialog: (...a) => api.dialog(...a),
    $socket: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
  }),
}))

vi.mock('@/stores/meta', () => ({
  getMeta: () => ({ getFields: () => api.fields }),
}))

vi.mock('@/composables/settings', async () => {
  const { ref } = await import('vue')
  api.isMobileView = ref(false)
  return {
    isMobileView: api.isMobileView,
    showSettings: ref(false),
    activeSettingsPage: ref(''),
    disableSettingModalOutsideClick: ref(false),
  }
})

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  api.toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() }
  const make = (opts = {}) => {
    const r = reactive({
      ...opts,
      data: opts.initialData ?? null,
      // Faithful to frappe-ui: a resource is constructed with `params: null`
      // and only `options.params` is sent with the request — `out.params` is
      // not written until a fetch supplies them (resources.js:46,63,67). The
      // fake used to inherit `params` from opts, which hid the bug where every
      // filter handler dereferenced a null `list.params` on first load.
      params: null,
      loading: false,
      fetch: vi.fn(),
      reload: vi.fn(),
      update: vi.fn((o) => Object.assign(r, o)),
      submit: vi.fn(),
    })
    api.resources.push(r)
    return r
  }
  return {
    ...actual,
    toast: api.toast,
    call: (...a) => api.call(...a),
    createResource: make,
    createListResource: make,
    createDocumentResource: make,
    usePageMeta: () => {},
  }
})

import ViewControls from '@/components/ViewControls.vue'
import { mountComponent } from '../helpers/mount'
import { nextTick, reactive } from 'vue'
import { flushPromises } from '@vue/test-utils'

const quiet = { inheritAttrs: false, template: '<div><slot /></div>' }
const STUBS = {
  Filter: { ...quiet, name: 'FilterStub' },
  SortBy: { ...quiet, name: 'SortByStub' },
  GroupBy: { ...quiet, name: 'GroupByStub' },
  ColumnSettings: { ...quiet, name: 'ColumnSettingsStub' },
  KanbanSettings: { ...quiet, name: 'KanbanSettingsStub' },
  QuickFilterField: {
    name: 'QuickFilterFieldStub',
    inheritAttrs: false,
    props: ['filter'],
    template: '<div />',
  },
  Dropdown: { ...quiet, name: 'DropdownStub' },
  Autocomplete: { ...quiet, name: 'AutocompleteStub' },
  Draggable: { ...quiet, name: 'DraggableStub' },
  FadedScrollableDiv: { ...quiet, name: 'FadedScrollableDivStub' },
  Tooltip: { ...quiet, name: 'TooltipStub' },
  ViewModal: { ...quiet, name: 'ViewModalStub' },
  // Renders its body only while open, as the real Dialog does — a stub that
  // always renders it would exercise the export form before any data exists.
  Dialog: {
    name: 'DialogStub',
    inheritAttrs: false,
    props: ['modelValue', 'open'],
    template: '<div v-if="open || modelValue"><slot /></div>',
  },
  FormControl: { ...quiet, name: 'FormControlStub' },
  Switch: { ...quiet, name: 'SwitchStub' },
}

// The list resource the component builds for itself is the first one created
// at setup time; every assertion about params/reload goes through it.
const listOf = (wrapper) => wrapper.vm.list

describe('ViewControls', () => {
  const mount = (props = {}) =>
    mountComponent(ViewControls, {
      props: { doctype: 'CRM Deal', options: { allowedViews: ['list'] }, ...props },
      global: { stubs: STUBS },
    })

  describe('the list resource params', () => {
    // frappe-ui never writes the initial params back onto the resource, so
    // `list.params` stayed null after the first load and every handler that
    // spread `list.params.filters` threw into Vue's error handler — the quick
    // filters, sort, export and the kanban "+" all silently did nothing until
    // setPageSize() (the one handler with a `|| getParams()` guard) seeded it.
    // ViewControls seeds them itself now.
    it('are populated as soon as the component mounts', () => {
      const wrapper = mount()
      expect(listOf(wrapper).params).toBeTruthy()
      expect(listOf(wrapper).params).toHaveProperty('doctype', 'CRM Deal')
      expect(listOf(wrapper).params).toHaveProperty('filters')
    })

    it('let a quick filter apply on first load, with no page-size change first', async () => {
      const wrapper = mount()
      expect(() =>
        wrapper.vm.applyQuickFilter(
          { fieldname: 'status', fieldtype: 'Select' },
          'Open',
        ),
      ).not.toThrow()
      await nextTick()
      expect(listOf(wrapper).params.filters).toMatchObject({ status: 'Open' })
    })
  })

  beforeEach(() => {
    api.resources = []
    api.route = reactive({ name: 'Deals', params: { viewType: 'list' }, query: {} })
    api.push = vi.fn()
    api.views = {}
    api.standardViews = {}
    api.defaultView = null
    api.reloadView = vi.fn()
    api.isManager = true
    api.isMobileView.value = false
    api.call = vi.fn(async () => ({}))
    api.dialog = vi.fn()
    api.fields = [
      { label: 'Status', fieldname: 'status', fieldtype: 'Select' },
      { label: 'Owner', fieldname: 'deal_owner', fieldtype: 'Link' },
    ]
  })

  const withData = (wrapper, data) => {
    listOf(wrapper).data = {
      page_length: 20,
      page_length_count: 20,
      total_count: 0,
      row_count: 0,
      columns: [],
      rows: [],
      views: [],
      ...data,
    }
    return wrapper
  }

  describe('the request it builds', () => {
    it('asks for the doctype', () => {
      expect(mount().vm.getParams().doctype).toBe('CRM Deal')
    })

    it('defaults to the list view sorted by last modified', () => {
      const params = mount().vm.getParams()
      expect(params.view.view_type).toBe('list')
      expect(params.order_by).toBe('modified desc')
      expect(params.filters).toEqual({})
    })

    it("carries the page's own baked-in filters separately", () => {
      // A page like "My Deals" passes fixed filters that the user cannot clear.
      const params = mount({ filters: { deal_owner: 'me' } }).vm.getParams()
      expect(params.default_filters).toEqual({ deal_owner: 'me' })
      expect(params.filters).toEqual({})
    })

    it('takes the settings of the view in the url', () => {
      api.views[12] = {
        name: 12,
        label: 'Hot deals',
        type: 'list',
        filters: '{"status":"Open"}',
        order_by: 'creation asc',
        columns: '[{"key":"status"}]',
      }
      api.route.query.view = 12
      const params = mount().vm.getParams()
      expect(params.filters).toEqual({ status: 'Open' })
      expect(params.order_by).toBe('creation asc')
      expect(params.view.custom_view_name).toBe(12)
    })

    it('falls back to the standard view for the type', () => {
      api.standardViews['CRM Deal kanban'] = {
        name: 3,
        type: 'kanban',
        column_field: 'stage',
      }
      api.route.params.viewType = 'kanban'
      expect(mount().vm.getParams().column_field).toBe('stage')
    })

    it('groups by owner unless told otherwise', () => {
      expect(mount().vm.getParams().view.group_by_field).toBe('owner')
    })

    describe('whether the view uses the default columns', () => {
      it('is off for a view that has its own columns', () => {
        // Regression: this read a field that does not exist and then OR'd
        // with `true`, so it was always on. `view` is what the save calls
        // send, so changing a filter or a sort wrote it back as 1 and the
        // server served the doctype defaults — the custom columns were gone.
        api.views[12] = {
          name: 12,
          load_default_columns: 0,
          columns: '[{"key":"status"}]',
        }
        api.route.query.view = 12
        const wrapper = mount()
        wrapper.vm.getParams()
        expect(wrapper.vm.view.load_default_columns).toBe(false)
      })

      it('is on for a view that asked for them', () => {
        api.views[12] = { name: 12, load_default_columns: 1 }
        api.route.query.view = 12
        const wrapper = mount()
        wrapper.vm.getParams()
        expect(wrapper.vm.view.load_default_columns).toBe(1)
      })

      it('is off when there is no saved view yet', () => {
        const wrapper = mount()
        wrapper.vm.getParams()
        expect(wrapper.vm.view.load_default_columns).toBe(false)
      })

      it('survives a reload after the columns were customised', () => {
        const wrapper = mount()
        wrapper.vm.updateColumns({ columns: [{ key: 'status' }], rows: [], isDefault: false })
        expect(wrapper.vm.view.load_default_columns).toBe(false)
        wrapper.vm.getParams()
        expect(wrapper.vm.view.load_default_columns).toBe(false)
      })
    })
  })

  describe('pagination', () => {
    const paged = (over = {}) => {
      const wrapper = mount()
      withData(wrapper, { total_count: 95, row_count: 20, ...over })
      return wrapper
    }

    it('starts on the first page', () => {
      expect(paged().vm.paginationInfo.currentPage).toBe(1)
    })

    it('counts the pages from the total', () => {
      expect(paged().vm.paginationInfo.totalPages).toBe(5)
    })

    it('always reports at least one page', () => {
      // An empty list still renders a pager; zero pages reads as broken.
      expect(paged({ total_count: 0, row_count: 0 }).vm.paginationInfo.totalPages).toBe(1)
    })

    it('says which rows are on screen', () => {
      const info = paged().vm.paginationInfo
      expect(info.from).toBe(1)
      expect(info.to).toBe(20)
    })

    it('says nothing is on screen when there is nothing', () => {
      expect(paged({ total_count: 0, row_count: 0 }).vm.paginationInfo.from).toBe(0)
    })

    it('reports the last partial page honestly', () => {
      const wrapper = paged()
      wrapper.vm.goToPage(5)
      listOf(wrapper).data.row_count = 15
      const info = wrapper.vm.paginationInfo
      expect(info.from).toBe(81)
      expect(info.to).toBe(95)
    })

    it('jumps to a page', () => {
      const wrapper = paged()
      wrapper.vm.goToPage(3)
      expect(listOf(wrapper).params.start).toBe(40)
      expect(wrapper.vm.paginationInfo.currentPage).toBe(3)
      expect(listOf(wrapper).reload).toHaveBeenCalled()
    })

    it('will not go before the first page', () => {
      const wrapper = paged()
      wrapper.vm.goToPage(0)
      expect(listOf(wrapper).params.start).toBe(0)
    })

    it('will not go past the last page', () => {
      const wrapper = paged()
      wrapper.vm.goToPage(99)
      expect(wrapper.vm.paginationInfo.currentPage).toBe(5)
    })

    it('ignores a page change while a request is in flight', () => {
      // Two overlapping requests can come back out of order and show the
      // wrong page's rows.
      const wrapper = paged()
      listOf(wrapper).loading = true
      wrapper.vm.goToPage(3)
      expect(listOf(wrapper).reload).not.toHaveBeenCalled()
    })

    it('changes the page size and starts again from the top', () => {
      const wrapper = paged()
      wrapper.vm.goToPage(3)
      listOf(wrapper).reload.mockClear()
      wrapper.vm.setPageSize(50)
      expect(listOf(wrapper).params.start).toBe(0)
      expect(listOf(wrapper).params.page_length).toBe(50)
      expect(listOf(wrapper).params.page_length_count).toBe(50)
      expect(listOf(wrapper).reload).toHaveBeenCalled()
    })

    it('ignores a size change while a request is in flight', () => {
      const wrapper = paged()
      listOf(wrapper).loading = true
      wrapper.vm.setPageSize(50)
      expect(listOf(wrapper).reload).not.toHaveBeenCalled()
    })

    it('goes back to the first page when the filters change', () => {
      // Page 4 of the old result set is meaningless against the new one.
      const wrapper = paged()
      wrapper.vm.goToPage(4)
      wrapper.vm.updateFilter({ status: 'Open' })
      expect(wrapper.vm.paginationInfo.currentPage).toBe(1)
      expect(listOf(wrapper).params.start).toBe(0)
    })

    it('goes back to the first page when the sort changes', () => {
      const wrapper = paged()
      wrapper.vm.goToPage(4)
      wrapper.vm.updateSort('creation asc')
      expect(wrapper.vm.paginationInfo.currentPage).toBe(1)
    })

    it('goes back to the first page on a manual refresh', () => {
      const wrapper = paged()
      wrapper.vm.goToPage(4)
      wrapper.vm.reload()
      expect(wrapper.vm.paginationInfo.currentPage).toBe(1)
    })
  })

  describe('filters', () => {
    it('applies them and reloads', () => {
      const wrapper = withData(mount(), {})
      wrapper.vm.updateFilter({ status: 'Open' })
      expect(listOf(wrapper).params.filters).toEqual({ status: 'Open' })
      expect(listOf(wrapper).reload).toHaveBeenCalled()
    })

    it('marks the view as having unsaved changes', () => {
      const wrapper = withData(mount(), {})
      wrapper.vm.updateFilter({ status: 'Open' })
      expect(wrapper.vm.viewUpdated).toBe(true)
    })

    it('persists a standard view straight away', () => {
      const wrapper = withData(mount(), {})
      wrapper.vm.updateFilter({ status: 'Open' })
      expect(api.call).toHaveBeenCalledWith(
        expect.stringContaining('create_or_update_standard_view'),
        expect.anything(),
      )
    })

    it('waits for Save on a custom view', () => {
      // A custom view is shared and explicit; changes are staged until saved.
      api.views[12] = { name: 12, label: 'Hot' }
      api.route.query.view = 12
      const wrapper = withData(mount(), {})
      wrapper.vm.updateFilter({ status: 'Open' })
      expect(api.call).not.toHaveBeenCalled()
    })

    describe('filtering from a cell', () => {
      const cell = (over = {}) => ({
        event: { stopPropagation: vi.fn(), preventDefault: vi.fn(), target: { closest: () => null } },
        idx: 2,
        column: { key: 'status', type: 'Select' },
        item: 'Open',
        firstColumn: { key: 'name' },
        ...over,
      })

      it('filters on the value that was clicked', () => {
        const wrapper = withData(mount(), {})
        wrapper.vm.applyFilter(cell())
        expect(listOf(wrapper).params.filters).toEqual({ status: 'Open' })
      })

      it("prefers a linked record's name over its label", () => {
        const wrapper = withData(mount(), {})
        wrapper.vm.applyFilter(
          cell({ column: { key: 'deal_owner', type: 'Link' }, item: { name: 'ada@x.com', label: 'Ada' } }),
        )
        expect(listOf(wrapper).params.filters).toEqual({ deal_owner: 'ada@x.com' })
      })

      it('clears the filter when the cell is empty', () => {
        const wrapper = withData(mount(), {})
        wrapper.vm.updateFilter({ status: 'Open' })
        wrapper.vm.applyFilter(cell({ item: '' }))
        expect(listOf(wrapper).params.filters).toEqual({})
      })

      it('leaves the first column alone', () => {
        // It is the record's own title; filtering to one record is pointless.
        const wrapper = withData(mount(), {})
        const c = cell({ idx: 0 })
        wrapper.vm.applyFilter(c)
        expect(c.event.preventDefault).not.toHaveBeenCalled()
      })

      it('leaves date-and-time columns alone', () => {
        // An exact timestamp matches one row at best.
        const wrapper = withData(mount(), {})
        const c = cell({ column: { key: 'modified', type: 'Datetime' } })
        wrapper.vm.applyFilter(c)
        expect(c.event.preventDefault).not.toHaveBeenCalled()
      })

      it('leaves the column beside the like heart alone', () => {
        const wrapper = withData(mount(), {})
        const c = cell({ idx: 1, firstColumn: { key: '_liked_by' } })
        wrapper.vm.applyFilter(c)
        expect(c.event.preventDefault).not.toHaveBeenCalled()
      })

      it('matches a single assignee loosely', () => {
        // `_assign` is a JSON list on the server, so it can only be matched
        // with LIKE.
        const wrapper = withData(mount(), {})
        wrapper.vm.applyFilter(
          cell({ column: { key: '_assign', type: 'Text' }, item: [{ name: 'ada@x.com' }] }),
        )
        expect(listOf(wrapper).params.filters._assign).toEqual([
          'LIKE',
          '%ada@x.com%',
        ])
      })

      it('picks the avatar that was clicked when there are several', () => {
        const wrapper = withData(mount(), {})
        wrapper.vm.applyFilter(
          cell({
            column: { key: '_assign', type: 'Text' },
            item: [{ name: 'ada@x.com' }, { name: 'grace@x.com' }],
            event: {
              stopPropagation: vi.fn(),
              preventDefault: vi.fn(),
              target: { closest: () => ({ getAttribute: () => 'grace@x.com' }) },
            },
          }),
        )
        expect(listOf(wrapper).params.filters._assign).toEqual([
          'LIKE',
          '%grace@x.com%',
        ])
      })

      it('does nothing when an unassigned row is clicked', () => {
        // Regression: this read `item[0].name` on an empty list and threw,
        // taking the list down instead of quietly doing nothing.
        const wrapper = withData(mount(), {})
        expect(() =>
          wrapper.vm.applyFilter(
            cell({ column: { key: '_assign', type: 'Text' }, item: [] }),
          ),
        ).not.toThrow()
        expect(listOf(wrapper).params.filters._assign).toBeUndefined()
      })
    })

    describe('the liked filter', () => {
      it('turns on', () => {
        const wrapper = withData(mount(), {})
        wrapper.vm.applyLikeFilter()
        expect(listOf(wrapper).params.filters._liked_by).toEqual(['LIKE', '%@me%'])
      })

      it('turns off again', () => {
        const wrapper = withData(mount(), {})
        wrapper.vm.applyLikeFilter()
        wrapper.vm.applyLikeFilter()
        expect(listOf(wrapper).params.filters._liked_by).toBeUndefined()
      })
    })
  })

  describe('sorting and grouping', () => {
    it('applies a sort order', () => {
      const wrapper = withData(mount(), {})
      wrapper.vm.updateSort('creation asc')
      expect(listOf(wrapper).params.order_by).toBe('creation asc')
      expect(wrapper.vm.view.order_by).toBe('creation asc')
    })

    it('applies a grouping', () => {
      const wrapper = withData(mount(), {})
      wrapper.vm.updateGroupBy('status')
      expect(listOf(wrapper).params.view.group_by_field).toBe('status')
      expect(wrapper.vm.view.group_by_field).toBe('status')
    })
  })

  describe('columns', () => {
    it('stores the chosen columns on the view', () => {
      const wrapper = withData(mount(), {})
      wrapper.vm.updateColumns({
        columns: [{ key: 'status' }],
        rows: ['status'],
        isDefault: false,
      })
      expect(wrapper.vm.view.columns).toEqual([{ key: 'status' }])
      expect(wrapper.vm.view.rows).toEqual(['status'])
    })

    it('clears them when the defaults are chosen', () => {
      // An empty column list is how the server is told to use its own.
      const wrapper = withData(mount(), {})
      wrapper.vm.updateColumns({ columns: [{ key: 'status' }], rows: [], isDefault: true })
      expect(wrapper.vm.view.columns).toBe('')
      expect(wrapper.vm.view.load_default_columns).toBe(true)
    })

    it('falls back to what the list is already showing', () => {
      const wrapper = withData(mount(), { columns: [{ key: 'status' }], rows: ['status'] })
      wrapper.vm.updateColumns()
      expect(wrapper.vm.view.columns).toEqual([{ key: 'status' }])
    })

    it('reloads only when asked', () => {
      const wrapper = withData(mount(), {})
      wrapper.vm.updateColumns({ columns: [], rows: [], isDefault: false })
      expect(listOf(wrapper).reload).not.toHaveBeenCalled()
      wrapper.vm.updateColumns({ columns: [], rows: [], isDefault: false, reload: true })
      expect(listOf(wrapper).reload).toHaveBeenCalled()
    })
  })

  describe('quick filters', () => {
    const quickResource = (wrapper) =>
      api.resources.find((r) => r.url === 'xbr_crm.api.doc.get_quick_filters')

    const withQuickFilters = (filters) => {
      const wrapper = withData(mount(), {})
      const q = quickResource(wrapper)
      q.data = filters
      wrapper.vm.setupNewQuickFilters(filters)
      return wrapper
    }

    it('offers every labelled field', () => {
      const wrapper = withData(mount(), {})
      expect(wrapper.vm.quickFilterOptions.map((o) => o.value)).toContain('status')
    })

    it('leaves out fields with no label', () => {
      api.fields = [{ fieldname: 'nolabel', fieldtype: 'Data' }]
      expect(withData(mount(), {}).vm.quickFilterOptions).toEqual([
        { label: 'Name', value: 'name', fieldtype: 'Data' },
      ])
    })

    it('adds Name, which is not a real field', () => {
      expect(
        withData(mount(), {}).vm.quickFilterOptions.map((o) => o.value),
      ).toContain('name')
    })

    it('offers Name once, not twice', () => {
      // Regression: the test for "is Name already here?" looked at a property
      // the options do not have, so Name was appended every time.
      api.fields = [{ label: 'Name', fieldname: 'name', fieldtype: 'Data' }]
      const options = withData(mount(), {}).vm.quickFilterOptions
      expect(options.filter((o) => o.value === 'name')).toHaveLength(1)
    })

    it('stops offering Name once it has been chosen', () => {
      const wrapper = withQuickFilters([
        { label: 'Name', fieldname: 'name', fieldtype: 'Data' },
      ])
      expect(wrapper.vm.quickFilterOptions.map((o) => o.value)).not.toContain(
        'name',
      )
    })

    it('stops offering a field once it has been chosen', () => {
      const wrapper = withQuickFilters([
        { label: 'Status', fieldname: 'status', fieldtype: 'Select' },
      ])
      expect(wrapper.vm.quickFilterOptions.map((o) => o.value)).not.toContain(
        'status',
      )
    })

    it('adds one', () => {
      const wrapper = withData(mount(), {})
      wrapper.vm.newQuickFilters = []
      wrapper.vm.addQuickFilter({ label: 'Status', value: 'status', fieldtype: 'Select' })
      expect(wrapper.vm.newQuickFilters).toEqual([
        { label: 'Status', fieldname: 'status', fieldtype: 'Select' },
      ])
    })

    it('will not add the same one twice', () => {
      const wrapper = withData(mount(), {})
      wrapper.vm.newQuickFilters = []
      const f = { label: 'Status', value: 'status', fieldtype: 'Select' }
      wrapper.vm.addQuickFilter(f)
      wrapper.vm.addQuickFilter(f)
      expect(wrapper.vm.newQuickFilters).toHaveLength(1)
    })

    it('removes one', () => {
      const wrapper = withQuickFilters([
        { label: 'Status', fieldname: 'status', fieldtype: 'Select' },
      ])
      wrapper.vm.removeQuickFilter({ fieldname: 'status' })
      expect(wrapper.vm.newQuickFilters).toEqual([])
    })

    it('sends the old set alongside the new one', () => {
      // The server needs to know what to unset, not just what to set.
      const wrapper = withQuickFilters([
        { label: 'Status', fieldname: 'status', fieldtype: 'Select' },
      ])
      wrapper.vm.newQuickFilters = [{ fieldname: 'deal_owner' }]
      wrapper.vm.saveQuickFilters()
      const update = api.resources.find(
        (r) => r.url === 'xbr_crm.api.doc.update_quick_filters',
      )
      expect(JSON.parse(update.params.quick_filters)).toEqual(['deal_owner'])
      expect(JSON.parse(update.params.old_filters)).toEqual(['status'])
      expect(update.fetch).toHaveBeenCalled()
    })

    describe('showing the applied value back in the box', () => {
      it('is blank when nothing is filtered', () => {
        const wrapper = withQuickFilters([
          { label: 'Name', fieldname: 'name', fieldtype: 'Data' },
        ])
        expect(wrapper.vm.quickFilterList[0].value).toBe('')
      })

      it('is unticked for a checkbox', () => {
        const wrapper = withQuickFilters([
          { label: 'Converted', fieldname: 'converted', fieldtype: 'Check' },
        ])
        expect(wrapper.vm.quickFilterList[0].value).toBe(false)
      })

      it('shows a plain value', () => {
        const wrapper = withQuickFilters([
          { label: 'Status', fieldname: 'status', fieldtype: 'Select' },
        ])
        wrapper.vm.updateFilter({ status: 'Open' })
        expect(wrapper.vm.quickFilterList[0].value).toBe('Open')
      })

      it('strips the wildcards off a text search', () => {
        const wrapper = withQuickFilters([
          { label: 'Name', fieldname: 'name', fieldtype: 'Data' },
        ])
        wrapper.vm.updateFilter({ name: ['LIKE', '%acme%'] })
        expect(wrapper.vm.quickFilterList[0].value).toBe('acme')
      })

      it('shows a ticked checkbox', () => {
        const wrapper = withQuickFilters([
          { label: 'Converted', fieldname: 'converted', fieldtype: 'Check' },
        ])
        wrapper.vm.updateFilter({ converted: true })
        expect(wrapper.vm.quickFilterList[0].value).toBe(true)
      })

      it('copes with the list having no filters at all', () => {
        const wrapper = withQuickFilters([
          { label: 'Name', fieldname: 'name', fieldtype: 'Data' },
        ])
        listOf(wrapper).params = { doctype: 'CRM Deal' }
        expect(() => wrapper.vm.quickFilterList).not.toThrow()
      })

      it('renders a box per quick filter', async () => {
        const wrapper = withQuickFilters([
          { label: 'Status', fieldname: 'status', fieldtype: 'Select' },
          { label: 'Name', fieldname: 'name', fieldtype: 'Data' },
        ])
        await nextTick()
        expect(
          wrapper.findAllComponents({ name: 'QuickFilterFieldStub' }),
        ).toHaveLength(2)
      })
    })

    describe('applying one', () => {
      it('matches an exact-value field exactly', () => {
        const wrapper = withData(mount(), {})
        wrapper.vm.applyQuickFilter(
          { fieldname: 'status', fieldtype: 'Select' },
          'Open',
        )
        expect(listOf(wrapper).params.filters).toEqual({ status: 'Open' })
      })

      it('matches a text field loosely', () => {
        const wrapper = withData(mount(), {})
        wrapper.vm.applyQuickFilter({ fieldname: 'name', fieldtype: 'Data' }, 'acme')
        expect(listOf(wrapper).params.filters).toEqual({
          name: ['LIKE', '%acme%'],
        })
      })

      it('clears the filter when the box is emptied', () => {
        const wrapper = withData(mount(), {})
        const f = { fieldname: 'status', fieldtype: 'Select' }
        wrapper.vm.applyQuickFilter(f, 'Open')
        wrapper.vm.applyQuickFilter(f, '')
        expect(listOf(wrapper).params.filters).toEqual({})
        expect(f.value).toBe('')
      })
    })
  })

  describe('the views dropdown', () => {
    it('offers the allowed standard views', () => {
      const wrapper = withData(mount({ options: { allowedViews: ['list', 'kanban'] } }), {})
      const standard = wrapper.vm.viewsDropdownOptions[0]
      expect(standard.items.map((i) => i.name)).toEqual(['list', 'kanban'])
    })

    it('offers only what the page allows', () => {
      const wrapper = withData(mount({ options: { allowedViews: ['list'] } }), {})
      expect(wrapper.vm.viewsDropdownOptions[0].items).toHaveLength(1)
    })

    it('marks the one in use', () => {
      const wrapper = withData(mount(), {})
      expect(wrapper.vm.viewsDropdownOptions[0].items[0].selected).toBe(true)
    })

    it('always ends with Create View', () => {
      const wrapper = withData(mount(), {})
      const last = wrapper.vm.viewsDropdownOptions.at(-1)
      expect(last.items.map((i) => i.label)).toEqual(['Create View'])
    })

    it('separates saved, public and pinned views', () => {
      const wrapper = withData(mount(), {
        views: [
          { name: 1, label: 'Mine', type: 'list' },
          { name: 2, label: 'Shared', type: 'list', public: 1 },
          { name: 3, label: 'Pinned', type: 'list', pinned: 1 },
        ],
      })
      expect(wrapper.vm.viewsDropdownOptions.map((g) => g.group)).toEqual([
        'Standard Views',
        'Saved Views',
        'Public Views',
        'Pinned Views',
        'Actions',
      ])
    })

    it('leaves out a group with nothing in it', () => {
      const wrapper = withData(mount(), {
        views: [{ name: 1, label: 'Mine', type: 'list' }],
      })
      expect(wrapper.vm.viewsDropdownOptions.map((g) => g.group)).toEqual([
        'Standard Views',
        'Saved Views',
        'Actions',
      ])
    })

    it('parses the filters stored against a view', () => {
      const wrapper = withData(mount(), {
        views: [{ name: 1, label: 'Mine', type: 'list', filters: '{"status":"Open"}' }],
      })
      const saved = wrapper.vm.viewsDropdownOptions[1].items[0]
      expect(saved.filters).toEqual({ status: 'Open' })
    })

    it('navigates to a standard view', () => {
      const wrapper = withData(mount(), {})
      wrapper.vm.viewsDropdownOptions[0].items[0].onClick()
      expect(api.push).toHaveBeenCalledWith({
        name: 'Deals',
        params: { viewType: 'list' },
      })
    })

    it('navigates to a saved view by name', () => {
      const wrapper = withData(mount(), {
        views: [{ name: 7, label: 'Mine', type: 'list' }],
      })
      wrapper.vm.viewsDropdownOptions[1].items[0].onClick()
      expect(api.push).toHaveBeenCalledWith({
        name: 'Deals',
        params: { viewType: 'list' },
        query: { view: 7 },
      })
    })

    it('drops any unsaved changes when switching away', () => {
      const wrapper = withData(mount(), {})
      wrapper.vm.updateFilter({ status: 'Open' })
      wrapper.vm.viewsDropdownOptions[0].items[0].onClick()
      expect(wrapper.vm.viewUpdated).toBe(false)
    })
  })

  describe('the per-view menu', () => {
    const actionsFor = (wrapper, view) =>
      wrapper.vm
        .viewActions(view, vi.fn())
        .flatMap((g) => g.items)
        .map((i) => i.label)

    it('tells a standard view from a saved one by its name', () => {
      // Standard views are named 'list'/'kanban'/'group_by'; a saved view is
      // a CRM View Settings record, and that doctype autoincrements — so its
      // name is a number. That is what the string test relies on.
      const wrapper = withData(mount(), {})
      expect(actionsFor(wrapper, { name: 'list', label: 'List' })).not.toContain(
        'Delete',
      )
      api.views[7] = { name: 7, label: 'Mine', dt: 'CRM Deal' }
      expect(actionsFor(wrapper, { name: 7, label: 'Mine' })).toContain('Delete')
    })

    it('always offers Duplicate', () => {
      const wrapper = withData(mount(), {})
      expect(actionsFor(wrapper, { name: 'list', label: 'List' })).toContain(
        'Duplicate',
      )
    })

    it('offers to make a standard view the default', () => {
      api.standardViews['CRM Deal list'] = { name: 4, type: 'list', dt: 'CRM Deal' }
      const wrapper = withData(mount(), {})
      expect(actionsFor(wrapper, { name: 'list', label: 'List' })).toContain(
        'Set As Default',
      )
    })

    it('does not offer that for the view already default', () => {
      api.standardViews['CRM Deal list'] = { name: 4, type: 'list', dt: 'CRM Deal' }
      api.defaultView = { name: 4 }
      const wrapper = withData(mount(), {})
      expect(actionsFor(wrapper, { name: 'list', label: 'List' })).not.toContain(
        'Set As Default',
      )
    })

    it('offers edit, pin and delete on a saved view', () => {
      api.views[7] = { name: 7, label: 'Mine', dt: 'CRM Deal' }
      const wrapper = withData(mount(), {})
      const labels = actionsFor(wrapper, { name: 7, label: 'Mine' })
      expect(labels).toEqual(
        expect.arrayContaining(['Duplicate', 'Edit', 'Pin View', 'Delete']),
      )
    })

    it('offers to unpin one already pinned', () => {
      api.views[7] = { name: 7, label: 'Mine', dt: 'CRM Deal', pinned: 1 }
      const wrapper = withData(mount(), {})
      expect(actionsFor(wrapper, { name: 7, label: 'Mine' })).toContain(
        'Unpin View',
      )
    })

    it('does not let a non-manager touch a public view', () => {
      api.isManager = false
      api.views[7] = { name: 7, label: 'Shared', dt: 'CRM Deal', public: 1 }
      const wrapper = withData(mount(), {})
      expect(actionsFor(wrapper, { name: 7, label: 'Shared' })).toEqual([
        'Duplicate',
      ])
    })

    it('lets a manager make a view public', () => {
      api.views[7] = { name: 7, label: 'Mine', dt: 'CRM Deal' }
      const wrapper = withData(mount(), {})
      expect(actionsFor(wrapper, { name: 7, label: 'Mine' })).toContain(
        'Make Public',
      )
    })

    it('hides pinning for a public view', () => {
      // Pinning is per-user; a public view belongs to everyone.
      api.views[7] = { name: 7, label: 'Shared', dt: 'CRM Deal', public: 1 }
      const wrapper = withData(mount(), {})
      expect(actionsFor(wrapper, { name: 7, label: 'Shared' })).not.toContain(
        'Pin View',
      )
    })

    it('asks before deleting', () => {
      api.views[7] = { name: 7, label: 'Mine', dt: 'CRM Deal' }
      const wrapper = withData(mount(), {})
      const del = wrapper.vm
        .viewActions({ name: 7, label: 'Mine' }, vi.fn())
        .flatMap((g) => g.items)
        .find((i) => i.label === 'Delete')
      del.onClick()
      expect(api.dialog).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'danger' }),
      )
      expect(api.call).not.toHaveBeenCalled()
    })
  })

  describe('view actions', () => {
    it('duplicates without renaming the original', async () => {
      // Regression: this renamed the view object the dropdown renders, so the
      // original visibly became "Mine (New)" on click and stayed renamed even
      // if the modal was cancelled.
      const view = { name: 7, label: 'Mine', dt: 'CRM Deal' }
      const wrapper = withData(mount(), {})
      wrapper.vm.duplicateView(view, vi.fn())
      expect(view.label).toBe('Mine')
      expect(wrapper.vm.viewModalObj.label).toBe('Mine (New)')
      expect(wrapper.vm.viewModalObj.mode).toBe('duplicate')
      expect(wrapper.vm.showViewModal).toBe(true)
    })

    it('closes the menu behind it', () => {
      const close = vi.fn()
      withData(mount(), {}).vm.duplicateView({ label: 'Mine' }, close)
      expect(close).toHaveBeenCalled()
    })

    it('opens a blank modal for a new view', () => {
      const wrapper = withData(mount(), {})
      wrapper.vm.createView()
      expect(wrapper.vm.viewModalObj.label).toBe('')
      expect(wrapper.vm.viewModalObj.mode).toBe('create')
    })

    it('pins a view and reflects it straight away', async () => {
      const view = { name: 7, pinned: 0 }
      withData(mount(), {}).vm.pinView(view)
      await flushPromises()
      expect(api.call).toHaveBeenCalledWith(expect.stringContaining('.pin'), {
        name: 7,
        value: true,
      })
      expect(view.pinned).toBe(true)
    })

    it('publishes a view', async () => {
      const view = { name: 7, public: 0 }
      withData(mount(), {}).vm.publicView(view)
      await flushPromises()
      expect(api.call).toHaveBeenCalledWith(expect.stringContaining('.public'), {
        name: 7,
        value: true,
      })
      expect(view.public).toBe(true)
    })

    it('sends the user back to the list after deleting', async () => {
      const close = vi.fn()
      withData(mount(), {}).vm.deleteView({ name: 7 }, close)
      await flushPromises()
      expect(api.call).toHaveBeenCalledWith(expect.stringContaining('.delete'), {
        name: 7,
      })
      expect(api.push).toHaveBeenCalledWith({
        name: 'Deals',
        params: { viewType: 'list' },
      })
      expect(close).toHaveBeenCalled()
    })

    it('sets a view as the default', async () => {
      withData(mount(), {}).vm.setAsDefault({ name: 7, type: 'list', dt: 'CRM Deal' })
      await flushPromises()
      expect(api.call).toHaveBeenCalledWith(
        expect.stringContaining('set_as_default'),
        { name: 7, type: 'list', doctype: 'CRM Deal' },
      )
    })

    it('throws away unsaved changes on cancel', () => {
      const wrapper = withData(mount(), {})
      wrapper.vm.updateFilter({ status: 'Open' })
      wrapper.vm.cancelChanges()
      expect(wrapper.vm.viewUpdated).toBe(false)
      expect(listOf(wrapper).params.filters).toEqual({})
    })
  })

  describe('page length', () => {
    it("loads another page's worth on demand", () => {
      const wrapper = withData(mount(), {})
      wrapper.vm.updatePageLength(20, true)
      expect(listOf(wrapper).params.page_length).toBe(40)
    })

    it('sets an exact page length', () => {
      const wrapper = withData(mount(), {})
      wrapper.vm.updatePageLength(50)
      expect(listOf(wrapper).params.page_length).toBe(50)
      expect(listOf(wrapper).params.page_length_count).toBe(50)
    })

    it('does nothing when the length has not changed', () => {
      const wrapper = withData(mount(), {})
      wrapper.vm.updatePageLength(50)
      listOf(wrapper).reload.mockClear()
      wrapper.vm.updatePageLength(50)
      expect(listOf(wrapper).reload).not.toHaveBeenCalled()
    })

    it('ignores a change while a request is in flight', () => {
      const wrapper = withData(mount(), {})
      listOf(wrapper).loading = true
      wrapper.vm.updatePageLength(50)
      expect(listOf(wrapper).reload).not.toHaveBeenCalled()
    })
  })

  describe('exporting', () => {
    const exportable = () =>
      withData(mount(), {
        total_count: 95,
        columns: [{ key: 'status' }, { key: 'deal_owner' }],
      })

    let href
    beforeEach(() => {
      href = ''
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: {
          set href(v) {
            href = v
          },
          get href() {
            return href
          },
        },
      })
    })

    it('asks for the columns on screen', async () => {
      const wrapper = exportable()
      await wrapper.vm.exportRows()
      expect(href).toContain('["status","deal_owner"]')
    })

    it('exports as the chosen format', async () => {
      const wrapper = exportable()
      wrapper.vm.export_type = 'CSV'
      await wrapper.vm.exportRows()
      expect(href).toContain('file_format_type=CSV')
    })

    it('exports one page by default', async () => {
      // Regression: the length was read only from the request params, which
      // are still empty right after the first load — the URL went out as
      // `page_length=undefined`.
      const wrapper = exportable()
      await wrapper.vm.exportRows()
      expect(href).toContain('page_length=20')
    })

    it('exports the page size the list actually used', async () => {
      const wrapper = exportable()
      wrapper.vm.setPageSize(50)
      await wrapper.vm.exportRows()
      expect(href).toContain('page_length=50')
    })

    it('exports everything when asked', async () => {
      const wrapper = exportable()
      wrapper.vm.export_all = true
      await wrapper.vm.exportRows()
      expect(href).toContain('page_length=95')
    })

    it('exports only the ticked rows', async () => {
      const wrapper = exportable()
      wrapper.vm.updateSelections(new Set(['DEAL-1', 'DEAL-2']))
      await wrapper.vm.exportRows()
      expect(href).toContain('selected_items=')
      expect(href).toContain('DEAL-1')
    })

    it('ignores the selection when exporting everything', () => {
      const wrapper = exportable()
      wrapper.vm.updateSelections(new Set(['DEAL-1']))
      wrapper.vm.export_all = true
      wrapper.vm.exportRows()
      expect(href).not.toContain('selected_items=')
    })

    it("carries the page's own filters as well as the user's", async () => {
      const wrapper = withData(
        mount({ filters: { deal_owner: 'me' } }),
        { columns: [{ key: 'status' }], total_count: 1 },
      )
      wrapper.vm.updateFilter({ status: 'Open' })
      await wrapper.vm.exportRows()
      expect(decodeURIComponent(href)).toContain('"deal_owner":"me"')
      expect(decodeURIComponent(href)).toContain('"status":"Open"')
    })

    it('resets the dialog afterwards', async () => {
      const wrapper = exportable()
      wrapper.vm.export_all = true
      wrapper.vm.export_type = 'CSV'
      await wrapper.vm.exportRows()
      expect(wrapper.vm.showExportDialog).toBe(false)
      expect(wrapper.vm.export_all).toBe(false)
      expect(wrapper.vm.export_type).toBe('Excel')
    })
  })

  describe('the current view', () => {
    it('is the standard one by default', () => {
      const wrapper = withData(mount(), {})
      expect(wrapper.vm.currentView.name).toBe('list')
      expect(wrapper.vm.currentView.is_standard).toBe(true)
    })

    it("takes the page's own name for the standard view", () => {
      const wrapper = withData(
        mount({ options: { allowedViews: ['list'], defaultViewName: 'All Deals' } }),
        {},
      )
      expect(wrapper.vm.currentView.label).toBe('All Deals')
    })

    it('is the saved view when one is in the url', () => {
      api.views[7] = { name: 7, label: 'Hot deals', type: 'list' }
      api.route.query.view = 7
      const wrapper = withData(mount(), {})
      expect(wrapper.vm.currentView.label).toBe('Hot deals')
      expect(wrapper.vm.currentView.is_standard).toBeFalsy()
    })
  })

  describe('refreshing', () => {
    it('reloads', () => {
      const wrapper = withData(mount(), {})
      wrapper.vm.reload()
      expect(listOf(wrapper).reload).toHaveBeenCalled()
    })

    it('does nothing while already loading', () => {
      const wrapper = withData(mount(), {})
      listOf(wrapper).loading = true
      wrapper.vm.reload()
      expect(listOf(wrapper).reload).not.toHaveBeenCalled()
    })
  })

  // Call Logs, Organizations and Contacts mount ViewControls with no `options`
  // prop at all, so the prop defaults are the live configuration for three
  // pages rather than dead fallbacks.
  describe('the defaults three pages rely on', () => {
    const bare = () =>
      mountComponent(ViewControls, {
        props: { doctype: 'Contact' },
        global: { stubs: STUBS },
      })

    it('shows the column picker', () => {
      expect(bare().findComponent({ name: 'ColumnSettingsStub' }).exists()).toBe(
        true,
      )
    })

    it('offers import and export', () => {
      // The same flag gates Import and Export inside the … menu, so it is not
      // enough to check the column picker alone.
      const items = bare()
        .findAllComponents({ name: 'DropdownStub' })
        .flatMap((d) => d.vm.$attrs.options ?? [])
        .flatMap((g) => g.items ?? [])
      const named = (label) => items.find((i) => i.label === label)
      expect(named('Import')?.condition()).toBe(true)
      expect(named('Export')?.condition()).toBe(true)
    })

    it('offers the list view', () => {
      expect(bare().vm.standardViews.map((v) => v.name)).toEqual(['list'])
    })
  })
})
