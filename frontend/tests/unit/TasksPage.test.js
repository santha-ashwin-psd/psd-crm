const api = vi.hoisted(() => ({
  call: vi.fn(),
  capture: vi.fn(),
  onboarding: vi.fn(),
  showModal: vi.fn(),
  statusField: null,
}))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  // stores/settings.js builds an auto-fetching document resource at module
  // scope, so importing this page hits the network unless both factories are
  // neutered here.
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

vi.mock('@/stores/meta', async () => {
  const { ref } = await import('vue')
  return {
    getMeta: () => ({
      getFields: () => api.statusField,
      doctypeMeta: ref({}),
      doctypesMeta: {},
    }),
  }
})

vi.mock('@/stores/users', () => ({
  usersStore: () => ({
    getUser: () => ({ full_name: 'Ada', user_image: '' }),
    isManager: () => true,
  }),
}))

const nav = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useRouter: () => nav, useRoute: () => ({ query: {}, params: {} }) }
})

import TasksPage from '@/pages/Tasks.vue'
import { mountComponent } from '../helpers/mount'

const STUBS = {
  ViewBreadcrumbs: true, LayoutHeader: true, ViewControls: true,
  TasksListView: true, KanbanView: true, EmptyState: true,
  ListPagination: true, Dropdown: true, Tooltip: true, TaskStatusIcon: true,
  TaskPriorityIcon: true, UserAvatar: true, StatusKpiBand: true,
}

// The template reads the global `$route`, not the useRoute() composable.
const ROUTE = { params: {}, query: {} }

const mountPage = () =>
  mountComponent(TasksPage, {
    global: { stubs: STUBS, mocks: { $route: ROUTE } },
  })

const setUrl = (url) => window.history.replaceState(null, '', url)

// `rows` (the list of fieldnames to project) is what parseRows iterates;
// omitting it makes every row build throw.
const withTasks = (wrapper, data) => {
  wrapper.vm.tasks = {
    data: { view_type: 'list', columns: [], rows: [], ...data },
    params: { filters: {} },
    reload: vi.fn(),
  }
  return wrapper.vm.tasks
}

describe('Tasks page', () => {
  beforeEach(() => {
    api.call.mockReset().mockResolvedValue({})
    api.capture.mockClear()
    api.showModal.mockClear()
    nav.push.mockClear()
    api.statusField = null
    setUrl('/crm/tasks')
  })

  describe('the status band', () => {
    it('falls back to the standard statuses when meta is unavailable', () => {
      const wrapper = mountPage()
      expect(wrapper.vm.taskStatuses.map((s) => s.name)).toEqual([
        'Backlog', 'Todo', 'In Progress', 'Done', 'Canceled',
      ])
    })

    it('uses the doctype options when they exist', () => {
      api.statusField = [
        { fieldname: 'status', options: [{ value: 'Open' }, { value: 'Shut' }] },
      ]
      const wrapper = mountPage()
      expect(wrapper.vm.taskStatuses.map((s) => s.name)).toEqual(['Open', 'Shut'])
    })

    it('drops blank options', () => {
      api.statusField = [
        { fieldname: 'status', options: [{ value: '' }, { value: 'Todo' }] },
      ]
      const wrapper = mountPage()
      expect(wrapper.vm.taskStatuses.map((s) => s.name)).toEqual(['Todo'])
    })

    it('colours each known status and greys the rest', () => {
      api.statusField = [
        { fieldname: 'status', options: [{ value: 'Done' }, { value: 'Weird' }] },
      ]
      const wrapper = mountPage()
      const byName = Object.fromEntries(
        wrapper.vm.taskStatuses.map((s) => [s.name, s.color]),
      )
      expect(byName.Done).toBe('!text-green-600')
      expect(byName.Weird).toBe('!text-gray-600')
    })

    it('is hidden only when there is nothing to show and no filter', () => {
      const wrapper = mountPage()
      withTasks(wrapper, { data: [] })
      expect(wrapper.vm.showStatusBand).toBe(false)
    })

    it('stays visible when a status filter is active but empty', () => {
      // Otherwise the band vanishes and the user cannot clear their own filter.
      const wrapper = mountPage()
      const tasks = withTasks(wrapper, { data: [] })
      tasks.params.filters = { status: 'Done' }
      expect(wrapper.vm.showStatusBand).toBe(true)
    })

    it('stays visible before anything has loaded', () => {
      expect(mountPage().vm.showStatusBand).toBe(true)
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
      withTasks(wrapper, { data: [] })
      const updateFilter = withControls(wrapper)
      wrapper.vm.filterByStatus('Done')
      expect(updateFilter).toHaveBeenCalledWith({ status: 'Done' })
    })

    it('clears it when the same one is clicked again', () => {
      // The band doubles as a toggle.
      const wrapper = mountPage()
      const tasks = withTasks(wrapper, { data: [] })
      tasks.params.filters = { status: 'Done' }
      const updateFilter = withControls(wrapper)
      wrapper.vm.filterByStatus('Done')
      expect(updateFilter).toHaveBeenCalledWith({})
    })

    it('keeps other filters intact', () => {
      const wrapper = mountPage()
      const tasks = withTasks(wrapper, { data: [] })
      tasks.params.filters = { priority: 'High' }
      const updateFilter = withControls(wrapper)
      wrapper.vm.filterByStatus('Done')
      expect(updateFilter).toHaveBeenCalledWith({ priority: 'High', status: 'Done' })
    })

    it('clears the status when given nothing', () => {
      const wrapper = mountPage()
      const tasks = withTasks(wrapper, { data: [] })
      tasks.params.filters = { status: 'Done', priority: 'High' }
      const updateFilter = withControls(wrapper)
      wrapper.vm.filterByStatus(null)
      expect(updateFilter).toHaveBeenCalledWith({ priority: 'High' })
    })

    it('does nothing before the controls are mounted', () => {
      const wrapper = mountPage()
      wrapper.vm.viewControls = null
      expect(() => wrapper.vm.filterByStatus('Done')).not.toThrow()
    })
  })

  describe('columns', () => {
    it('right-aligns a trailing numeric column', () => {
      const wrapper = mountPage()
      withTasks(wrapper, {
        columns: [{ key: 'title', type: 'Data' }, { key: 'amount', type: 'Currency' }],
      })
      expect(wrapper.vm.columns.at(-1).align).toBe('right')
    })

    it('leaves a trailing text column alone', () => {
      // Right-aligning a name column desyncs it from its header.
      const wrapper = mountPage()
      withTasks(wrapper, {
        columns: [{ key: 'amount', type: 'Currency' }, { key: 'title', type: 'Data' }],
      })
      expect(wrapper.vm.columns.at(-1).align).toBeUndefined()
    })

    it('does not align a numeric column that is not last', () => {
      const wrapper = mountPage()
      withTasks(wrapper, {
        columns: [{ key: 'amount', type: 'Currency' }, { key: 'title', type: 'Data' }],
      })
      expect(wrapper.vm.columns[0].align).toBeUndefined()
    })

    it('is empty before anything loads', () => {
      expect(mountPage().vm.columns).toEqual([])
    })
  })

  describe('opening a task', () => {
    it('opens the task editor', () => {
      const wrapper = mountPage()
      wrapper.vm.showTask('TASK-1')
      expect(api.showModal).toHaveBeenCalledWith(
        expect.objectContaining({ doctype: 'CRM Task', name: 'TASK-1' }),
      )
    })
  })

  describe('deleting', () => {
    it('deletes the task', async () => {
      const wrapper = mountPage()
      withTasks(wrapper, { data: [] })
      await wrapper.vm.deleteTask('TASK-1')
      expect(api.call).toHaveBeenCalledWith('frappe.client.delete', {
        doctype: 'CRM Task',
        name: 'TASK-1',
      })
    })
  })

  describe('jumping to the linked record', () => {
    it('opens a deal by its deal id', () => {
      const wrapper = mountPage()
      wrapper.vm.redirect('CRM Deal', 'DEAL-1')
      expect(nav.push).toHaveBeenCalledWith({
        name: 'Deal',
        params: { dealId: 'DEAL-1' },
      })
    })

    it('opens anything else as a lead', () => {
      const wrapper = mountPage()
      wrapper.vm.redirect('CRM Lead', 'LEAD-1')
      expect(nav.push).toHaveBeenCalledWith({
        name: 'Lead',
        params: { leadId: 'LEAD-1' },
      })
    })

    it('does nothing without a record', () => {
      const wrapper = mountPage()
      wrapper.vm.redirect('CRM Deal', null)
      expect(nav.push).not.toHaveBeenCalled()
    })
  })

  describe('opening a task from a deep link', () => {
    it('opens the task named in ?open', () => {
      // Runs from inside the `rows` computed, so its readiness guard must not
      // read `rows` itself — that re-enters the computed and never fires.
      setUrl('/crm/tasks?open=12')
      const wrapper = mountPage()
      withTasks(wrapper, { data: [{ name: 12 }] })
      void wrapper.vm.rows
      expect(api.showModal).toHaveBeenCalledWith(
        expect.objectContaining({ doctype: 'CRM Task', name: 12 }),
      )
    })

    it('waits until the list has data', () => {
      setUrl('/crm/tasks?open=12')
      const wrapper = mountPage()
      withTasks(wrapper, { data: [] })
      void wrapper.vm.rows
      expect(api.showModal).not.toHaveBeenCalled()
    })

    it('keeps the rest of the query string', () => {
      // ?view= selects the saved view; dropping it silently resets the view.
      setUrl('/crm/tasks?view=my-view&open=12')
      const wrapper = mountPage()
      withTasks(wrapper, { data: [{ name: 12 }] })
      void wrapper.vm.rows
      expect(window.location.search).toContain('view=my-view')
      expect(window.location.search).not.toContain('open=')
    })

    it('does nothing without the parameter', () => {
      setUrl('/crm/tasks?view=my-view')
      const wrapper = mountPage()
      withTasks(wrapper, { data: [{ name: 12 }] })
      void wrapper.vm.rows
      expect(api.showModal).not.toHaveBeenCalled()
      expect(window.location.search).toContain('view=my-view')
    })
  })
})
