const api = vi.hoisted(() => ({
  toast: null,
  invite: null,
  pending: null,
  users: null,
  isAdmin: true,
  capture: vi.fn(),
  updateOnboardingStep: vi.fn(),
}))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  api.toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
  return {
    ...actual,
    toast: api.toast,
    createResource: (options = {}) => {
      api.invite = reactive({ ...options, data: null, submit: vi.fn(), fetch: vi.fn() })
      return api.invite
    },
    createListResource: (options = {}) => {
      api.pending = reactive({ ...options, data: [], reload: vi.fn(), fetch: vi.fn() })
      return api.pending
    },
  }
})

vi.mock('frappe-ui/frappe', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useTelemetry: () => ({ capture: api.capture }),
    useOnboarding: () => ({ updateOnboardingStep: api.updateOnboardingStep }),
  }
})

vi.mock('@/stores/users', async () => {
  const { reactive } = await import('vue')
  api.users = reactive({ data: { crmUsers: [] }, reload: vi.fn() })
  return {
    usersStore: () => ({
      users: api.users,
      isAdmin: () => api.isAdmin,
      isManager: () => true,
      getUser: (e) => ({ name: e, email: e, full_name: e }),
    }),
  }
})

import InviteUserPage from '@/components/Settings/InviteUserPage.vue'
import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'

const mount = () =>
  mountComponent(InviteUserPage, {
    global: {
      stubs: { SettingsLayoutBase: true, Avatar: true, ErrorMessage: true },
    },
  })

describe('InviteUserPage', () => {
  beforeEach(() => {
    api.toast.success.mockClear()
    api.toast.error.mockClear()
    api.toast.info.mockClear()
    api.capture.mockClear()
    api.updateOnboardingStep.mockClear()
    api.isAdmin = true
    api.users.data = { crmUsers: [] }
  })

  describe('collecting addresses', () => {
    it('splits a comma-separated list', () => {
      const wrapper = mount()
      wrapper.vm.updateInvitees('ada@x.com,grace@x.com')
      expect(wrapper.vm.invitees).toEqual(['ada@x.com', 'grace@x.com'])
    })

    it('trims each one', () => {
      const wrapper = mount()
      wrapper.vm.updateInvitees(' ada@x.com , grace@x.com ')
      expect(wrapper.vm.invitees).toEqual(['ada@x.com', 'grace@x.com'])
    })

    it('drops anything that is not an address', () => {
      // Pasting a list often brings names and separators along with it.
      const wrapper = mount()
      wrapper.vm.updateInvitees('ada@x.com, Ada Lovelace, grace@x.com')
      expect(wrapper.vm.invitees).toEqual(['ada@x.com', 'grace@x.com'])
    })

    it('ends up empty when nothing is valid', () => {
      const wrapper = mount()
      wrapper.vm.updateInvitees('not-an-email')
      expect(wrapper.vm.invitees).toEqual([])
    })

    it('handles a single address with no comma', () => {
      const wrapper = mount()
      wrapper.vm.updateInvitees('ada@x.com')
      expect(wrapper.vm.invitees).toEqual(['ada@x.com'])
    })
  })

  describe('warning about existing users', () => {
    it('says nothing before anything is typed', () => {
      expect(mount().vm.userExistMessage).toBeNull()
    })

    it('names an address that is already a user', async () => {
      api.users.data = { crmUsers: [{ name: 'ada@x.com' }] }
      const wrapper = mount()
      wrapper.vm.updateInvitees('ada@x.com,grace@x.com')
      await nextTick()
      expect(wrapper.vm.userExistMessage).toBe(
        'User with email ada@x.com already exists',
      )
    })

    it('names all of them', async () => {
      api.users.data = {
        crmUsers: [{ name: 'ada@x.com' }, { name: 'grace@x.com' }],
      }
      const wrapper = mount()
      wrapper.vm.updateInvitees('ada@x.com,grace@x.com')
      await nextTick()
      expect(wrapper.vm.userExistMessage).toContain('ada@x.com')
      expect(wrapper.vm.userExistMessage).toContain('grace@x.com')
    })

    it('says nothing when none of them exist', async () => {
      api.users.data = { crmUsers: [{ name: 'someone@x.com' }] }
      const wrapper = mount()
      wrapper.vm.updateInvitees('ada@x.com')
      await nextTick()
      expect(wrapper.vm.userExistMessage).toBeNull()
    })

    it('says nothing before the user list has loaded', async () => {
      api.users.data = null
      const wrapper = mount()
      wrapper.vm.updateInvitees('ada@x.com')
      await nextTick()
      expect(wrapper.vm.userExistMessage).toBeNull()
    })
  })

  describe('warning about pending invitations', () => {
    it('names an address that is already invited', async () => {
      // Inviting twice would send a second password email and confuse them.
      const wrapper = mount()
      api.pending.data = [{ email: 'ada@x.com' }]
      wrapper.vm.updateInvitees('ada@x.com')
      await nextTick()
      expect(wrapper.vm.inviteeExistMessage).toBe(
        'User with email ada@x.com already invited',
      )
    })

    it('says nothing when there are no pending invitations', async () => {
      const wrapper = mount()
      api.pending.data = []
      wrapper.vm.updateInvitees('ada@x.com')
      await nextTick()
      expect(wrapper.vm.inviteeExistMessage).toBeNull()
    })
  })

  describe('which roles may be granted', () => {
    it('lets an admin grant any of the three', () => {
      expect(mount().vm.roleOptions.map((o) => o.value)).toEqual([
        'Sales User',
        'Sales Manager',
        'Company Admin',
      ])
    })

    it('limits a non-admin to Sales User', () => {
      // A manager can invite people but not create peers or superiors.
      api.isAdmin = false
      expect(mount().vm.roleOptions.map((o) => o.value)).toEqual(['Sales User'])
    })

    it('starts on the least privileged role', () => {
      expect(mount().vm.role).toBe('Sales User')
    })

    it('explains what each role can do', async () => {
      const wrapper = mount()
      for (const role of ['Sales User', 'Sales Manager', 'Company Admin']) {
        wrapper.vm.role = role
        await nextTick()
        expect(wrapper.vm.description, role).toBeTruthy()
      }
    })
  })

  describe('sending', () => {
    it('sends the addresses and the chosen role', () => {
      const wrapper = mount()
      wrapper.vm.updateInvitees('ada@x.com,grace@x.com')
      wrapper.vm.role = 'Sales Manager'
      expect(api.invite.makeParams()).toEqual({
        emails: 'ada@x.com,grace@x.com',
        role: 'Sales Manager',
      })
    })

    it('confirms a single invitation', () => {
      mount()
      api.invite.onSuccess({ invited: ['ada@x.com'] })
      expect(api.toast.success).toHaveBeenCalledWith('Invitation sent')
    })

    it('counts several', () => {
      mount()
      api.invite.onSuccess({ invited: ['ada@x.com', 'grace@x.com'] })
      expect(api.toast.success).toHaveBeenCalledWith('2 invitations sent')
    })

    it('clears the form afterwards', () => {
      const wrapper = mount()
      wrapper.vm.updateInvitees('ada@x.com')
      wrapper.vm.role = 'Company Admin'
      api.invite.onSuccess({ invited: ['ada@x.com'] })
      expect(wrapper.vm.invitees).toEqual([])
      expect(wrapper.vm.role).toBe('Sales User')
      expect(wrapper.vm.error).toBeNull()
    })

    it('marks the onboarding step done', () => {
      mount()
      api.invite.onSuccess({ invited: ['ada@x.com'] })
      expect(api.updateOnboardingStep).toHaveBeenCalledWith('invite_your_team')
      expect(api.capture).toHaveBeenCalledWith('user_invited')
    })

    it('reports addresses that were skipped', () => {
      // A silent no-op would look like success.
      mount()
      api.invite.onSuccess({ invited: [], skipped: ['ada@x.com'] })
      expect(api.toast.info).toHaveBeenCalledWith('Already a user: ada@x.com')
    })

    it('reports each failure with its reason', () => {
      mount()
      api.invite.onSuccess({
        invited: [],
        failed: [{ email: 'ada@x.com', reason: 'Mailbox full' }],
      })
      expect(api.toast.error).toHaveBeenCalledWith('ada@x.com: Mailbox full')
    })

    it('reports a partial batch honestly', () => {
      mount()
      api.invite.onSuccess({
        invited: ['grace@x.com'],
        skipped: ['ada@x.com'],
        failed: [{ email: 'alan@x.com', reason: 'Bounced' }],
      })
      expect(api.toast.success).toHaveBeenCalledWith('Invitation sent')
      expect(api.toast.info).toHaveBeenCalled()
      expect(api.toast.error).toHaveBeenCalled()
    })

    it('claims no success when nothing was invited', () => {
      mount()
      api.invite.onSuccess({ invited: [], skipped: ['ada@x.com'] })
      expect(api.toast.success).not.toHaveBeenCalled()
      expect(api.updateOnboardingStep).not.toHaveBeenCalled()
    })

    it('copes with a response carrying no lists at all', () => {
      mount()
      expect(() => api.invite.onSuccess({})).not.toThrow()
      expect(() => api.invite.onSuccess(undefined)).not.toThrow()
    })
  })

  describe('when the request itself fails', () => {
    it('shows the server reason', () => {
      const wrapper = mount()
      api.invite.onError({ messages: ['Seat limit reached'] })
      expect(wrapper.vm.error).toBe('Seat limit reached')
      expect(api.toast.error).toHaveBeenCalledWith('Seat limit reached')
    })

    it('never shows an empty toast', () => {
      // Regression: there was no fallback, so a plain Error left `error`
      // undefined and popped a blank toast.
      const wrapper = mount()
      api.invite.onError(new Error('offline'))
      expect(wrapper.vm.error).toBe('offline')
      expect(api.toast.error).toHaveBeenCalledWith('offline')
    })

    it('falls back when the failure carries nothing', () => {
      const wrapper = mount()
      api.invite.onError({})
      expect(wrapper.vm.error).toBe('Could not send invitations')
      expect(api.toast.error).not.toHaveBeenCalledWith(undefined)
    })
  })

  describe('pending invitations', () => {
    it('fetches only the ones still outstanding', () => {
      mount()
      expect(api.pending.filters).toEqual({ status: 'Pending' })
    })
  })
})
