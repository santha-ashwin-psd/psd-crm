const api = vi.hoisted(() => ({
  toast: null,
  docs: {},
  insert: null,
  setEnabled: vi.fn(),
  isEnabled: null,
  docOptions: {},
}))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  api.toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn() }
  return {
    ...actual,
    toast: api.toast,
    createResource: (options = {}) => {
      api.insert = reactive({ ...options, data: null, submit: vi.fn(), fetch: vi.fn() })
      return api.insert
    },
  }
})

vi.mock('@/composables/telephony', async () => {
  const { ref, computed } = await import('vue')
  // `isEnabled` is a function taking a provider name, not a ref.
  api.isEnabled = vi.fn(() => false)
  return {
    setEnabled: api.setEnabled,
    useTelephony: () => ({
      isEnabled: api.isEnabled,
      integrations: computed(() => []),
      isAnyEnabled: computed(() => false),
    }),
    callEnabled: ref(false),
  }
})

vi.mock('@/stores/users', () => ({
  usersStore: () => ({
    getUser: () => ({ name: 'ada@x.com', full_name: 'Ada' }),
    isManager: () => true,
  }),
}))

vi.mock('@/data/document', async () => {
  const { reactive } = await import('vue')
  return {
    useDocument: (doctype, name, options = {}) => {
      api.docOptions[doctype] = options
      const doc = reactive({
        doc: { enabled: false },
        originalDoc: { enabled: false },
        save: { submit: vi.fn() },
        reload: vi.fn(),
      })
      api.docs[doctype] = doc
      return { document: doc }
    },
  }
})

import TwilioSettings from '@/components/Settings/Telephony/TwilioSettings.vue'
import ExotelSettings from '@/components/Settings/Telephony/ExotelSettings.vue'
import TelephonySettings from '@/components/Settings/Telephony/TelephonySettings.vue'
import TelephonyPage from '@/components/Settings/Telephony/TelephonyPage.vue'
import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'

const SwitchStub = {
  props: ['modelValue', 'size', 'label'],
  template: '<button class="local-switch" />',
}

const STUBS = {
  Switch: SwitchStub,
  Combobox: true,
  SkeletonLoader: true,
  SettingsLayoutBase: true,
  Password: true,
  LoadingIndicator: true,
  PhoneIcon: true,
  LucidePhone: true,
}

describe('TwilioSettings', () => {
  const mount = () => mountComponent(TwilioSettings, { global: { stubs: STUBS } })
  const twilio = () => api.docs['CRM Twilio Settings']

  beforeEach(() => {
    api.setEnabled.mockClear()
    api.docs = {}
  })

  describe('the application list', () => {
    it('is empty until an account is configured', () => {
      const wrapper = mount()
      twilio().doc.twilio_apps = 'app-a,app-b'
      expect(wrapper.vm.twilioApps).toEqual([])
    })

    it('splits the stored comma-separated list', async () => {
      const wrapper = mount()
      twilio().doc.account_sid = 'AC123'
      twilio().doc.twilio_apps = 'app-a,app-b'
      await nextTick()
      expect(wrapper.vm.twilioApps).toEqual([
        { label: 'app-a', value: 'app-a' },
        { label: 'app-b', value: 'app-b' },
      ])
    })

    it('is empty when no applications have been fetched', async () => {
      const wrapper = mount()
      twilio().doc.account_sid = 'AC123'
      await nextTick()
      expect(wrapper.vm.twilioApps).toEqual([])
    })
  })

  describe('turning it on', () => {
    it('marks the document enabled without saving yet', () => {
      // The user still has credentials to fill in; saving now would store a
      // half-configured integration.
      const wrapper = mount()
      wrapper.vm.enable()
      expect(twilio().doc.enabled).toBe(true)
      expect(twilio().save.submit).not.toHaveBeenCalled()
    })
  })

  describe('turning it off', () => {
    it('saves immediately', () => {
      const wrapper = mount()
      wrapper.vm.disable()
      expect(twilio().doc.enabled).toBe(false)
      expect(twilio().save.submit).toHaveBeenCalled()
    })
  })

  describe('saving', () => {
    it('does not switch telephony on until the server accepts', () => {
      // Regression: `setEnabled` ran outside the callback, so a refused save
      // still lit up the Calls tab and the call button app-wide.
      const wrapper = mount()
      twilio().doc.enabled = true
      wrapper.vm.update()
      expect(api.setEnabled).not.toHaveBeenCalled()
    })

    it('switches it on once the save lands', () => {
      const wrapper = mount()
      twilio().doc.enabled = true
      wrapper.vm.update()
      twilio().save.submit.mock.calls[0][1].onSuccess()
      expect(api.setEnabled).toHaveBeenCalledWith('twilio', true)
    })

    it('reloads the document afterwards', () => {
      const wrapper = mount()
      wrapper.vm.update()
      twilio().save.submit.mock.calls[0][1].onSuccess()
      expect(twilio().reload).toHaveBeenCalled()
    })
  })

  describe('unsaved changes', () => {
    it('reports none on arrival', () => {
      expect(mount().vm.isDirty).toBe(false)
    })

    it('notices an edit', async () => {
      const wrapper = mount()
      twilio().doc.account_sid = 'AC123'
      await nextTick()
      expect(wrapper.vm.isDirty).toBe(true)
    })
  })

  describe('fetching applications', () => {
    it('reloads the document when the fetch succeeds', () => {
      mount()
      const options = api.docOptions['CRM Twilio Settings']
      options.whitelistedMethods.fetchTwilioApps.onSuccess()
      expect(twilio().reload).toHaveBeenCalled()
    })
  })
})

describe('ExotelSettings', () => {
  const mount = () => mountComponent(ExotelSettings, { global: { stubs: STUBS } })
  const exotel = () => api.docs['CRM Exotel Settings']

  beforeEach(() => {
    api.setEnabled.mockClear()
    api.docs = {}
  })

  it('marks the document enabled without saving yet', () => {
    const wrapper = mount()
    wrapper.vm.enable()
    expect(exotel().doc.enabled).toBe(true)
    expect(exotel().save.submit).not.toHaveBeenCalled()
  })

  it('saves immediately when switched off', () => {
    const wrapper = mount()
    wrapper.vm.disable()
    expect(exotel().doc.enabled).toBe(false)
    expect(exotel().save.submit).toHaveBeenCalled()
  })

  it('does not switch telephony on until the server accepts', () => {
    const wrapper = mount()
    exotel().doc.enabled = true
    wrapper.vm.update()
    expect(api.setEnabled).not.toHaveBeenCalled()
  })

  it('switches it on once the save lands', () => {
    const wrapper = mount()
    exotel().doc.enabled = true
    wrapper.vm.update()
    exotel().save.submit.mock.calls[0][1].onSuccess()
    expect(api.setEnabled).toHaveBeenCalledWith('exotel', true)
  })

  it('notices an edit', async () => {
    const wrapper = mount()
    exotel().doc.account_sid = 'EX123'
    await nextTick()
    expect(wrapper.vm.isDirty).toBe(true)
  })
})

describe('TelephonySettings', () => {
  const mount = () =>
    mountComponent(TelephonySettings, { global: { stubs: STUBS } })
  const agent = () => api.docs['CRM Telephony Agent']

  beforeEach(() => {
    api.toast.success.mockClear()
    api.toast.error.mockClear()
    api.docs = {}
  })

  describe('when the agent record does not exist yet', () => {
    const asNew = (wrapper) => {
      api.docOptions['CRM Telephony Agent'].onError({
        exc_type: 'DoesNotExistError',
      })
      return wrapper
    }

    it('starts an empty document rather than showing an error', () => {
      // Every user needs an agent record; not having one yet is the normal
      // first-visit state, not a failure.
      const wrapper = asNew(mount())
      expect(wrapper.vm.isNewDoc).toBe(true)
      expect(agent().doc).toEqual({})
    })

    it('inserts rather than saves', async () => {
      const wrapper = asNew(mount())
      agent().doc.twilio_number = '+1555'
      await nextTick()
      wrapper.vm.update()
      expect(api.insert.submit).toHaveBeenCalledWith({
        doc: {
          doctype: 'CRM Telephony Agent',
          user: 'ada@x.com',
          twilio_number: '+1555',
        },
      })
      expect(agent().save.submit).not.toHaveBeenCalled()
    })

    it('switches to saving once it has been created', () => {
      const wrapper = asNew(mount())
      api.insert.onSuccess({ name: 'ada@x.com', twilio_number: '+1555' })
      expect(wrapper.vm.isNewDoc).toBe(false)
      expect(api.toast.success).toHaveBeenCalledWith('Document created successfully')
    })

    it('leaves the created document clean', () => {
      // doc and originalDoc must be separate objects, or the next edit would
      // mutate both and isDirty would never fire again.
      const wrapper = asNew(mount())
      api.insert.onSuccess({ name: 'ada@x.com', twilio_number: '+1555' })
      expect(wrapper.vm.isDirty).toBe(false)
      expect(agent().doc).not.toBe(agent().originalDoc)
    })
  })

  describe('when the agent record exists', () => {
    it('saves rather than inserts', async () => {
      const wrapper = mount()
      agent().doc.twilio_number = '+1555'
      await nextTick()
      wrapper.vm.update()
      expect(agent().save.submit).toHaveBeenCalled()
      expect(api.insert.submit).not.toHaveBeenCalled()
    })

    it('does nothing when nothing changed', () => {
      const wrapper = mount()
      wrapper.vm.update()
      expect(agent().save.submit).not.toHaveBeenCalled()
      expect(api.insert.submit).not.toHaveBeenCalled()
    })
  })

  describe('reporting a failed insert', () => {
    it('shows every message the server returned', () => {
      mount()
      api.insert.onError({ messages: ['Number in use', 'Invalid prefix'] })
      expect(api.toast.error).toHaveBeenCalledWith('Number in use')
      expect(api.toast.error).toHaveBeenCalledWith('Invalid prefix')
    })

    it('still says something when there are no messages', () => {
      // Regression: `err.messages?.forEach(...)` is a no-op on a plain Error,
      // so a transport failure showed the user nothing at all.
      mount()
      api.insert.onError(new Error('Network request failed'))
      expect(api.toast.error).toHaveBeenCalledWith('Network request failed')
    })

    it('falls back when the failure carries nothing', () => {
      mount()
      api.insert.onError({})
      expect(api.toast.error).toHaveBeenCalledWith(
        'Failed to save telephony settings',
      )
    })

    it('says something even for an empty messages array', () => {
      mount()
      api.insert.onError({ messages: [] })
      expect(api.toast.error).toHaveBeenCalled()
    })
  })
})

describe('TelephonyPage', () => {
  const mount = () =>
    mountComponent(TelephonyPage, {
      global: {
        stubs: {
          TelephonySettings: true,
          ExotelSettings: true,
          TwilioSettings: true,
        },
      },
    })

  it('opens on the general telephony settings', () => {
    expect(mount().vm.step).toBe('telephony-settings')
  })

  it('switches to the provider a child asks for', () => {
    const wrapper = mount()
    wrapper.vm.updateStep('twilio-settings')
    expect(wrapper.vm.step).toBe('twilio-settings')
  })
})
