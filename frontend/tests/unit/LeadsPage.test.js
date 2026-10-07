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
  // stores/settings.js builds an auto-fetching document resource at module
  // scope; every factory has to be inert or importing the page hits the network.
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

// callEnabled is a bare exported ref; makeCall lives on the Pinia globalStore.
// It must be a genuine ref — a plain property would be read once and cached.
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
      getFormattedPercent: (f, d) => String(d[f] ?? ''),
      getFormattedFloat: (f, d) => String(d[f] ?? ''),
      getFormattedCurrency: (f, d) => String(d[f] ?? ''),
      getFields: () => [],
      doctypeMeta: ref({}),
      doctypesMeta: {},
    }),
  }
})

vi.mock('@/composables/useBroadcast', () => ({
  useBroadcast: () => ({ on: vi.fn(), send: vi.fn(), off: vi.fn() }),
}))

vi.mock('@/composables/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: () => ({}),
}))

vi.mock('@/stores/statuses', () => ({
  statusesStore: () => ({
    getLeadStatus: (s) => ({ color: s === 'Open' ? 'text-green-600' : 'text-gray-600' }),
    statusOptions: () => [{ label: 'Open', value: 'Open' }],
    leadStatuses: { Open: { name: 'Open', color: 'text-green-600' } },
  }),
}))

vi.mock('@/stores/users', () => ({
  usersStore: () => ({
    getUser: (email) => ({ full_name: email === 'ada@x.com' ? 'Ada' : email, user_image: '' }),
    isManager: () => true,
  }),
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

import LeadsPage from '@/pages/Leads.vue'
import { mountComponent } from '../helpers/mount'

const STUBS = {
  ViewBreadcrumbs: true, LayoutHeader: true, ViewControls: true,
  LeadsListView: true, KanbanView: true, GroupByView: true,
  EmptyState: true, ListPagination: true, LeadModal: true,
  Dropdown: true, Tooltip: true, StatusKpiBand: true,
  IndicatorIcon: true, PhoneIcon: true, NoteIcon: true, TaskIcon: true,
}

const ROUTE = { params: {}, query: {} }

const mountPage = () =>
  mountComponent(LeadsPage, {
    global: { stubs: STUBS, mocks: { $route: ROUTE } },
  })

const withLeads = (wrapper, data) => {
  wrapper.vm.leads = {
    data: { view_type: 'list', columns: [], rows: [], ...data },
    params: { filters: {} },
    reload: vi.fn(),
  }
  return wrapper.vm.leads
}

describe('Leads page', () => {
  beforeEach(() => {
    api.call.mockReset().mockResolvedValue({})
    api.capture.mockClear()
    api.onboarding.mockClear()
    api.showModal.mockClear()
    api.makeCall.mockClear()
    api.callEnabled.value = true
  })

  describe('the status band', () => {
    it('is hidden when there is nothing to show and no filter', () => {
      const wrapper = mountPage()
      withLeads(wrapper, { data: [] })
      expect(wrapper.vm.showStatusBand).toBe(false)
    })

    it('stays visible when a status filter is active but empty', () => {
      const wrapper = mountPage()
      const leads = withLeads(wrapper, { data: [] })
      leads.params.filters = { status: 'Open' }
      expect(wrapper.vm.showStatusBand).toBe(true)
    })

    it('reflects the active status', () => {
      const wrapper = mountPage()
      const leads = withLeads(wrapper, { data: [] })
      leads.params.filters = { status: 'Open' }
      expect(wrapper.vm.activeStatus).toBe('Open')
    })

    it('has no active status by default', () => {
      const wrapper = mountPage()
      withLeads(wrapper, { data: [] })
      expect(wrapper.vm.activeStatus).toBeNull()
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
      withLeads(wrapper, { data: [] })
      const updateFilter = withControls(wrapper)
      wrapper.vm.filterByStatus('Open')
      expect(updateFilter).toHaveBeenCalledWith({ status: 'Open' })
    })

    it('toggles it off when clicked again', () => {
      const wrapper = mountPage()
      const leads = withLeads(wrapper, { data: [] })
      leads.params.filters = { status: 'Open' }
      const updateFilter = withControls(wrapper)
      wrapper.vm.filterByStatus('Open')
      expect(updateFilter).toHaveBeenCalledWith({})
    })

    it('keeps unrelated filters', () => {
      const wrapper = mountPage()
      const leads = withLeads(wrapper, { data: [] })
      leads.params.filters = { lead_owner: 'ada@x.com' }
      const updateFilter = withControls(wrapper)
      wrapper.vm.filterByStatus('Open')
      expect(updateFilter).toHaveBeenCalledWith({
        lead_owner: 'ada@x.com',
        status: 'Open',
      })
    })

    it('does nothing before the controls exist', () => {
      const wrapper = mountPage()
      wrapper.vm.viewControls = null
      expect(() => wrapper.vm.filterByStatus('Open')).not.toThrow()
    })
  })

  describe('grouping rows', () => {
    const groupField = (extra = {}) => ({
      fieldname: 'status',
      label: 'Status',
      options: ['Open', 'Replied'],
      ...extra,
    })

    it('creates a group per option', () => {
      const wrapper = mountPage()
      withLeads(wrapper, { data: [], rows: ['name'] })
      const groups = wrapper.vm.getGroupedByRows(
        [{ name: 'L1', status: 'Open' }, { name: 'L2', status: 'Replied' }],
        groupField(),
        [],
      )
      expect(groups.map((g) => g.group)).toEqual(['Open', 'Replied'])
    })

    it('puts each row into its own group', () => {
      const wrapper = mountPage()
      withLeads(wrapper, { data: [], rows: ['name'] })
      const groups = wrapper.vm.getGroupedByRows(
        [{ name: 'L1', status: 'Open' }, { name: 'L2', status: 'Replied' }],
        groupField(),
        [],
      )
      expect(groups[0].rows).toHaveLength(1)
      expect(groups[1].rows).toHaveLength(1)
    })

    it('collects rows with no value under a blank group', () => {
      // A lead with no status still has to appear somewhere.
      const wrapper = mountPage()
      withLeads(wrapper, { data: [], rows: ['name'] })
      const groups = wrapper.vm.getGroupedByRows(
        [{ name: 'L1', status: null }],
        groupField({ options: ['', 'Open'] }),
        [],
      )
      expect(groups[0].rows).toHaveLength(1)
    })

    it('gives status groups a coloured indicator', () => {
      const wrapper = mountPage()
      withLeads(wrapper, { data: [], rows: ['name'] })
      const groups = wrapper.vm.getGroupedByRows([], groupField(), [])
      expect(typeof groups[0].icon).toBe('function')
    })

    it('leaves other group fields without an indicator', () => {
      const wrapper = mountPage()
      withLeads(wrapper, { data: [], rows: ['name'] })
      const groups = wrapper.vm.getGroupedByRows(
        [],
        groupField({ fieldname: 'industry', options: ['Software'] }),
        [],
      )
      expect(groups[0].icon).toBeUndefined()
    })

    it('starts every group expanded', () => {
      const wrapper = mountPage()
      withLeads(wrapper, { data: [], rows: ['name'] })
      const groups = wrapper.vm.getGroupedByRows([], groupField(), [])
      expect(groups.every((g) => g.collapsed === false)).toBe(true)
    })

    it('produces nothing when the field has no options', () => {
      const wrapper = mountPage()
      withLeads(wrapper, { data: [], rows: ['name'] })
      expect(
        wrapper.vm.getGroupedByRows([], groupField({ options: undefined }), []),
      ).toEqual([])
    })
  })

  describe('kanban rows', () => {
    it('flattens every column into one list', () => {
      const wrapper = mountPage()
      withLeads(wrapper, { view_type: 'kanban', data: [], rows: ['name'] })
      const rows = wrapper.vm.getKanbanRows(
        [{ data: [{ name: 'L1' }] }, { data: [{ name: 'L2' }] }],
        [],
      )
      expect(rows).toHaveLength(2)
    })

    it('tolerates an empty column', () => {
      const wrapper = mountPage()
      withLeads(wrapper, { view_type: 'kanban', data: [], rows: ['name'] })
      const rows = wrapper.vm.getKanbanRows(
        [{ data: [{ name: 'L1' }] }, { label: 'no data' }],
        [],
      )
      expect(rows).toHaveLength(1)
    })
  })

  describe('columns', () => {
    it('right-aligns a trailing numeric column', () => {
      const wrapper = mountPage()
      withLeads(wrapper, {
        columns: [{ key: 'name', type: 'Data' }, { key: 'revenue', type: 'Currency' }],
      })
      expect(wrapper.vm.columns.at(-1).align).toBe('right')
    })

    it('leaves a trailing text column alone', () => {
      const wrapper = mountPage()
      withLeads(wrapper, {
        columns: [{ key: 'revenue', type: 'Currency' }, { key: 'name', type: 'Data' }],
      })
      expect(wrapper.vm.columns.at(-1).align).toBeUndefined()
    })
  })

  // The SLA column shows a countdown while a response is still owed and a
  // verdict once it is settled. Nothing exercised it: the countdown branch, the
  // overdue colour, and the three settled colours were all untested.
  describe('the SLA column', () => {
    const sla = (lead) => {
      const wrapper = mountPage()
      withLeads(wrapper, { data: [lead], rows: ['sla_status'] })
      return wrapper.vm.parseRows([lead], [])[0].sla_status
    }

    // Full ISO, not Frappe's 'YYYY-MM-DD HH:mm:ss' — that form has no zone and
    // `new Date()` reads it as local, so a +3h UTC fixture lands in the past
    // wherever the machine runs ahead of UTC and the "still in time" case goes
    // red for a reason that has nothing to do with the code.
    const inHours = (n) => new Date(Date.now() + n * 3600 * 1000).toISOString()

    it.each(['First Response Due', 'Rolling Response Due'])(
      'counts down while a %s is owed',
      (sla_status) => {
        const cell = sla({ sla_status, response_by: inHours(3) })
        // The countdown replaces the status text; the raw status stays as the
        // tooltip in the settled cases, but here the tooltip becomes the date.
        expect(cell.value).not.toBe(sla_status)
        expect(cell.label).not.toBe(sla_status)
      },
    )

    it('turns red once the response is overdue', () => {
      expect(sla({ sla_status: 'First Response Due', response_by: inHours(-3) }).color)
        .toBe('red')
    })

    it('stays amber while there is still time', () => {
      expect(sla({ sla_status: 'First Response Due', response_by: inHours(3) }).color)
        .toBe('orange')
    })

    it.each([
      ['Failed', 'red'],
      ['Fulfilled', 'green'],
      ['Paused', 'orange'],
    ])('shows %s in %s', (sla_status, color) => {
      const cell = sla({ sla_status, response_by: inHours(3) })
      expect(cell.color).toBe(color)
      expect(cell.value).toBe(sla_status)
    })
  })

  describe('row actions', () => {
    const withRow = (wrapper, row) => {
      withLeads(wrapper, { data: [row], rows: Object.keys(row) })
      return wrapper
    }

    it('offers note and task on every lead', () => {
      const wrapper = mountPage()
      withRow(wrapper, { name: 'L1', mobile_no: '' })
      expect(wrapper.vm.actions('L1').map((a) => a.label)).toEqual([
        'New Note',
        'New Task',
      ])
    })

    it('offers a call when there is a number and telephony is on', () => {
      const wrapper = mountPage()
      withRow(wrapper, { name: 'L1', mobile_no: '+441234' })
      expect(wrapper.vm.actions('L1').map((a) => a.label)).toContain('Make a Call')
    })

    it('hides the call when telephony is off', () => {
      // A dial action that cannot dial is worse than no action.
      api.callEnabled.value = false
      const wrapper = mountPage()
      withRow(wrapper, { name: 'L1', mobile_no: '+441234' })
      expect(wrapper.vm.actions('L1').map((a) => a.label)).not.toContain(
        'Make a Call',
      )
    })

    it('dials the row’s number', () => {
      const wrapper = mountPage()
      withRow(wrapper, { name: 'L1', mobile_no: '+441234' })
      wrapper.vm.actions('L1').find((a) => a.label === 'Make a Call').onClick()
      expect(api.makeCall).toHaveBeenCalledWith('+441234')
    })
  })

  describe('creating a note or task from a lead', () => {
    it('attaches the note to the lead', () => {
      const wrapper = mountPage()
      wrapper.vm.showNote('LEAD-1')
      expect(api.showModal).toHaveBeenCalledWith(
        expect.objectContaining({
          doctype: 'FCRM Note',
          defaults: { reference_doctype: 'CRM Lead', reference_docname: 'LEAD-1' },
        }),
      )
    })

    it('attaches the task to the lead', () => {
      const wrapper = mountPage()
      wrapper.vm.showTask('LEAD-1')
      expect(api.showModal).toHaveBeenCalledWith(
        expect.objectContaining({
          doctype: 'CRM Task',
          defaults: { reference_doctype: 'CRM Lead', reference_docname: 'LEAD-1' },
        }),
      )
    })

    it('ticks off onboarding for a first note', () => {
      const wrapper = mountPage()
      wrapper.vm.after({ doctype: 'FCRM Note' }, true)
      expect(api.onboarding).toHaveBeenCalledWith('create_first_note')
      expect(api.capture).toHaveBeenCalledWith('note_created')
    })

    it('ticks off onboarding for a first task', () => {
      const wrapper = mountPage()
      wrapper.vm.after({ doctype: 'CRM Task' }, true)
      expect(api.onboarding).toHaveBeenCalledWith('create_first_task')
      expect(api.capture).toHaveBeenCalledWith('task_created')
    })

    it('does not re-tick onboarding on an edit', () => {
      const wrapper = mountPage()
      wrapper.vm.after({ doctype: 'FCRM Note' }, false)
      expect(api.onboarding).not.toHaveBeenCalled()
      expect(api.capture).toHaveBeenCalledWith('note_updated')
    })
  })

  describe('creating a lead from a kanban column', () => {
    it('opens the lead modal', () => {
      const wrapper = mountPage()
      withLeads(wrapper, { data: [] })
      wrapper.vm.onNewClick({ column: { name: 'Open' } })
      expect(wrapper.vm.showLeadModal).toBe(true)
    })

    it('prefills the column’s field', () => {
      // Dragging "+" in the Open column should create an Open lead.
      const wrapper = mountPage()
      const leads = withLeads(wrapper, { data: [] })
      leads.params.column_field = 'status'
      wrapper.vm.onNewClick({ column: { name: 'Open' } })
      expect(wrapper.vm.defaults.status).toBe('Open')
    })

    it('prefills nothing outside kanban', () => {
      const wrapper = mountPage()
      withLeads(wrapper, { data: [] })
      wrapper.vm.onNewClick({ column: { name: 'Open' } })
      expect(wrapper.vm.defaults.status).toBeUndefined()
    })
  })
})
