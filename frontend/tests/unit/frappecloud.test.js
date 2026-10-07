const created = vi.hoisted(() => [])
vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    createResource: (options) => {
      const resource = { options, fetch: vi.fn(), reload: vi.fn() }
      created.push(resource)
      return resource
    },
  }
})

import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { globalStore } from '@/stores/global'
import {
  confirmLoginToFrappeCloud,
  currentSiteInfo,
} from '@/composables/frappecloud'

/**
 * globalStore reads $dialog off the app instance and can only be *created*
 * inside a component. Once created, pinia caches it, which is why
 * confirmLoginToFrappeCloud can call globalStore() from a click handler later.
 * This mirrors that: instantiate inside a component, then call outside one.
 */
function installGlobalStore($dialog) {
  return mount(
    {
      setup() {
        globalStore()
        return () => null
      },
    },
    {
      global: {
        plugins: [createPinia()],
        config: { globalProperties: { $dialog, $socket: {} } },
      },
    },
  )
}

describe('frappecloud', () => {
  let openSpy

  beforeEach(() => {
    openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
  })

  afterEach(() => {
    openSpy.mockRestore()
  })

  describe('currentSiteInfo', () => {
    it('records the base url and site name from the response', () => {
      const $dialog = vi.fn()
      const wrapper = installGlobalStore($dialog)

      currentSiteInfo.options.onSuccess({
        base_url: 'https://frappecloud.com',
        site_name: 'acme.frappe.cloud',
      })

      confirmLoginToFrappeCloud()
      $dialog.mock.calls[0][0].actions[0].onClick(vi.fn())

      expect(openSpy).toHaveBeenCalledWith(
        'https://frappecloud.com/dashboard/sites/acme.frappe.cloud',
        '_blank',
      )
      wrapper.unmount()
    })

    it('uses a custom base url for a self-hosted control plane', () => {
      const $dialog = vi.fn()
      const wrapper = installGlobalStore($dialog)

      currentSiteInfo.options.onSuccess({
        base_url: 'https://cloud.example.com',
        site_name: 'crm.example.com',
      })

      confirmLoginToFrappeCloud()
      $dialog.mock.calls[0][0].actions[0].onClick(vi.fn())

      expect(openSpy).toHaveBeenCalledWith(
        'https://cloud.example.com/dashboard/sites/crm.example.com',
        '_blank',
      )
      wrapper.unmount()
    })
  })

  describe('confirmLoginToFrappeCloud', () => {
    it('refreshes the site info before asking', () => {
      // The dialog is about to build a URL from this data, so it is fetched
      // rather than trusted from an earlier page load.
      const wrapper = installGlobalStore(vi.fn())
      confirmLoginToFrappeCloud()
      expect(currentSiteInfo.fetch).toHaveBeenCalled()
      wrapper.unmount()
    })

    it('asks for confirmation rather than navigating straight away', () => {
      const $dialog = vi.fn()
      const wrapper = installGlobalStore($dialog)

      confirmLoginToFrappeCloud()

      const config = $dialog.mock.calls[0][0]
      expect(config.title).toBe('Login to Frappe Cloud?')
      expect(config.actions).toHaveLength(1)
      expect(config.actions[0].label).toBe('Confirm')
      // Nothing opens until the user confirms.
      expect(openSpy).not.toHaveBeenCalled()
      wrapper.unmount()
    })

    it('closes the dialog after confirming', () => {
      const $dialog = vi.fn()
      const wrapper = installGlobalStore($dialog)
      confirmLoginToFrappeCloud()

      const close = vi.fn()
      $dialog.mock.calls[0][0].actions[0].onClick(close)
      expect(close).toHaveBeenCalled()
      wrapper.unmount()
    })
  })
})
