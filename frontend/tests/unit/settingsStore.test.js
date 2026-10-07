// settings.js builds a document resource at module scope, which would fetch
// FCRM Settings on import.
vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { fakeResource } = await import('../helpers/pinia.js')
  return {
    ...actual,
    createDocumentResource: (options) => fakeResource(options),
  }
})

import { getSettings } from '@/stores/settings'

const DOC = {
  brand_name: 'PSD CRM',
  brand_logo: '/files/logo.png',
  favicon: '/files/favicon.ico',
  crm_timeline_timestamp_format: 'Exact',
}

describe('settings store', () => {
  it('exposes the same singleton on every call', () => {
    // Not a pinia store — module-level state shared by every consumer.
    expect(getSettings().brand).toBe(getSettings().brand)
    expect(getSettings()._settings).toBe(getSettings()._settings)
  })

  it('stores the document when the fetch succeeds', () => {
    const { _settings, settings } = getSettings()
    _settings.options.onSuccess(structuredClone(DOC))
    expect(settings.value.brand_name).toBe('PSD CRM')
  })

  it('populates the brand from the document', () => {
    const { _settings, brand } = getSettings()
    _settings.options.onSuccess(structuredClone(DOC))
    expect(brand.name).toBe('PSD CRM')
    expect(brand.logo).toBe('/files/logo.png')
    expect(brand.favicon).toBe('/files/favicon.ico')
  })

  it('returns the document from onSuccess', () => {
    const { _settings } = getSettings()
    expect(_settings.options.onSuccess(structuredClone(DOC))).toMatchObject({
      brand_name: 'PSD CRM',
    })
  })

  it('leaves the brand fields undefined when the document has none', () => {
    const { _settings, brand } = getSettings()
    _settings.options.onSuccess({})
    expect(brand.name).toBeUndefined()
    expect(brand.logo).toBeUndefined()
  })

  it('re-reads the brand on demand', () => {
    const { settings, brand, setupBrand } = getSettings()
    settings.value = { brand_name: 'Renamed' }
    setupBrand()
    expect(brand.name).toBe('Renamed')
  })

  it('does not throw when settings have not loaded yet', () => {
    const { settings, setupBrand } = getSettings()
    settings.value = null
    expect(() => setupBrand()).not.toThrow()
  })
})
