const alerts = vi.hoisted(() => ({
  list: null,
  complete: vi.fn(),
  removeCompleted: vi.fn(),
}))

vi.mock('@/data/notifications', async () => {
  const { ref } = await import('vue')
  alerts.list = ref([])
  return {
    useEventNotificationAlert: () => ({
      eventNotificationAlerts: alerts.list,
      completeEventNotificationAlert: alerts.complete,
      removeCompletedEventNotificationAlerts: alerts.removeCompleted,
    }),
  }
})

vi.mock('@/stores/users', () => ({
  usersStore: () => ({
    getUser: (email) => ({
      full_name: email === 'ada@example.com' ? 'Ada Lovelace' : '',
      user_image: email === 'ada@example.com' ? '/ada.png' : '',
    }),
  }),
}))

const nav = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useRouter: () => nav }
})

import EventNotificationPopup from '@/components/EventNotificationPopup.vue'
import { mountComponent } from '../helpers/mount'

const alert = (overrides = {}) => ({
  id: 'alert-1',
  completed: false,
  notification: {
    event_name: 'EVENT-1',
    starts_on: '2026-08-20 09:00:00',
    ends_on: '2026-08-20 10:00:00',
    owner: 'ada@example.com',
    ...overrides.notification,
  },
  ...overrides,
})

const mountPopup = (list = []) => {
  alerts.list.value = list
  return mountComponent(EventNotificationPopup, {
    global: { stubs: { UserAvatar: true, Avatar: true } },
  })
}

describe('EventNotificationPopup', () => {
  beforeEach(() => {
    alerts.complete.mockClear()
    alerts.removeCompleted.mockClear()
    nav.push.mockClear()
  })

  describe('which alerts show', () => {
    it('shows pending alerts', () => {
      const wrapper = mountPopup([alert(), alert({ id: 'alert-2' })])
      expect(wrapper.vm.visibleAlerts).toHaveLength(2)
    })

    it('hides ones already dealt with', () => {
      const wrapper = mountPopup([alert(), alert({ id: 'a2', completed: true })])
      expect(wrapper.vm.visibleAlerts.map((a) => a.id)).toEqual(['alert-1'])
    })

    it('shows nothing when there are no alerts', () => {
      expect(mountPopup([]).vm.visibleAlerts).toEqual([])
    })
  })

  describe('opening an event', () => {
    it('navigates to the calendar on the event date', () => {
      const wrapper = mountPopup([alert()])
      wrapper.vm.openEvent(alert())
      expect(nav.push).toHaveBeenCalledWith({
        name: 'Calendar',
        query: { eventId: 'EVENT-1', date: '2026-08-20' },
      })
    })

    it('dismisses the alert at the same time', () => {
      // Opening the event is acting on the reminder; it should not linger.
      const wrapper = mountPopup([alert()])
      wrapper.vm.openEvent(alert())
      expect(alerts.complete).toHaveBeenCalledWith('alert-1')
    })
  })

  describe('dismissing', () => {
    it('marks the alert complete immediately', () => {
      const wrapper = mountPopup([alert()])
      wrapper.vm.completeAlert('alert-1')
      expect(alerts.complete).toHaveBeenCalledWith('alert-1')
    })

    it('sweeps it away after the exit animation', () => {
      // Removing at once would cut the leave transition short.
      vi.useFakeTimers()
      const wrapper = mountPopup([alert()])
      wrapper.vm.completeAlert('alert-1')
      expect(alerts.removeCompleted).not.toHaveBeenCalled()
      vi.advanceTimersByTime(300)
      expect(alerts.removeCompleted).toHaveBeenCalled()
      vi.useRealTimers()
    })
  })

  describe('event time', () => {
    it('says All Day for an all-day event', () => {
      const wrapper = mountPopup([])
      expect(wrapper.vm.formatEventTime({ all_day_event: 1 })).toBe('All Day')
    })

    it('renders a start and end time', () => {
      const wrapper = mountPopup([])
      expect(
        wrapper.vm.formatEventTime({
          starts_on: '2026-08-20 09:00:00',
          ends_on: '2026-08-20 10:30:00',
        }),
      ).toBe('9:00 am - 10:30 am')
    })

    it('says nothing when there is no start time', () => {
      expect(mountPopup([]).vm.formatEventTime({})).toBe('')
    })
  })

  describe('participants', () => {
    it('resolves each one to a display record', () => {
      const wrapper = mountPopup([])
      expect(
        wrapper.vm.getParticipants({
          event_participants: ['ada@example.com'],
        }),
      ).toEqual([
        { label: 'Ada Lovelace', image: '/ada.png', name: 'ada@example.com' },
      ])
    })

    it('falls back to the address for an unknown person', () => {
      const wrapper = mountPopup([])
      expect(
        wrapper.vm.getParticipants({ event_participants: ['zoe@example.com'] })[0],
      ).toMatchObject({ label: 'zoe@example.com', image: '' })
    })

    it('includes the organiser', () => {
      // The person who scheduled it is attending too.
      const wrapper = mountPopup([])
      const names = wrapper.vm
        .getParticipants({
          event_participants: ['zoe@example.com'],
          owner: 'ada@example.com',
        })
        .map((p) => p.name)
      expect(names).toContain('ada@example.com')
    })

    it('does not list the organiser twice', () => {
      const wrapper = mountPopup([])
      const names = wrapper.vm
        .getParticipants({
          event_participants: ['ada@example.com'],
          owner: 'ada@example.com',
        })
        .map((p) => p.name)
      expect(names).toEqual(['ada@example.com'])
    })

    it('returns nothing for an event with no participants', () => {
      // The owner alone is not enough to render a participant row.
      const wrapper = mountPopup([])
      expect(wrapper.vm.getParticipants({ owner: 'ada@example.com' })).toEqual(
        [],
      )
      expect(wrapper.vm.getParticipants({})).toEqual([])
    })
  })
})
