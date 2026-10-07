const api = vi.hoisted(() => ({
  toast: null,
  call: vi.fn(),
  save: null,
  contacts: null,
  assignees: null,
  sections: null,
  document: null,
  makeCall: vi.fn(),
  statusType: 'Ongoing',
  // Whether the status map can resolve the name at all. A status renamed in
  // settings resolves to `undefined` — not to an object with an undefined
  // type — and only the first shape exercises the `?.` guards.
  statusResolves: true,
  translatable: false,
  store: null,
}))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  api.toast = { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() }
  const inert = (options = {}) => {
    const r = reactive({
      ...options,
      data: null,
      doc: null,
      fetch: vi.fn(),
      reload: vi.fn(),
      submit: vi.fn(),
      // `update` too: Link.vue's search calls it before every reload, and a
      // resource without it throws — under passing tests, as an unhandled
      // error rather than a failure.
      update: vi.fn(function (o) {
        Object.assign(this, o)
      }),
      setValue: { submit: vi.fn() },
      insert: { submit: vi.fn() },
      delete: { submit: vi.fn() },
    })
    if (options.url?.includes('get_deal_contacts')) api.contacts = r
    // Deal.vue builds its own side-panel resource rather than taking the one
    // from useDocument, so that is the object `sections.reload()` hits.
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
    useDocument: () => {
      // Stable across the component's lifetime so `reload` calls can be
      // asserted; the shared DealPage suite builds these fresh each call.
      api.save = { submit: vi.fn() }
      api.assignees = reactive({ reload: vi.fn(), data: [] })
      api.document = reactive({
        doc: {},
        statuses: [],
        _statuses: [],
        save: api.save,
        reload: vi.fn(),
      })
      return {
        document: api.document,
        triggerOnChange: vi.fn(),
        assignees: api.assignees,
        sections: reactive({ reload: vi.fn(), data: [] }),
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
    getDealStatus: () =>
      api.statusResolves
        ? { type: api.statusType, color: 'text-gray-600' }
        : undefined,
    statusOptions: (_k, custom, onChange) => ({ custom, onChange }),
  }),
}))

vi.mock('@/stores/users', () => ({
  usersStore: () => ({
    getUser: (e) => ({ full_name: e === 'ada@x.com' ? 'Ada' : e, user_image: '' }),
    isManager: () => true,
  }),
}))

vi.mock('@/stores/global', async () => {
  const { reactive } = await import('vue')
  api.store = reactive({ onCall: false, calling: false, activeNumber: '' })
  return {
    globalStore: () => ({
      $dialog: vi.fn(),
      $socket: { on: vi.fn(), off: vi.fn() },
      makeCall: api.makeCall,
      ...api.store,
      get onCall() {
        return api.store.onCall
      },
      get calling() {
        return api.store.calling
      },
      get activeNumber() {
        return api.store.activeNumber
      },
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
    isTranslatable: () => api.translatable,
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

import DealPage from '@/pages/Deal.vue'
import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'

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

describe('Deal page — saving, status and the record actions', () => {
  beforeEach(() => {
    api.call.mockReset().mockResolvedValue({ name: 'ok' })
    for (const t of Object.values(api.toast)) t.mockClear()
    api.makeCall.mockClear()
    nav.push.mockClear()
    api.statusType = 'Ongoing'
    api.statusResolves = true
    api.translatable = false
    ROUTE.query = {}
  })

  describe('the status label', () => {
    it('shows the status as stored when the doctype is not translated', () => {
      expect(mountPage().vm.statusLabel('Qualification')).toBe('Qualification')
    })

    it('translates it when the doctype is', () => {
      api.translatable = true
      expect(mountPage().vm.statusLabel('Qualification')).toBe('Qualification')
    })
  })

  describe('marking a deal lost', () => {
    const lost = (docOver = {}) => {
      api.statusType = 'Lost'
      const wrapper = mountPage()
      Object.assign(wrapper.vm.document.doc, { status: 'Lost', ...docOver })
      return wrapper
    }

    it('asks for a reason when none has been given', () => {
      const wrapper = lost()
      wrapper.vm.setLostReason()
      expect(wrapper.vm.showLostReasonModal).toBe(true)
      expect(api.save.submit).not.toHaveBeenCalled()
    })

    it('saves straight away once a reason is chosen', () => {
      const wrapper = lost({ lost_reason: 'Price' })
      wrapper.vm.setLostReason()
      expect(wrapper.vm.showLostReasonModal).toBe(false)
      expect(api.save.submit).toHaveBeenCalled()
    })

    it('still asks when the reason is "Other" with nothing written', () => {
      // "Other" on its own says nothing; the notes are the reason.
      const wrapper = lost({ lost_reason: 'Other' })
      wrapper.vm.setLostReason()
      expect(wrapper.vm.showLostReasonModal).toBe(true)
    })

    it('saves once "Other" has notes against it', () => {
      const wrapper = lost({ lost_reason: 'Other', lost_notes: 'Went quiet' })
      wrapper.vm.setLostReason()
      expect(api.save.submit).toHaveBeenCalled()
      expect(wrapper.vm.showLostReasonModal).toBe(false)
    })

    it('saves without asking for any other status', () => {
      const wrapper = mountPage()
      wrapper.vm.document.doc.status = 'Qualification'
      wrapper.vm.setLostReason()
      expect(api.save.submit).toHaveBeenCalled()
      expect(wrapper.vm.showLostReasonModal).toBe(false)
    })

    it('refreshes the side panel after the save lands', () => {
      const wrapper = lost({ lost_reason: 'Price' })
      wrapper.vm.setLostReason()
      api.save.submit.mock.calls.at(-1)[1].onSuccess()
      expect(api.sections.reload).toHaveBeenCalled()
    })

    it('does not prompt for a status the app cannot classify', () => {
      // `getDealStatus` returns undefined for a status renamed in settings;
      // blocking the save behind a "why lost?" modal it cannot justify would
      // be worse than saving.
      const wrapper = mountPage()
      wrapper.vm.document.doc.status = 'Archived'
      api.statusType = undefined
      wrapper.vm.setLostReason()
      expect(api.save.submit).toHaveBeenCalled()
      expect(wrapper.vm.showLostReasonModal).toBe(false)
    })
  })

  describe('a field changing on the side panel', () => {
    it('routes a move to Lost through the reason prompt', () => {
      api.statusType = 'Lost'
      const wrapper = mountPage()
      wrapper.vm.document.doc.status = 'Lost'
      wrapper.vm.beforeStatusChange({ status: 'Lost' })
      expect(wrapper.vm.showLostReasonModal).toBe(true)
    })

    it('saves any other status change directly', () => {
      const wrapper = mountPage()
      wrapper.vm.beforeStatusChange({ status: 'Qualification' })
      expect(api.save.submit).toHaveBeenCalled()
    })

    it('saves a change to something that is not the status', () => {
      const wrapper = mountPage()
      wrapper.vm.beforeStatusChange({ deal_owner: 'ada@x.com' })
      expect(api.save.submit).toHaveBeenCalled()
    })

    it('copes with being handed nothing', () => {
      const wrapper = mountPage()
      expect(() => wrapper.vm.beforeStatusChange()).not.toThrow()
      expect(api.save.submit).toHaveBeenCalled()
    })
  })

  describe('what gets refreshed after a save', () => {
    it('reloads the assignees when the owner changed', () => {
      // The owner is also an assignee, so the chips beside the record go stale.
      mountPage().vm.reloadResources({ deal_owner: 'ada@x.com' })
      expect(api.assignees.reload).toHaveBeenCalled()
    })

    it('leaves the assignees alone for any other field', () => {
      mountPage().vm.reloadResources({ industry: 'Software' })
      expect(api.assignees.reload).not.toHaveBeenCalled()
    })

    it('reloads the side panel when the status changed', () => {
      mountPage().vm.reloadResources({ status: 'Qualification' })
      expect(api.sections.reload).toHaveBeenCalled()
    })

    it('does not reload it for a move to Lost', () => {
      // That path saves through setLostReason, which reloads on its own.
      api.statusType = 'Lost'
      mountPage().vm.reloadResources({ status: 'Lost' })
      expect(api.sections.reload).not.toHaveBeenCalled()
    })

    it('reloads both when both changed', () => {
      mountPage().vm.reloadResources({
        deal_owner: 'ada@x.com',
        status: 'Qualification',
      })
      expect(api.assignees.reload).toHaveBeenCalled()
      expect(api.sections.reload).toHaveBeenCalled()
    })

    it('copes with being handed nothing', () => {
      const wrapper = mountPage()
      expect(() => wrapper.vm.reloadResources()).not.toThrow()
      expect(api.assignees.reload).not.toHaveBeenCalled()
    })

    it('reloads for a status the app cannot classify', () => {
      // `getDealStatus` returns undefined outright for a status renamed in
      // settings — not an object with an undefined type. Dereferencing it here
      // throws inside the save callback, so the panel never refreshes and the
      // failure surfaces nowhere near the save.
      api.statusResolves = false
      const wrapper = mountPage()
      expect(() => wrapper.vm.reloadResources({ status: 'Archived' })).not.toThrow()
      expect(api.sections.reload).toHaveBeenCalled()
    })
  })

  describe('calling the deal', () => {
    const withContacts = (rows) => {
      const wrapper = mountPage()
      api.contacts.data = rows
      return wrapper
    }

    it('dials the primary contact', () => {
      const wrapper = withContacts([
        { name: 'C1', is_primary: 0, mobile_no: '+911111' },
        { name: 'C2', is_primary: 1, mobile_no: '+912222' },
      ])
      wrapper.vm.triggerCall()
      expect(api.makeCall).toHaveBeenCalledWith('+912222')
    })

    it('says so when no contact is marked primary', () => {
      // Regression: `mobile_no` was read off the contact on the line *above*
      // this guard, so the case the guard exists for threw instead.
      const wrapper = withContacts([{ name: 'C1', is_primary: 0 }])
      expect(() => wrapper.vm.triggerCall()).not.toThrow()
      expect(api.toast.error).toHaveBeenCalledWith('No Primary Contact Set')
      expect(api.makeCall).not.toHaveBeenCalled()
    })

    it('says so when there are no contacts at all', () => {
      const wrapper = withContacts([])
      expect(() => wrapper.vm.triggerCall()).not.toThrow()
      expect(api.toast.error).toHaveBeenCalledWith('No Primary Contact Set')
    })

    it('says so before the contacts have loaded', () => {
      const wrapper = mountPage()
      expect(() => wrapper.vm.triggerCall()).not.toThrow()
      expect(api.toast.error).toHaveBeenCalledWith('No Primary Contact Set')
    })

    it('says so when the primary contact has no number', () => {
      const wrapper = withContacts([{ name: 'C1', is_primary: 1, mobile_no: '' }])
      wrapper.vm.triggerCall()
      expect(api.toast.error).toHaveBeenCalledWith('No Mobile Number Set')
      expect(api.makeCall).not.toHaveBeenCalled()
    })
  })

  describe('the owner shown on the hero', () => {
    it('shows their full name', () => {
      const wrapper = mountPage()
      wrapper.vm.document.doc.deal_owner = 'ada@x.com'
      expect(wrapper.vm.ownerName).toBe('Ada')
    })

    it('falls back to the address for someone unknown', () => {
      const wrapper = mountPage()
      wrapper.vm.document.doc.deal_owner = 'nobody@x.com'
      expect(wrapper.vm.ownerName).toBe('nobody@x.com')
    })

    it('shows nothing when the deal has no owner', () => {
      expect(mountPage().vm.ownerName).toBe('')
    })
  })
})
