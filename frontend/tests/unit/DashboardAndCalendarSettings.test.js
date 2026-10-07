const api = vi.hoisted(() => ({
  toast: null,
  settings: null,
  dialog: vi.fn(),
  send: vi.fn(),
  showSettings: null,
}))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  api.toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
  return { ...actual, toast: api.toast }
})

vi.mock('@/stores/settings', async () => {
  const { reactive } = await import('vue')
  return {
    getSettings: () => {
      api.settings = reactive({
        doc: {
          currency: 'INR',
          service_provider: 'frankfurter.app',
          access_key: '',
          event_notifications: [],
          all_day_event_notifications: [],
          default_calendar_view: 'Weekly',
        },
        save: { submit: vi.fn() },
      })
      return { _settings: api.settings, brand: { value: {} } }
    },
    isTranslatable: () => false,
  }
})

vi.mock('@/stores/global', () => ({
  globalStore: () => ({ $dialog: api.dialog, $socket: { on: vi.fn(), off: vi.fn() } }),
}))

vi.mock('@/composables/useBroadcast', () => ({
  useBroadcast: () => ({ send: api.send, on: vi.fn(), off: vi.fn() }),
}))

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

const ROUTE = vi.hoisted(() => ({ name: 'Dashboard', params: {}, query: {}, hash: '' }))
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useRoute: () => ROUTE }
})

import DashboardSettings from '@/components/Settings/DashboardSettings.vue'
import CalendarSettings from '@/components/Settings/CalendarSettings.vue'
import {
  min,
  max,
  handleIntervalChange,
} from '@/components/Calendar/utils'
import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'

const STUBS = {
  SettingsLayoutBase: true, Link: true, ErrorMessage: true, TimePicker: true,
  Switch: { props: ['modelValue'], template: '<button />' },
}

const mount = (Component) =>
  mountComponent(Component, { global: { stubs: STUBS, mocks: { $route: ROUTE } } })

describe('DashboardSettings', () => {
  beforeEach(() => {
    api.toast.success.mockClear()
    api.dialog.mockClear()
    api.send.mockClear()
    ROUTE.name = 'Dashboard'
  })

  describe('the exchange-rate provider', () => {
    it('offers four', () => {
      expect(mount(DashboardSettings).vm.providerOptions).toHaveLength(4)
    })

    it('asks for a key only for the providers that need one', async () => {
      const wrapper = mount(DashboardSettings)
      expect(wrapper.vm.requiresAccessKey).toBe(false)

      for (const provider of ['exchangerate.host', 'exchangerate-api']) {
        api.settings.doc.service_provider = provider
        await nextTick()
        expect(wrapper.vm.requiresAccessKey, provider).toBe(true)
      }
    })

    it('links to the right documentation for that provider', async () => {
      // The key is obtained from the provider's own site, so a wrong link
      // sends the user somewhere with no key to give them.
      const wrapper = mount(DashboardSettings)
      api.settings.doc.service_provider = 'exchangerate-api'
      await nextTick()
      expect(wrapper.vm.providerMeta.docsUrl).toContain('exchangerate-api.com')
    })

    it('has no metadata for a provider that needs no key', () => {
      expect(mount(DashboardSettings).vm.providerMeta).toBeUndefined()
    })
  })

  describe('saving', () => {
    const validateOf = (wrapper) => {
      wrapper.vm.updateSettings()
      return api.settings.save.submit.mock.calls[0][1].validate
    }

    it('requires a currency', async () => {
      const wrapper = mount(DashboardSettings)
      api.settings.doc.currency = ''
      await nextTick()
      const message = validateOf(wrapper)()
      expect(message).toBe('Please select a currency before saving.')
      expect(wrapper.vm.errorMessage).toBe(message)
    })

    it('requires an access key for a provider that needs one', async () => {
      // Saving without it would leave the dashboard silently unable to convert.
      const wrapper = mount(DashboardSettings)
      api.settings.doc.service_provider = 'exchangerate.host'
      api.settings.doc.access_key = ''
      await nextTick()
      expect(validateOf(wrapper)()).toContain('Exchangerate Host')
    })

    it('accepts a provider that needs no key', () => {
      const wrapper = mount(DashboardSettings)
      expect(validateOf(wrapper)()).toBeUndefined()
      expect(wrapper.vm.errorMessage).toBe('')
    })

    it('accepts a key-bearing provider once the key is given', async () => {
      const wrapper = mount(DashboardSettings)
      api.settings.doc.service_provider = 'exchangerate.host'
      api.settings.doc.access_key = 'abc'
      await nextTick()
      expect(validateOf(wrapper)()).toBeUndefined()
    })

    it('clears a stale error on the next attempt', async () => {
      const wrapper = mount(DashboardSettings)
      api.settings.doc.currency = ''
      await nextTick()
      validateOf(wrapper)()
      expect(wrapper.vm.errorMessage).toBeTruthy()

      api.settings.doc.currency = 'INR'
      await nextTick()
      api.settings.save.submit.mock.calls[0][1].validate()
      expect(wrapper.vm.errorMessage).toBe('')
    })

    it('confirms when it lands', () => {
      const wrapper = mount(DashboardSettings)
      wrapper.vm.updateSettings()
      api.settings.save.submit.mock.calls[0][1].onSuccess()
      expect(api.toast.success).toHaveBeenCalledWith(
        'Dashboard settings updated successfully',
      )
    })

    it('tells an open deal page to rebuild its sections', () => {
      // Currency formatting is baked into the rendered sections.
      ROUTE.name = 'Deal'
      const wrapper = mount(DashboardSettings)
      wrapper.vm.updateSettings()
      api.settings.save.submit.mock.calls[0][1].onSuccess()
      expect(api.send).toHaveBeenCalledWith('reload-deal-sections')
    })

    it('does not broadcast from anywhere else', () => {
      const wrapper = mount(DashboardSettings)
      wrapper.vm.updateSettings()
      api.settings.save.submit.mock.calls[0][1].onSuccess()
      expect(api.send).not.toHaveBeenCalled()
    })
  })

  describe('setting the currency', () => {
    it('warns that it cannot be undone', () => {
      mount(DashboardSettings).vm.setCurrency('USD')
      expect(api.dialog).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Set Currency' }),
      )
      expect(api.settings.save.submit).not.toHaveBeenCalled()
    })

    it('saves once confirmed', () => {
      const wrapper = mount(DashboardSettings)
      wrapper.vm.setCurrency('USD')
      const close = vi.fn()
      api.dialog.mock.calls[0][0].actions[0].onClick(close)
      expect(api.settings.doc.currency).toBe('USD')
      api.settings.save.submit.mock.calls[0][1].onSuccess()
      expect(api.toast.success).toHaveBeenCalledWith(
        'Currency set as USD successfully',
      )
      expect(close).toHaveBeenCalled()
    })
  })
})

describe('CalendarSettings', () => {
  describe('the view choices', () => {
    it('offers daily, weekly and monthly', () => {
      expect(mount(CalendarSettings).vm.viewOptions.map((o) => o.value)).toEqual([
        'Daily',
        'Weekly',
        'Monthly',
      ])
    })

    it('offers both reminder channels', () => {
      expect(
        mount(CalendarSettings).vm.channelOptions.map((o) => o.value),
      ).toEqual(['Notification', 'Email'])
    })
  })

  describe('the interval labels', () => {
    it('are singular at one', () => {
      // "1 minutes before" reads badly enough to be worth the branch.
      expect(
        mount(CalendarSettings).vm.intervalOptions({ before: 1 }).map((o) => o.label),
      ).toEqual(['minute', 'hour', 'day', 'week'])
    })

    it('are plural otherwise', () => {
      expect(
        mount(CalendarSettings).vm.intervalOptions({ before: 5 }).map((o) => o.label),
      ).toEqual(['minutes', 'hours', 'days', 'weeks'])
    })

    it('offer only days and weeks for an all-day event', () => {
      // A reminder in minutes is meaningless for an event with no start time.
      expect(
        mount(CalendarSettings)
          .vm.allDayIntervalOptions({ before: 2 })
          .map((o) => o.value),
      ).toEqual(['days', 'weeks'])
    })

    // The all-day list has its own copy of the singular/plural branch, and only
    // the plural side of it was pinned.
    it('are singular at one for an all-day event too', () => {
      expect(
        mount(CalendarSettings)
          .vm.allDayIntervalOptions({ before: 1 })
          .map((o) => o.label),
      ).toEqual(['day', 'week'])
    })

    it('are plural otherwise for an all-day event', () => {
      expect(
        mount(CalendarSettings)
          .vm.allDayIntervalOptions({ before: 3 })
          .map((o) => o.label),
      ).toEqual(['days', 'weeks'])
    })
  })

  describe('the notification lists', () => {
    it('start empty', () => {
      expect(mount(CalendarSettings).vm.notifications).toEqual([])
      expect(mount(CalendarSettings).vm.allDayNotifications).toEqual([])
    })

    it('read through to the settings document', async () => {
      const wrapper = mount(CalendarSettings)
      api.settings.doc.event_notifications = [{ before: 10, interval: 'minutes' }]
      await nextTick()
      expect(wrapper.vm.notifications).toHaveLength(1)
    })

    it('write back to the settings document', () => {
      const wrapper = mount(CalendarSettings)
      wrapper.vm.notifications = [{ before: 30, interval: 'minutes' }]
      expect(api.settings.doc.event_notifications).toHaveLength(1)
    })

    it('cope with the fields being absent', async () => {
      const wrapper = mount(CalendarSettings)
      api.settings.doc.event_notifications = undefined
      await nextTick()
      expect(wrapper.vm.notifications).toEqual([])
    })
  })

  describe('saving', () => {
    it('closes the dialog', () => {
      const wrapper = mount(CalendarSettings)
      wrapper.vm.updateSettings()
      api.settings.save.submit.mock.calls[0][1].onSuccess()
      expect(api.showSettings.value).toBe(false)
    })
  })
})

describe('reminder interval limits', () => {
  const clamp = (before, interval) => {
    const n = { before, interval }
    handleIntervalChange(n)
    return n.before
  }

  describe('the allowed range', () => {
    it('starts at five for minutes and one for everything else', () => {
      expect(min({ interval: 'minutes' })).toBe(5)
      for (const interval of ['hours', 'days', 'weeks']) {
        expect(min({ interval }), interval).toBe(1)
      }
    })

    it('caps days at four weeks and weeks at four', () => {
      expect(max({ interval: 'days' })).toBe(28)
      expect(max({ interval: 'weeks' })).toBe(4)
    })

    it('agrees with what the clamp enforces', () => {
      // The input's max attribute and the blur handler have to match, or the
      // field accepts a value it then silently rewrites.
      for (const interval of ['minutes', 'hours', 'days', 'weeks']) {
        expect(clamp(99999, interval), interval).toBe(max({ interval }))
      }
    })
  })

  describe('clamping minutes', () => {
    it('raises anything below five', () => {
      expect(clamp(1, 'minutes')).toBe(5)
      expect(clamp(0, 'minutes')).toBe(5)
    })

    it('rounds to the nearest five', () => {
      // The picker steps in fives; an odd value would not be reachable again.
      expect(clamp(7, 'minutes')).toBe(5)
      expect(clamp(8, 'minutes')).toBe(10)
      expect(clamp(13, 'minutes')).toBe(15)
    })

    it('leaves a multiple of five alone', () => {
      expect(clamp(30, 'minutes')).toBe(30)
    })
  })

  describe('clamping the other units', () => {
    it('raises anything below one', () => {
      for (const interval of ['hours', 'days', 'weeks']) {
        expect(clamp(0, interval), interval).toBe(1)
      }
    })

    it('caps days at twenty-eight', () => {
      expect(clamp(60, 'days')).toBe(28)
    })

    it('caps weeks at four', () => {
      expect(clamp(10, 'weeks')).toBe(4)
    })

    it('leaves a value in range alone', () => {
      expect(clamp(3, 'days')).toBe(3)
      expect(clamp(2, 'weeks')).toBe(2)
      expect(clamp(6, 'hours')).toBe(6)
    })
  })
})
