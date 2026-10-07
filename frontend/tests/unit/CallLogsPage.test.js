const api = vi.hoisted(() => ({
  createResource: vi.fn(),
  capture: vi.fn(),
  showModal: vi.fn(),
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
  api.createResource.mockImplementation(inert)
  return {
    ...actual,
    call: vi.fn().mockResolvedValue(0),
    createResource: api.createResource,
    createDocumentResource: inert,
    createListResource: inert,
  }
})

vi.mock('frappe-ui/frappe', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useTelemetry: () => ({ capture: api.capture }),
    useOnboarding: () => ({
      updateOnboardingStep: vi.fn(),
      isOnboardingStepsCompleted: false,
    }),
    usePageMeta: vi.fn(),
  }
})

vi.mock('@/composables/doctypeModal', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useDoctypeModal: () => ({ ...actual.useDoctypeModal(), showModal: api.showModal }),
  }
})

// `getCallLogDetail` is exercised for real, so only the two module-scope
// network touches it makes are faked: the meta store and the settings doc
// that `timestampCell` reads.
vi.mock('@/stores/meta', async () => {
  const { ref } = await import('vue')
  return {
    getMeta: () => ({
      getFormattedPercent: (field, doc) => `${doc[field]}%`,
      getFormattedFloat: (field, doc) => `${doc[field]}.00`,
      getFormattedCurrency: (field, doc) => `$ ${doc[field]}`,
      getFields: () => [],
      doctypeMeta: ref({}),
      doctypesMeta: {},
    }),
  }
})

vi.mock('@/stores/settings', async () => {
  const { ref } = await import('vue')
  return {
    getSettings: () => ({
      brand: ref({ favicon: '/f.ico' }),
      _settings: { doc: {} },
    }),
  }
})

vi.mock('@/stores/views', () => ({
  viewsStore: () => ({
    getView: () => null,
    views: { data: [] },
    reload: vi.fn(),
    getPinnedViews: () => [],
    getPublicViews: () => [],
    getSavedViews: () => [],
  }),
}))

vi.mock('@/utils/view', () => ({ getView: () => null }))

vi.mock('@/stores/global', () => ({
  globalStore: () => ({
    makeCall: vi.fn(),
    $dialog: vi.fn(),
    $socket: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
  }),
}))

vi.mock('@/stores/users', () => ({
  usersStore: () => ({
    getUser: (e) => ({ full_name: e, user_image: '' }),
    isManager: () => true,
  }),
}))

vi.mock('@/stores/organizations', () => ({
  organizationsStore: () => ({ getOrganization: () => undefined }),
}))

vi.mock('@/stores/session', () => ({
  sessionStore: () => ({ user: 'ada@x.com', isLoggedIn: true }),
}))

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }))
const ROUTE = vi.hoisted(() => ({
  query: {},
  params: {},
  hash: '',
  name: 'Call Logs',
  path: '/telephony',
}))
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useRouter: () => nav, useRoute: () => ROUTE }
})

import CallLogsPage from '@/pages/CallLogs.vue'
import { pageCreateAction } from '@/composables/pageActions'
import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'

const STUBS = {
  LayoutHeader: true, ViewBreadcrumbs: true, CustomActions: true,
  CallLogDetailModal: true, Dropdown: true, Tooltip: true,
  // Array-form props so the number-valued v-models below do not trip the
  // Boolean type check an auto-stub infers for them.
  ViewControls: {
    props: ['modelValue', 'loadMore', 'resizeColumn', 'updatedPageCount', 'doctype'],
    template: '<div class="stub-controls" />',
  },
  StatusKpiBand: {
    props: ['show', 'statuses', 'activeStatus', 'totalLabel', 'maxStatuses'],
    template: '<div class="stub-band" />',
  },
  CallLogsListView: { template: '<div class="stub-list" />' },
  EmptyState: { template: '<div class="stub-empty" />' },
}

const mountPage = () =>
  mountComponent(CallLogsPage, {
    global: { stubs: STUBS, mocks: { $route: ROUTE } },
  })

let replaceState

/** Points the fake browser at a URL without recording it as a page call. */
const setUrl = (url) => {
  window.history.replaceState(null, '', url)
  replaceState.mockClear()
}

const withLogs = (wrapper, data) => {
  wrapper.vm.callLogs = {
    data: { view_type: 'list', data: [], rows: [], columns: [], ...data },
    params: { filters: {} },
    reload: vi.fn(),
  }
  return wrapper.vm.callLogs
}

const rowFor = (wrapper, log, columns = []) => {
  withLogs(wrapper, { data: [log], rows: Object.keys(log), columns })
  return wrapper.vm.rows[0]
}

describe('Call Logs page', () => {
  beforeEach(() => {
    api.createResource.mockClear()
    api.capture.mockClear()
    api.showModal.mockClear()
    // Spied after the URL is set so setUrl's own write is never asserted on.
    replaceState = vi.spyOn(window.history, 'replaceState')
    setUrl('/telephony')
  })

  afterEach(() => {
    replaceState.mockRestore()
  })

  describe('which views produce rows', () => {
    it('builds rows for the list view', () => {
      const wrapper = mountPage()
      withLogs(wrapper, { data: [{ name: 'CALL-1' }], rows: ['name'] })
      expect(wrapper.vm.rows).toHaveLength(1)
    })

    it('builds rows for the group-by view', () => {
      const wrapper = mountPage()
      withLogs(wrapper, {
        view_type: 'group_by',
        data: [{ name: 'CALL-1' }],
        rows: ['name'],
      })
      expect(wrapper.vm.rows).toHaveLength(1)
    })

    it('builds nothing for a view it does not handle', () => {
      // Kanban hands over a different shape; rows here would break its renderer.
      const wrapper = mountPage()
      withLogs(wrapper, {
        view_type: 'kanban',
        data: [{ name: 'CALL-1' }],
        rows: ['name'],
      })
      expect(wrapper.vm.rows).toEqual([])
    })

    it('builds nothing before the list has loaded', () => {
      expect(mountPage().vm.rows).toEqual([])
    })
  })

  describe('shaping a call log row', () => {
    it('renders the duration with a clock icon', () => {
      // The `duration` cell is built from the server-formatted `_duration`,
      // not from the raw seconds the field itself holds.
      const wrapper = mountPage()
      withLogs(wrapper, {
        data: [{ name: 'CALL-1', duration: 150, _duration: '2m 30s' }],
        rows: ['duration'],
      })
      expect(wrapper.vm.rows[0].duration).toEqual({
        label: '2m 30s',
        icon: 'clock',
      })
    })

    it('points the arrow inward for an incoming call', () => {
      const wrapper = mountPage()
      withLogs(wrapper, {
        data: [{ name: 'CALL-1', type: 'Incoming' }],
        rows: ['type'],
      })
      expect(wrapper.vm.rows[0].type).toEqual({
        label: 'Incoming',
        icon: 'phone-incoming',
      })
    })

    it('points the arrow outward for anything else', () => {
      const wrapper = mountPage()
      withLogs(wrapper, {
        data: [{ name: 'CALL-1', type: 'Outgoing' }],
        rows: ['type'],
      })
      expect(wrapper.vm.rows[0].type).toEqual({
        label: 'Outgoing',
        icon: 'phone-outgoing',
      })
    })

    it('translates the raw status into its display label and colour', () => {
      // "No Answer" is what the telephony provider sends; users read "Missed".
      const wrapper = mountPage()
      withLogs(wrapper, {
        data: [{ name: 'CALL-1', status: 'No Answer' }],
        rows: ['status'],
      })
      expect(wrapper.vm.rows[0].status).toEqual({
        label: 'Missed Call',
        color: 'red',
      })
    })

    it('pairs the caller with their avatar', () => {
      const wrapper = mountPage()
      withLogs(wrapper, {
        data: [{ name: 'CALL-1', _caller: { label: 'Ada', image: '/ada.png' } }],
        rows: ['caller'],
      })
      expect(wrapper.vm.rows[0].caller).toEqual({
        label: 'Ada',
        image: '/ada.png',
      })
    })

    it('turns creation into a timestamp cell', () => {
      const wrapper = mountPage()
      const row = rowFor(wrapper, {
        name: 'CALL-1',
        creation: '2026-03-14 09:00:00',
      })
      expect(row.creation).toHaveProperty('label')
      expect(row.creation).toHaveProperty('timeAgo')
    })

    it('formats a column by the type the view declares', () => {
      const wrapper = mountPage()
      const row = rowFor(wrapper, { name: 'CALL-1', cost: 42 }, [
        { key: 'cost', type: 'Currency' },
      ])
      expect(row.cost).toBe('$ 42')
    })

    it('leaves an untyped column exactly as the server sent it', () => {
      const wrapper = mountPage()
      const row = rowFor(wrapper, { name: 'CALL-1', id: 'abc-123' })
      expect(row.id).toBe('abc-123')
    })
  })

  describe('columns', () => {
    it('right-aligns a trailing numeric column', () => {
      const wrapper = mountPage()
      withLogs(wrapper, {
        columns: [
          { key: 'type', type: 'Data' },
          { key: 'cost', type: 'Currency' },
        ],
      })
      expect(wrapper.vm.columns.at(-1).align).toBe('right')
    })

    it('leaves a trailing text column alone', () => {
      // Avatar/name columns must stay left or the header stops lining up.
      const wrapper = mountPage()
      withLogs(wrapper, {
        columns: [
          { key: 'cost', type: 'Currency' },
          { key: 'caller', type: 'Data' },
        ],
      })
      expect(wrapper.vm.columns.at(-1).align).toBeUndefined()
    })

    it('only touches the last column', () => {
      const wrapper = mountPage()
      withLogs(wrapper, {
        columns: [
          { key: 'cost', type: 'Currency' },
          { key: 'duration', type: 'Int' },
        ],
      })
      expect(wrapper.vm.columns[0].align).toBeUndefined()
    })

    it('copes with a list that has no columns yet', () => {
      expect(mountPage().vm.columns).toEqual([])
    })
  })

  describe('the status band', () => {
    it('reports the status currently filtered on', () => {
      const wrapper = mountPage()
      const logs = withLogs(wrapper, {})
      logs.params.filters = { status: 'Completed' }
      expect(wrapper.vm.activeStatus).toBe('Completed')
    })

    it('reports no active status when nothing is filtered', () => {
      const wrapper = mountPage()
      withLogs(wrapper, {})
      expect(wrapper.vm.activeStatus).toBeNull()
    })

    it('hides itself when the unfiltered list is genuinely empty', () => {
      const wrapper = mountPage()
      withLogs(wrapper, { data: [] })
      expect(wrapper.vm.showStatusBand).toBe(false)
    })

    it('stays visible on an empty result the user filtered into', () => {
      // Otherwise the band vanishes and there is no way to clear the filter.
      const wrapper = mountPage()
      const logs = withLogs(wrapper, { data: [] })
      logs.params.filters = { status: 'Busy' }
      expect(wrapper.vm.showStatusBand).toBe(true)
    })

    it('stays visible while the list is still loading', () => {
      expect(mountPage().vm.showStatusBand).toBe(true)
    })
  })

  describe('filtering by status', () => {
    const withControls = (wrapper) => {
      const updateFilter = vi.fn()
      wrapper.vm.viewControls = { updateFilter }
      return updateFilter
    }

    it('applies the status that was clicked', () => {
      const wrapper = mountPage()
      withLogs(wrapper, {})
      const updateFilter = withControls(wrapper)
      wrapper.vm.filterByStatus('Completed')
      expect(updateFilter).toHaveBeenCalledWith({ status: 'Completed' })
    })

    it('clears the status when the same card is clicked again', () => {
      const wrapper = mountPage()
      const logs = withLogs(wrapper, {})
      logs.params.filters = { status: 'Completed' }
      const updateFilter = withControls(wrapper)
      wrapper.vm.filterByStatus('Completed')
      expect(updateFilter).toHaveBeenCalledWith({})
    })

    it('clears the status when the Total card is clicked', () => {
      const wrapper = mountPage()
      const logs = withLogs(wrapper, {})
      logs.params.filters = { status: 'Busy', type: 'Incoming' }
      const updateFilter = withControls(wrapper)
      wrapper.vm.filterByStatus(null)
      expect(updateFilter).toHaveBeenCalledWith({ type: 'Incoming' })
    })

    it('keeps the other filters when swapping status', () => {
      const wrapper = mountPage()
      const logs = withLogs(wrapper, {})
      logs.params.filters = { status: 'Busy', type: 'Incoming' }
      const updateFilter = withControls(wrapper)
      wrapper.vm.filterByStatus('Completed')
      expect(updateFilter).toHaveBeenCalledWith({
        status: 'Completed',
        type: 'Incoming',
      })
    })

    it('does not mutate the live filter object in place', () => {
      const wrapper = mountPage()
      const logs = withLogs(wrapper, {})
      logs.params.filters = { status: 'Busy' }
      withControls(wrapper)
      wrapper.vm.filterByStatus('Busy')
      expect(logs.params.filters).toEqual({ status: 'Busy' })
    })

    it('does nothing before the view controls exist', () => {
      const wrapper = mountPage()
      wrapper.vm.viewControls = null
      expect(() => wrapper.vm.filterByStatus('Completed')).not.toThrow()
    })
  })

  describe('what the page shows', () => {
    it('shows the table once there are rows', async () => {
      const wrapper = mountPage()
      withLogs(wrapper, { data: [{ name: 'CALL-1' }], rows: ['name'] })
      await nextTick()
      expect(wrapper.find('.stub-list').exists()).toBe(true)
      expect(wrapper.find('.stub-empty').exists()).toBe(false)
    })

    it('shows the empty state once the list comes back with nothing', async () => {
      const wrapper = mountPage()
      withLogs(wrapper, { data: [] })
      await nextTick()
      expect(wrapper.find('.stub-empty').exists()).toBe(true)
      expect(wrapper.find('.stub-list').exists()).toBe(false)
    })

    it('shows neither while the first load is still in flight', async () => {
      const wrapper = mountPage()
      await nextTick()
      expect(wrapper.find('.stub-empty').exists()).toBe(false)
      expect(wrapper.find('.stub-list').exists()).toBe(false)
    })

    it('hands the band the four call statuses it surfaces', () => {
      const wrapper = mountPage()
      const band = wrapper.findComponent(STUBS.StatusKpiBand)
      expect(band.props('statuses').map((s) => s.name)).toEqual([
        'Completed',
        'In Progress',
        'No Answer',
        'Busy',
      ])
      // "No Answer"/"Busy" are provider wording; the cards read Missed/Declined.
      expect(band.props('statuses').map((s) => s.label)).toContain('Missed')
      expect(band.props('statuses').map((s) => s.label)).toContain('Declined')
    })
  })

  describe('opening a call log', () => {
    it('opens the detail modal and fetches that log', () => {
      const wrapper = mountPage()
      wrapper.vm.showCallLog('CALL-1')
      expect(wrapper.vm.showCallLogDetailModal).toBe(true)
      expect(api.createResource).toHaveBeenCalledWith({
        url: 'xbr_crm.fcrm.doctype.crm_call_log.crm_call_log.get_call_log',
        params: { name: 'CALL-1' },
        cache: ['call_log', 'CALL-1'],
        auto: true,
      })
    })

    it('caches per log so two logs do not share a response', () => {
      const wrapper = mountPage()
      wrapper.vm.showCallLog('CALL-1')
      wrapper.vm.showCallLog('CALL-2')
      const caches = api.createResource.mock.calls.map(([o]) => o.cache)
      expect(caches).toContainEqual(['call_log', 'CALL-1'])
      expect(caches).toContainEqual(['call_log', 'CALL-2'])
    })
  })

  describe('creating a call log', () => {
    it('is wired to the header create button while the page is open', () => {
      const wrapper = mountPage()
      expect(pageCreateAction.value).toBe(wrapper.vm.createCallLog)
    })

    it('releases the header create button when the page goes away', () => {
      // Otherwise +Create on the next page would still log a call.
      mountPage().unmount()
      expect(pageCreateAction.value).toBeNull()
    })

    it('opens a blank Call Log form', () => {
      const wrapper = mountPage()
      wrapper.vm.createCallLog()
      expect(api.showModal).toHaveBeenCalledWith(
        expect.objectContaining({
          doctype: 'CRM Call Log',
          title: 'Call Log',
        }),
      )
    })

    it('refreshes the list and reports the new log', () => {
      const wrapper = mountPage()
      const logs = withLogs(wrapper, {})
      wrapper.vm.createCallLog()
      api.showModal.mock.calls[0][0].callbacks.afterInsert()
      expect(logs.reload).toHaveBeenCalled()
      expect(api.capture).toHaveBeenCalledWith('call_log_created')
    })
  })

  describe('the ?open deep link', () => {
    it('opens the log named in the query string on mount', () => {
      setUrl('/telephony?open=CALL-1')
      const wrapper = mountPage()
      expect(wrapper.vm.showCallLogDetailModal).toBe(true)
      expect(api.createResource).toHaveBeenCalledWith(
        expect.objectContaining({ params: { name: 'CALL-1' } }),
      )
    })

    it('stays shut when there is no open parameter', () => {
      setUrl('/telephony?view=all')
      const wrapper = mountPage()
      expect(wrapper.vm.showCallLogDetailModal).toBe(false)
      expect(replaceState).not.toHaveBeenCalled()
    })

    it('takes open out of the address bar so a refresh does not reopen it', () => {
      setUrl('/telephony?open=CALL-1')
      mountPage()
      expect(window.location.search).not.toContain('open=')
    })

    it('keeps the rest of the query string when it drops open', () => {
      // ?view= selects the saved view; wiping it silently resets the user's view.
      setUrl('/telephony?open=CALL-1&view=all')
      mountPage()
      expect(replaceState).toHaveBeenCalledWith(null, '', '/telephony?view=all')
      expect(window.location.search).toContain('view=all')
      expect(window.location.search).not.toContain('open=')
    })

    it('keeps every surviving parameter, not just the first', () => {
      setUrl('/telephony?view=all&open=CALL-1&sort=desc')
      mountPage()
      expect(window.location.search).toContain('view=all')
      expect(window.location.search).toContain('sort=desc')
      expect(window.location.search).not.toContain('open=')
    })

    it('leaves no dangling question mark when open was the only parameter', () => {
      setUrl('/telephony?open=CALL-1')
      mountPage()
      expect(replaceState).toHaveBeenCalledWith(null, '', '/telephony')
      expect(window.location.search).toBe('')
    })

    it('preserves the path it was opened on', () => {
      setUrl('/crm/telephony/logs?open=CALL-1')
      mountPage()
      expect(window.location.pathname).toBe('/crm/telephony/logs')
    })
  })
})
