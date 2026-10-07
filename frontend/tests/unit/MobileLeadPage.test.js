const api = vi.hoisted(() => ({
  toast: null,
  save: { submit: vi.fn() },
  triggerOnChange: vi.fn(),
  assigneesReload: vi.fn(),
  sections: null,
  statusArgs: null,
  view: null,
  leadStatusType: 'Open',
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
    // MobileLead.vue owns the side-panel layout resource, so the test needs a
    // handle on it to say whether the layout has arrived yet.
    if (options.url?.includes('get_sidepanel_sections')) api.sections = r
    return r
  }
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

const docs = vi.hoisted(() => ({ ref: null, error: null }))
vi.mock('@/data/document', async () => {
  const { reactive, ref } = await import('vue')
  return {
    useDocument: () => {
      docs.ref = reactive({
        doc: {},
        statuses: [],
        _statuses: [],
        save: api.save,
        reload: vi.fn(),
      })
      // MobileLead.vue watches `error`, so it has to be a real ref.
      docs.error = ref(null)
      return {
        document: docs.ref,
        triggerOnChange: api.triggerOnChange,
        triggerOnRender: vi.fn(),
        assignees: { reload: api.assigneesReload, data: [] },
        scripts: { data: [] },
        error: docs.error,
      }
    },
  }
})

vi.mock('@/stores/statuses', () => ({
  statusesStore: () => ({
    getLeadStatus: () => ({ type: api.leadStatusType, color: 'text-gray-600' }),
    statusOptions: (...args) => {
      api.statusArgs = args
      return { custom: args[1], onChange: args[2] }
    },
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
const ROUTE = vi.hoisted(() => ({
  query: {},
  params: {},
  hash: '',
  name: 'Lead',
  path: '/leads/LEAD-1',
}))
const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }))
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useRouter: () => nav,
    useRoute: () => ROUTE,
  }
})

import { nextTick } from 'vue'
import MobileLeadPage from '@/pages/MobileLead.vue'
import { whatsappEnabled } from '@/composables/whatsapp'
import { mountComponent } from '../helpers/mount'

const STUBS = {
  LayoutHeader: { template: '<div class="stub-header"><slot /></div>' },
  Breadcrumbs: { props: ['items'], template: '<nav class="stub-breadcrumbs" />' },
  // Renders only the selected tab's panel, the way frappe-ui's Tabs does.
  Tabs: {
    props: ['tabs', 'modelValue'],
    template:
      '<div class="stub-tabs"><slot name="tab-panel" :tab="tabs[modelValue] || {}" /></div>',
  },
  Dropdown: {
    props: ['options'],
    template: '<div class="stub-dropdown"><slot :open="false" /></div>',
  },
  Activities: { template: '<div class="stub-activities" />' },
  SidePanelLayout: { props: ['sections'], template: '<div class="stub-side-panel" />' },
  SLASection: { template: '<div class="stub-sla" />' },
  AssignTo: { template: '<div class="stub-assign-to" />' },
  CustomActions: { props: ['actions'], template: '<div class="stub-custom-actions" />' },
  ConvertToDealModal: { template: '<div class="stub-convert-modal" />' },
  ErrorPage: {
    props: ['errorTitle', 'errorMessage'],
    template: '<div class="stub-error-page">{{ errorTitle }}|{{ errorMessage }}</div>',
  },
  LostReasonModal: true,
  DeleteLinkedDocModal: true,
  Icon: true,
  Tooltip: true,
}

function setWindowWidth(width) {
  window.innerWidth = width
  window.dispatchEvent(new Event('resize'))
}

const mountPage = () =>
  mountComponent(MobileLeadPage, {
    props: { leadId: 'LEAD-1' },
    global: { stubs: STUBS, mocks: { $route: ROUTE } },
  })

// Mount with a lead already loaded — everything below the header is gated on
// `doc.name`.
async function mountLoadedPage(doc = {}) {
  const wrapper = mountPage()
  wrapper.vm.document.doc = { name: 'LEAD-1', lead_name: 'Acme enquiry', ...doc }
  await nextTick()
  return wrapper
}

const tabNames = (wrapper) => wrapper.vm.tabs.map((t) => t.name)

const buttonLabelled = (wrapper, label) =>
  wrapper.findAll('.stub-button').find((b) => b.text().includes(label))

describe('Mobile lead page', () => {
  beforeEach(() => {
    localStorage.clear()
    api.save.submit.mockClear()
    api.triggerOnChange.mockClear().mockResolvedValue(undefined)
    api.assigneesReload.mockClear()
    api.toast.error.mockClear()
    api.sections = null
    api.statusArgs = null
    api.view = null
    api.leadStatusType = 'Open'
    ROUTE.query = {}
    ROUTE.hash = ''
    whatsappEnabled.value = false
    // isMobileView is derived from the window size, so it is driven by the
    // actual width rather than assigned to.
    setWindowWidth(500)
  })

  describe('the tab strip', () => {
    it('leads with a Details tab on a phone-sized screen', () => {
      // The desktop page has no such tab: it shows the fields in a side column.
      expect(tabNames(mountPage())[0]).toBe('Details')
    })

    it('drops the Details tab once the screen is desktop-sized', () => {
      setWindowWidth(1440)
      const names = tabNames(mountPage())
      expect(names).not.toContain('Details')
      expect(names[0]).toBe('Activity')
    })

    it('adds a WhatsApp tab only when the integration is enabled', () => {
      expect(tabNames(mountPage())).not.toContain('WhatsApp')
      whatsappEnabled.value = true
      expect(tabNames(mountPage())).toContain('WhatsApp')
    })
  })

  describe('the open tab', () => {
    it('opens the tab named in the url hash', () => {
      ROUTE.hash = '#notes'
      const wrapper = mountPage()
      expect(wrapper.vm.tabs[wrapper.vm.tabIndex].name).toBe('Notes')
    })

    it('falls back to Details for a tab this page does not carry', () => {
      // Events exists on the desktop lead page only, and both pages remember
      // the last visited tab under the same key.
      ROUTE.hash = '#events'
      const wrapper = mountPage()
      expect(wrapper.vm.tabs[wrapper.vm.tabIndex].name).toBe('Details')
    })
  })

  describe('the tab panel', () => {
    it('shows the field sections on the Details tab', async () => {
      ROUTE.hash = '#details'
      const wrapper = await mountLoadedPage()
      api.sections.data = [{ label: 'Contacts', fields: [] }]
      await nextTick()
      expect(wrapper.find('.stub-side-panel').exists()).toBe(true)
      expect(wrapper.find('.stub-activities').exists()).toBe(false)
    })

    it('holds the side panel back until the section layout arrives', async () => {
      ROUTE.hash = '#details'
      const wrapper = await mountLoadedPage()
      expect(api.sections.data).toBe(null)
      expect(wrapper.find('.stub-side-panel').exists()).toBe(false)
    })

    it('shows the SLA band only for a lead under an SLA', async () => {
      ROUTE.hash = '#details'
      expect((await mountLoadedPage()).find('.stub-sla').exists()).toBe(false)
      const wrapper = await mountLoadedPage({ sla_status: 'First Response Due' })
      expect(wrapper.find('.stub-sla').exists()).toBe(true)
    })

    it('hands every other tab to the activity feed', async () => {
      ROUTE.hash = '#notes'
      const wrapper = await mountLoadedPage()
      api.sections.data = [{ label: 'Contacts', fields: [] }]
      await nextTick()
      expect(wrapper.find('.stub-activities').exists()).toBe(true)
      expect(wrapper.find('.stub-side-panel').exists()).toBe(false)
    })
  })

  describe('the status control in the header', () => {
    it('labels the button with the current status', async () => {
      const wrapper = await mountLoadedPage({ status: 'Replied' })
      expect(buttonLabelled(wrapper, 'Replied')).toBeTruthy()
    })

    it('leaves the button out until the lead has a status', async () => {
      const wrapper = await mountLoadedPage()
      expect(wrapper.find('.stub-dropdown').exists()).toBe(true)
      expect(wrapper.findAll('.stub-button')).toHaveLength(1)
    })

    it('offers the statuses a client script supplied', async () => {
      const wrapper = await mountLoadedPage({ status: 'Open' })
      wrapper.vm.document._statuses = [{ name: 'Scripted' }]
      await nextTick()
      expect(api.statusArgs[1]).toEqual([{ name: 'Scripted' }])
    })

    it('prefers the doctype statuses when there are any', async () => {
      const wrapper = await mountLoadedPage({ status: 'Open' })
      wrapper.vm.document.statuses = [{ name: 'Configured' }]
      wrapper.vm.document._statuses = [{ name: 'Scripted' }]
      await nextTick()
      expect(api.statusArgs[1]).toEqual([{ name: 'Configured' }])
    })

    it('runs a pick through the document trigger', async () => {
      api.leadStatusType = 'Lost'
      const wrapper = await mountLoadedPage({ status: 'Open' })
      await api.statusArgs[2]('Lost')
      expect(api.triggerOnChange).toHaveBeenCalledWith('status', 'Lost')
      // No reason recorded yet, so the change parks at the prompt.
      expect(wrapper.vm.showLostReasonModal).toBe(true)
      expect(api.save.submit).not.toHaveBeenCalled()
    })
  })

  describe('the action bar', () => {
    it('stays hidden until the lead has loaded', () => {
      const wrapper = mountPage()
      expect(wrapper.find('.stub-assign-to').exists()).toBe(false)
      expect(wrapper.find('.stub-tabs').exists()).toBe(false)
      expect(buttonLabelled(wrapper, 'Convert')).toBeFalsy()
    })

    it('opens the convert-to-deal modal', async () => {
      const wrapper = await mountLoadedPage()
      await buttonLabelled(wrapper, 'Convert').trigger('click')
      expect(wrapper.vm.showConvertToDealModal).toBe(true)
      expect(wrapper.find('.stub-convert-modal').exists()).toBe(true)
    })

    it('shows client-script actions from both sources', async () => {
      const wrapper = await mountLoadedPage()
      expect(wrapper.findAll('.stub-custom-actions')).toHaveLength(0)
      wrapper.vm.document.actions = [{ label: 'Ping' }]
      wrapper.vm.document._actions = [{ label: 'Pong' }]
      await nextTick()
      expect(wrapper.findAll('.stub-custom-actions')).toHaveLength(2)
    })
  })

  describe('going back', () => {
    it('trails from the Leads list down to this lead', async () => {
      const wrapper = await mountLoadedPage()
      expect(wrapper.vm.breadcrumbs[0]).toMatchObject({
        label: 'Leads',
        route: { name: 'Leads' },
      })
      expect(wrapper.vm.breadcrumbs.at(-1)).toMatchObject({
        label: 'Acme enquiry',
        route: { name: 'Lead', params: { leadId: 'LEAD-1' } },
      })
    })

    it('keeps the view the user came from in the trail', () => {
      ROUTE.query = { view: 'hot-leads', viewType: 'list' }
      api.view = { label: 'Hot leads', icon: 'flame' }
      const wrapper = mountPage()
      expect(wrapper.vm.breadcrumbs).toHaveLength(3)
      expect(wrapper.vm.breadcrumbs[1]).toMatchObject({
        label: 'Hot leads',
        route: { name: 'Leads', query: { view: 'hot-leads' } },
      })
    })

    it('drops the view crumb when that view is gone', () => {
      ROUTE.query = { view: 'deleted-view' }
      api.view = null
      expect(mountPage().vm.breadcrumbs).toHaveLength(2)
    })
  })

  describe('when the lead cannot be loaded', () => {
    it('names a missing document', async () => {
      const wrapper = mountPage()
      docs.error.value = { exc_type: 'DoesNotExistError' }
      await nextTick()
      expect(wrapper.vm.errorTitle).toBe('Document Not Found')
      expect(wrapper.find('.stub-error-page').text()).toContain(
        'Document Not Found',
      )
    })

    it('reports any other failure with the server message', async () => {
      const wrapper = mountPage()
      docs.error.value = { exc_type: 'ValidationError', messages: ['No access'] }
      await nextTick()
      expect(wrapper.vm.errorTitle).toBe('Error Occurred')
      expect(wrapper.vm.errorMessage).toBe('No access')
    })

    it('says something when the failure carries no message', async () => {
      const wrapper = mountPage()
      docs.error.value = { exc_type: 'ValidationError' }
      await nextTick()
      expect(wrapper.vm.errorMessage).toBe('An Error Occurred')
    })

    it('clears the error page once the lead arrives', async () => {
      const wrapper = mountPage()
      docs.error.value = { exc_type: 'DoesNotExistError' }
      await nextTick()
      docs.error.value = null
      await nextTick()
      expect(wrapper.vm.errorTitle).toBe('')
      expect(wrapper.find('.stub-error-page').exists()).toBe(false)
    })
  })

  describe('after a field change', () => {
    it('reloads assignees when the lead owner changed', async () => {
      const wrapper = await mountLoadedPage()
      wrapper.vm.reloadAssignees({ lead_owner: 'ada@x.com' })
      expect(api.assigneesReload).toHaveBeenCalled()
    })

    it('leaves assignees alone for an unrelated field', async () => {
      const wrapper = await mountLoadedPage()
      wrapper.vm.reloadAssignees({ status: 'Replied' })
      expect(api.assigneesReload).not.toHaveBeenCalled()
    })

    it('tolerates being handed nothing', async () => {
      const wrapper = await mountLoadedPage()
      expect(() => wrapper.vm.reloadAssignees()).not.toThrow()
    })
  })
})
