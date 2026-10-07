const api = vi.hoisted(() => ({
  toast: null,
  call: vi.fn(),
  save: { submit: vi.fn() },
  contacts: null,
  sections: null,
  view: null,
  triggerOnChange: vi.fn(),
  assigneesReload: vi.fn(),
  isMobileView: null,
  callEnabled: null,
  whatsappEnabled: null,
  docError: null,
}))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  api.toast = { error: vi.fn(), success: vi.fn(), warning: vi.fn(), create: vi.fn() }
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
    // Two named resources on this page need to be reachable from the tests:
    // the contact list and the side-panel section layout.
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
  const { reactive, ref } = await import('vue')
  return {
    useDocument: () => {
      api.docError = ref(null)
      return {
        document: reactive({
          doc: {},
          statuses: [],
          _statuses: [],
          _actions: [],
          save: api.save,
          reload: vi.fn(),
        }),
        triggerOnChange: api.triggerOnChange,
        triggerOnRender: vi.fn(),
        assignees: { reload: api.assigneesReload, data: [] },
        scripts: { data: [] },
        // The page watches this; omitting it produced a stream of
        // "Invalid watch source: undefined" warnings that would drown a real one.
        error: api.docError,
      }
    },
  }
})

// These three drive the tab list, and the page reads them through computed(),
// so they have to be genuine refs or the first value is cached forever.
vi.mock('@/composables/settings', async () => {
  const { ref } = await import('vue')
  api.isMobileView = ref(true)
  return { isMobileView: api.isMobileView }
})

vi.mock('@/composables/telephony', async () => {
  const { ref } = await import('vue')
  api.callEnabled = ref(false)
  return { callEnabled: api.callEnabled }
})

vi.mock('@/composables/whatsapp', async () => {
  const { ref } = await import('vue')
  api.whatsappEnabled = ref(false)
  return { whatsappEnabled: api.whatsappEnabled }
})

vi.mock('@/stores/statuses', () => ({
  statusesStore: () => ({
    getDealStatus: (s) => ({
      type: s === 'Lost' ? 'Lost' : 'Open',
      color: 'text-gray-600',
    }),
    statusOptions: (_k, custom, onChange) => ({ custom, onChange }),
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

import MobileDealPage from '@/pages/MobileDeal.vue'
import { mountComponent } from '../helpers/mount'
import { flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

const STUBS = {
  LayoutHeader: true, Breadcrumbs: true, Activities: true,
  SidePanelLayout: true, AssignTo: true, Dropdown: true, Tooltip: true,
  Tabs: true, FileUploader: true, DeleteLinkedDocModal: true,
  OrganizationModal: true, ContactModal: true, ErrorPage: true,
  CustomActions: true, SLASection: true, Avatar: true,
  CollapsibleSection: true, Link: true, LostReasonModal: true,
}

const mountPage = () =>
  mountComponent(MobileDealPage, {
    props: { dealId: 'DEAL-1' },
    global: { stubs: STUBS, mocks: { $route: ROUTE } },
  })

const sectionWith = (name) => [
  { name: 'details', columns: [{ fields: [{ name }] }] },
]

describe('Mobile deal page', () => {
  beforeEach(() => {
    api.call.mockReset().mockResolvedValue({ name: 'ok' })
    api.save.submit.mockClear()
    api.toast.error.mockClear()
    api.toast.success.mockClear()
    api.triggerOnChange.mockClear()
    api.assigneesReload.mockClear()
    nav.push.mockClear()
    api.view = null
    ROUTE.query = {}
    api.isMobileView.value = true
    api.callEnabled.value = false
    api.whatsappEnabled.value = false
  })

  describe('the page title', () => {
    it('uses the doctype title field', () => {
      const wrapper = mountPage()
      wrapper.vm.document.doc = { deal_name: 'Acme renewal' }
      expect(wrapper.vm.title).toBe('Acme renewal')
    })

    it('falls back to the record id before the document loads', () => {
      expect(mountPage().vm.title).toBe('DEAL-1')
    })
  })

  describe('breadcrumbs', () => {
    it('starts at the Deals list and ends at this deal', () => {
      const wrapper = mountPage()
      expect(wrapper.vm.breadcrumbs[0]).toMatchObject({ label: 'Deals' })
      expect(wrapper.vm.breadcrumbs.at(-1)).toMatchObject({
        route: { name: 'Deal', params: { dealId: 'DEAL-1' } },
      })
    })

    it('inserts the saved view the user came from', () => {
      ROUTE.query = { view: 'won-deals', viewType: 'list' }
      api.view = { label: 'Won deals', icon: 'trophy' }
      expect(mountPage().vm.breadcrumbs).toHaveLength(3)
    })

    it('omits it when the view no longer exists', () => {
      ROUTE.query = { view: 'gone' }
      api.view = null
      expect(mountPage().vm.breadcrumbs).toHaveLength(2)
    })
  })

  describe('which tabs are offered', () => {
    const labels = (w) => w.vm.tabs.map((t) => t.name)

    it('always shows the core tabs', () => {
      expect(labels(mountPage())).toEqual(
        expect.arrayContaining([
          'Activity', 'Emails', 'Comments', 'Data', 'Tasks', 'Notes', 'Attachments',
        ]),
      )
    })

    it('shows Details only on a mobile viewport', async () => {
      // On a wide screen the side panel is always visible, so a Details tab
      // would duplicate it.
      const wrapper = mountPage()
      expect(labels(wrapper)).toContain('Details')
      api.isMobileView.value = false
      await nextTick()
      expect(labels(wrapper)).not.toContain('Details')
    })

    it('hides Calls until telephony is configured', async () => {
      const wrapper = mountPage()
      expect(labels(wrapper)).not.toContain('Calls')
      api.callEnabled.value = true
      await nextTick()
      expect(labels(wrapper)).toContain('Calls')
    })

    it('hides WhatsApp until it is configured', async () => {
      const wrapper = mountPage()
      expect(labels(wrapper)).not.toContain('WhatsApp')
      api.whatsappEnabled.value = true
      await nextTick()
      expect(labels(wrapper)).toContain('WhatsApp')
    })
  })

  describe('the organization field in the side panel', () => {
    // Built in the `parsedSections` computed now, not the resource's
    // `transform` — a cached resource kept the first Deal's closures.
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

    it('skips the contacts section, which has no columns to walk', () => {
      const wrapper = mountPage()
      api.sections.data = [{ name: 'contacts_section' }]
      expect(() => wrapper.vm.parsedSections).not.toThrow()
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

    it('stays quiet when the server returns nothing', async () => {
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
      expect(api.toast.success).toHaveBeenCalledWith('Contact Removed')
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
    it('always offers Delete', () => {
      const wrapper = mountPage()
      expect(
        wrapper.vm.contactOptions({ name: 'C1', is_primary: false })
          .map((o) => o.label),
      ).toContain('Delete')
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

  describe('editing a field inline', () => {
    it('writes the new value and saves', () => {
      const wrapper = mountPage()
      wrapper.vm.document.doc = { deal_name: 'Old' }
      wrapper.vm.updateField('deal_name', 'New')
      expect(wrapper.vm.doc.deal_name).toBe('New')
      expect(api.save.submit).toHaveBeenCalled()
    })

    it('puts the old value back when the save is refused', () => {
      // Otherwise the screen keeps showing a value the server never stored.
      const wrapper = mountPage()
      wrapper.vm.document.doc = { deal_name: 'Old' }
      wrapper.vm.updateField('deal_name', 'New')
      api.save.submit.mock.calls[0][1].onError({ messages: ['Not allowed'] })
      expect(wrapper.vm.doc.deal_name).toBe('Old')
      expect(api.toast.error).toHaveBeenCalledWith('Not allowed')
    })

    it('surfaces a plain Error message rather than burying it', () => {
      const wrapper = mountPage()
      wrapper.vm.document.doc = { deal_name: 'Old' }
      wrapper.vm.updateField('deal_name', 'New')
      api.save.submit.mock.calls[0][1].onError(new Error('offline'))
      expect(api.toast.error).toHaveBeenCalledWith('offline')
    })

    it('falls back when the error carries no message at all', () => {
      const wrapper = mountPage()
      wrapper.vm.document.doc = { deal_name: 'Old' }
      wrapper.vm.updateField('deal_name', 'New')
      api.save.submit.mock.calls[0][1].onError({})
      expect(api.toast.error).toHaveBeenCalledWith('Error updating field')
    })

    it('clears every field when handed a list', () => {
      const wrapper = mountPage()
      wrapper.vm.document.doc = { email: 'a@x.com', mobile_no: '123' }
      wrapper.vm.updateField(['email', 'mobile_no'])
      expect(wrapper.vm.doc.email).toBe('')
      expect(wrapper.vm.doc.mobile_no).toBe('')
    })

    it('restores every field in the list when the save is refused', () => {
      // Regression: the list branch captured `{}` as the old values, so this
      // rollback wrote `undefined` over each field instead of the value it
      // held — leaving the doc dirtier than before the failed save.
      const wrapper = mountPage()
      wrapper.vm.document.doc = { email: 'a@x.com', mobile_no: '123' }
      wrapper.vm.updateField(['email', 'mobile_no'])
      api.save.submit.mock.calls[0][1].onError({ messages: ['Nope'] })
      expect(wrapper.vm.doc.email).toBe('a@x.com')
      expect(wrapper.vm.doc.mobile_no).toBe('123')
    })
  })

  describe('moving a deal to a Lost status', () => {
    it('asks for a reason when none has been given', async () => {
      const wrapper = mountPage()
      wrapper.vm.document.doc = { status: 'Lost' }
      wrapper.vm.setLostReason()
      expect(wrapper.vm.showLostReasonModal).toBe(true)
      expect(api.save.submit).not.toHaveBeenCalled()
    })

    it('saves straight away when a reason is already recorded', () => {
      const wrapper = mountPage()
      wrapper.vm.document.doc = { status: 'Lost', lost_reason: 'Price' }
      wrapper.vm.setLostReason()
      expect(wrapper.vm.showLostReasonModal).toBe(false)
      expect(api.save.submit).toHaveBeenCalled()
    })

    it('still asks when the reason is Other with no note', () => {
      // "Other" on its own says nothing, so the note is what carries the reason.
      const wrapper = mountPage()
      wrapper.vm.document.doc = { status: 'Lost', lost_reason: 'Other' }
      wrapper.vm.setLostReason()
      expect(wrapper.vm.showLostReasonModal).toBe(true)
    })

    it('accepts Other once a note is written', () => {
      const wrapper = mountPage()
      wrapper.vm.document.doc = {
        status: 'Lost',
        lost_reason: 'Other',
        lost_notes: 'Went elsewhere',
      }
      wrapper.vm.setLostReason()
      expect(wrapper.vm.showLostReasonModal).toBe(false)
      expect(api.save.submit).toHaveBeenCalled()
    })

    it('does not ask for any other status', () => {
      const wrapper = mountPage()
      wrapper.vm.document.doc = { status: 'Open' }
      wrapper.vm.setLostReason()
      expect(wrapper.vm.showLostReasonModal).toBe(false)
      expect(api.save.submit).toHaveBeenCalled()
    })
  })

  describe('changing a field from the side panel', () => {
    it('routes a Lost status through the reason gate', () => {
      const wrapper = mountPage()
      wrapper.vm.document.doc = { status: 'Lost' }
      wrapper.vm.beforeStatusChange({ status: 'Lost' })
      expect(wrapper.vm.showLostReasonModal).toBe(true)
    })

    it('saves any other change directly', () => {
      const wrapper = mountPage()
      wrapper.vm.beforeStatusChange({ deal_name: 'Renamed' })
      expect(api.save.submit).toHaveBeenCalled()
      expect(wrapper.vm.showLostReasonModal).toBe(false)
    })

    it('tolerates being handed nothing', () => {
      const wrapper = mountPage()
      expect(() => wrapper.vm.beforeStatusChange()).not.toThrow()
      expect(api.save.submit).toHaveBeenCalled()
    })

    it('refreshes the assignee list after the owner changes', () => {
      // The owner is an assignee, so the sidebar avatars go stale without this.
      const wrapper = mountPage()
      wrapper.vm.beforeStatusChange({ deal_owner: 'ada@x.com' })
      api.save.submit.mock.calls[0][1].onSuccess()
      expect(api.assigneesReload).toHaveBeenCalled()
    })

    it('leaves them alone for an unrelated field', () => {
      const wrapper = mountPage()
      wrapper.vm.beforeStatusChange({ deal_name: 'Renamed' })
      api.save.submit.mock.calls[0][1].onSuccess()
      expect(api.assigneesReload).not.toHaveBeenCalled()
    })
  })

  describe('the status dropdown', () => {
    it('runs the change through the document hooks before the Lost gate', async () => {
      const wrapper = mountPage()
      wrapper.vm.document.doc = { status: 'Open' }
      await wrapper.vm.triggerStatusChange('Won')
      expect(api.triggerOnChange).toHaveBeenCalledWith('status', 'Won')
    })
  })

  describe('when the document cannot be loaded', () => {
    it('says the record is missing for a DoesNotExistError', async () => {
      const wrapper = mountPage()
      api.docError.value = { exc_type: 'DoesNotExistError' }
      await nextTick()
      expect(wrapper.vm.errorTitle).toBe('Document not found')
    })

    it('falls back to a generic title for anything else', async () => {
      const wrapper = mountPage()
      api.docError.value = { exc_type: 'ValidationError', messages: ['Bad'] }
      await nextTick()
      expect(wrapper.vm.errorTitle).toBe('Error occurred')
      expect(wrapper.vm.errorMessage).toBe('Bad')
    })

    it('clears the message once the error goes away', async () => {
      const wrapper = mountPage()
      api.docError.value = { exc_type: 'DoesNotExistError' }
      await nextTick()
      api.docError.value = null
      await nextTick()
      expect(wrapper.vm.errorTitle).toBe('')
      expect(wrapper.vm.errorMessage).toBe('')
    })
  })

  describe('deleting', () => {
    it('opens the linked-documents check rather than deleting outright', () => {
      const wrapper = mountPage()
      wrapper.vm.deleteDeal()
      expect(wrapper.vm.showDeleteLinkedDocModal).toBe(true)
    })
  })

  describe('status labels', () => {
    it('passes the status through when the doctype is not translatable', () => {
      expect(mountPage().vm.statusLabel('Negotiation')).toBe('Negotiation')
    })
  })
})
