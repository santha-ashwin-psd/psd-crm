const api = vi.hoisted(() => ({ call: vi.fn(), info: vi.fn() }))
vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    call: api.call,
    toast: { ...actual.toast, info: api.info },
  }
})

import {
  createDocument,
  showCreateDocumentModal,
  createDocumentDoctype,
  createDocumentData,
  createDocumentCallback,
  runCreateDocumentCallback,
} from '@/composables/document'

/** Answer the two ERPNext single-value lookups. */
function erpnextSettings({ enabled, sync_products }) {
  api.call.mockImplementation((_method, { field }) =>
    Promise.resolve(field === 'enabled' ? enabled : sync_products),
  )
}

describe('createDocument', () => {
  let openSpy

  beforeEach(() => {
    api.call.mockReset()
    api.info.mockReset()
    showCreateDocumentModal.value = false
    createDocumentDoctype.value = ''
    createDocumentData.value = {}
    createDocumentCallback.value = null
    openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
  })

  afterEach(() => {
    openSpy.mockRestore()
  })

  it('does nothing without a doctype', async () => {
    await createDocument(null)
    expect(showCreateDocumentModal.value).toBe(false)
  })

  it('opens the modal with the doctype, data and callback', async () => {
    const callback = vi.fn()
    await createDocument('CRM Deal', { status: 'Open' }, null, callback)

    expect(createDocumentDoctype.value).toBe('CRM Deal')
    expect(createDocumentData.value).toEqual({ status: 'Open' })
    expect(createDocumentCallback.value).toBe(callback)
    expect(showCreateDocumentModal.value).toBe(true)
  })

  it('defaults the data and callback', async () => {
    await createDocument('CRM Deal')
    expect(createDocumentData.value).toEqual({})
    expect(createDocumentCallback.value).toBeNull()
  })

  it('closes whatever opened it first', async () => {
    const close = vi.fn()
    await createDocument('CRM Deal', {}, close)
    expect(close).toHaveBeenCalled()
  })

  it('tolerates no close handler', async () => {
    await expect(createDocument('CRM Deal', {})).resolves.toBeUndefined()
  })

  it('does not consult ERPNext for ordinary doctypes', async () => {
    await createDocument('CRM Deal')
    expect(api.call).not.toHaveBeenCalled()
  })

  describe('CRM Product', () => {
    it('redirects to ERPNext when the integration owns products', async () => {
      // Products live in ERPNext as Items when syncing is on; creating one here
      // would make a second source of truth.
      erpnextSettings({ enabled: 1, sync_products: 1 })
      const close = vi.fn()
      await createDocument('CRM Product', {}, close)

      expect(close).toHaveBeenCalled()
      expect(api.info).toHaveBeenCalled()
      expect(openSpy).toHaveBeenCalledWith('/app/item/new', '_blank')
      expect(showCreateDocumentModal.value).toBe(false)
    })

    it('creates locally when the integration is off', async () => {
      erpnextSettings({ enabled: 0, sync_products: 1 })
      await createDocument('CRM Product')
      expect(openSpy).not.toHaveBeenCalled()
      expect(showCreateDocumentModal.value).toBe(true)
    })

    it('creates locally when product sync is off', async () => {
      erpnextSettings({ enabled: 1, sync_products: 0 })
      await createDocument('CRM Product')
      expect(openSpy).not.toHaveBeenCalled()
      expect(showCreateDocumentModal.value).toBe(true)
    })

    it('creates locally when the settings lookup fails', async () => {
      // A missing ERPNext CRM Settings doctype must not block product creation.
      api.call.mockRejectedValue(new Error('DoesNotExistError'))
      await createDocument('CRM Product')
      expect(openSpy).not.toHaveBeenCalled()
      expect(showCreateDocumentModal.value).toBe(true)
    })

    it('treats null settings as off', async () => {
      erpnextSettings({ enabled: null, sync_products: null })
      await createDocument('CRM Product')
      expect(showCreateDocumentModal.value).toBe(true)
    })
  })

  describe('the insert callback', () => {
    it('is a no-op when nothing registered one', () => {
      // GlobalModals used to call `createDocumentCallback(data)` straight from
      // the template. Every create started from the app header registers no
      // callback, so that was a call to `null`: it threw, aborted the handler,
      // and the list never refreshed.
      createDocumentCallback.value = null
      expect(() => runCreateDocumentCallback({ name: 'X' })).not.toThrow()
    })

    it('runs the registered callback with the new document', () => {
      const cb = vi.fn()
      createDocumentCallback.value = cb
      runCreateDocumentCallback({ name: 'CRM-LEAD-1' })
      expect(cb).toHaveBeenCalledWith({ name: 'CRM-LEAD-1' })
    })

    it('does not fire again on the next, unrelated create', () => {
      // The ref was never cleared, so a callback left behind by one modal
      // stayed armed and ran against a document it knew nothing about.
      const cb = vi.fn()
      createDocumentCallback.value = cb
      runCreateDocumentCallback({ name: 'first' })
      runCreateDocumentCallback({ name: 'second' })
      expect(cb).toHaveBeenCalledTimes(1)
      expect(createDocumentCallback.value).toBeNull()
    })
  })
})
