const api = vi.hoisted(() => ({
  toast: null,
  user: null,
  resources: {},
  shortcuts: null,
  currentTheme: null,
  setTheme: vi.fn(),
}))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive, ref } = await import('vue')
  api.toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn() }
  api.currentTheme = ref('system')
  return {
    ...actual,
    toast: api.toast,
    useTheme: () => ({ currentTheme: api.currentTheme, setTheme: api.setTheme }),
    createResource: (options = {}) => {
      const r = reactive({ ...options, data: null, fetch: vi.fn(), reload: vi.fn() })
      // Two resources here; key them by the endpoint they call.
      if (options.url?.includes('get_single_value')) api.resources.language = r
      if (options.url?.includes('get_timezones')) api.resources.timezones = r
      return r
    },
    createDocumentResource: (options = {}) => {
      api.user = reactive({
        ...options,
        doc: { language: '', time_zone: 'Asia/Kolkata', full_name: 'Ada' },
        originalDoc: { language: '', time_zone: 'Asia/Kolkata', full_name: 'Ada' },
        save: { submit: vi.fn() },
      })
      return api.user
    },
  }
})

vi.mock('@/stores/settings', async () => {
  const { ref } = await import('vue')
  return {
    getSettings: () => ({
      brand: ref({ favicon: '/f.ico', name: 'Acme CRM' }),
      _settings: { doc: {} },
    }),
    isTranslatable: () => false,
  }
})

vi.mock('@/composables/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: (config) => {
    api.shortcuts = config.shortcuts
  },
}))

import PreferencesSettings from '@/components/Settings/PreferencesSettings.vue'
import ThemeSwitcher from '@/components/Settings/ThemeSwitcher.vue'
import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'

const STUBS = {
  SettingsLayoutBase: true,
  ThemeSwitcher: true,
  Link: true,
  Combobox: true,
  CRMLogo: true,
}

const mount = () =>
  mountComponent(PreferencesSettings, {
    global: { stubs: STUBS, provide: { session: { user: 'ada@x.com' } } },
  })

describe('PreferencesSettings', () => {
  let reload

  beforeEach(() => {
    api.toast.success.mockClear()
    api.toast.error.mockClear()
    api.resources = {}
    reload = vi.fn()
    // happy-dom's location.reload cannot be spied on directly.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload },
    })
  })

  describe('the language control', () => {
    it('shows the site default when the user has not chosen one', async () => {
      // An empty User.language means "inherit"; without the fallback the
      // control rendered blank and looked broken.
      const wrapper = mount()
      api.resources.language.data = 'fr'
      await nextTick()
      expect(wrapper.vm.language).toBe('fr')
    })

    it('prefers an explicit choice by the user', async () => {
      const wrapper = mount()
      api.resources.language.data = 'fr'
      api.user.doc.language = 'de'
      await nextTick()
      expect(wrapper.vm.language).toBe('de')
    })

    it('falls back to empty when neither is known', () => {
      expect(mount().vm.language).toBe('')
    })

    it('writes an explicit pick onto the document', () => {
      const wrapper = mount()
      wrapper.vm.language = 'es'
      expect(api.user.doc.language).toBe('es')
    })

    it('does not write the inherited value back', async () => {
      // Reading the fallback must not silently make it the user's own setting.
      const wrapper = mount()
      api.resources.language.data = 'fr'
      await nextTick()
      void wrapper.vm.language
      expect(api.user.doc.language).toBe('')
    })
  })

  describe('the timezone list', () => {
    it('is empty until it loads', () => {
      expect(mount().vm.getTimezoneOptions()).toEqual([])
    })

    it('offers each zone as a label and value', async () => {
      const wrapper = mount()
      api.resources.timezones.data = { timezones: ['Asia/Kolkata', 'UTC'] }
      await nextTick()
      expect(wrapper.vm.getTimezoneOptions()).toEqual([
        { label: 'Asia/Kolkata', value: 'Asia/Kolkata' },
        { label: 'UTC', value: 'UTC' },
      ])
    })
  })

  describe('unsaved changes', () => {
    it('reports none on arrival', () => {
      expect(mount().vm.isDirty).toBe(false)
    })

    it('notices an edit', async () => {
      const wrapper = mount()
      api.user.doc.full_name = 'Ada L'
      await nextTick()
      expect(wrapper.vm.isDirty).toBe(true)
    })
  })

  describe('saving', () => {
    it('confirms when it lands', () => {
      const wrapper = mount()
      wrapper.vm.save()
      api.user.save.submit.mock.calls[0][1].onSuccess()
      expect(api.toast.success).toHaveBeenCalledWith(
        'Preferences Updated Successfully',
      )
    })

    it('reloads the page after a language change', () => {
      // Translations are loaded once at boot, so the new language only takes
      // effect on a fresh load.
      const wrapper = mount()
      api.user.doc.language = 'fr'
      wrapper.vm.save()
      api.user.save.submit.mock.calls[0][1].onSuccess()
      expect(reload).toHaveBeenCalled()
    })

    it('reloads after a timezone change too', () => {
      const wrapper = mount()
      api.user.doc.time_zone = 'UTC'
      wrapper.vm.save()
      api.user.save.submit.mock.calls[0][1].onSuccess()
      expect(reload).toHaveBeenCalled()
    })

    it('does not reload for an unrelated change', () => {
      const wrapper = mount()
      api.user.doc.full_name = 'Ada L'
      wrapper.vm.save()
      api.user.save.submit.mock.calls[0][1].onSuccess()
      expect(reload).not.toHaveBeenCalled()
    })

    it('shows the server reason when it refuses', () => {
      const wrapper = mount()
      wrapper.vm.save()
      api.user.save.submit.mock.calls[0][1].onError({ messages: ['Not allowed'] })
      expect(api.toast.error).toHaveBeenCalledWith('Not allowed')
    })

    it('shows a plain Error message rather than burying it', () => {
      const wrapper = mount()
      wrapper.vm.save()
      api.user.save.submit.mock.calls[0][1].onError(new Error('offline'))
      expect(api.toast.error).toHaveBeenCalledWith('offline')
    })

    it('does not reload when the save failed', () => {
      const wrapper = mount()
      api.user.doc.language = 'fr'
      wrapper.vm.save()
      api.user.save.submit.mock.calls[0][1].onError({})
      expect(reload).not.toHaveBeenCalled()
    })
  })

  describe('the save shortcut', () => {
    const press = (over = {}) => ({
      metaKey: true,
      ctrlKey: false,
      key: 's',
      ...over,
    })

    it('is registered', () => {
      mount()
      expect(api.shortcuts).toHaveLength(1)
    })

    it('matches cmd+s and ctrl+s', () => {
      mount()
      const { match } = api.shortcuts[0]
      expect(match(press())).toBe(true)
      expect(match(press({ metaKey: false, ctrlKey: true }))).toBe(true)
    })

    it('matches an uppercase S', () => {
      // Held shift, or caps lock on.
      mount()
      expect(api.shortcuts[0].match(press({ key: 'S' }))).toBe(true)
    })

    it('ignores the key on its own', () => {
      mount()
      expect(
        api.shortcuts[0].match(press({ metaKey: false, ctrlKey: false })),
      ).toBe(false)
    })

    it('saves only when there is something to save', async () => {
      const wrapper = mount()
      api.shortcuts[0].action()
      expect(api.user.save.submit).not.toHaveBeenCalled()

      api.user.doc.full_name = 'Ada L'
      await nextTick()
      void wrapper.vm.isDirty
      api.shortcuts[0].action()
      expect(api.user.save.submit).toHaveBeenCalled()
    })
  })
})

describe('ThemeSwitcher', () => {
  const mount = () => mountComponent(ThemeSwitcher, { props: { name: 'Acme' } })

  it.each([
    ['light', 'light'],
    ['dark', 'dark'],
  ])('reports the %s theme', (current, expected) => {
    api.currentTheme.value = current
    expect(mount().vm.theme).toBe(expected)
  })

  it('reports anything else as following the system', () => {
    // frappe-ui stores no explicit value for "system", so the absence of light
    // or dark is what identifies it.
    api.currentTheme.value = null
    expect(mount().vm.theme).toBe('system')
  })

  it('treats an unknown value as system rather than erroring', () => {
    api.currentTheme.value = 'sepia'
    expect(mount().vm.theme).toBe('system')
  })

  it('applies a chosen theme', () => {
    const wrapper = mount()
    wrapper.vm.theme = 'dark'
    expect(api.setTheme).toHaveBeenCalledWith('dark')
  })
})
