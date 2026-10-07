const api = vi.hoisted(() => ({
  isManager: true,
  whatsappInstalled: null,
  activeSettingsPage: null,
  showSettings: null,
}))

// Settings.vue imports every settings panel, and their module graphs reach
// stores/settings.js, which builds an auto-fetching document resource at module
// scope. Stubbing the components does not help — the modules still run.
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
      save: { submit: vi.fn() },
    })
  return {
    ...actual,
    createResource: inert,
    createListResource: inert,
    createDocumentResource: inert,
  }
})

vi.mock('@/stores/users', () => ({
  usersStore: () => ({
    isManager: () => api.isManager,
    getUser: () => ({ full_name: 'Ada Lovelace', user_image: '' }),
    users: { data: { crmUsers: [] } },
  }),
}))

vi.mock('@/composables/whatsapp', async () => {
  const { ref } = await import('vue')
  api.whatsappInstalled = ref(false)
  return { isWhatsappInstalled: api.whatsappInstalled, whatsappEnabled: ref(false) }
})

vi.mock('@/composables/settings', async () => {
  const { ref } = await import('vue')
  api.activeSettingsPage = ref('')
  api.showSettings = ref(true)
  return {
    showSettings: api.showSettings,
    activeSettingsPage: api.activeSettingsPage,
    disableSettingModalOutsideClick: ref(false),
    isMobileView: ref(false),
  }
})

import Settings from '@/components/Settings/Settings.vue'
import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'

const mount = () =>
  mountComponent(Settings, {
    global: {
      stubs: {
        SidebarLink: true, Avatar: true,
        ProfilePage: true, PreferencesSettings: true, GeneralSettings: true,
        DashboardSettings: true, DefaultsSettings: true, BrandSettings: true,
        CalendarSettings: true, Users: true, InviteUserPage: true,
        Hierarchy: true, EmailConfig: true, EmailTemplatePage: true,
        AssignmentRulePage: true, SlaConfig: true, FormsSettings: true,
        HomeActions: true, TelephonyPage: true, WhatsAppSettings: true,
        ERPNextSettings: true, LeadSyncSourcePage: true,
      },
    },
  })

const groupLabels = (w) => w.vm.tabs.map((t) => t.label)
const allItems = (w) => w.vm.tabs.flatMap((t) => t.items.map((i) => i.label))

describe('Settings shell', () => {
  beforeEach(() => {
    api.isManager = true
    api.whatsappInstalled.value = false
    api.activeSettingsPage.value = ''
  })

  describe('what a manager sees', () => {
    it('gets every group', () => {
      expect(groupLabels(mount())).toEqual([
        'User Configuration',
        'System Configuration',
        'User Management',
        'Email',
        'Automation & Rules',
        'Customization',
        'Integrations',
      ])
    })

    it('can manage users and the hierarchy', () => {
      expect(allItems(mount())).toEqual(
        expect.arrayContaining(['Users', 'Invite User', 'Sales Hierarchy']),
      )
    })
  })

  describe('what everyone else sees', () => {
    it('loses the manager-only groups', () => {
      api.isManager = false
      expect(groupLabels(mount())).toEqual([
        'User Configuration',
        'Email',
        'Integrations',
      ])
    })

    it('keeps their own profile and preferences', () => {
      // Nothing here is privileged; it is the user's own account.
      api.isManager = false
      expect(allItems(mount())).toEqual(
        expect.arrayContaining(['Profile', 'Preferences']),
      )
    })

    it('keeps email templates but loses email accounts', () => {
      // Templates are shared content; accounts are server configuration.
      api.isManager = false
      const items = allItems(mount())
      expect(items).toContain('Templates')
      expect(items).not.toContain('Accounts')
    })

    it('keeps telephony but loses the other integrations', () => {
      api.isManager = false
      const items = allItems(mount())
      expect(items).toContain('Telephony')
      expect(items).not.toContain('ERPNext')
      expect(items).not.toContain('Lead Syncing')
    })

    it('never sees a group left empty by filtering', () => {
      api.isManager = false
      for (const tab of mount().vm.tabs) {
        expect(tab.items.length, tab.label).toBeGreaterThan(0)
      }
    })
  })

  describe('WhatsApp', () => {
    it('is hidden when the app is not installed', () => {
      expect(allItems(mount())).not.toContain('WhatsApp')
    })

    it('appears once it is installed', () => {
      api.whatsappInstalled.value = true
      expect(allItems(mount())).toContain('WhatsApp')
    })

    it('stays hidden from a non-manager even when installed', () => {
      // Both conditions have to hold.
      api.whatsappInstalled.value = true
      api.isManager = false
      expect(allItems(mount())).not.toContain('WhatsApp')
    })
  })

  describe('the opening page', () => {
    it('is the first item of the first group', () => {
      expect(mount().vm.activeTab.label).toBe('Profile')
    })

    it('is still valid for a non-manager', () => {
      api.isManager = false
      expect(mount().vm.activeTab.label).toBe('Profile')
    })
  })

  describe('navigating to a page by name', () => {
    it('selects it', () => {
      const wrapper = mount()
      wrapper.vm.setActiveTab('Users')
      expect(wrapper.vm.activeTab.label).toBe('Users')
    })

    it('finds a page in any group', () => {
      const wrapper = mount()
      wrapper.vm.setActiveTab('Lead Syncing')
      expect(wrapper.vm.activeTab.label).toBe('Lead Syncing')
    })

    it('falls back to the first page for a name that does not exist', () => {
      // Otherwise the panel would render nothing at all.
      const wrapper = mount()
      wrapper.vm.setActiveTab('Nonexistent')
      expect(wrapper.vm.activeTab.label).toBe('Profile')
    })

    it('falls back for a page the user may not see', () => {
      api.isManager = false
      const wrapper = mount()
      wrapper.vm.setActiveTab('Users')
      expect(wrapper.vm.activeTab.label).toBe('Profile')
    })

    it('falls back when given nothing', () => {
      const wrapper = mount()
      wrapper.vm.setActiveTab('Users')
      wrapper.vm.setActiveTab('')
      expect(wrapper.vm.activeTab.label).toBe('Profile')
    })

    it('follows a request from elsewhere in the app', async () => {
      // Other screens deep-link into settings by setting this.
      const wrapper = mount()
      api.activeSettingsPage.value = 'Invite User'
      await nextTick()
      expect(wrapper.vm.activeTab.label).toBe('Invite User')
    })
  })

  describe('every page', () => {
    it('has a component to render', () => {
      for (const item of mount().vm.tabs.flatMap((t) => t.items)) {
        expect(item.component, item.label).toBeTruthy()
      }
    })

    it('has an icon', () => {
      for (const item of mount().vm.tabs.flatMap((t) => t.items)) {
        expect(item.icon, item.label).toBeTruthy()
      }
    })

    it('has a unique label, since navigation looks pages up by name', () => {
      const labels = allItems(mount())
      expect(new Set(labels).size).toBe(labels.length)
    })
  })
})
