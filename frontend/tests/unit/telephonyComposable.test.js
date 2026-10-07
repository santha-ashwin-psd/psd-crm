const api = vi.hoisted(() => ({ resource: null }))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  return {
    ...actual,
    // Neutered: the module builds its resource at import time with
    // `auto: true`, which would otherwise fire a real request on load.
    createResource: (opts = {}) => {
      api.resource = reactive({ ...opts, data: null, fetch: vi.fn(), reload: vi.fn() })
      return api.resource
    },
  }
})

import {
  useTelephony,
  setEnabled,
  callEnabled,
  defaultCallingMedium,
} from '@/composables/telephony'

// The module holds one shared integrations map for the whole app, so each test
// puts it back to a known state through the resource's own success handler.
const load = (data) => api.resource.onSuccess(data)

describe('telephony', () => {
  beforeEach(() => {
    load({ integrations: {}, default_calling_medium: '' })
  })

  describe('what it asks the server', () => {
    it('asks once, on load, and caches the answer', () => {
      expect(api.resource.url).toBe(
        'xbr_crm.integrations.api.is_call_integration_enabled',
      )
      expect(api.resource.auto).toBe(true)
      expect(api.resource.cache).toBe('Is Call Integration Enabled')
    })
  })

  describe('reading the answer', () => {
    it('records which integrations are on', () => {
      load({ integrations: { twilio: true, exotel: false } })
      const { isEnabled } = useTelephony()
      expect(isEnabled('twilio')).toBe(true)
      expect(isEnabled('exotel')).toBe(false)
    })

    it('treats an integration it has never heard of as off', () => {
      load({ integrations: { twilio: true } })
      expect(useTelephony().isEnabled('somethingelse')).toBe(false)
    })

    it('copes with a response that lists none', () => {
      load({})
      expect(useTelephony().integrations.value).toEqual([])
      expect(callEnabled.value).toBe(false)
    })

    it('records the preferred medium', () => {
      load({ integrations: {}, default_calling_medium: 'Exotel' })
      expect(defaultCallingMedium.value).toBe('Exotel')
    })
  })

  describe('whether calling is available at all', () => {
    it('is off when nothing is enabled', () => {
      load({ integrations: { twilio: false, exotel: false } })
      expect(callEnabled.value).toBe(false)
      expect(useTelephony().isAnyEnabled.value).toBe(false)
    })

    it('is on as soon as one is', () => {
      load({ integrations: { twilio: false, exotel: true } })
      expect(callEnabled.value).toBe(true)
      expect(useTelephony().isAnyEnabled.value).toBe(true)
    })
  })

  describe('turning one on or off from settings', () => {
    it('takes effect without another round trip', () => {
      // The settings page flips this locally so the phone icons appear at once.
      load({ integrations: { twilio: false } })
      setEnabled('twilio', true)
      expect(useTelephony().isEnabled('twilio')).toBe(true)
      expect(callEnabled.value).toBe(true)
    })

    it('turns calling off again when the last one goes', () => {
      load({ integrations: { twilio: true } })
      setEnabled('twilio', false)
      expect(callEnabled.value).toBe(false)
    })

    it('leaves calling on while another is still enabled', () => {
      load({ integrations: { twilio: true, exotel: true } })
      setEnabled('twilio', false)
      expect(callEnabled.value).toBe(true)
    })

    it('adds one that was not in the response', () => {
      load({ integrations: {} })
      setEnabled('exotel', true)
      expect(useTelephony().isEnabled('exotel')).toBe(true)
    })
  })

  describe('the list it exposes', () => {
    it('names each integration and whether it is on', () => {
      load({ integrations: { twilio: true, exotel: false } })
      expect(useTelephony().integrations.value).toEqual([
        { name: 'twilio', enabled: true },
        { name: 'exotel', enabled: false },
      ])
    })

    it('follows a later change', () => {
      load({ integrations: { twilio: false } })
      const { integrations } = useTelephony()
      setEnabled('twilio', true)
      expect(integrations.value).toEqual([{ name: 'twilio', enabled: true }])
    })
  })
})
