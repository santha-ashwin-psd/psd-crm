/**
 * `src/data/notifications.js` — the event-reminder alerts behind the popup.
 *
 * Reached through mocks everywhere else in the suite, so nothing exercised the
 * module itself: not the query that decides which events can notify you, and
 * not the expiry rules that decide when an alert stops nagging.
 */
const api = vi.hoisted(() => ({
  useEvent: vi.fn(() => ({ events: { data: [] } })),
  user: 'ada@x.com',
  saveUserSettings: vi.fn(async () => ({})),
  getUserSettings: vi.fn(async () => null),
  storage: null,
}))

vi.mock('@/stores/session', () => ({
  sessionStore: () => ({ user: api.user }),
}))

vi.mock('@/composables/event', () => ({
  useEvent: (...a) => api.useEvent(...a),
}))

vi.mock('@/data/userSettings', () => ({
  useUserSettings: () => ({ save: (...a) => api.saveUserSettings(...a) }),
  getUserSettings: (...a) => api.getUserSettings(...a),
}))

// The alert list is `useStorage`-backed, i.e. one array shared by every caller
// and persisted to localStorage. A plain ref keeps that sharing without the
// persistence, which is what the module's behaviour actually depends on.
vi.mock('@vueuse/core', async (importOriginal) => {
  const actual = await importOriginal()
  const { ref } = await import('vue')
  api.storage = ref([])
  return { ...actual, useStorage: () => api.storage }
})

import {
  useEventNotifications,
  useEventNotificationAlert,
} from '@/data/notifications'
import { withSetup } from '../helpers/setup'
import { dayjs } from 'frappe-ui'

const future = () => dayjs().add(2, 'hour').toISOString()
const past = () => dayjs().subtract(2, 'hour').toISOString()

const event = (over = {}) => ({
  event_name: 'EV-1',
  ends_on: future(),
  ...over,
})

describe('event notifications', () => {
  beforeEach(() => {
    api.storage.value = []
    api.useEvent.mockClear()
    api.saveUserSettings.mockClear().mockResolvedValue({})
    api.getUserSettings.mockClear().mockResolvedValue(null)
    vi.useRealTimers()
  })

  describe('which events can raise a reminder', () => {
    const filters = () => {
      useEventNotifications()
      return api.useEvent.mock.calls.at(-1)[0].filters
    }

    it('asks only for open events', () => {
      expect(filters().status).toBe('Open')
    })

    it('asks only for the signed-in user’s own events', () => {
      // Without this you are reminded about other people's calendars.
      expect(filters().owner).toBe('ada@x.com')
    })

    it('asks only for events that have not already finished', () => {
      const [op, when] = filters().ends_on
      expect(op).toBe('>=')
      expect(dayjs(when).isBefore(dayjs().add(1, 'minute'))).toBe(true)
    })

    it('does not turn on the generic notification stream', () => {
      // These render as their own popup; the shared stream would double them.
      useEventNotifications()
      expect(api.useEvent.mock.calls.at(-1)[0].notifications).toBe(false)
    })
  })

  describe('raising an alert', () => {
    it('adds one for an incoming event', () => {
      const [alerts, app] = withSetup(useEventNotificationAlert)
      alerts.handleEventNotification(event())
      expect(alerts.eventNotificationAlerts.value).toHaveLength(1)
      expect(alerts.eventNotificationAlerts.value[0]).toMatchObject({
        id: 'EV-1',
        completed: false,
      })
      app.unmount()
    })

    it('does not raise a second alert for the same event', () => {
      // The socket re-delivers on reconnect; without this the popup stacks.
      const [alerts, app] = withSetup(useEventNotificationAlert)
      alerts.handleEventNotification(event())
      alerts.handleEventNotification(event())
      expect(alerts.eventNotificationAlerts.value).toHaveLength(1)
      app.unmount()
    })

    it('raises a fresh alert once the old one is dealt with', () => {
      const [alerts, app] = withSetup(useEventNotificationAlert)
      alerts.addEventNotificationAlert(event())
      alerts.eventNotificationAlerts.value[0].completed = true
      alerts.addEventNotificationAlert(event())
      expect(alerts.eventNotificationAlerts.value).toHaveLength(2)
      app.unmount()
    })

    it('says nothing about an event already dismissed in a past session', () => {
      const [alerts, app] = withSetup(useEventNotificationAlert)
      alerts.completedEvents.value = ['EV-1']
      alerts.handleEventNotification(event())
      expect(alerts.eventNotificationAlerts.value).toEqual([])
      app.unmount()
    })

    it('keeps the event payload so the popup can render it', () => {
      const [alerts, app] = withSetup(useEventNotificationAlert)
      alerts.addEventNotificationAlert(event({ subject: 'Standup' }))
      expect(alerts.eventNotificationAlerts.value[0].notification).toMatchObject({
        subject: 'Standup',
      })
      app.unmount()
    })
  })

  describe('which alerts are still showing', () => {
    const seeded = (rows) => {
      const [alerts, app] = withSetup(useEventNotificationAlert)
      api.storage.value = rows
      return [alerts, app]
    }

    it('shows one for an event still to come', () => {
      const [alerts, app] = seeded([
        { id: 'EV-1', completed: false, notification: event() },
      ])
      expect(alerts.activeAlerts.value.map((a) => a.id)).toEqual(['EV-1'])
      app.unmount()
    })

    it('hides one the user has dismissed', () => {
      const [alerts, app] = seeded([
        { id: 'EV-1', completed: true, notification: event() },
      ])
      expect(alerts.activeAlerts.value).toEqual([])
      app.unmount()
    })

    it('hides one for an event that has already ended', () => {
      const [alerts, app] = seeded([
        { id: 'EV-1', completed: false, notification: event({ ends_on: past() }) },
      ])
      expect(alerts.activeAlerts.value).toEqual([])
      app.unmount()
    })

    it('shows one whose payload carries no end time', () => {
      // An all-day or open-ended event has no ends_on; dropping it would mean
      // never reminding about the events that most need it.
      const [alerts, app] = seeded([
        { id: 'EV-1', completed: false, notification: { event_name: 'EV-1' } },
      ])
      expect(alerts.activeAlerts.value.map((a) => a.id)).toEqual(['EV-1'])
      app.unmount()
    })

    it('hides one dismissed in a past session even if the row says otherwise', () => {
      const [alerts, app] = seeded([
        { id: 'EV-1', completed: false, notification: event() },
      ])
      alerts.completedEvents.value = ['EV-1']
      expect(alerts.activeAlerts.value).toEqual([])
      app.unmount()
    })
  })

  describe('dismissing an alert', () => {
    it('marks it done and remembers it across sessions', async () => {
      const [alerts, app] = withSetup(useEventNotificationAlert)
      api.storage.value = [
        { id: 'EV-1', completed: false, notification: event() },
      ]
      await alerts.completeEventNotificationAlert('EV-1')
      expect(alerts.eventNotificationAlerts.value[0].completed).toBe(true)
      expect(alerts.completedEvents.value).toContain('EV-1')
      expect(api.saveUserSettings).toHaveBeenCalledWith(
        'Event',
        'notifications',
        expect.objectContaining({ completedEvents: ['EV-1'] }),
      )
      app.unmount()
    })

    it('does not write the same dismissal twice', () => {
      const [alerts, app] = withSetup(useEventNotificationAlert)
      alerts.completedEvents.value = ['EV-1']
      alerts.completeEventNotificationAlert('EV-1')
      expect(api.saveUserSettings).not.toHaveBeenCalled()
      app.unmount()
    })

    it('still records an unknown id rather than doing nothing', async () => {
      const [alerts, app] = withSetup(useEventNotificationAlert)
      await alerts.completeEventNotificationAlert('EV-GONE')
      expect(alerts.completedEvents.value).toContain('EV-GONE')
      app.unmount()
    })
  })

  describe('clearing up', () => {
    it('drops the dismissed rows and keeps the rest', () => {
      const [alerts, app] = withSetup(useEventNotificationAlert)
      api.storage.value = [
        { id: 'A', completed: true },
        { id: 'B', completed: false },
      ]
      alerts.removeCompletedEventNotificationAlerts()
      expect(alerts.eventNotificationAlerts.value.map((a) => a.id)).toEqual(['B'])
      app.unmount()
    })

    it('empties the list entirely on request', () => {
      const [alerts, app] = withSetup(useEventNotificationAlert)
      api.storage.value = [{ id: 'A', completed: false }]
      alerts.clearAllEventNotificationAlerts()
      expect(alerts.eventNotificationAlerts.value).toEqual([])
      app.unmount()
    })

    it('forgets past dismissals so those events can notify again', async () => {
      const [alerts, app] = withSetup(useEventNotificationAlert)
      alerts.completedEvents.value = ['EV-1']
      await alerts.clearCompletedEvents()
      expect(alerts.completedEvents.value).toEqual([])
      expect(api.saveUserSettings).toHaveBeenCalled()
      app.unmount()
    })

    it('dismisses alerts for events that have since ended', async () => {
      const [alerts, app] = withSetup(useEventNotificationAlert)
      api.storage.value = [
        { id: 'OLD', completed: false, notification: event({ ends_on: past() }) },
        { id: 'NEW', completed: false, notification: event({ event_name: 'NEW' }) },
      ]
      await alerts.cleanupExpiredEventAlerts()
      expect(alerts.completedEvents.value).toEqual(['OLD'])
      app.unmount()
    })

    it('leaves an alert alone when its event has no end time', async () => {
      const [alerts, app] = withSetup(useEventNotificationAlert)
      api.storage.value = [
        { id: 'OPEN', completed: false, notification: { event_name: 'OPEN' } },
      ]
      await alerts.cleanupExpiredEventAlerts()
      expect(alerts.completedEvents.value).toEqual([])
      app.unmount()
    })
  })

  describe('settings loaded from the server', () => {
    it('restores what was dismissed before', async () => {
      api.getUserSettings.mockResolvedValue({ completedEvents: ['EV-7'] })
      const [alerts, app] = withSetup(useEventNotificationAlert)
      await alerts.loadNotificationSettings()
      expect(alerts.completedEvents.value).toEqual(['EV-7'])
      app.unmount()
    })

    it('starts empty when the server has never been told', async () => {
      api.getUserSettings.mockResolvedValue(null)
      const [alerts, app] = withSetup(useEventNotificationAlert)
      await alerts.loadNotificationSettings()
      expect(alerts.completedEvents.value).toEqual([])
      app.unmount()
    })

    it('survives a settings row with no completedEvents key', async () => {
      api.getUserSettings.mockResolvedValue({})
      const [alerts, app] = withSetup(useEventNotificationAlert)
      await alerts.loadNotificationSettings()
      expect(alerts.completedEvents.value).toEqual([])
      app.unmount()
    })

    it('does not take the popup down when the request fails', async () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {})
      api.getUserSettings.mockRejectedValue(new Error('offline'))
      const [alerts, app] = withSetup(useEventNotificationAlert)
      await expect(alerts.loadNotificationSettings()).resolves.toBeUndefined()
      err.mockRestore()
      app.unmount()
    })

    it('does not take the popup down when saving fails', async () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {})
      api.saveUserSettings.mockRejectedValue(new Error('offline'))
      const [alerts, app] = withSetup(useEventNotificationAlert)
      await expect(alerts.saveNotificationSettings()).resolves.toBeUndefined()
      err.mockRestore()
      app.unmount()
    })
  })

  describe('the expiry sweep', () => {
    it('stops when the component using it goes away', () => {
      // It is a setInterval, so a missed clear keeps firing against a dead
      // component for as long as the tab is open.
      vi.useFakeTimers()
      const clear = vi.spyOn(globalThis, 'clearInterval')
      const [, app] = withSetup(useEventNotificationAlert)
      app.unmount()
      expect(clear).toHaveBeenCalled()
      clear.mockRestore()
      vi.useRealTimers()
    })
  })
})
