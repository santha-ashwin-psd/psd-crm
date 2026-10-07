const api = vi.hoisted(() => ({ toast: null, user: null, shortcuts: null }))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  api.toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn() }
  return {
    ...actual,
    toast: api.toast,
    createDocumentResource: (options = {}) => {
      const doc = {
        first_name: 'Ada',
        last_name: 'Lovelace',
        user_image: '',
        email: 'ada@x.com',
      }
      api.user = reactive({
        ...options,
        doc,
        originalDoc: { ...doc },
        save: { submit: vi.fn() },
      })
      return api.user
    },
  }
})

vi.mock('@/composables/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: (config) => {
    api.shortcuts = config.shortcuts
  },
}))

import ProfileSettings from '@/components/Settings/Profile/ProfileSettings.vue'
import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'

const STUBS = {
  SettingsLayoutBase: true,
  ChangePasswordModal: true,
  FileUploader: true,
  Avatar: true,
  Tooltip: true,
  LoadingIndicator: true,
}

const mount = () =>
  mountComponent(ProfileSettings, {
    global: { stubs: STUBS, provide: { session: { user: 'ada@x.com' } } },
  })

describe('ProfileSettings', () => {
  beforeEach(() => {
    api.toast.success.mockClear()
    api.toast.error.mockClear()
  })

  describe('the display name', () => {
    it('joins the two name fields', () => {
      expect(mount().vm.fullName).toBe('Ada Lovelace')
    })

    it('omits the gap when there is no surname', async () => {
      const wrapper = mount()
      api.user.doc.last_name = ''
      await nextTick()
      expect(wrapper.vm.fullName).toBe('Ada')
    })

    it('is empty when neither is set', async () => {
      const wrapper = mount()
      api.user.doc.first_name = ''
      api.user.doc.last_name = ''
      await nextTick()
      expect(wrapper.vm.fullName).toBe('')
    })

    it('splits an edit at the first space', () => {
      const wrapper = mount()
      wrapper.vm.fullName = 'Grace Hopper'
      expect(api.user.doc.first_name).toBe('Grace')
      expect(api.user.doc.last_name).toBe('Hopper')
    })

    it('keeps a multi-part surname together', () => {
      // Only the first token is the given name; everything after it belongs to
      // the surname, not just the second word.
      const wrapper = mount()
      wrapper.vm.fullName = 'Ada King Lovelace'
      expect(api.user.doc.first_name).toBe('Ada')
      expect(api.user.doc.last_name).toBe('King Lovelace')
    })

    it('clears the surname for a single-word name', () => {
      const wrapper = mount()
      wrapper.vm.fullName = 'Prince'
      expect(api.user.doc.first_name).toBe('Prince')
      expect(api.user.doc.last_name).toBe('')
    })
  })

  describe('the photo tooltip', () => {
    it('invites an upload when there is no photo', () => {
      expect(mount().vm.profileTooltipText).toBe('Upload Photo')
    })

    it('offers a change once there is one', async () => {
      const wrapper = mount()
      api.user.doc.user_image = '/files/ada.png'
      await nextTick()
      expect(wrapper.vm.profileTooltipText).toBe('Change Photo')
    })

    it('switches to Remove while hovering the remove control', async () => {
      const wrapper = mount()
      api.user.doc.user_image = '/files/ada.png'
      wrapper.vm.isHoveringRemove = true
      await nextTick()
      expect(wrapper.vm.profileTooltipText).toBe('Remove Photo')
    })
  })

  describe('changing the photo', () => {
    it('stores the new url and saves', () => {
      const wrapper = mount()
      wrapper.vm.updateImage('/files/ada.png')
      expect(api.user.doc.user_image).toBe('/files/ada.png')
      expect(api.user.save.submit).toHaveBeenCalled()
    })

    it('removing it clears the field and saves', () => {
      const wrapper = mount()
      // Both sides: a photo the user already had saved. Setting only `doc`
      // would make clearing it a no-op change, and `save` would skip.
      api.user.doc.user_image = '/files/ada.png'
      api.user.originalDoc.user_image = '/files/ada.png'
      wrapper.vm.updateImage()
      expect(api.user.doc.user_image).toBe('')
      expect(api.user.save.submit).toHaveBeenCalled()
    })

    it('drops the hover state so the tooltip does not stick', async () => {
      // The remove control unmounts on click, so no mouseleave ever fires.
      const wrapper = mount()
      wrapper.vm.isHoveringRemove = true
      wrapper.vm.updateImage()
      await nextTick()
      expect(wrapper.vm.isHoveringRemove).toBe(false)
    })
  })

  describe('saving', () => {
    it('does nothing when nothing changed', () => {
      const wrapper = mount()
      wrapper.vm.save()
      expect(api.user.save.submit).not.toHaveBeenCalled()
    })

    it('still closes the name editor in that case', async () => {
      // Otherwise tabbing out of an untouched field leaves it stuck open.
      const wrapper = mount()
      wrapper.vm.editName = true
      wrapper.vm.save()
      await nextTick()
      expect(wrapper.vm.editName).toBe(false)
    })

    it('submits a real change', async () => {
      const wrapper = mount()
      api.user.doc.first_name = 'Grace'
      await nextTick()
      wrapper.vm.save()
      expect(api.user.save.submit).toHaveBeenCalled()
    })

    it('confirms and closes the editor once it lands', async () => {
      const wrapper = mount()
      api.user.doc.first_name = 'Grace'
      wrapper.vm.editName = true
      await nextTick()
      wrapper.vm.save()
      api.user.save.submit.mock.calls[0][1].onSuccess()
      await nextTick()
      expect(api.toast.success).toHaveBeenCalledWith('Profile Updated Successfully')
      expect(wrapper.vm.editName).toBe(false)
    })

    it('keeps the editor open when the server refuses', async () => {
      // The value is still unsaved, so closing would hide the edit the user
      // needs to correct.
      const wrapper = mount()
      api.user.doc.first_name = 'Grace'
      wrapper.vm.editName = true
      await nextTick()
      wrapper.vm.save()
      api.user.save.submit.mock.calls[0][1].onError({ messages: ['Not allowed'] })
      await nextTick()
      expect(wrapper.vm.editName).toBe(true)
      expect(api.toast.error).toHaveBeenCalledWith('Not allowed')
    })

    it('shows a plain Error message rather than burying it', async () => {
      const wrapper = mount()
      api.user.doc.first_name = 'Grace'
      await nextTick()
      wrapper.vm.save()
      api.user.save.submit.mock.calls[0][1].onError(new Error('offline'))
      expect(api.toast.error).toHaveBeenCalledWith('offline')
    })

    it('falls back when the failure carries nothing', async () => {
      const wrapper = mount()
      api.user.doc.first_name = 'Grace'
      await nextTick()
      wrapper.vm.save()
      api.user.save.submit.mock.calls[0][1].onError({})
      expect(api.toast.error).toHaveBeenCalledWith('Failed to update profile')
    })
  })

  describe('two-factor authentication', () => {
    it('opens the desk user page in a new tab', () => {
      // It is configured in the Frappe desk, not here.
      const open = vi.spyOn(window, 'open').mockImplementation(() => {})
      mount().vm.openTwoFactor()
      expect(open).toHaveBeenCalledWith('/app/user/ada@x.com', '_blank')
      open.mockRestore()
    })
  })

  describe('the save shortcut', () => {
    it('matches cmd+s and ctrl+s', () => {
      mount()
      const { match } = api.shortcuts[0]
      expect(match({ metaKey: true, key: 's' })).toBe(true)
      expect(match({ ctrlKey: true, key: 'S' })).toBe(true)
      // Falsy rather than strictly false: with neither modifier present the
      // expression short-circuits to `undefined`, which the shortcut layer
      // reads as no match.
      expect(match({ key: 's' })).toBeFalsy()
      expect(match({ metaKey: true, key: 'a' })).toBe(false)
    })

    it('saves only when there is something to save', async () => {
      mount()
      api.shortcuts[0].action()
      expect(api.user.save.submit).not.toHaveBeenCalled()

      api.user.doc.first_name = 'Grace'
      await nextTick()
      api.shortcuts[0].action()
      expect(api.user.save.submit).toHaveBeenCalled()
    })
  })
})
