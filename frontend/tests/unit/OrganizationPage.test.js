const api = vi.hoisted(() => ({
  toast: null,
  call: vi.fn(),
  save: { submit: vi.fn() },
  openExternal: vi.fn(),
  docReload: vi.fn(),
  sectionsReload: vi.fn(),
  showModal: vi.fn(),
}))

// The address field opens the generic doctype modal; capture the payload so
// the defaults (typed title, Dynamic Link) can be asserted.
vi.mock('@/composables/doctypeModal', () => ({
  useDoctypeModal: () => ({ showModal: api.showModal }),
}))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  api.toast = { error: vi.fn(), success: vi.fn(), warning: vi.fn() }
  const inert = (options = {}) => {
    const resource = reactive({
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
    if (options.url?.includes('get_sidepanel_sections')) api.sections = resource
    return resource
  }
  return {
    ...actual,
    toast: api.toast,
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
    useTelemetry: () => ({ capture: vi.fn() }),
    useOnboarding: () => ({ updateOnboardingStep: vi.fn() }),
    usePageMeta: vi.fn(),
  }
})

const docs = vi.hoisted(() => ({ ref: null }))
vi.mock('@/data/document', async () => {
  const { reactive } = await import('vue')
  return {
    useDocument: () => {
      docs.ref = reactive({
        doc: {},
        save: api.save,
        reload: api.docReload,
      })
      return {
        document: docs.ref,
        triggerOnChange: vi.fn(),
        assignees: { reload: vi.fn(), data: [] },
        sections: { reload: api.sectionsReload, data: [] },
        permissions: { data: { permissions: { delete: true } } },
        scripts: { data: [] },
        triggerOnRender: vi.fn(),
      }
    },
  }
})

vi.mock('@/stores/statuses', () => ({
  statusesStore: () => ({
    getDealStatus: () => ({ type: 'Open', color: 'text-gray-600' }),
    statusOptions: () => [],
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
    $dialog: vi.fn(),
    $socket: { on: vi.fn(), off: vi.fn() },
    makeCall: vi.fn(),
  }),
}))

vi.mock('@/stores/settings', async () => {
  const { ref } = await import('vue')
  return {
    // timestampCell reads getSettings()._settings.doc, so it must exist.
    getSettings: () => ({
      brand: ref({ favicon: '/f.ico' }),
      _settings: { doc: {} },
    }),
    isTranslatable: () => false,
  }
})

vi.mock('@/stores/meta', async () => {
  const { ref } = await import('vue')
  return {
    getMeta: () => ({
      doctypeMeta: ref({ title_field: 'organization_name' }),
      getFormattedCurrency: (f, d) => `₹${d[f]}`,
      getFields: () => [],
      doctypesMeta: {},
    }),
  }
})

// The page imports it as `openWebsite as openExternalWebsite`, so the export
// to override is `openWebsite`.
vi.mock('@/utils', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, openWebsite: api.openExternal }
})

// utils/view.js calls viewsStore() at module scope, so importing it without
// an active Pinia throws before any test runs.
vi.mock('@/utils/view', () => ({ getView: () => null }))

vi.mock('@/composables/useBroadcast', () => ({
  useBroadcast: () => ({ on: vi.fn(), send: vi.fn(), off: vi.fn() }),
}))

const nav = vi.hoisted(() => ({ push: vi.fn() }))
const ROUTE = vi.hoisted(() => ({ query: {}, params: {}, hash: '' }))
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useRouter: () => nav, useRoute: () => ROUTE }
})

import OrganizationPage from '@/pages/Organization.vue'
import { mountComponent } from '../helpers/mount'
import { flushPromises } from '@vue/test-utils'

const STUBS = {
  LayoutHeader: true, Breadcrumbs: true, Activities: true,
  SidePanelLayout: true, Dropdown: true, Tooltip: true, Tabs: true,
  FileUploader: true, DeleteLinkedDocModal: true, ErrorPage: true,
  CustomActions: true, Avatar: true, Button: true, ListView: true,
  AddressModal: true,
}

const mountPage = () =>
  mountComponent(OrganizationPage, {
    props: { organizationId: 'ORG-1' },
    global: { stubs: STUBS, mocks: { $route: ROUTE } },
  })

describe('Organization page', () => {
  beforeEach(() => {
    api.call.mockReset().mockResolvedValue({ name: 'ok' })
    api.save.submit.mockClear()
    api.toast.error.mockClear()
    api.openExternal.mockClear()
    api.docReload.mockClear()
    api.sectionsReload.mockClear()
    api.showModal.mockClear()
    nav.push.mockClear()
  })

  describe('the website field', () => {
    it('strips the scheme for display', () => {
      const wrapper = mountPage()
      expect(wrapper.vm.website('https://acme.com')).toBe('acme.com')
    })

    it('strips a www prefix too', () => {
      const wrapper = mountPage()
      expect(wrapper.vm.website('https://www.acme.com')).toBe('acme.com')
    })

    it('handles a bare host', () => {
      const wrapper = mountPage()
      expect(wrapper.vm.website('acme.com')).toBe('acme.com')
    })

    it('handles http as well as https', () => {
      const wrapper = mountPage()
      expect(wrapper.vm.website('http://www.acme.com/about')).toBe(
        'acme.com/about',
      )
    })

    it('returns nothing for a blank value', () => {
      const wrapper = mountPage()
      expect(wrapper.vm.website('')).toBe('')
      expect(wrapper.vm.website(undefined)).toBeUndefined()
    })
  })

  describe('opening the website', () => {
    it('opens the stored address', () => {
      const wrapper = mountPage()
      wrapper.vm.organization.doc = { website: 'https://acme.com' }
      wrapper.vm.openWebsite()
      expect(api.openExternal).toHaveBeenCalledWith('https://acme.com')
    })

    it('says so when there is none rather than opening nothing', () => {
      const wrapper = mountPage()
      wrapper.vm.organization.doc = {}
      wrapper.vm.openWebsite()
      expect(api.openExternal).not.toHaveBeenCalled()
      expect(api.toast.error).toHaveBeenCalledWith('No Website Found')
    })
  })

  describe('renaming the organization', () => {
    it('renames the document rather than saving a field', async () => {
      // The organization name is the primary key, so a change is a rename.
      const wrapper = mountPage()
      wrapper.vm.beforeFieldChange({ organization_name: 'Acme Two' })
      expect(api.call).toHaveBeenCalledWith('frappe.client.rename_doc', {
        doctype: 'CRM Organization',
        old_name: 'ORG-1',
        new_name: 'Acme Two',
      })
      expect(api.save.submit).not.toHaveBeenCalled()
    })

    it('navigates to the new id once renamed', async () => {
      const wrapper = mountPage()
      wrapper.vm.beforeFieldChange({ organization_name: 'Acme Two' })
      await flushPromises()
      expect(nav.push).toHaveBeenCalledWith({
        name: 'Organization',
        params: { organizationId: 'Acme Two' },
      })
    })

    it('saves normally for any other field', () => {
      const wrapper = mountPage()
      wrapper.vm.beforeFieldChange({ industry: 'Software' })
      expect(api.save.submit).toHaveBeenCalled()
      expect(api.call).not.toHaveBeenCalled()
    })

    it('tolerates being handed nothing', () => {
      const wrapper = mountPage()
      expect(() => wrapper.vm.beforeFieldChange()).not.toThrow()
      expect(api.save.submit).toHaveBeenCalled()
    })
  })

  describe('linked deals', () => {
    it('shapes a deal row for the list', () => {
      const wrapper = mountPage()
      const row = wrapper.vm.getDealRowObject({
        name: 'DEAL-1',
        annual_revenue: 5000,
        status: 'Open',
        modified: '2026-08-20 09:00:00',
      })
      expect(row.name).toBe('DEAL-1')
      expect(row.annual_revenue).toBe('₹5000')
    })
  })

  describe('the address field in the side panel', () => {
    const addressSection = () => [
      { name: 'details', columns: [{ fields: [{ fieldname: 'address' }] }] },
    ]

    it('binds its handlers to the organization that is mounted now', () => {
      // The handlers used to be installed by the resource's `transform`. On a
      // cache hit frappe-ui returns the resource created by the FIRST
      // organization and discards the new options, so a second organization
      // reused handlers closed over the first one's document — creating an
      // address on org B wrote it onto org A, and B stayed empty. Rebuilding
      // them per instance in a computed is what fixes it.
      // One data object standing in for the shared cache entry that
      // frappe-ui hands to every Organization.
      const shared = addressSection()

      const first = mountPage()
      api.sections.data = shared
      void first.vm.parsedSections
      first.unmount()

      const second = mountPage()
      api.sections.data = shared
      const field = second.vm.parsedSections[0].columns[0].fields[0]
      field.create('Head Office', vi.fn())
      const { callbacks } = api.showModal.mock.calls.at(-1)[0]
      callbacks.afterInsert({ name: 'ADDRESS-B' })

      expect(second.vm.organization.doc.address).toBe('ADDRESS-B')
    })

    it('passes the typed text to the dialog and links it to the organization', () => {
      const wrapper = mountPage()
      api.sections.data = addressSection()
      wrapper.vm.parsedSections[0].columns[0].fields[0].create(
        'Head Office',
        vi.fn(),
      )
      const call = api.showModal.mock.calls.at(-1)[0]
      // The typed text used to be written straight onto doc.address — a
      // dangling link if the dialog was cancelled — and never reached the form.
      expect(call.defaults.address_title).toBe('Head Office')
      // Without the Dynamic Link, Frappe makes address_title mandatory and the
      // whole address ends up as the docname.
      expect(call.defaults.links[0]).toMatchObject({
        link_doctype: 'CRM Organization',
      })
    })

    it('does not mutate the shared cache entry', () => {
      const wrapper = mountPage()
      const source = addressSection()
      api.sections.data = source
      void wrapper.vm.parsedSections
      expect(source[0].columns[0].fields[0].create).toBeUndefined()
    })
  })
})
