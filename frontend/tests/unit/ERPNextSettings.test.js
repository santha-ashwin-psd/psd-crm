const api = vi.hoisted(() => ({
  toast: null,
  res: null,
  syncStatus: null,
  dialog: vi.fn(),
  socket: { on: vi.fn(), off: vi.fn() },
  capture: vi.fn(),
  methodOptions: {},
}))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  api.toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
  return {
    ...actual,
    toast: api.toast,
    createDocumentResource: (options = {}) => {
      api.methodOptions = options.whitelistedMethods || {}
      api.setValueOptions = options.setValue
      api.res = reactive({
        ...options,
        doc: {},
        originalDoc: {},
        get: { submit: vi.fn(async () => ({})), reload: vi.fn(async () => ({})), loading: false },
        setValue: { submit: vi.fn(async () => ({})), loading: false },
        isERPNextInstalled: { submit: vi.fn(async () => ({})), data: null, loading: false },
        getExternalCompanies: { submit: vi.fn(async () => ({})), data: null, loading: false },
        runProductSync: { submit: vi.fn(async () => ({})), loading: false },
      })
      return api.res
    },
    createResource: (options = {}) => {
      api.syncStatus = reactive({
        ...options,
        data: null,
        fetched: false,
        submit: vi.fn(),
      })
      return api.syncStatus
    },
  }
})

vi.mock('frappe-ui/frappe', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useTelemetry: () => ({ capture: api.capture }) }
})

vi.mock('@/stores/global', () => ({
  globalStore: () => ({ $dialog: api.dialog, $socket: api.socket }),
}))

import ERPNextSettings from '@/components/Settings/ERPNextSettings.vue'
import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'
import { flushPromises } from '@vue/test-utils'

const mount = () =>
  mountComponent(ERPNextSettings, {
    global: {
      stubs: {
        SettingsLayoutBase: true, Link: true, LoadingIndicator: true,
        Tooltip: true, ERPNextIcon: true,
        Switch: { props: ['modelValue'], template: '<button />' },
      },
    },
  })

const configured = (over = {}) => ({
  enabled: 1,
  erpnext_site_url: 'https://erp.example.com',
  api_key: 'key',
  api_secret: 'secret',
  erpnext_company: 'Acme',
  create_customer_on_status_change: 0,
  deal_status: '',
  sync_products: 0,
  ...over,
})

const withDoc = (doc = configured(), installed = null) => {
  const wrapper = mount()
  Object.assign(api.res.doc, doc)
  api.res.originalDoc = { ...doc }
  api.res.isERPNextInstalled.data = installed
  return wrapper
}

describe('ERPNextSettings', () => {
  beforeEach(() => {
    api.toast.success.mockClear()
    api.toast.error.mockClear()
    api.dialog.mockClear()
    api.capture.mockClear()
  })

  describe('validating the site connection', () => {
    it('is satisfied when ERPNext is installed on this site', () => {
      // No remote credentials are needed in that case.
      const wrapper = withDoc(configured({ erpnext_site_url: '', api_key: '' }), {
        message: true,
      })
      expect(wrapper.vm.validateSiteConnection()).toBe(true)
    })

    it('requires a site url for a remote site', () => {
      const wrapper = withDoc(configured({ erpnext_site_url: '' }))
      expect(wrapper.vm.validateSiteConnection()).toBe(false)
      expect(api.toast.error).toHaveBeenCalledWith('Site URL is required')
    })

    it('rejects a url that is not a url', () => {
      const wrapper = withDoc(configured({ erpnext_site_url: 'erp.example.com' }))
      expect(wrapper.vm.validateSiteConnection()).toBe(false)
      expect(api.toast.error).toHaveBeenCalledWith('Invalid Site URL')
    })

    it('accepts a full url', () => {
      expect(withDoc(configured()).vm.validateSiteConnection()).toBe(true)
    })

    it('requires an API key', () => {
      const wrapper = withDoc(configured({ api_key: '' }))
      expect(wrapper.vm.validateSiteConnection()).toBe(false)
      expect(api.toast.error).toHaveBeenCalledWith('API key is required')
    })

    it('requires an API secret', () => {
      const wrapper = withDoc(configured({ api_secret: '' }))
      expect(wrapper.vm.validateSiteConnection()).toBe(false)
      expect(api.toast.error).toHaveBeenCalledWith('API secret is required')
    })

    it('reports only the first problem', () => {
      // Otherwise three toasts stack up for one empty form.
      const wrapper = withDoc(
        configured({ erpnext_site_url: '', api_key: '', api_secret: '' }),
      )
      wrapper.vm.validateSiteConnection()
      expect(api.toast.error).toHaveBeenCalledTimes(1)
    })
  })

  describe('validating the rest', () => {
    it('requires a company', () => {
      const wrapper = withDoc(configured({ erpnext_company: '' }))
      expect(wrapper.vm.validateData()).toBe(false)
      expect(api.toast.error).toHaveBeenCalledWith('Company name is required')
    })

    it('requires a deal status when customers are created automatically', () => {
      // Without it there is no trigger point for the creation.
      const wrapper = withDoc(
        configured({ create_customer_on_status_change: 1, deal_status: '' }),
      )
      expect(wrapper.vm.validateData()).toBe(false)
      expect(api.toast.error).toHaveBeenCalledWith('Deal status is required')
    })

    it('does not require a deal status otherwise', () => {
      expect(withDoc(configured()).vm.validateData()).toBe(true)
    })
  })

  describe('the Update button', () => {
    it('is disabled while the connection is incomplete', () => {
      expect(withDoc(configured({ api_key: '' })).vm.isDisabled).toBe(true)
    })

    it('is disabled without a company', () => {
      expect(withDoc(configured({ erpnext_company: '' })).vm.isDisabled).toBe(true)
    })

    it('is enabled for a complete configuration', () => {
      expect(withDoc(configured()).vm.isDisabled).toBe(false)
    })

    it('ignores the credentials when ERPNext is on this site', () => {
      const wrapper = withDoc(
        configured({ erpnext_site_url: '', api_key: '', api_secret: '' }),
        { message: true },
      )
      expect(wrapper.vm.isDisabled).toBe(false)
    })
  })

  describe('detecting changes', () => {
    it('reports none on arrival', () => {
      expect(withDoc(configured()).vm.isDirty).toBe(false)
    })

    it.each([
      'enabled', 'erpnext_site_url', 'api_key', 'api_secret',
      'erpnext_company', 'create_customer_on_status_change',
      'deal_status', 'sync_products',
    ])('notices a change to %s', async (field) => {
      const wrapper = withDoc(configured())
      api.res.doc[field] = 'changed'
      await nextTick()
      expect(wrapper.vm.isDirty).toBe(true)
    })

    it('tracks the credentials separately', async () => {
      // Verifying the connection only needs to re-run when these change.
      const wrapper = withDoc(configured())
      expect(wrapper.vm.areSiteSettingsChanged).toBe(false)
      api.res.doc.api_key = 'other'
      await nextTick()
      expect(wrapper.vm.areSiteSettingsChanged).toBe(true)
    })

    it('does not treat a company change as a credentials change', async () => {
      const wrapper = withDoc(configured())
      api.res.doc.erpnext_company = 'Other'
      await nextTick()
      expect(wrapper.vm.areSiteSettingsChanged).toBe(false)
    })
  })

  describe('saving', () => {
    it('refuses an invalid configuration', async () => {
      const wrapper = withDoc(configured({ erpnext_company: '' }))
      await wrapper.vm.saveSettings()
      expect(api.res.setValue.submit).not.toHaveBeenCalled()
    })

    it('sends every field', async () => {
      const wrapper = withDoc(configured())
      await wrapper.vm.saveSettings()
      const sent = api.res.setValue.submit.mock.calls[0][0]
      expect(Object.keys(sent)).toEqual(
        expect.arrayContaining([
          'enabled', 'erpnext_site_url', 'api_key', 'api_secret',
          'erpnext_company', 'sync_products', 'deal_status',
          'is_erpnext_in_different_site',
        ]),
      )
    })

    it('records that ERPNext lives elsewhere', async () => {
      const wrapper = withDoc(configured(), null)
      await wrapper.vm.saveSettings()
      expect(
        api.res.setValue.submit.mock.calls[0][0].is_erpnext_in_different_site,
      ).toBe(true)
    })

    it('records the first enable only', async () => {
      const wrapper = withDoc(configured({ enabled: 0 }))
      api.res.doc.enabled = 1
      await nextTick()
      await wrapper.vm.saveSettings()
      await api.res.setValue.submit.mock.calls[0][1].onSuccess()
      expect(api.capture).toHaveBeenCalledWith('erpnext_integration_enabled')
    })

    it('does not record an enable that was already on', async () => {
      const wrapper = withDoc(configured({ enabled: 1 }))
      await wrapper.vm.saveSettings()
      await api.res.setValue.submit.mock.calls[0][1].onSuccess()
      expect(api.capture).not.toHaveBeenCalledWith('erpnext_integration_enabled')
    })

    it('refreshes the company list for a remote site', async () => {
      const wrapper = withDoc(configured(), null)
      await wrapper.vm.saveSettings()
      await api.res.setValue.submit.mock.calls[0][1].onSuccess()
      expect(api.res.getExternalCompanies.submit).toHaveBeenCalled()
    })

    it('skips that when ERPNext is on this site', async () => {
      const wrapper = withDoc(configured(), { message: true })
      await wrapper.vm.saveSettings()
      await api.res.setValue.submit.mock.calls[0][1].onSuccess()
      expect(api.res.getExternalCompanies.submit).not.toHaveBeenCalled()
    })

    it('shows the server reason when it refuses', () => {
      withDoc(configured())
      api.setValueOptions.onError({ messages: ['Bad credentials'] })
      expect(api.toast.error).toHaveBeenCalledWith('Bad credentials')
    })

    it('shows a plain Error message rather than burying it', () => {
      withDoc(configured())
      api.setValueOptions.onError(new Error('offline'))
      expect(api.toast.error).toHaveBeenCalledWith('offline')
    })
  })

  describe('turning the integration off', () => {
    it('asks first', () => {
      const wrapper = withDoc(configured())
      wrapper.vm.toggleEnable(true)
      expect(api.dialog).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Disable ERPNext Integration' }),
      )
      expect(api.res.setValue.submit).not.toHaveBeenCalled()
    })

    it('turns it on without asking', () => {
      const wrapper = withDoc(configured({ enabled: 0 }))
      wrapper.vm.toggleEnable(false)
      expect(api.dialog).not.toHaveBeenCalled()
      expect(api.res.doc.enabled).toBe(true)
    })
  })

  describe('verifying the connection', () => {
    it('refuses when the credentials are incomplete', () => {
      const wrapper = withDoc(configured({ api_secret: '' }))
      wrapper.vm.verifyConnection()
      expect(api.res.setValue.submit).not.toHaveBeenCalled()
    })

    it('sends only the connection fields', () => {
      // The company is chosen after the connection works, so it is not sent.
      const wrapper = withDoc(configured())
      wrapper.vm.verifyConnection()
      const sent = api.res.setValue.submit.mock.calls[0][0]
      expect(sent).not.toHaveProperty('erpnext_company')
      expect(sent).toHaveProperty('api_secret')
    })

    it('confirms and loads the companies', () => {
      const wrapper = withDoc(configured(), null)
      wrapper.vm.verifyConnection()
      api.res.setValue.submit.mock.calls[0][1].onSuccess()
      expect(api.toast.success).toHaveBeenCalledWith('Site connection validated')
      expect(api.res.getExternalCompanies.submit).toHaveBeenCalled()
    })
  })

  describe('the product sync', () => {
    it('persists a changed sync_products before running', async () => {
      // Otherwise the job would run against the previously saved setting.
      const wrapper = withDoc(configured({ sync_products: 0 }))
      api.res.doc.sync_products = 1
      await nextTick()
      await wrapper.vm.runProductSync()
      expect(api.res.setValue.submit).toHaveBeenCalledWith(
        { sync_products: 1 },
        undefined,
      )
      expect(api.res.runProductSync.submit).toHaveBeenCalled()
    })

    it('runs straight away when the setting is unchanged', async () => {
      const wrapper = withDoc(configured())
      await wrapper.vm.runProductSync()
      expect(api.res.setValue.submit).not.toHaveBeenCalled()
      expect(api.res.runProductSync.submit).toHaveBeenCalled()
    })

    it('reports a failure to start with the server reason', () => {
      withDoc(configured())
      api.methodOptions.runProductSync.onError({ messages: ['Queue full'] })
      expect(api.toast.error).toHaveBeenCalledWith('Queue full')
    })

    it('shows a plain Error message rather than burying it', () => {
      withDoc(configured())
      api.methodOptions.runProductSync.onError(new Error('offline'))
      expect(api.toast.error).toHaveBeenCalledWith('offline')
    })

    it('refreshes the logs once it starts', () => {
      withDoc(configured())
      api.methodOptions.runProductSync.onSuccess()
      expect(api.toast.success).toHaveBeenCalledWith('Product sync started.')
      expect(api.syncStatus.submit).toHaveBeenCalled()
    })
  })

  // Opening the page fires three requests in sequence, and the last two are
  // conditional. Asking for a product-sync status when ERPNext is not there at
  // all produces a server error on a page the user has only just opened.
  describe('what it fetches when the page opens', () => {
    const opened = async ({ installed, enabled }) => {
      // The resources only exist once the component is created, and onMounted
      // awaits two of them before the check. Filling them in during that await
      // window is what actually happens: `get` populates the doc and
      // `isERPNextInstalled` sets its data, then the gate is read.
      const wrapper = mount()
      Object.assign(api.res.doc, configured({ enabled }))
      api.res.isERPNextInstalled.data = installed
      api.syncStatus.submit.mockClear()
      await flushPromises()
      return wrapper
    }

    it('asks for the sync status when ERPNext is installed and the link is on', async () => {
      await opened({ installed: true, enabled: 1 })
      expect(api.syncStatus.submit).toHaveBeenCalled()
    })

    it('does not ask when the link is switched off', async () => {
      await opened({ installed: true, enabled: 0 })
      expect(api.syncStatus.submit).not.toHaveBeenCalled()
    })

    it('does not ask when ERPNext is not installed', async () => {
      await opened({ installed: null, enabled: 1 })
      expect(api.syncStatus.submit).not.toHaveBeenCalled()
    })
  })

  describe('the sync log tabs', () => {
    const withStatus = (data) => {
      const wrapper = withDoc(configured())
      api.syncStatus.data = data
      return wrapper
    }

    it('offers products, items and failures', () => {
      expect(withStatus({}).vm.productSyncSections.map((s) => s.name)).toEqual([
        'products',
        'items',
        'failed',
      ])
    })

    it('reads rows and counts from a wrapped shape', () => {
      const wrapper = withStatus({
        products: { rows: [{ name: 'P-1' }], count: 12 },
      })
      const section = wrapper.vm.productSyncSections[0]
      expect(section.rows).toEqual([{ name: 'P-1' }])
      expect(section.count).toBe(12)
    })

    it('reads a bare array too', () => {
      // The endpoint returns either shape depending on the section.
      const wrapper = withStatus({ items: [{ name: 'I-1' }, { name: 'I-2' }] })
      const section = wrapper.vm.productSyncSections[1]
      expect(section.rows).toHaveLength(2)
      expect(section.count).toBe(2)
    })

    it('is empty before anything loads', () => {
      const wrapper = withStatus(null)
      for (const section of wrapper.vm.productSyncSections) {
        expect(section.rows, section.name).toEqual([])
        expect(section.count, section.name).toBe(0)
      }
    })

    it('falls back to the first section for an unknown tab', async () => {
      const wrapper = withStatus({})
      wrapper.vm.activeProductSyncLogTab = 'nonexistent'
      await nextTick()
      expect(wrapper.vm.currentProductSyncSection.name).toBe('products')
    })
  })

  describe('naming a sync row', () => {
    it('prefers the product name', () => {
      const wrapper = withDoc(configured())
      expect(
        wrapper.vm.getSyncRowName({ product_name: 'Widget', name: 'P-1' }),
      ).toBe('Widget')
    })

    it('falls back through item name and code to the record id', () => {
      const wrapper = withDoc(configured())
      expect(wrapper.vm.getSyncRowName({ item_name: 'Gadget' })).toBe('Gadget')
      expect(wrapper.vm.getSyncRowName({ product: 'P-2' })).toBe('P-2')
      expect(wrapper.vm.getSyncRowName({ name: 'P-3' })).toBe('P-3')
    })
  })

  describe('linking a sync row to the desk', () => {
    it('links a product to its CRM record', async () => {
      const wrapper = withDoc(configured())
      wrapper.vm.activeProductSyncLogTab = 'products'
      await nextTick()
      expect(wrapper.vm.getDeskUrl({ name: 'P-1' })).toBe(
        `${window.location.origin}/app/crm-product/P-1`,
      )
    })

    it('links an item to the ERPNext record', async () => {
      const wrapper = withDoc(configured())
      wrapper.vm.activeProductSyncLogTab = 'items'
      await nextTick()
      expect(wrapper.vm.getDeskUrl({ name: 'I-1' })).toContain('/app/item/I-1')
    })

    it('escapes a name with a slash in it', async () => {
      const wrapper = withDoc(configured())
      wrapper.vm.activeProductSyncLogTab = 'items'
      await nextTick()
      expect(wrapper.vm.getDeskUrl({ name: 'A/B' })).toContain('A%2FB')
    })

    it('gives no link for a failure row', async () => {
      // A failed sync has no record to open.
      const wrapper = withDoc(configured())
      wrapper.vm.activeProductSyncLogTab = 'failed'
      await nextTick()
      expect(wrapper.vm.getDeskUrl({ name: 'X' })).toBe('')
    })

    it('gives no link for a row with no id', async () => {
      const wrapper = withDoc(configured())
      wrapper.vm.activeProductSyncLogTab = 'products'
      await nextTick()
      expect(wrapper.vm.getDeskUrl({})).toBe('')
    })
  })

  describe('the unsynced summary', () => {
    const summary = (unsynced) => {
      const wrapper = withDoc(configured())
      api.syncStatus.data = { unsynced }
      return wrapper.vm.unsyncedSummary
    }

    it('is empty when nothing is outstanding', () => {
      expect(summary(null)).toBe('')
      expect(summary({})).toBe('')
    })

    it('counts items', () => {
      expect(summary({ items: 3 })).toBe('3 items not yet synced')
    })

    it('uses the singular for one', () => {
      expect(summary({ items: 1 })).toBe('1 item not yet synced')
    })

    it('mentions products only when product sync is on', () => {
      expect(summary({ products: 2, sync_products: 0 })).toBe('')
      expect(summary({ products: 2, sync_products: 1 })).toBe(
        '2 products not yet synced',
      )
    })

    it('joins both when both are outstanding', () => {
      expect(summary({ items: 1, products: 2, sync_products: 1 })).toBe(
        '1 item and 2 products not yet synced',
      )
    })
  })

  describe('background sync notifications', () => {
    it('subscribes on arrival and unsubscribes on the way out', () => {
      const wrapper = withDoc(configured())
      expect(api.socket.on).toHaveBeenCalledWith(
        'crm_product_sync_complete',
        expect.any(Function),
      )
      wrapper.unmount()
      expect(api.socket.off).toHaveBeenCalledWith(
        'crm_product_sync_complete',
        expect.any(Function),
      )
    })

    it('refreshes the logs when a sync finishes', () => {
      const wrapper = withDoc(configured(), { message: true })
      api.syncStatus.submit.mockClear()
      wrapper.vm.onSyncComplete()
      expect(api.syncStatus.submit).toHaveBeenCalled()
    })

    it('does nothing for a remote site, which has no local logs', () => {
      const wrapper = withDoc(configured(), null)
      api.syncStatus.submit.mockClear()
      wrapper.vm.onSyncComplete()
      expect(api.syncStatus.submit).not.toHaveBeenCalled()
    })
  })
})
