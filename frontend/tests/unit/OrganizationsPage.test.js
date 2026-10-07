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
    useTelemetry: () => ({ capture: vi.fn() }),
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

import OrganizationsPage from '@/pages/Organizations.vue'
import { mountComponent } from '../helpers/mount'

const STUBS = {
  ViewBreadcrumbs: true, LayoutHeader: true, ViewControls: true,
  OrganizationsListView: true, GroupByView: true, EmptyState: true,
  ListPagination: true, OrganizationModal: true, Dropdown: true,
  Tooltip: true, StatusKpiBand: true,
}

const ROUTE = { params: {}, query: {} }

const mountPage = () =>
  mountComponent(OrganizationsPage, {
    global: { stubs: STUBS, mocks: { $route: ROUTE } },
  })

const withOrgs = (wrapper, data) => {
  wrapper.vm.organizations = {
    data: { view_type: 'list', columns: [], rows: [], ...data },
    params: { filters: {} },
    reload: vi.fn(),
  }
  return wrapper.vm.organizations
}

const rowFor = (wrapper, org, columns = []) => {
  withOrgs(wrapper, { data: [org], rows: Object.keys(org), columns })
  return wrapper.vm.rows[0]
}

describe('Organizations page', () => {
  describe('which views render rows', () => {
    it('builds rows for the list view', () => {
      const wrapper = mountPage()
      withOrgs(wrapper, { data: [{ name: 'O1' }], rows: ['name'] })
      expect(wrapper.vm.rows).toHaveLength(1)
    })

    it('builds rows for the group-by view', () => {
      const wrapper = mountPage()
      withOrgs(wrapper, {
        view_type: 'group_by',
        data: [{ name: 'O1' }],
        rows: ['name'],
      })
      expect(wrapper.vm.rows).toHaveLength(1)
    })

    it('builds nothing for a view it does not handle', () => {
      const wrapper = mountPage()
      withOrgs(wrapper, {
        view_type: 'kanban',
        data: [{ name: 'O1' }],
        rows: ['name'],
      })
      expect(wrapper.vm.rows).toEqual([])
    })

    it('builds nothing before anything loads', () => {
      expect(mountPage().vm.rows).toEqual([])
    })
  })

  describe('shaping a row', () => {
    it('pairs the name with its logo', () => {
      const wrapper = mountPage()
      const row = rowFor(wrapper, {
        name: 'O1',
        organization_name: 'Acme Ltd',
        organization_logo: '/acme.png',
      })
      expect(row.organization_name).toMatchObject({ label: 'Acme Ltd' })
    })

    it('normalises a website into a link', () => {
      const wrapper = mountPage()
      const row = rowFor(wrapper, { name: 'O1', website: 'acme.com' })
      expect(row.website).toContain('acme.com')
    })

    it('formats a currency column', () => {
      const wrapper = mountPage()
      const row = rowFor(wrapper, { name: 'O1', annual_revenue: 900 }, [
        { key: 'annual_revenue', type: 'Currency' },
      ])
      expect(row.annual_revenue).toBe('₹900')
    })

    it('formats a percent column', () => {
      const wrapper = mountPage()
      const row = rowFor(wrapper, { name: 'O1', growth: 12 }, [
        { key: 'growth', type: 'Percent' },
      ])
      expect(row.growth).toBe('12%')
    })

    it('turns creation into a timestamp cell', () => {
      const wrapper = mountPage()
      const row = rowFor(wrapper, { name: 'O1', creation: '2026-08-20 09:00:00' })
      expect(row.creation).toHaveProperty('label')
    })

    it('leaves an untyped column alone', () => {
      const wrapper = mountPage()
      expect(rowFor(wrapper, { name: 'O1', industry: 'Software' }).industry).toBe(
        'Software',
      )
    })
  })

  describe('columns', () => {
    it('right-aligns a trailing numeric column', () => {
      const wrapper = mountPage()
      withOrgs(wrapper, {
        columns: [
          { key: 'organization_name', type: 'Data' },
          { key: 'annual_revenue', type: 'Currency' },
        ],
      })
      expect(wrapper.vm.columns.at(-1).align).toBe('right')
    })

    it('leaves a trailing text column alone', () => {
      const wrapper = mountPage()
      withOrgs(wrapper, {
        columns: [
          { key: 'annual_revenue', type: 'Currency' },
          { key: 'organization_name', type: 'Data' },
        ],
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
      withOrgs(wrapper, { data: [] })
      const updateFilter = withControls(wrapper)
      wrapper.vm.filterByStatus('Active')
      expect(updateFilter).toHaveBeenCalledWith({ status: 'Active' })
    })

    it('toggles it off when clicked again', () => {
      const wrapper = mountPage()
      const orgs = withOrgs(wrapper, { data: [] })
      orgs.params.filters = { status: 'Active' }
      const updateFilter = withControls(wrapper)
      wrapper.vm.filterByStatus('Active')
      expect(updateFilter).toHaveBeenCalledWith({})
    })

    it('does nothing before the controls exist', () => {
      const wrapper = mountPage()
      wrapper.vm.viewControls = null
      expect(() => wrapper.vm.filterByStatus('Active')).not.toThrow()
    })
  })
})
