const api = vi.hoisted(() => ({
  route: null,
  pinned: [],
  public: [],
  isManager: true,
  setUp: null,
  createDocument: null,
  capture: null,
  send: null,
  call: null,
  push: null,
  usersPromise: null,
  pageCreateAction: null,
  headerPrimaryActionPresent: null,
  isMobile: null,
  mobileSidebarOpened: null,
  isCommandPaletteOpen: null,
  showChangePasswordModal: null,
  showSettings: null,
  activeSettingsPage: null,
  minimize: null,
}))

vi.mock('vue-router', () => ({
  useRoute: () => api.route,
  useRouter: () => ({ push: api.push }),
}))

vi.mock('@/router', () => ({ default: { push: (...a) => api.push(...a) } }))

vi.mock('@/stores/views', () => ({
  viewsStore: () => ({
    getPinnedViews: () => api.pinned,
    getPublicViews: () => api.public,
  }),
}))

const crmSettings = vi.hoisted(() => ({ value: null }))
vi.mock('@/stores/settings', async () => {
  const { reactive } = await import('vue')
  crmSettings.value = reactive({ doc: { hide_getting_started: 0 } })
  return {
    getSettings: () => ({ brand: { name: 'Acme' }, _settings: crmSettings.value }),
  }
})

vi.mock('@/stores/notifications', async () => {
  const { ref } = await import('vue')
  return {
    unreadNotificationsCount: ref(0),
    notificationsStore: () => ({ toggle: vi.fn() }),
  }
})

vi.mock('@/stores/users', () => ({
  usersStore: () => ({
    users: { promise: api.usersPromise },
    isManager: () => api.isManager,
    getUser: (e) => ({ name: e, full_name: e }),
  }),
}))

vi.mock('@/stores/session', () => ({
  sessionStore: () => ({ user: 'ada@x.com', logout: vi.fn() }),
}))

vi.mock('@/composables/settings', async () => {
  const { ref } = await import('vue')
  api.isMobile = ref(false)
  api.mobileSidebarOpened = ref(false)
  api.showSettings = ref(false)
  api.activeSettingsPage = ref('')
  return {
    isMobileView: api.isMobile,
    mobileSidebarOpened: api.mobileSidebarOpened,
    showSettings: api.showSettings,
    activeSettingsPage: api.activeSettingsPage,
    disableSettingModalOutsideClick: ref(false),
  }
})

vi.mock('@/composables/commandPalette', async () => {
  const { ref } = await import('vue')
  api.isCommandPaletteOpen = ref(false)
  return { isCommandPaletteOpen: api.isCommandPaletteOpen }
})

vi.mock('@/composables/document', async () => {
  const { ref } = await import('vue')
  api.createDocument = vi.fn()
  return {
    createDocument: (...a) => api.createDocument(...a),
    showCreateDocumentModal: ref(false),
    createDocumentDoctype: ref(''),
    createDocumentData: ref({}),
    createDocumentCallback: ref(null),
  }
})

vi.mock('@/composables/pageActions', async () => {
  const { ref } = await import('vue')
  api.pageCreateAction = ref(null)
  api.headerPrimaryActionPresent = ref(false)
  return {
    pageCreateAction: api.pageCreateAction,
    headerPrimaryActionPresent: api.headerPrimaryActionPresent,
  }
})

vi.mock('@/composables/modals', async () => {
  const { ref } = await import('vue')
  api.showChangePasswordModal = ref(false)
  return {
    showChangePasswordModal: api.showChangePasswordModal,
    showQuickEntryModal: ref(false),
    quickEntryProps: ref({}),
    showAboutModal: ref(false),
  }
})

vi.mock('@/composables/useBroadcast.js', () => ({
  useBroadcast: () => ({ send: (...a) => api.send(...a), on: vi.fn() }),
}))

vi.mock('frappe-ui/frappe', async () => {
  const { ref } = await import('vue')
  api.minimize = ref(false)
  return {
    TrialBanner: { name: 'TrialBanner', template: '<div />' },
    HelpModal: { name: 'HelpModal', template: '<div />' },
    IntermediateStepModal: { name: 'IntermediateStepModal', template: '<div />' },
    useOnboarding: () => ({
      isOnboardingStepsCompleted: ref(false),
      setUp: (...a) => api.setUp(...a),
    }),
    showHelpModal: ref(false),
    minimize: api.minimize,
    useTelemetry: () => ({ capture: (...a) => api.capture(...a) }),
  }
})

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  return {
    ...actual,
    call: (...a) => api.call(...a),
    createResource: (opts = {}) =>
      reactive({ ...opts, data: null, fetch: vi.fn(), reload: vi.fn() }),
  }
})

import AppSidebar from '@/components/Layouts/AppSidebar.vue'
import AppHeader from '@/components/Layouts/AppHeader.vue'
import DesktopLayout from '@/components/Layouts/DesktopLayout.vue'
import MobileLayout from '@/components/Layouts/MobileLayout.vue'
import SettingsLayoutBase from '@/components/Layouts/SettingsLayoutBase.vue'
import { mountComponent } from '../helpers/mount'
import { nextTick, reactive } from 'vue'
import { flushPromises } from '@vue/test-utils'

const quiet = { inheritAttrs: false, template: '<div><slot /></div>' }
const STUBS = {
  SidebarLink: { ...quiet, name: 'SidebarLinkStub' },
  BrandLogo: { ...quiet, name: 'BrandLogoStub' },
  Settings: { ...quiet, name: 'SettingsStub' },
  SalesHierarchyBanner: { ...quiet, name: 'S1' },
  GettingStartedBanner: { ...quiet, name: 'S2' },
  UserDropdown: { ...quiet, name: 'UserDropdownStub' },
  CallUI: { ...quiet, name: 'CallUIStub' },
  Notifications: { ...quiet, name: 'NotificationsStub' },
  GlobalModals: { ...quiet, name: 'GlobalModalsStub' },
  AppSidebar: { ...quiet, name: 'AppSidebarStub' },
  AppHeader: { ...quiet, name: 'AppHeaderStub' },
  MobileSidebar: { ...quiet, name: 'MobileSidebarStub' },
  Dropdown: {
    name: 'DropdownStub',
    inheritAttrs: false,
    props: ['options'],
    template: '<div><slot /></div>',
  },
  RouterLink: { ...quiet, name: 'RouterLinkStub' },
}

describe('AppSidebar', () => {
  const mount = () => mountComponent(AppSidebar, { global: { stubs: STUBS } })

  beforeEach(() => {
    api.route = reactive({ name: 'Leads', params: {}, query: {} })
    api.pinned = []
    api.public = []
    api.isManager = true
    api.setUp = vi.fn()
    api.capture = vi.fn()
    api.send = vi.fn()
    api.push = vi.fn()
    api.call = vi.fn(async () => '')
    api.usersPromise = Promise.resolve()
    api.minimize.value = false
    api.showSettings.value = false
    api.activeSettingsPage.value = ''
    api.showChangePasswordModal.value = false
    crmSettings.value.doc.hide_getting_started = 0
    localStorage.clear()
  })

  describe('Getting started', () => {
    it('shows the sidebar card while steps are left', () => {
      expect(mount().findComponent({ name: 'S2' }).exists()).toBe(true)
    })

    it('hides the card when Settings turns it off', () => {
      crmSettings.value.doc.hide_getting_started = 1
      expect(mount().findComponent({ name: 'S2' }).exists()).toBe(false)
    })
  })

  describe('the links it shows', () => {
    it('lists every section of the app', () => {
      expect(mount().vm.links.map((l) => l.to)).toEqual([
        'Dashboard',
        'Inbox',
        'Leads',
        'Deals',
        'Contacts',
        'Organizations',
        'Notes',
        'Tasks',
        'Calendar',
        'Call Logs',
      ])
    })

    it('gives every link an icon', () => {
      expect(mount().vm.links.every((l) => l.icon)).toBe(true)
    })

    it('groups them under All Views', () => {
      const groups = mount().vm.allViews
      expect(groups[0].name).toBe('All Views')
      expect(groups[0].views).toHaveLength(10)
    })

    it('badges the Inbox with conversations waiting for a reply', () => {
      const inbox = mount().vm.links.find((l) => l.to === 'Inbox')
      expect(typeof inbox.badge).toBe('function')
      expect(typeof inbox.badge()).toBe('number')
    })

    it('shows no other group when there are no saved views', () => {
      expect(mount().vm.allViews.map((g) => g.name)).toEqual(['All Views'])
    })

    it('adds public and pinned groups, in that order', () => {
      api.public = [{ name: 1, label: 'Shared' }]
      api.pinned = [{ name: 2, label: 'Mine' }]
      expect(mount().vm.allViews.map((g) => g.name)).toEqual([
        'All Views',
        'Public Views',
        'Pinned Views',
      ])
    })
  })

  describe('collapsing', () => {
    it('starts expanded', () => {
      expect(mount().vm.isSidebarCollapsed).toBe(false)
    })

    it('remembers the choice for next time', async () => {
      const wrapper = mount()
      wrapper.vm.isSidebarCollapsed = true
      await nextTick()
      expect(mount().vm.isSidebarCollapsed).toBe(true)
    })
  })

  describe('the onboarding steps', () => {
    const stepNamed = (wrapper, name) =>
      wrapper.vm.steps.find((s) => s.name === name)

    it('registers them once the user list has loaded', async () => {
      // The list decides whether the manager-only step is offered, so
      // registering before it arrives would offer the wrong set.
      mount()
      await flushPromises()
      expect(api.setUp).toHaveBeenCalled()
    })

    it('offers inviting the team only to a manager', async () => {
      mount()
      await flushPromises()
      expect(api.setUp.mock.calls[0][0].map((s) => s.name)).toContain(
        'invite_your_team',
      )

      api.setUp.mockClear()
      api.isManager = false
      mount()
      await flushPromises()
      expect(api.setUp.mock.calls[0][0].map((s) => s.name)).not.toContain(
        'invite_your_team',
      )
    })

    it('starts with every step incomplete', () => {
      expect(mount().vm.steps.every((s) => s.completed === false)).toBe(true)
    })

    it('orders the steps that depend on others after them', () => {
      const wrapper = mount()
      const order = wrapper.vm.steps.map((s) => s.name)
      for (const step of wrapper.vm.steps) {
        if (!step.dependsOn) continue
        expect(order.indexOf(step.dependsOn), step.name).toBeLessThan(
          order.indexOf(step.name),
        )
      }
    })

    it('opens the password dialog', () => {
      const wrapper = mount()
      stepNamed(wrapper, 'setup_your_password').onClick()
      expect(api.showChangePasswordModal.value).toBe(true)
      expect(api.minimize.value).toBe(true)
      expect(api.capture).toHaveBeenCalledWith(
        'onboarding_step_clicked_setup_password',
      )
    })

    it('opens the invite page in settings', () => {
      const wrapper = mount()
      stepNamed(wrapper, 'invite_your_team').onClick()
      expect(api.showSettings.value).toBe(true)
      expect(api.activeSettingsPage.value).toBe('Invite User')
    })

    it('goes to the leads list and asks it to open the create form', () => {
      // The broadcast is what tells whichever tab is on Leads to open it.
      const wrapper = mount()
      stepNamed(wrapper, 'create_first_lead').onClick()
      expect(api.push).toHaveBeenCalledWith({ name: 'Leads' })
      expect(api.send).toHaveBeenCalledWith('trigger_lead_create', true)
    })

    it('takes the user to the right tab of their first deal', async () => {
      api.call.mockResolvedValue('DEAL-1')
      const wrapper = mount()
      for (const [name, hash] of [
        ['create_first_task', '#tasks'],
        ['create_first_note', '#notes'],
        ['add_first_comment', '#comments'],
        ['send_first_email', '#emails'],
      ]) {
        api.push.mockClear()
        await stepNamed(wrapper, name).onClick()
        expect(api.push, name).toHaveBeenCalledWith({
          name: 'Deal',
          params: { dealId: 'DEAL-1' },
          hash,
        })
      }
    })

    it('falls back to a list when there is no deal yet', async () => {
      api.call.mockResolvedValue('')
      const wrapper = mount()
      await stepNamed(wrapper, 'create_first_task').onClick()
      expect(api.push).toHaveBeenCalledWith({ name: 'Tasks' })
    })

    it('uses the deal it already knows about rather than asking again', async () => {
      localStorage.setItem('firstDealada@x.com', 'DEAL-9')
      const wrapper = mount()
      await stepNamed(wrapper, 'create_first_note').onClick()
      expect(api.call).not.toHaveBeenCalled()
      expect(api.push).toHaveBeenCalledWith({
        name: 'Deal',
        params: { dealId: 'DEAL-9' },
        hash: '#notes',
      })
    })

    it('shows a walkthrough before converting a lead', async () => {
      const wrapper = mount()
      await stepNamed(wrapper, 'convert_lead_to_deal').onClick()
      expect(wrapper.vm.showIntermediateModal).toBe(true)
      expect(wrapper.vm.currentStep.videoURL).toContain('convertToDeal')
    })

    it('goes to the lead once the walkthrough is dismissed', async () => {
      api.call.mockResolvedValue('LEAD-1')
      const wrapper = mount()
      await stepNamed(wrapper, 'convert_lead_to_deal').onClick()
      await wrapper.vm.currentStep.onClick()
      expect(wrapper.vm.showIntermediateModal).toBe(false)
      expect(api.push).toHaveBeenCalledWith({
        name: 'Lead',
        params: { leadId: 'LEAD-1' },
      })
    })

    it('falls back to the leads list when there is no lead', async () => {
      api.call.mockResolvedValue('')
      const wrapper = mount()
      await stepNamed(wrapper, 'convert_lead_to_deal').onClick()
      await wrapper.vm.currentStep.onClick()
      expect(api.push).toHaveBeenCalledWith({ name: 'Leads' })
    })

    it('shows a walkthrough before changing a deal status', async () => {
      const wrapper = mount()
      await stepNamed(wrapper, 'change_deal_status').onClick()
      expect(wrapper.vm.currentStep.videoURL).toContain('changeDealStatus')
    })

    it('collapses the onboarding panel on every step', async () => {
      // Each step either navigates or opens a dialog. Leaving the panel
      // expanded covers whatever the click just opened, so this is not
      // decoration — it is the step actually being usable.
      const wrapper = mount()
      for (const step of wrapper.vm.steps) {
        api.minimize.value = false
        await step.onClick()
        expect(api.minimize.value, step.name).toBe(true)
      }
    })

    it('records every step click', async () => {
      const wrapper = mount()
      for (const step of wrapper.vm.steps) {
        api.capture.mockClear()
        await step.onClick()
        expect(api.capture, step.name).toHaveBeenCalledWith(
          expect.stringMatching(/^onboarding_step_clicked_/),
        )
      }
    })

    it('names the event after the step, bar one', () => {
      // `setup_your_password` reports itself as `..._setup_password`. Pinned
      // rather than corrected: renaming a telemetry event breaks continuity
      // with whatever has already been recorded under the old name.
      const wrapper = mount()
      const odd = wrapper.vm.steps.find((s) => s.name === 'setup_your_password')
      odd.onClick()
      expect(api.capture).toHaveBeenCalledWith(
        'onboarding_step_clicked_setup_password',
      )
    })
  })

  describe('the help centre', () => {
    it('groups the articles', () => {
      const wrapper = mount()
      expect(wrapper.vm.articles.length).toBeGreaterThan(1)
      expect(
        wrapper.vm.articles.every((a) => a.subArticles?.length > 0),
      ).toBe(true)
    })

    it('starts with every group closed', () => {
      expect(mount().vm.articles.every((a) => a.opened === false)).toBe(true)
    })

    it('gives every article a name to fetch it by', () => {
      const wrapper = mount()
      const all = wrapper.vm.articles.flatMap((a) => a.subArticles)
      expect(all.every((s) => s.name && s.title)).toBe(true)
    })

    it('names each article only once', () => {
      const names = mount()
        .vm.articles.flatMap((a) => a.subArticles)
        .map((s) => s.name)
      expect(new Set(names).size).toBe(names.length)
    })
  })
})

describe('AppHeader', () => {
  const mount = (routeName = 'Leads') => {
    api.route = reactive({ name: routeName, params: {}, query: {} })
    return mountComponent(AppHeader, { global: { stubs: STUBS } })
  }

  // The search icon is a bare button that is always present, so the Create
  // button has to be picked out by its label.
  const createButton = (wrapper) =>
    wrapper.findAll('button').find((b) => b.text().includes('Create'))

  beforeEach(() => {
    api.isMobile.value = false
    api.mobileSidebarOpened.value = false
    api.isCommandPaletteOpen.value = false
    api.pageCreateAction.value = null
    api.headerPrimaryActionPresent.value = false
    api.createDocument.mockClear()
  })

  describe('what Create makes', () => {
    it('makes the record the list is showing', () => {
      for (const [route, doctype] of [
        ['Leads', 'CRM Lead'],
        ['Deals', 'CRM Deal'],
        ['Contacts', 'Contact'],
        ['Organizations', 'CRM Organization'],
        ['Tasks', 'CRM Task'],
      ]) {
        expect(mount(route).vm.currentDoctype, route).toBe(doctype)
      }
    })

    it('has nothing to make on a page that is not a record list', () => {
      // Notes, Calendar and Call Logs register their own create flow instead.
      for (const route of ['Dashboard', 'Calendar', 'Call Logs', 'Notes']) {
        expect(mount(route).vm.currentDoctype, route).toBeUndefined()
      }
    })

    it('creates the doctype for the current list, and refreshes it after', async () => {
      // The 4th argument is the callback createDocument fires on insert. The
      // header has no handle on the list resource (ViewControls owns it), so
      // without it a record created from here only showed up on a manual
      // reload. It routes through pageReloadAction, which list pages register.
      const wrapper = mount('Deals')
      await createButton(wrapper).trigger('click')
      expect(api.createDocument).toHaveBeenCalledWith(
        'CRM Deal',
        {},
        null,
        expect.any(Function),
      )
    })

    it('prefers the create flow the page registered', async () => {
      const pageAction = vi.fn()
      api.pageCreateAction.value = pageAction
      const wrapper = mount('Notes')
      await nextTick()
      await createButton(wrapper).trigger('click')
      expect(pageAction).toHaveBeenCalled()
      expect(api.createDocument).not.toHaveBeenCalled()
    })

    it('offers a menu of everything when the page has no create of its own', () => {
      const wrapper = mount('Dashboard')
      const menu = wrapper.findComponent({ name: 'DropdownStub' })
      expect(menu.props('options')[0].items.map((i) => i.label)).toEqual([
        'Lead',
        'Deal',
        'Contact',
        'Organization',
        'Task',
      ])
    })

    it('creates the right doctype from that menu', () => {
      const wrapper = mount('Dashboard')
      wrapper
        .findComponent({ name: 'DropdownStub' })
        .props('options')[0]
        .items[1].onClick()
      expect(api.createDocument).toHaveBeenCalledWith('CRM Deal')
    })
  })

  describe('on a record page', () => {
    it('recognises the detail routes', () => {
      for (const route of ['Lead', 'Deal', 'Contact', 'Organization', 'Task', 'Note']) {
        expect(mount(route).vm.isDetailPage, route).toBe(true)
      }
      expect(mount('Leads').vm.isDetailPage).toBe(false)
    })

    it('hides Create — the page has its own primary action', () => {
      // Otherwise the header offers "new lead" while you are reading one.
      const wrapper = mount('Deal')
      expect(wrapper.findComponent({ name: 'DropdownStub' }).exists()).toBe(false)
      expect(createButton(wrapper)).toBeUndefined()
    })
  })

  describe('on a phone', () => {
    it('offers the menu button', async () => {
      api.isMobile.value = true
      const wrapper = mount('Deal')
      await nextTick()
      expect(wrapper.find('[aria-label="Toggle navigation menu"]').exists()).toBe(
        true,
      )
    })

    it('has no menu button on a wide screen, where the sidebar is always there', () => {
      expect(
        mount('Deal').find('[aria-label="Toggle navigation menu"]').exists(),
      ).toBe(false)
    })

    it('opens and closes the sidebar', () => {
      const wrapper = mount('Leads')
      wrapper.vm.toggleSidebar()
      expect(api.mobileSidebarOpened.value).toBe(true)
      wrapper.vm.toggleSidebar()
      expect(api.mobileSidebarOpened.value).toBe(false)
    })
  })

  it('opens search from the header', () => {
    const wrapper = mount('Leads')
    wrapper.vm.openCommandPalette()
    expect(api.isCommandPaletteOpen.value).toBe(true)
  })

  it('keeps the call widget mounted across pages', () => {
    expect(mount('Leads').findComponent({ name: 'CallUIStub' }).exists()).toBe(
      true,
    )
  })
})

describe('DesktopLayout', () => {
  const mount = () =>
    mountComponent(DesktopLayout, {
      slots: { default: '<div class="page">page</div>' },
      global: { stubs: STUBS },
    })

  it('puts the sidebar beside the page', () => {
    const wrapper = mount()
    expect(wrapper.findComponent({ name: 'AppSidebarStub' }).exists()).toBe(true)
    expect(wrapper.find('.page').exists()).toBe(true)
  })

  it('carries the header, notifications and the shared modals', () => {
    const wrapper = mount()
    for (const name of ['AppHeaderStub', 'NotificationsStub', 'GlobalModalsStub']) {
      expect(wrapper.findComponent({ name }).exists(), name).toBe(true)
    }
  })

  it('offers a skip link to the content', () => {
    // Without it, keyboard users tab through the whole sidebar on every page.
    const wrapper = mount()
    const link = wrapper.find('a[href="#main-content"]')
    expect(link.exists()).toBe(true)
    expect(wrapper.find('#main-content').exists()).toBe(true)
  })
})

describe('MobileLayout', () => {
  const mount = () =>
    mountComponent(MobileLayout, {
      slots: { default: '<div class="page">page</div>' },
      global: { stubs: STUBS },
    })

  it('uses the mobile sidebar, not the desktop one', () => {
    const wrapper = mount()
    expect(wrapper.findComponent({ name: 'MobileSidebarStub' }).exists()).toBe(
      true,
    )
    expect(wrapper.findComponent({ name: 'AppSidebarStub' }).exists()).toBe(false)
  })

  it('shows the page', () => {
    expect(mount().find('.page').exists()).toBe(true)
  })

  it('carries the same header and modals as the desktop layout', () => {
    const wrapper = mount()
    for (const name of ['AppHeaderStub', 'NotificationsStub', 'GlobalModalsStub']) {
      expect(wrapper.findComponent({ name }).exists(), name).toBe(true)
    }
  })
})

describe('SettingsLayoutBase', () => {
  const mount = (props = {}, slots = {}) =>
    mountComponent(SettingsLayoutBase, {
      props,
      slots,
      global: { stubs: STUBS },
    })

  it('shows the title and description', () => {
    const wrapper = mount({ title: 'Email', description: 'Connect an inbox' })
    expect(wrapper.text()).toContain('Email')
    expect(wrapper.text()).toContain('Connect an inbox')
  })

  it('leaves out the description when there is none', () => {
    expect(mount({ title: 'Email' }).find('p').exists()).toBe(false)
  })

  it('lets the caller replace the title entirely', () => {
    const wrapper = mount(
      { title: 'Email' },
      { title: '<span class="custom">Custom</span>' },
    )
    expect(wrapper.find('.custom').exists()).toBe(true)
  })

  it('shows the description slot even with no description prop', () => {
    const wrapper = mount({}, { description: '<p class="d">From a slot</p>' })
    expect(wrapper.find('.d').exists()).toBe(true)
  })

  it('shows header actions only when given', () => {
    expect(mount({}).html()).not.toContain('header-action')
    const wrapper = mount({}, { 'header-actions': '<button class="header-action" />' })
    expect(wrapper.find('.header-action').exists()).toBe(true)
  })

  it('shows the header-bottom band only when given', () => {
    const wrapper = mount({}, { 'header-bottom': '<div class="band" />' })
    expect(wrapper.find('.band').exists()).toBe(true)
    expect(mount({}).find('.band').exists()).toBe(false)
  })

  it('scrolls the content, not the header', () => {
    const wrapper = mount({}, { content: '<div class="c">rows</div>' })
    expect(wrapper.find('.c').exists()).toBe(true)
    expect(wrapper.html()).toContain('overflow-y-auto')
  })
})
