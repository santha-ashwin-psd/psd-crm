const api = vi.hoisted(() => ({
  call: vi.fn(),
  capture: vi.fn(),
  onboarding: vi.fn(),
  showModal: vi.fn(),
  makeCall: vi.fn(),
  callEnabled: null,
}))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  const inert = (options = {}) =>
    reactive({
      ...options,
      data: null,
      doc: null,
      fetch: vi.fn(),
      reload: vi.fn(),
      submit: vi.fn(),
      setValue: { submit: vi.fn() },
      insert: { submit: vi.fn() },
      delete: { submit: vi.fn() },
    })
  return {
    ...actual,
    call: api.call,
    createResource: inert,
    createDocumentResource: inert,
    createListResource: inert,
  }
})

vi.mock('frappe-ui/frappe', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useTelemetry: () => ({ capture: api.capture }),
    useOnboarding: () => ({ updateOnboardingStep: api.onboarding }),
  }
})

vi.mock('@/composables/doctypeModal', () => ({
  useDoctypeModal: () => ({ showModal: api.showModal }),
}))

vi.mock('@/composables/telephony', async () => {
  const { ref } = await import('vue')
  api.callEnabled = ref(true)
  return { callEnabled: api.callEnabled }
})

vi.mock('@/stores/global', () => ({
  globalStore: () => ({
    makeCall: api.makeCall,
    $dialog: vi.fn(),
    $socket: { on: vi.fn(), off: vi.fn() },
  }),
}))

vi.mock('@/stores/meta', async () => {
  const { ref } = await import('vue')
  return {
    getMeta: () => ({
      getFormattedPercent: (f, d) => `${d[f]}%`,
      getFormattedFloat: (f, d) => String(d[f]),
      getFormattedCurrency: (f, d) => `₹${d[f]}`,
      getFields: () => [],
      doctypeMeta: ref({}),
      doctypesMeta: {},
    }),
  }
})

vi.mock('@/stores/organizations', () => ({
  organizationsStore: () => ({
    getOrganization: (name) =>
      name === 'Acme' ? { organization_logo: '/acme.png' } : undefined,
  }),
}))

vi.mock('@/stores/statuses', () => ({
  statusesStore: () => ({
    getDealStatus: (s) => ({ color: s === 'Won' ? 'text-green-600' : 'text-gray-600' }),
    statusOptions: () => [{ label: 'Won', value: 'Won' }],
    dealStatuses: { data: [{ name: 'Won' }] },
  }),
}))

vi.mock('@/stores/users', () => ({
  usersStore: () => ({
    getUser: (email) => ({ full_name: email === 'ada@x.com' ? 'Ada' : email, user_image: '' }),
    isManager: () => true,
  }),
}))

vi.mock('@/composables/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: () => ({}),
}))

const nav = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useRouter: () => nav,
    useRoute: () => ({ query: {}, params: {} }),
  }
})

import DealsPage from '@/pages/Deals.vue'
import { mountComponent } from '../helpers/mount'

const STUBS = {
  ViewBreadcrumbs: true, LayoutHeader: true, ViewControls: true,
  DealsListView: true, KanbanView: true, GroupByView: true,
  EmptyState: true, ListPagination: true, DealModal: true,
  Dropdown: true, Tooltip: true, StatusKpiBand: true,
  IndicatorIcon: true, PhoneIcon: true, NoteIcon: true, TaskIcon: true,
}

const ROUTE = { params: {}, query: {} }

const mountPage = () =>
  mountComponent(DealsPage, {
    global: { stubs: STUBS, mocks: { $route: ROUTE } },
  })

const withDeals = (wrapper, data) => {
  wrapper.vm.deals = {
    data: { view_type: 'list', columns: [], rows: [], ...data },
    params: { filters: {} },
    reload: vi.fn(),
  }
  return wrapper.vm.deals
}

/** Runs one deal through parseRows with the given column metadata. */
const parseOne = (wrapper, deal, columns = []) => {
  withDeals(wrapper, { data: [], rows: Object.keys(deal), columns })
  return wrapper.vm.parseRows([deal], columns)[0]
}

describe('Deals page', () => {
  beforeEach(() => {
    api.call.mockReset().mockResolvedValue({})
    api.capture.mockClear()
    api.onboarding.mockClear()
    api.showModal.mockClear()
    api.makeCall.mockClear()
    api.callEnabled.value = true
    ROUTE.params = {}
  })

  describe('the status band', () => {
    it('is hidden when there is nothing to show and no filter', () => {
      const wrapper = mountPage()
      withDeals(wrapper, { data: [] })
      expect(wrapper.vm.showStatusBand).toBe(false)
    })

    it('stays visible when a status filter is active but empty', () => {
      const wrapper = mountPage()
      const deals = withDeals(wrapper, { data: [] })
      deals.params.filters = { status: 'Won' }
      expect(wrapper.vm.showStatusBand).toBe(true)
    })

    it('reflects the active status', () => {
      const wrapper = mountPage()
      const deals = withDeals(wrapper, { data: [] })
      deals.params.filters = { status: 'Won' }
      expect(wrapper.vm.activeStatus).toBe('Won')
    })
  })

  describe('filtering by status', () => {
    const withControls = (wrapper) => {
      const updateFilter = vi.fn()
      wrapper.vm.viewControls = { updateFilter }
      return updateFilter
    }

    it('applies the chosen status', () => {
      const wrapper = mountPage()
      withDeals(wrapper, { data: [] })
      const updateFilter = withControls(wrapper)
      wrapper.vm.filterByStatus('Won')
      expect(updateFilter).toHaveBeenCalledWith({ status: 'Won' })
    })

    it('toggles it off when clicked again', () => {
      const wrapper = mountPage()
      const deals = withDeals(wrapper, { data: [] })
      deals.params.filters = { status: 'Won' }
      const updateFilter = withControls(wrapper)
      wrapper.vm.filterByStatus('Won')
      expect(updateFilter).toHaveBeenCalledWith({})
    })

    it('keeps unrelated filters', () => {
      const wrapper = mountPage()
      const deals = withDeals(wrapper, { data: [] })
      deals.params.filters = { deal_owner: 'ada@x.com' }
      const updateFilter = withControls(wrapper)
      wrapper.vm.filterByStatus('Won')
      expect(updateFilter).toHaveBeenCalledWith({
        deal_owner: 'ada@x.com',
        status: 'Won',
      })
    })
  })

  describe('shaping a row for display', () => {
    it('pairs an organization with its logo', () => {
      const wrapper = mountPage()
      const row = parseOne(wrapper, { name: 'D1', organization: 'Acme' })
      expect(row.organization).toEqual({
        label: 'Acme',
        logo: '/acme.png',
      })
    })

    it('copes with an organization the store has not loaded', () => {
      const wrapper = mountPage()
      const row = parseOne(wrapper, { name: 'D1', organization: 'Unknown Ltd' })
      expect(row.organization).toEqual({
        label: 'Unknown Ltd',
        logo: undefined,
      })
    })

    it('colours the status', () => {
      const wrapper = mountPage()
      const row = parseOne(wrapper, { name: 'D1', status: 'Won' })
      expect(row.status).toEqual({ label: 'Won', color: 'text-green-600' })
    })

    it('formats a currency column', () => {
      const wrapper = mountPage()
      const row = parseOne(
        wrapper,
        { name: 'D1', annual_revenue: 5000 },
        [{ key: 'annual_revenue', type: 'Currency' }],
      )
      expect(row.annual_revenue).toBe('₹5000')
    })

    it('formats a percent column', () => {
      const wrapper = mountPage()
      const row = parseOne(
        wrapper,
        { name: 'D1', probability: 70 },
        [{ key: 'probability', type: 'Percent' }],
      )
      expect(row.probability).toBe('70%')
    })

    it('leaves an untyped column as it came', () => {
      const wrapper = mountPage()
      const row = parseOne(wrapper, { name: 'D1', deal_name: 'Big one' })
      expect(row.deal_name).toBe('Big one')
    })
  })

  describe('SLA status', () => {
    const slaRow = (wrapper, deal) =>
      parseOne(wrapper, { name: 'D1', sla_status: deal.sla_status, ...deal }).sla_status

    it('marks a failed SLA red', () => {
      const wrapper = mountPage()
      expect(slaRow(wrapper, { sla_status: 'Failed' }).color).toBe('red')
    })

    it('marks a fulfilled SLA green', () => {
      const wrapper = mountPage()
      expect(slaRow(wrapper, { sla_status: 'Fulfilled' }).color).toBe('green')
    })

    it('turns an overdue response red', () => {
      // A due-by in the past is a breach, whatever the stored status says.
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2026, 7, 20, 12, 0, 0))
      const wrapper = mountPage()
      const row = slaRow(wrapper, {
        sla_status: 'First Response Due',
        response_by: '2026-08-20 09:00:00',
      })
      expect(row.color).toBe('red')
      vi.useRealTimers()
    })

    it('leaves a response still in the future amber', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2026, 7, 20, 12, 0, 0))
      const wrapper = mountPage()
      const row = slaRow(wrapper, {
        sla_status: 'First Response Due',
        response_by: '2026-08-20 18:00:00',
      })
      expect(row.color).toBe('orange')
      vi.useRealTimers()
    })
  })

  describe('grouping rows', () => {
    const groupField = (extra = {}) => ({
      fieldname: 'status',
      label: 'Status',
      options: ['Won', 'Lost'],
      ...extra,
    })

    it('creates a group per option', () => {
      const wrapper = mountPage()
      withDeals(wrapper, { data: [], rows: ['name'] })
      const groups = wrapper.vm.getGroupedByRows(
        [{ name: 'D1', status: 'Won' }, { name: 'D2', status: 'Lost' }],
        groupField(),
        [],
      )
      expect(groups.map((g) => g.group)).toEqual(['Won', 'Lost'])
    })

    it('sorts each row into its group', () => {
      const wrapper = mountPage()
      withDeals(wrapper, { data: [], rows: ['name'] })
      const groups = wrapper.vm.getGroupedByRows(
        [{ name: 'D1', status: 'Won' }, { name: 'D2', status: 'Lost' }],
        groupField(),
        [],
      )
      expect(groups[0].rows).toHaveLength(1)
      expect(groups[1].rows).toHaveLength(1)
    })

    it('gives status groups a coloured indicator', () => {
      const wrapper = mountPage()
      withDeals(wrapper, { data: [], rows: ['name'] })
      const groups = wrapper.vm.getGroupedByRows([], groupField(), [])
      expect(typeof groups[0].icon).toBe('function')
    })

    it('leaves other group fields without one', () => {
      const wrapper = mountPage()
      withDeals(wrapper, { data: [], rows: ['name'] })
      const groups = wrapper.vm.getGroupedByRows(
        [],
        groupField({ fieldname: 'industry', options: ['Software'] }),
        [],
      )
      expect(groups[0].icon).toBeUndefined()
    })
  })

  describe('kanban rows', () => {
    it('flattens every column into one list', () => {
      const wrapper = mountPage()
      withDeals(wrapper, { view_type: 'kanban', data: [], rows: ['name'] })
      expect(
        wrapper.vm.getKanbanRows(
          [{ data: [{ name: 'D1' }] }, { data: [{ name: 'D2' }] }],
          [],
        ),
      ).toHaveLength(2)
    })

    it('tolerates a column with no data', () => {
      const wrapper = mountPage()
      withDeals(wrapper, { view_type: 'kanban', data: [], rows: ['name'] })
      expect(
        wrapper.vm.getKanbanRows(
          [{ data: [{ name: 'D1' }] }, { label: 'empty' }],
          [],
        ),
      ).toHaveLength(1)
    })
  })

  describe('row actions', () => {
    const withRow = (wrapper, row) =>
      withDeals(wrapper, { data: [row], rows: Object.keys(row) })

    it('offers note and task on every deal', () => {
      const wrapper = mountPage()
      withRow(wrapper, { name: 'D1', mobile_no: '' })
      expect(wrapper.vm.actions('D1').map((a) => a.label)).toEqual([
        'New Note',
        'New Task',
      ])
    })

    it('offers a call when there is a number and telephony is on', () => {
      const wrapper = mountPage()
      withRow(wrapper, { name: 'D1', mobile_no: '+441234' })
      expect(wrapper.vm.actions('D1').map((a) => a.label)).toContain('Make a Call')
    })

    it('hides the call when telephony is off', () => {
      api.callEnabled.value = false
      const wrapper = mountPage()
      withRow(wrapper, { name: 'D1', mobile_no: '+441234' })
      expect(wrapper.vm.actions('D1').map((a) => a.label)).not.toContain(
        'Make a Call',
      )
    })
  })

  describe('creating a note or task from a deal', () => {
    it('attaches the note to the deal', () => {
      const wrapper = mountPage()
      wrapper.vm.showNote('DEAL-1')
      expect(api.showModal).toHaveBeenCalledWith(
        expect.objectContaining({
          doctype: 'FCRM Note',
          defaults: { reference_doctype: 'CRM Deal', reference_docname: 'DEAL-1' },
        }),
      )
    })

    it('attaches the task to the deal', () => {
      const wrapper = mountPage()
      wrapper.vm.showTask('DEAL-1')
      expect(api.showModal).toHaveBeenCalledWith(
        expect.objectContaining({
          doctype: 'CRM Task',
          defaults: { reference_doctype: 'CRM Deal', reference_docname: 'DEAL-1' },
        }),
      )
    })

    it('ticks off onboarding only for a first one', () => {
      const wrapper = mountPage()
      wrapper.vm.after({ doctype: 'FCRM Note' }, true)
      expect(api.onboarding).toHaveBeenCalledWith('create_first_note')
      api.onboarding.mockClear()
      wrapper.vm.after({ doctype: 'FCRM Note' }, false)
      expect(api.onboarding).not.toHaveBeenCalled()
    })
  })

  describe('creating a deal from a kanban column', () => {
    it('opens the deal modal', () => {
      const wrapper = mountPage()
      withDeals(wrapper, { data: [] })
      wrapper.vm.onNewClick({ column: { name: 'Won' } })
      expect(wrapper.vm.showDealModal).toBe(true)
    })

    it('prefills the column’s field', () => {
      const wrapper = mountPage()
      const deals = withDeals(wrapper, { data: [] })
      deals.params.column_field = 'status'
      wrapper.vm.onNewClick({ column: { name: 'Won' } })
      expect(wrapper.vm.defaults.status).toBe('Won')
    })
  })
})
