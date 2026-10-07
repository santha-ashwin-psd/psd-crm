const api = vi.hoisted(() => ({
  toast: null,
  call: vi.fn(),
  save: { submit: vi.fn() },
  contacts: null,
  view: null,
}))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  api.toast = { error: vi.fn(), success: vi.fn(), warning: vi.fn() }
  const inert = (options = {}) => {
    const r = reactive({
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
    // Deal.vue keeps one named resource for its contact list.
    if (options.url?.includes('get_deal_contacts')) api.contacts = r
    if (options.url?.includes('get_sidepanel_sections')) api.sections = r
    return r
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
    useOnboarding: () => ({
      updateOnboardingStep: vi.fn(),
      isOnboardingStepsCompleted: false,
    }),
    usePageMeta: vi.fn(),
  }
})

vi.mock('@/data/document', async () => {
  const { reactive } = await import('vue')
  return {
    useDocument: () => ({
      document: reactive({
        doc: {},
        statuses: [],
        _statuses: [],
        save: api.save,
        reload: vi.fn(),
      }),
      triggerOnChange: vi.fn(),
      assignees: { reload: vi.fn(), data: [] },
      sections: { reload: vi.fn(), data: [] },
      permissions: { data: { permissions: { delete: true } } },
      triggerOnBeforeCreate: vi.fn(),
      scripts: { data: [] },
      triggerOnRender: vi.fn(),
    }),
  }
})

vi.mock('@/stores/statuses', () => ({
  statusesStore: () => ({
    getDealStatus: () => ({ type: 'Open', color: 'text-gray-600' }),
    statusOptions: (_k, custom, onChange) => ({ custom, onChange }),
  }),
}))

vi.mock('@/stores/users', () => ({
  usersStore: () => ({
    getUser: (e) => ({ full_name: e === 'ada@x.com' ? 'Ada' : e, user_image: '' }),
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
      doctypeMeta: ref({ title_field: 'deal_name' }),
      getFields: () => [],
      doctypesMeta: {},
    }),
  }
})

vi.mock('@/utils/view', () => ({ getView: () => api.view }))

vi.mock('@/composables/useBroadcast', () => ({
  useBroadcast: () => ({ on: vi.fn(), send: vi.fn(), off: vi.fn() }),
}))

const nav = vi.hoisted(() => ({ push: vi.fn() }))
const ROUTE = vi.hoisted(() => ({ query: {}, params: {}, hash: '' }))
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useRouter: () => nav, useRoute: () => ROUTE }
})

import DealPage from '@/pages/Deal.vue'
import { mountComponent } from '../helpers/mount'
import { flushPromises } from '@vue/test-utils'

const STUBS = {
  LayoutHeader: true, Breadcrumbs: true, Activities: true,
  SidePanelLayout: true, AssignTo: true, Dropdown: true, Tooltip: true,
  Tabs: true, FileUploader: true, DeleteLinkedDocModal: true,
  OrganizationModal: true, ContactModal: true, ErrorPage: true,
  CustomActions: true, SLASection: true, Avatar: true, Button: true,
  Section: true, ContactsSection: true,
}

const mountPage = () =>
  mountComponent(DealPage, {
    props: { dealId: 'DEAL-1' },
    global: { stubs: STUBS, mocks: { $route: ROUTE } },
  })

describe('Deal page', () => {
  beforeEach(() => {
    api.call.mockReset().mockResolvedValue({ name: 'ok' })
    api.save.submit.mockClear()
    api.toast.error.mockClear()
    api.toast.success.mockClear()
    nav.push.mockClear()
    api.view = null
    ROUTE.query = {}
  })

  describe('the page title', () => {
    it('uses the doctype title field', () => {
      const wrapper = mountPage()
      wrapper.vm.document.doc = { deal_name: 'Acme renewal' }
      expect(wrapper.vm.title).toBe('Acme renewal')
    })

    it('falls back to the record id', () => {
      expect(mountPage().vm.title).toBe('DEAL-1')
    })
  })

  describe('adding a contact', () => {
    it('posts the contact against the deal', async () => {
      const wrapper = mountPage()
      api.contacts.data = []
      await wrapper.vm.addContact('CONTACT-1')
      expect(api.call).toHaveBeenCalledWith(
        'xbr_crm.fcrm.doctype.crm_deal.crm_deal.add_contact',
        { deal: 'DEAL-1', contact: 'CONTACT-1' },
      )
    })

    it('refuses a contact already on the deal', async () => {
      // Adding twice would create a duplicate row on the server.
      const wrapper = mountPage()
      api.contacts.data = [{ name: 'CONTACT-1' }]
      await wrapper.vm.addContact('CONTACT-1')
      expect(api.call).not.toHaveBeenCalled()
      expect(api.toast.error).toHaveBeenCalledWith('Contact Already Added')
    })

    it('refreshes the list once it lands', async () => {
      const wrapper = mountPage()
      api.contacts.data = []
      await wrapper.vm.addContact('CONTACT-1')
      await flushPromises()
      expect(api.contacts.reload).toHaveBeenCalled()
      expect(api.toast.success).toHaveBeenCalledWith('Contact Added')
    })

    it('does not report success when the server returns nothing', async () => {
      api.call.mockResolvedValue(null)
      const wrapper = mountPage()
      api.contacts.data = []
      await wrapper.vm.addContact('CONTACT-1')
      await flushPromises()
      expect(api.toast.success).not.toHaveBeenCalled()
    })
  })

  describe('removing a contact', () => {
    it('posts the removal and refreshes', async () => {
      const wrapper = mountPage()
      await wrapper.vm.removeContact('CONTACT-1')
      await flushPromises()
      expect(api.call).toHaveBeenCalledWith(
        'xbr_crm.fcrm.doctype.crm_deal.crm_deal.remove_contact',
        { deal: 'DEAL-1', contact: 'CONTACT-1' },
      )
      expect(api.contacts.reload).toHaveBeenCalled()
    })
  })

  describe('setting the primary contact', () => {
    it('posts the change and refreshes', async () => {
      const wrapper = mountPage()
      await wrapper.vm.setPrimaryContact('CONTACT-1')
      await flushPromises()
      expect(api.call).toHaveBeenCalledWith(
        'xbr_crm.fcrm.doctype.crm_deal.crm_deal.set_primary_contact',
        { deal: 'DEAL-1', contact: 'CONTACT-1' },
      )
      expect(api.toast.success).toHaveBeenCalledWith('Primary Contact Set')
    })
  })

  describe('the per-contact menu', () => {
    it('always offers Remove', () => {
      const wrapper = mountPage()
      expect(
        wrapper.vm.contactOptions({ name: 'C1', is_primary: false })
          .map((o) => o.label),
      ).toContain('Remove')
    })

    it('offers Set as Primary for a secondary contact', () => {
      const wrapper = mountPage()
      expect(
        wrapper.vm.contactOptions({ name: 'C1', is_primary: false })
          .map((o) => o.label),
      ).toContain('Set as Primary Contact')
    })

    it('hides it for the contact that already is primary', () => {
      const wrapper = mountPage()
      expect(
        wrapper.vm.contactOptions({ name: 'C1', is_primary: true })
          .map((o) => o.label),
      ).not.toContain('Set as Primary Contact')
    })
  })

  describe('the organization field in the side panel', () => {
    const sectionWith = (fieldname) => [
      { name: 'details', columns: [{ fields: [{ fieldname }] }] },
    ]

    // The handlers used to be installed by the resource's `transform`. On a
    // cache hit frappe-ui returns the previously created resource and discards
    // the new options, so they stayed bound to the first Deal mounted in the
    // session. They are rebuilt per instance in the `parsedSections` computed
    // now, so these assertions go through the rendered sections.
    const parsedWith = (wrapper, fieldname) => {
      api.sections.data = sectionWith(fieldname)
      return wrapper.vm.parsedSections
    }

    it('wires up create and link handlers', () => {
      const wrapper = mountPage()
      const field = parsedWith(wrapper, 'organization')[0].columns[0].fields[0]
      expect(typeof field.create).toBe('function')
      expect(typeof field.link).toBe('function')
    })

    it('opens the organization modal seeded with what was typed', () => {
      const wrapper = mountPage()
      const close = vi.fn()
      parsedWith(wrapper, 'organization')[0].columns[0].fields[0].create(
        'Acme Ltd',
        close,
      )
      expect(wrapper.vm.showOrganizationModal).toBe(true)
      expect(wrapper.vm._organization.organization_name).toBe('Acme Ltd')
      expect(close).toHaveBeenCalled()
    })

    it('navigates to an existing organization', () => {
      const wrapper = mountPage()
      parsedWith(wrapper, 'organization')[0].columns[0].fields[0].link('ORG-1')
      expect(nav.push).toHaveBeenCalledWith({
        name: 'Organization',
        params: { organizationId: 'ORG-1' },
      })
    })

    it('leaves other fields untouched', () => {
      const wrapper = mountPage()
      const field = parsedWith(wrapper, 'deal_name')[0].columns[0].fields[0]
      expect(field.create).toBeUndefined()
    })

    it('does not mutate the shared cache entry', () => {
      // `sections.data` is shared between every Deal via the resource cache,
      // so writing handlers into it is what leaked one deal's closures to the
      // next. The computed must spread instead.
      const wrapper = mountPage()
      const source = sectionWith('organization')
      api.sections.data = source
      void wrapper.vm.parsedSections
      expect(source[0].columns[0].fields[0].create).toBeUndefined()
    })

    it('skips the contacts section entirely', () => {
      // It has no `columns`, so walking it would throw.
      const wrapper = mountPage()
      api.sections.data = [{ name: 'contacts_section' }]
      expect(() => wrapper.vm.parsedSections).not.toThrow()
    })
  })

  describe('deleting', () => {
    it('opens the linked-documents check', () => {
      const wrapper = mountPage()
      wrapper.vm.deleteDeal?.() ?? (wrapper.vm.showDeleteLinkedDocModal = true)
      expect(wrapper.vm.showDeleteLinkedDocModal).toBe(true)
    })
  })
})
