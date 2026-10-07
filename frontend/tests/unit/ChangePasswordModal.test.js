const api = vi.hoisted(() => ({ resource: null, toast: null, onboarding: vi.fn() }))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  api.toast = { success: vi.fn(), error: vi.fn() }
  return {
    ...actual,
    toast: api.toast,
    createResource: (options) => {
      api.resource = reactive({ ...options, submit: vi.fn(), fetch: vi.fn() })
      return api.resource
    },
  }
})

vi.mock('frappe-ui/frappe', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useOnboarding: () => ({ updateOnboardingStep: api.onboarding }) }
})

import ChangePasswordModal from '@/components/Modals/ChangePasswordModal.vue'
import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'

const mountModal = () =>
  mountComponent(ChangePasswordModal, {
    props: { modelValue: true },
    global: { stubs: { Dialog: true, Password: true, ErrorMessage: true } },
  })

/** Sets the three fields and lets the validation watcher run. */
const type = async (wrapper, { current = '', next = '', confirm = '' }) => {
  wrapper.vm.currentPassword = current
  wrapper.vm.newPassword = next
  wrapper.vm.confirmPassword = confirm
  await nextTick()
  return wrapper.vm.confirmPasswordMessage
}

const STRONG = 'Str0ng!pass'

describe('ChangePasswordModal', () => {
  beforeEach(() => {
    api.onboarding.mockClear()
    api.toast.success.mockClear()
    api.toast.error.mockClear()
  })

  describe('password strength', () => {
    it('says nothing before anything is typed', async () => {
      const wrapper = mountModal()
      expect(await type(wrapper, {})).toBe('')
    })

    it('rejects anything under eight characters', async () => {
      const wrapper = mountModal()
      expect(await type(wrapper, { next: 'Ab1!' })).toBe(
        'Password must be at least 8 characters',
      )
    })

    it('requires all four character classes', async () => {
      const wrapper = mountModal()
      const weak = 'Password must contain lowercase, uppercase, number, and symbol'
      expect(await type(wrapper, { next: 'alllowercase1!' })).toBe(weak)
      expect(await type(wrapper, { next: 'ALLUPPERCASE1!' })).toBe(weak)
      expect(await type(wrapper, { next: 'NoDigitsHere!' })).toBe(weak)
      expect(await type(wrapper, { next: 'NoSymbols123' })).toBe(weak)
    })

    it('accepts one with all four', async () => {
      const wrapper = mountModal()
      expect(await type(wrapper, { next: STRONG })).toBe('')
    })

    it('does not count a space as the symbol', async () => {
      // \s is excluded from the symbol class on purpose.
      const wrapper = mountModal()
      expect(await type(wrapper, { next: 'Abcdef 1g' })).toBe(
        'Password must contain lowercase, uppercase, number, and symbol',
      )
    })
  })

  describe('comparing the three fields', () => {
    it('refuses a new password identical to the current one', async () => {
      const wrapper = mountModal()
      expect(await type(wrapper, { current: STRONG, next: STRONG })).toBe(
        'New password cannot be the same as current password',
      )
    })

    it('reports a mismatch against the confirmation', async () => {
      const wrapper = mountModal()
      expect(await type(wrapper, { next: STRONG, confirm: 'Different1!' })).toBe(
        'Passwords do not match',
      )
    })

    it('confirms when they match', async () => {
      const wrapper = mountModal()
      expect(await type(wrapper, { next: STRONG, confirm: STRONG })).toBe(
        'Passwords match',
      )
    })

    it('reports weakness before mismatch', async () => {
      // Telling someone their passwords do not match is unhelpful when the
      // password would be rejected anyway.
      const wrapper = mountModal()
      expect(await type(wrapper, { next: 'weak', confirm: 'other' })).toBe(
        'Password must be at least 8 characters',
      )
    })

    it('clears the message when the fields are emptied', async () => {
      const wrapper = mountModal()
      await type(wrapper, { next: STRONG, confirm: 'nope' })
      expect(await type(wrapper, {})).toBe('')
    })
  })

  describe('submitting', () => {
    it('sends the old and new password', () => {
      const wrapper = mountModal()
      wrapper.vm.currentPassword = 'OldPass1!'
      wrapper.vm.newPassword = STRONG
      expect(api.resource.makeParams()).toEqual({
        old_password: 'OldPass1!',
        new_password: STRONG,
      })
    })

    it('confirms, closes and clears every field on success', async () => {
      const wrapper = mountModal()
      wrapper.vm.currentPassword = 'OldPass1!'
      wrapper.vm.newPassword = STRONG
      wrapper.vm.confirmPassword = STRONG
      api.resource.onSuccess()
      await nextTick()
      expect(api.toast.success).toHaveBeenCalled()
      expect(wrapper.vm.currentPassword).toBe('')
      expect(wrapper.vm.newPassword).toBe('')
      expect(wrapper.vm.confirmPassword).toBe('')
      expect(wrapper.emitted('update:modelValue').at(-1)[0]).toBe(false)
    })

    it('ticks off the onboarding step', () => {
      mountModal()
      api.resource.onSuccess()
      expect(api.onboarding).toHaveBeenCalledWith('setup_your_password')
    })

    it('shows the server message when it refuses', () => {
      mountModal()
      api.resource.onError({ messages: ['Incorrect current password'] })
      expect(api.toast.error).toHaveBeenCalledWith('Incorrect current password')
    })

    it('shows a fallback for an error with no message', () => {
      mountModal()
      api.resource.onError(new Error('offline'))
      expect(api.toast.error).toHaveBeenCalledWith('Failed to update password')
    })
  })
})
