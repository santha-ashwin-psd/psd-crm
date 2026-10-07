const api = vi.hoisted(() => ({
  toast: null,
  call: vi.fn(async () => ({})),
  users: null,
  isAdmin: true,
  isManager: false,
}))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  api.toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn() }
  return { ...actual, toast: api.toast, call: (...a) => api.call(...a) }
})

vi.mock('@/stores/users', async () => {
  const { reactive } = await import('vue')
  api.users = reactive({
    data: { crmUsers: [] },
    loading: false,
    reload: vi.fn(),
    next: vi.fn(),
    hasNextPage: false,
  })
  return {
    usersStore: () => ({
      users: api.users,
      isAdmin: () => api.isAdmin,
      isManager: () => api.isManager,
      getUser: (e) => ({ name: e, email: e, full_name: e }),
    }),
  }
})

vi.mock('@/composables/settings', async () => {
  const { ref } = await import('vue')
  return {
    activeSettingsPage: ref(''),
    isMobileView: ref(false),
    disableSettingModalOutsideClick: ref(false),
  }
})

import UsersSettings from '@/components/Settings/Users.vue'
import { mountComponent } from '../helpers/mount'

const crmUser = (name, over = {}) => ({
  name,
  full_name: name.split('@')[0],
  user_image: '',
  role: 'Sales User',
  ...over,
})

const mount = () =>
  mountComponent(UsersSettings, {
    global: {
      stubs: {
        SettingsLayoutBase: true, AddExistingUserModal: true,
        SkeletonLoader: true, EmptyState: true, Dropdown: true,
        Avatar: true, Tooltip: true,
      },
    },
  })

describe('Users settings', () => {
  beforeEach(() => {
    api.toast.success.mockClear()
    api.toast.error.mockClear()
    api.call.mockReset().mockResolvedValue({})
    api.isAdmin = true
    api.isManager = false
    api.users.data = {
      crmUsers: [
        crmUser('ada@x.com', { full_name: 'Ada Lovelace' }),
        crmUser('boss@x.com', { full_name: 'Grace Hopper', role: 'Sales Manager' }),
        crmUser('Administrator', { full_name: 'Administrator' }),
      ],
    }
  })

  describe('the list', () => {
    it('never shows Administrator', () => {
      // It is a system account, not a member of the workspace.
      expect(mount().vm.usersList.map((u) => u.name)).toEqual([
        'ada@x.com',
        'boss@x.com',
      ])
    })

    it('matches a search on full name', () => {
      const wrapper = mount()
      wrapper.vm.search = 'lovelace'
      expect(wrapper.vm.usersList.map((u) => u.name)).toEqual(['ada@x.com'])
    })

    it('matches a search on email', () => {
      const wrapper = mount()
      wrapper.vm.search = 'boss@'
      expect(wrapper.vm.usersList.map((u) => u.name)).toEqual(['boss@x.com'])
    })

    it('ignores case and padding', () => {
      const wrapper = mount()
      wrapper.vm.search = '  LOVELACE '
      expect(wrapper.vm.usersList).toHaveLength(1)
    })

    it('narrows by role', () => {
      const wrapper = mount()
      wrapper.vm.currentRole = 'Sales Manager'
      expect(wrapper.vm.usersList.map((u) => u.name)).toEqual(['boss@x.com'])
    })

    it('copes with no users loaded yet', () => {
      api.users.data = null
      expect(mount().vm.usersList).toEqual([])
    })
  })

  describe('who may change roles', () => {
    const labels = (wrapper, user) =>
      wrapper.vm.getDropdownOptions(user).map((o) => o.label)

    it('offers every role to an admin', () => {
      expect(labels(mount(), crmUser('ada@x.com'))).toEqual([
        'Company Admin',
        'Manager',
        'Sales User',
      ])
    })

    it('offers only Sales User to everyone else', () => {
      // Regression: the guard read `option.condition?.() || true`, which is
      // true for every input — so the filter removed nothing and a non-admin
      // was offered the admin and manager roles.
      api.isAdmin = false
      expect(labels(mount(), crmUser('ada@x.com'))).toEqual(['Sales User'])
    })

    it('keeps an option that declares no condition', () => {
      // `?? true` must still default an absent condition to visible.
      api.isAdmin = false
      expect(labels(mount(), crmUser('ada@x.com'))).toContain('Sales User')
    })

    it('marks the role the user already has', () => {
      const wrapper = mount()
      const options = wrapper.vm.getDropdownOptions(
        crmUser('boss@x.com', { role: 'Sales Manager' }),
      )
      expect(options.find((o) => o.label === 'Manager')).toBeDefined()
    })
  })

  describe('changing a role', () => {
    it('sends the new role', async () => {
      const wrapper = mount()
      wrapper.vm.updateRole(crmUser('ada@x.com'), 'Sales Manager')
      expect(api.call).toHaveBeenCalledWith(
        'xbr_crm.tenancy.admin.update_member_role',
        { user: 'ada@x.com', role: 'Sales Manager' },
      )
    })

    it('does nothing when the role is unchanged', () => {
      const wrapper = mount()
      wrapper.vm.updateRole(crmUser('ada@x.com', { role: 'Sales User' }), 'Sales User')
      expect(api.call).not.toHaveBeenCalled()
    })

    it('prefers the CRM role over the system role when comparing', () => {
      // crm_role is the authoritative one when both are present.
      const wrapper = mount()
      wrapper.vm.updateRole(
        crmUser('ada@x.com', { role: 'Sales User', crm_role: 'Sales Manager' }),
        'Sales Manager',
      )
      expect(api.call).not.toHaveBeenCalled()
    })

    it('confirms with a readable role name', async () => {
      const wrapper = mount()
      await wrapper.vm.updateRole(crmUser('ada@x.com'), 'Sales Manager')
      await Promise.resolve()
      expect(api.toast.success).toHaveBeenCalledWith(
        'ada has been granted Manager access',
      )
    })

    it('refreshes the list afterwards', async () => {
      const wrapper = mount()
      wrapper.vm.updateRole(crmUser('ada@x.com'), 'Sales Manager')
      await Promise.resolve()
      await Promise.resolve()
      expect(api.users.reload).toHaveBeenCalled()
    })

    it('shows a plain Error message rather than burying it', async () => {
      api.call.mockRejectedValue(new Error('offline'))
      const wrapper = mount()
      wrapper.vm.updateRole(crmUser('ada@x.com'), 'Sales Manager')
      await Promise.resolve()
      await Promise.resolve()
      expect(api.toast.error).toHaveBeenCalledWith('offline')
    })
  })

  describe('removing a user', () => {
    it('sends the removal', () => {
      const wrapper = mount()
      wrapper.vm.removeUser(crmUser('ada@x.com'))
      expect(api.call).toHaveBeenCalledWith('xbr_crm.tenancy.admin.remove_member', {
        user: 'ada@x.com',
      })
    })

    it('confirms once it lands', async () => {
      const wrapper = mount()
      wrapper.vm.removeUser(crmUser('ada@x.com', { full_name: 'Ada' }))
      await Promise.resolve()
      expect(api.toast.success).toHaveBeenCalledWith(
        'User Ada has been removed',
      )
    })

    it('reports the server reason when it refuses', async () => {
      api.call.mockRejectedValue({ messages: ['User owns open deals'] })
      const wrapper = mount()
      wrapper.vm.removeUser(crmUser('ada@x.com'))
      await Promise.resolve()
      await Promise.resolve()
      expect(api.toast.error).toHaveBeenCalledWith('User owns open deals')
    })

    it('is offered behind a confirmation', () => {
      const labels = mount().vm.getMoreOptions(crmUser('ada@x.com')).map((o) => o.label)
      expect(labels).toContain('Remove')
    })
  })

  describe('role presentation', () => {
    it('gives admins a shield', () => {
      const wrapper = mount()
      expect(wrapper.vm.roleIcon('Company Admin')).toBe('shield')
      expect(wrapper.vm.roleIcon('System Manager')).toBe('shield')
    })

    it('gives managers a briefcase', () => {
      expect(mount().vm.roleIcon('Sales Manager')).toBe('briefcase')
    })

    it('falls back for anything else', () => {
      expect(mount().vm.roleIcon('Sales User')).toBe('user-check')
      expect(mount().vm.roleIcon(undefined)).toBe('user-check')
    })

    it('shows System Manager as Admin', () => {
      // The internal name would mean nothing to the person reading it.
      expect(mount().vm.roleMap['System Manager']).toBe('Admin')
    })

    it('offers every role in the filter', () => {
      expect(mount().vm.roleFilterOptions.map((o) => o.value)).toEqual([
        'All',
        'Company Admin',
        'Sales Manager',
        'Sales User',
      ])
    })
  })
})
