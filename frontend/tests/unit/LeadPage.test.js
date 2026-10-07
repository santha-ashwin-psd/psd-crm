const api = vi.hoisted(() => ({
  unknownUsers: [],
  toast: null,
  save: { submit: vi.fn() },
  triggerOnChange: vi.fn(),
  sectionsReload: vi.fn(),
  assigneesReload: vi.fn(),
  docReload: vi.fn(),
  view: null,
  leadStatusType: 'Open',
}))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  api.toast = { error: vi.fn(), success: vi.fn(), warning: vi.fn() }
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
    toast: api.toast,
    call: vi.fn(),
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

const docs = vi.hoisted(() => ({ ref: null }))
vi.mock('@/data/document', async () => {
  const { reactive } = await import('vue')
  return {
    useDocument: () => {
      docs.ref = reactive({
        doc: {},
        statuses: [],
        _statuses: [],
        save: api.save,
        reload: api.docReload,
      })
      // Lead.vue destructures all of these; omitting any leaves render-time
      // TypeErrors in the log that would mask a genuine failure.
      return {
        document: docs.ref,
        triggerOnChange: api.triggerOnChange,
        assignees: { reload: api.assigneesReload, data: [] },
        sections: { reload: api.sectionsReload, data: [] },
        permissions: { data: { permissions: { delete: true } } },
        triggerOnBeforeCreate: vi.fn(),
        scripts: { data: [] },
        triggerOnRender: vi.fn(),
      }
    },
  }
})

vi.mock('@/stores/statuses', () => ({
  statusesStore: () => ({
    getLeadStatus: () => ({ type: api.leadStatusType, color: 'text-gray-600' }),
    statusOptions: (_kind, custom, onChange) => ({ custom, onChange }),
  }),
}))

vi.mock('@/stores/users', () => ({
  usersStore: () => ({
    // `getUser` resolves against a map that is filled by a fetch, so it returns
    // undefined outright for an owner it has not seen — a deactivated user, or
    // any owner before the list lands. `api.unknownUsers` selects that case.
    getUser: (e) =>
      api.unknownUsers.includes(e)
        ? undefined
        : { full_name: e === 'ada@x.com' ? 'Ada' : e, user_image: '' },
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
      doctypeMeta: ref({ title_field: 'lead_name' }),
      getFields: () => [],
      doctypesMeta: {},
    }),
  }
})

vi.mock('@/utils/view', () => ({ getView: () => api.view }))

vi.mock('@/composables/useBroadcast', () => ({
  useBroadcast: () => ({ on: vi.fn(), send: vi.fn(), off: vi.fn() }),
}))

// useActiveTabManager reads route.hash, so it must be present.
const ROUTE = vi.hoisted(() => ({ query: {}, params: {}, hash: '' }))
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useRouter: () => ({ push: vi.fn() }),
    useRoute: () => ROUTE,
  }
})

import LeadPage from '@/pages/Lead.vue'
import { mountComponent } from '../helpers/mount'

const STUBS = {
  LayoutHeader: true, Breadcrumbs: true, Activities: true,
  SidePanelLayout: true, AssignTo: true, Dropdown: true, Tooltip: true,
  Tabs: true, FileUploader: true, DeleteLinkedDocModal: true,
  ConvertToDealModal: true, LostReasonModal: true, ErrorPage: true,
  CustomActions: true, SLASection: true, Avatar: true, Button: true,
}

const mountPage = () =>
  mountComponent(LeadPage, {
    props: { leadId: 'LEAD-1' },
    global: { stubs: STUBS, mocks: { $route: ROUTE } },
  })

describe('Lead page', () => {
  beforeEach(() => {
    api.unknownUsers = []
    api.save.submit.mockClear()
    api.triggerOnChange.mockClear().mockResolvedValue(undefined)
    api.sectionsReload.mockClear()
    api.assigneesReload.mockClear()
    api.docReload.mockClear()
    api.toast.error.mockClear()
    api.view = null
    api.leadStatusType = 'Open'
    ROUTE.query = {}
  })

  describe('the page title', () => {
    it('uses the doctype title field', () => {
      const wrapper = mountPage()
      wrapper.vm.document.doc = { lead_name: 'Acme enquiry' }
      expect(wrapper.vm.title).toBe('Acme enquiry')
    })

    it('falls back to the record id', () => {
      // A lead with no name still needs something in the breadcrumb.
      expect(mountPage().vm.title).toBe('LEAD-1')
    })
  })

  describe('editing a field', () => {
    it('writes the value and saves', () => {
      const wrapper = mountPage()
      wrapper.vm.document.doc = { first_name: 'Ada' }
      wrapper.vm.updateField('first_name', 'Grace')
      expect(wrapper.vm.doc.first_name).toBe('Grace')
      expect(api.save.submit).toHaveBeenCalled()
    })

    it('puts the old value back when the save fails', () => {
      // Leaving the rejected value on screen would misreport what is stored.
      const wrapper = mountPage()
      wrapper.vm.document.doc = { first_name: 'Ada' }
      wrapper.vm.updateField('first_name', 'Grace')
      api.save.submit.mock.calls[0][1].onError({ messages: ['Not allowed'] })
      expect(wrapper.vm.doc.first_name).toBe('Ada')
      expect(api.toast.error).toHaveBeenCalledWith('Not allowed')
    })

    it('surfaces a plain Error message rather than burying it', () => {
      // `.messages` is the frappe API shape; a transport or client-side failure
      // arrives as an Error with only `.message`. Reading just `.messages`
      // discarded the reason and showed the generic fallback instead.
      const wrapper = mountPage()
      wrapper.vm.document.doc = { first_name: 'Ada' }
      wrapper.vm.updateField('first_name', 'Grace')
      api.save.submit.mock.calls[0][1].onError(new Error('offline'))
      expect(api.toast.error).toHaveBeenCalledWith('offline')
    })

    it('shows a fallback message when the error carries none', () => {
      const wrapper = mountPage()
      wrapper.vm.document.doc = { first_name: 'Ada' }
      wrapper.vm.updateField('first_name', 'Grace')
      api.save.submit.mock.calls[0][1].onError({})
      expect(api.toast.error).toHaveBeenCalledWith('Error updating field')
    })

    it('clears every field when given a list', () => {
      // The side panel uses this to blank a group of fields at once.
      const wrapper = mountPage()
      wrapper.vm.document.doc = { email: 'a@x.com', mobile_no: '123' }
      wrapper.vm.updateField(['email', 'mobile_no'])
      expect(wrapper.vm.doc.email).toBe('')
      expect(wrapper.vm.doc.mobile_no).toBe('')
    })

    it('asks for a reload once the save lands', () => {
      const wrapper = mountPage()
      wrapper.vm.document.doc = { first_name: 'Ada' }
      wrapper.vm.updateField('first_name', 'Grace')
      api.save.submit.mock.calls[0][1].onSuccess()
      expect(wrapper.vm.reload).toBe(true)
    })
  })

  describe('marking a lead lost', () => {
    it('asks for a reason when moving to a Lost status', () => {
      api.leadStatusType = 'Lost'
      const wrapper = mountPage()
      wrapper.vm.document.doc = { status: 'Lost' }
      wrapper.vm.setLostReason()
      expect(wrapper.vm.showLostReasonModal).toBe(true)
      expect(api.save.submit).not.toHaveBeenCalled()
    })

    it('saves straight away when a reason is already recorded', () => {
      api.leadStatusType = 'Lost'
      const wrapper = mountPage()
      wrapper.vm.document.doc = { status: 'Lost', lost_reason: 'Price' }
      wrapper.vm.setLostReason()
      expect(wrapper.vm.showLostReasonModal).toBe(false)
      expect(api.save.submit).toHaveBeenCalled()
    })

    it('still asks when the reason is Other with no notes', () => {
      // "Other" alone explains nothing.
      api.leadStatusType = 'Lost'
      const wrapper = mountPage()
      wrapper.vm.document.doc = { status: 'Lost', lost_reason: 'Other' }
      wrapper.vm.setLostReason()
      expect(wrapper.vm.showLostReasonModal).toBe(true)
    })

    it('accepts Other once notes are given', () => {
      api.leadStatusType = 'Lost'
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

    it('does not ask for a non-Lost status', () => {
      api.leadStatusType = 'Open'
      const wrapper = mountPage()
      wrapper.vm.document.doc = { status: 'Open' }
      wrapper.vm.setLostReason()
      expect(wrapper.vm.showLostReasonModal).toBe(false)
      expect(api.save.submit).toHaveBeenCalled()
    })
  })

  describe('changing status from the side panel', () => {
    it('routes a Lost status through the reason prompt', () => {
      api.leadStatusType = 'Lost'
      const wrapper = mountPage()
      wrapper.vm.document.doc = { status: 'Lost' }
      wrapper.vm.beforeStatusChange({ status: 'Lost' })
      expect(wrapper.vm.showLostReasonModal).toBe(true)
    })

    it('saves any other change directly', () => {
      api.leadStatusType = 'Open'
      const wrapper = mountPage()
      wrapper.vm.beforeStatusChange({ status: 'Replied' })
      expect(api.save.submit).toHaveBeenCalled()
    })

    it('saves a change that is not a status at all', () => {
      const wrapper = mountPage()
      wrapper.vm.beforeStatusChange({ first_name: 'Ada' })
      expect(api.save.submit).toHaveBeenCalled()
    })

    it('tolerates being handed nothing', () => {
      const wrapper = mountPage()
      expect(() => wrapper.vm.beforeStatusChange()).not.toThrow()
    })
  })

  describe('refreshing after a change', () => {
    it('reloads assignees when the owner changed', () => {
      const wrapper = mountPage()
      wrapper.vm.reloadResources({ lead_owner: 'ada@x.com' })
      expect(api.assigneesReload).toHaveBeenCalled()
    })

    it('leaves assignees alone for an unrelated field', () => {
      const wrapper = mountPage()
      wrapper.vm.reloadResources({ first_name: 'Ada' })
      expect(api.assigneesReload).not.toHaveBeenCalled()
    })

    it('tolerates being handed nothing', () => {
      const wrapper = mountPage()
      expect(() => wrapper.vm.reloadResources()).not.toThrow()
    })
  })

  describe('deleting', () => {
    it('opens the linked-documents check rather than deleting outright', () => {
      // A lead may have notes, tasks and emails hanging off it.
      const wrapper = mountPage()
      wrapper.vm.deleteLead()
      expect(wrapper.vm.showDeleteLinkedDocModal).toBe(true)
    })
  })

  describe('status labels', () => {
    it('passes the status through when the doctype is not translatable', () => {
      expect(mountPage().vm.statusLabel('Replied')).toBe('Replied')
    })
  })

  // The hero shows who owns the lead. Falling back to the raw id is not a
  // nicety — the alternative is a blank where the owner should be.
  describe('the owner name in the hero', () => {
    const ownerNameFor = (owner) => {
      const wrapper = mountPage()
      wrapper.vm.document.doc.lead_owner = owner
      return wrapper.vm.ownerName
    }

    it('shows the full name when the user is known', () => {
      expect(ownerNameFor('ada@x.com')).toBe('Ada')
    })

    it('falls back to the id when the user cannot be resolved', () => {
      api.unknownUsers = ['gone@x.com']
      expect(ownerNameFor('gone@x.com')).toBe('gone@x.com')
    })

    it('shows nothing when the lead has no owner', () => {
      expect(ownerNameFor('')).toBe('')
    })
  })
})
