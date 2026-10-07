const api = vi.hoisted(() => ({ capture: vi.fn() }))

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
    useOnboarding: () => ({ updateOnboardingStep: vi.fn() }),
  }
})

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

vi.mock('@/stores/organizations.js', () => ({
  organizationsStore: () => ({
    getOrganization: (name) =>
      name === 'Acme' ? { organization_logo: '/acme.png' } : undefined,
  }),
}))

vi.mock('@/stores/users', () => ({
  usersStore: () => ({
    getUser: (e) => ({ full_name: e, user_image: '' }),
    isManager: () => true,
  }),
}))

vi.mock('@/stores/global', () => ({
  globalStore: () => ({
    makeCall: vi.fn(),
    $dialog: vi.fn(),
    $socket: { on: vi.fn(), off: vi.fn() },
  }),
}))

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useRouter: () => ({ push: vi.fn() }),
    useRoute: () => ({ query: {}, params: {} }),
  }
})

import ContactsPage from '@/pages/Contacts.vue'
import { mountComponent } from '../helpers/mount'

const STUBS = {
  ViewBreadcrumbs: true, LayoutHeader: true, ViewControls: true,
  ContactsListView: true, GroupByView: true, EmptyState: true,
  ListPagination: true, ContactModal: true, Dropdown: true,
  Tooltip: true, StatusKpiBand: true,
}

const ROUTE = { params: {}, query: {} }

const mountPage = () =>
  mountComponent(ContactsPage, {
    global: { stubs: STUBS, mocks: { $route: ROUTE } },
  })

const withContacts = (wrapper, data) => {
  wrapper.vm.contacts = {
    data: { view_type: 'list', columns: [], rows: [], ...data },
    params: { filters: {} },
    reload: vi.fn(),
  }
  return wrapper.vm.contacts
}

const rowFor = (wrapper, contact, columns = []) => {
  withContacts(wrapper, { data: [contact], rows: Object.keys(contact), columns })
  return wrapper.vm.rows[0]
}

describe('Contacts page', () => {
  beforeEach(() => {
    api.capture.mockClear()
  })

  describe('which views render rows', () => {
    it('builds rows for the list view', () => {
      const wrapper = mountPage()
      withContacts(wrapper, { data: [{ name: 'C1' }], rows: ['name'] })
      expect(wrapper.vm.rows).toHaveLength(1)
    })

    it('builds rows for the group-by view', () => {
      const wrapper = mountPage()
      withContacts(wrapper, {
        view_type: 'group_by',
        data: [{ name: 'C1' }],
        rows: ['name'],
      })
      expect(wrapper.vm.rows).toHaveLength(1)
    })

    it('builds nothing for a view it does not handle', () => {
      // Kanban supplies a different shape; returning rows anyway would break it.
      const wrapper = mountPage()
      withContacts(wrapper, {
        view_type: 'kanban',
        data: [{ name: 'C1' }],
        rows: ['name'],
      })
      expect(wrapper.vm.rows).toEqual([])
    })

    it('builds nothing before anything loads', () => {
      expect(mountPage().vm.rows).toEqual([])
    })
  })

  describe('shaping a row', () => {
    it('pairs the name with its avatar', () => {
      const wrapper = mountPage()
      const row = rowFor(wrapper, {
        name: 'C1',
        full_name: 'Ada Lovelace',
        image: '/ada.png',
      })
      expect(row.full_name).toEqual({
        label: 'Ada Lovelace',
        image_label: 'Ada Lovelace',
        image: '/ada.png',
      })
    })

    it('pairs the company with its logo', () => {
      const wrapper = mountPage()
      const row = rowFor(wrapper, { name: 'C1', company_name: 'Acme' })
      expect(row.company_name).toEqual({ label: 'Acme', logo: '/acme.png' })
    })

    it('copes with a company the store has not loaded', () => {
      const wrapper = mountPage()
      const row = rowFor(wrapper, { name: 'C1', company_name: 'Unknown Ltd' })
      expect(row.company_name).toEqual({ label: 'Unknown Ltd', logo: undefined })
    })

    it('formats a currency column', () => {
      const wrapper = mountPage()
      const row = rowFor(wrapper, { name: 'C1', worth: 500 }, [
        { key: 'worth', type: 'Currency' },
      ])
      expect(row.worth).toBe('₹500')
    })

    it('turns modified into a timestamp cell', () => {
      const wrapper = mountPage()
      const row = rowFor(wrapper, { name: 'C1', modified: '2026-08-20 09:00:00' })
      expect(row.modified).toHaveProperty('label')
    })

    it('leaves an untyped column alone', () => {
      const wrapper = mountPage()
      expect(rowFor(wrapper, { name: 'C1', email_id: 'ada@x.com' }).email_id).toBe(
        'ada@x.com',
      )
    })
  })

  describe('columns', () => {
    it('right-aligns a trailing numeric column', () => {
      const wrapper = mountPage()
      withContacts(wrapper, {
        columns: [{ key: 'name', type: 'Data' }, { key: 'worth', type: 'Currency' }],
      })
      expect(wrapper.vm.columns.at(-1).align).toBe('right')
    })

    it('leaves a trailing text column alone', () => {
      const wrapper = mountPage()
      withContacts(wrapper, {
        columns: [{ key: 'worth', type: 'Currency' }, { key: 'name', type: 'Data' }],
      })
      expect(wrapper.vm.columns.at(-1).align).toBeUndefined()
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
      withContacts(wrapper, { data: [] })
      const updateFilter = withControls(wrapper)
      wrapper.vm.filterByStatus('Open')
      expect(updateFilter).toHaveBeenCalledWith({ status: 'Open' })
    })

    it('toggles it off when clicked again', () => {
      const wrapper = mountPage()
      const contacts = withContacts(wrapper, { data: [] })
      contacts.params.filters = { status: 'Open' }
      const updateFilter = withControls(wrapper)
      wrapper.vm.filterByStatus('Open')
      expect(updateFilter).toHaveBeenCalledWith({})
    })

    it('does nothing before the controls exist', () => {
      const wrapper = mountPage()
      wrapper.vm.viewControls = null
      expect(() => wrapper.vm.filterByStatus('Open')).not.toThrow()
    })
  })
})
