const api = vi.hoisted(() => ({
  toast: null,
  settings: null,
  fcrm: null,
  fields: [],
  setupBrand: vi.fn(),
  showSettings: null,
}))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  api.toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
  return {
    ...actual,
    toast: api.toast,
    createDocumentResource: (options = {}) => {
      const doc = { currency: 'INR', currency_precision: '2' }
      api.settings = reactive({
        ...options,
        doc,
        originalDoc: { ...doc },
        save: { submit: vi.fn() },
      })
      return api.settings
    },
  }
})

vi.mock('@/stores/meta', () => ({
  getMeta: () => ({ getFields: () => api.fields }),
}))

vi.mock('@/stores/settings', async () => {
  const { reactive } = await import('vue')
  return {
    getSettings: () => {
      api.fcrm = reactive({
        doc: {
          update_timestamp_on_new_communication: 0,
          crm_timeline_timestamp_format: 'Relative',
          brand_logo: '',
          favicon: '',
        },
        save: { submit: vi.fn() },
      })
      return {
        _settings: api.fcrm,
        setupBrand: api.setupBrand,
        brand: { value: {} },
      }
    },
    isTranslatable: () => false,
  }
})

vi.mock('@/composables/settings', async () => {
  const { ref } = await import('vue')
  api.showSettings = ref(true)
  return {
    showSettings: api.showSettings,
    isMobileView: ref(false),
    activeSettingsPage: ref(''),
    disableSettingModalOutsideClick: ref(false),
  }
})

vi.mock('@/data/document', async () => {
  const { reactive } = await import('vue')
  return {
    useDocument: () => {
      api.fcrm = reactive({ doc: {}, save: { submit: vi.fn() } })
      return { document: api.fcrm, triggerOnChange: vi.fn() }
    },
  }
})

import DefaultsSettings from '@/components/Settings/DefaultsSettings.vue'
import GeneralSettings from '@/components/Settings/GeneralSettings.vue'
import BrandSettings from '@/components/Settings/BrandSettings.vue'
import HomeActions from '@/components/Settings/HomeActions.vue'
import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'

const STUBS = {
  SettingsLayoutBase: true, Link: true, Select: true, ImageUploader: true,
  Grid: true, ErrorMessage: true,
  Switch: { props: ['modelValue'], template: '<button />' },
}

const mount = (Component) =>
  mountComponent(Component, { global: { stubs: STUBS } })

describe('DefaultsSettings', () => {
  beforeEach(() => {
    api.toast.success.mockClear()
    api.toast.error.mockClear()
    api.fields = []
  })

  describe('the rows it offers', () => {
    it('covers currency, numbers, dates and times', () => {
      expect(mount(DefaultsSettings).vm.rows.map((r) => r.field)).toEqual([
        'currency',
        'currency_precision',
        'number_format',
        'float_precision',
        'date_format',
        'time_format',
      ])
    })

    it('makes currency a link to the Currency doctype', () => {
      // The others are plain selects off System Settings' own options.
      const row = mount(DefaultsSettings).vm.rows.find(
        (r) => r.field === 'currency',
      )
      expect(row.type).toBe('link')
      expect(row.doctype).toBe('Currency')
    })

    it('describes every row', () => {
      for (const row of mount(DefaultsSettings).vm.rows) {
        expect(row.title, row.field).toBeTruthy()
        expect(row.description, row.field).toBeTruthy()
      }
    })
  })

  describe('the options for a row', () => {
    it('come from the doctype meta', () => {
      api.fields = [{ fieldname: 'date_format', options: ['dd-mm-yyyy', 'yyyy-mm-dd'] }]
      expect(mount(DefaultsSettings).vm.getOptions('date_format')).toEqual([
        'dd-mm-yyyy',
        'yyyy-mm-dd',
      ])
    })

    it('are empty for a field the meta does not know', () => {
      expect(mount(DefaultsSettings).vm.getOptions('nonexistent')).toEqual([])
    })

    it('are empty before the meta loads', () => {
      api.fields = null
      expect(mount(DefaultsSettings).vm.getOptions('date_format')).toEqual([])
    })
  })

  describe('unsaved changes', () => {
    it('reports none on arrival', () => {
      expect(mount(DefaultsSettings).vm.isDirty).toBe(false)
    })

    it('notices an edit', async () => {
      const wrapper = mount(DefaultsSettings)
      api.settings.doc.currency = 'USD'
      await nextTick()
      expect(wrapper.vm.isDirty).toBe(true)
    })
  })

  describe('saving', () => {
    it('confirms when it lands', () => {
      const wrapper = mount(DefaultsSettings)
      wrapper.vm.updateSettings()
      api.settings.save.submit.mock.calls[0][1].onSuccess()
      expect(api.toast.success).toHaveBeenCalledWith(
        'Settings updated successfully',
      )
    })

    it('shows the server reason when it refuses', () => {
      const wrapper = mount(DefaultsSettings)
      wrapper.vm.updateSettings()
      api.settings.save.submit.mock.calls[0][1].onError({
        messages: ['Precision must be below 9'],
      })
      expect(api.toast.error).toHaveBeenCalledWith('Precision must be below 9')
    })

    it('shows a plain Error message rather than burying it', () => {
      const wrapper = mount(DefaultsSettings)
      wrapper.vm.updateSettings()
      api.settings.save.submit.mock.calls[0][1].onError(new Error('offline'))
      expect(api.toast.error).toHaveBeenCalledWith('offline')
    })

    it('falls back when the failure carries nothing', () => {
      const wrapper = mount(DefaultsSettings)
      wrapper.vm.updateSettings()
      api.settings.save.submit.mock.calls[0][1].onError({})
      expect(api.toast.error).toHaveBeenCalledWith('Failed to save settings')
    })
  })
})

describe('GeneralSettings', () => {
  beforeEach(() => {
    api.toast.success.mockClear()
  })

  describe('the rows it offers', () => {
    it('covers the three automation switches and two timeline choices', () => {
      expect(mount(GeneralSettings).vm.rows.map((r) => r.field)).toEqual([
        'update_timestamp_on_new_communication',
        'auto_mark_replied_on_response',
        'auto_reopen_on_new_communication',
        'crm_timeline_timestamp_format',
        'crm_timeline_sort_order',
      ])
    })

    it('marks each row as a switch or a select', () => {
      const types = new Set(mount(GeneralSettings).vm.rows.map((r) => r.type))
      expect(types).toEqual(new Set(['switch', 'select']))
    })

    it('offers relative and exact timestamps', () => {
      expect(
        mount(GeneralSettings).vm.timestampFormatOptions.map((o) => o.value),
      ).toEqual(['Relative', 'Exact'])
    })

    it('offers both timeline sort orders', () => {
      expect(
        mount(GeneralSettings).vm.sortOrderOptions.map((o) => o.value),
      ).toEqual(['Oldest First', 'Newest First'])
    })

    it('explains what each setting does', () => {
      for (const row of mount(GeneralSettings).vm.rows) {
        expect(row.description, row.field).toBeTruthy()
      }
    })
  })

  describe('toggling a switch', () => {
    it('writes the value and saves immediately', () => {
      // These settings have no Save button; each one persists on change.
      const wrapper = mount(GeneralSettings)
      wrapper.vm.onToggle('auto_mark_replied_on_response', true)
      expect(api.fcrm.doc.auto_mark_replied_on_response).toBe(true)
      expect(api.fcrm.save.submit).toHaveBeenCalled()
    })

    it('confirms which way it went', () => {
      const wrapper = mount(GeneralSettings)
      wrapper.vm.onToggle('auto_mark_replied_on_response', true)
      api.fcrm.save.submit.mock.calls[0][1].onSuccess()
      expect(api.toast.success).toHaveBeenCalledWith(
        'Setting enabled successfully',
      )

      api.toast.success.mockClear()
      wrapper.vm.onToggle('auto_mark_replied_on_response', false)
      api.fcrm.save.submit.mock.calls[1][1].onSuccess()
      expect(api.toast.success).toHaveBeenCalledWith(
        'Setting disabled successfully',
      )
    })
  })

  describe('choosing an option', () => {
    it('writes the value and saves immediately', () => {
      const wrapper = mount(GeneralSettings)
      wrapper.vm.onSelect('crm_timeline_sort_order', 'Newest First')
      expect(api.fcrm.doc.crm_timeline_sort_order).toBe('Newest First')
      api.fcrm.save.submit.mock.calls[0][1].onSuccess()
      expect(api.toast.success).toHaveBeenCalledWith(
        'Setting updated successfully',
      )
    })
  })
})

describe('BrandSettings', () => {
  it('offers a logo and a favicon', () => {
    expect(mount(BrandSettings).vm.assets.map((a) => a.field)).toEqual([
      'brand_logo',
      'favicon',
    ])
  })

  it('says where each one appears and what size to use', () => {
    // Both are easy to get wrong and hard to notice afterwards.
    for (const asset of mount(BrandSettings).vm.assets) {
      expect(asset.where, asset.field).toBeTruthy()
      expect(asset.recommendation, asset.field).toMatch(/32/)
    }
  })

  it('accepts only images', () => {
    for (const asset of mount(BrandSettings).vm.assets) {
      expect(asset.accept).toBe('image/*')
    }
  })

  it('re-applies the branding after saving', () => {
    // The logo and favicon are read once at boot; without this the change
    // would not appear until a reload.
    const wrapper = mount(BrandSettings)
    wrapper.vm.updateSettings()
    api.fcrm.save.submit.mock.calls[0][1].onSuccess()
    expect(api.setupBrand).toHaveBeenCalled()
  })

  it('closes the settings dialog afterwards', () => {
    const wrapper = mount(BrandSettings)
    wrapper.vm.updateSettings()
    api.fcrm.save.submit.mock.calls[0][1].onSuccess()
    expect(api.showSettings.value).toBe(false)
  })
})

describe('HomeActions', () => {
  beforeEach(() => {
    api.showSettings.value = true
  })

  it('saves and closes', () => {
    const wrapper = mount(HomeActions)
    wrapper.vm.updateSettings()
    api.fcrm.save.submit.mock.calls[0][1].onSuccess()
    expect(api.showSettings.value).toBe(false)
  })

  it('starts with no error showing', () => {
    expect(mount(HomeActions).vm.errorMessage).toBe('')
  })
})
