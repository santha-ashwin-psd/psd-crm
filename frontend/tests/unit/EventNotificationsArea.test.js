const data = vi.hoisted(() => ({ events: null }))

// Spread the real module rather than replacing it: it runs
// `dayjs.extend(isBetween)` at import time, and the component's whole
// classification depends on that plugin being registered.
vi.mock('@/data/notifications', async (importOriginal) => {
  const actual = await importOriginal()
  const { ref } = await import('vue')
  data.events = ref([])
  return { ...actual, useEventNotifications: () => ({ events: data.events }) }
})

const store = vi.hoisted(() => ({ toggle: vi.fn() }))
vi.mock('@/stores/notifications', () => ({
  notificationsStore: () => ({ toggle: store.toggle }),
}))

const nav = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useRouter: () => nav }
})

import EventNotificationsArea from '@/components/EventNotificationsArea.vue'
import { mountComponent } from '../helpers/mount'

// Classification is entirely relative to "now", so the clock is pinned.
const NOW = new Date(2026, 7, 21, 12, 0, 0)

const event = (overrides = {}) => ({
  name: 'EVENT-1',
  subject: 'Standup',
  starts_on: '2026-08-21 15:00:00',
  ends_on: '2026-08-21 16:00:00',
  color: 'blue',
  all_day: 0,
  owner: 'ada@example.com',
  participants: [],
  ...overrides,
})

const mountArea = (events = []) => {
  data.events.value = events
  return mountComponent(EventNotificationsArea, {
    global: {
      stubs: { MultipleAvatar: true, EmptyState: true, EventIcon: true },
    },
  })
}

const section = (wrapper, type) =>
  wrapper.vm.computedEvents.find((s) => s.type === type)

describe('EventNotificationsArea', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    store.toggle.mockClear()
    nav.push.mockClear()
  })

  afterEach(() => vi.useRealTimers())

  describe('grouping', () => {
    it('shows nothing when there are no events', () => {
      expect(mountArea([]).vm.computedEvents).toEqual([])
    })

    it('always renders the three buckets in a fixed order', () => {
      const wrapper = mountArea([event()])
      expect(wrapper.vm.computedEvents.map((s) => s.type)).toEqual([
        'Starting now',
        'Ongoing events',
        'Upcoming events',
      ])
    })

    it('counts each bucket', () => {
      const wrapper = mountArea([event(), event({ name: 'EVENT-2' })])
      expect(section(wrapper, 'Upcoming events').count).toBe(2)
      expect(section(wrapper, 'Ongoing events').count).toBe(0)
    })
  })

  describe('classifying an event against the clock', () => {
    it('calls an event within five minutes "starting now"', () => {
      const wrapper = mountArea([
        event({ starts_on: '2026-08-21 12:03:00', ends_on: '2026-08-21 13:00:00' }),
      ])
      expect(section(wrapper, 'Starting now').items).toHaveLength(1)
    })

    it('counts one that just started as starting now too', () => {
      // The window is symmetric: five minutes either side of now.
      const wrapper = mountArea([
        event({ starts_on: '2026-08-21 11:57:00', ends_on: '2026-08-21 13:00:00' }),
      ])
      expect(section(wrapper, 'Starting now').items).toHaveLength(1)
    })

    it('calls one further out "upcoming"', () => {
      const wrapper = mountArea([
        event({ starts_on: '2026-08-21 14:00:00', ends_on: '2026-08-21 15:00:00' }),
      ])
      expect(section(wrapper, 'Upcoming events').items).toHaveLength(1)
    })

    it('calls one already under way "ongoing"', () => {
      const wrapper = mountArea([
        event({ starts_on: '2026-08-21 11:00:00', ends_on: '2026-08-21 13:00:00' }),
      ])
      expect(section(wrapper, 'Ongoing events').items).toHaveLength(1)
    })

    it('sorts a mixed set into the right buckets', () => {
      const wrapper = mountArea([
        event({ name: 'A', starts_on: '2026-08-21 11:00:00', ends_on: '2026-08-21 13:00:00' }),
        event({ name: 'B', starts_on: '2026-08-21 12:02:00', ends_on: '2026-08-21 13:00:00' }),
        event({ name: 'C', starts_on: '2026-08-21 18:00:00', ends_on: '2026-08-21 19:00:00' }),
      ])
      expect(section(wrapper, 'Ongoing events').items.map((i) => i.id)).toEqual(['A'])
      expect(section(wrapper, 'Starting now').items.map((i) => i.id)).toEqual(['B'])
      expect(section(wrapper, 'Upcoming events').items.map((i) => i.id)).toEqual(['C'])
    })
  })

  describe('mapping an event for display', () => {
    it('carries the identifiers across', () => {
      const wrapper = mountArea([event()])
      expect(section(wrapper, 'Upcoming events').items[0]).toMatchObject({
        id: 'EVENT-1',
        title: 'Standup',
        fromDate: '2026-08-21',
        color: 'blue',
        owner: 'ada@example.com',
      })
    })

    it('formats the times in place while rendering', () => {
      // `formattedDateTime` assigns back onto the item it is given, and the
      // template calls it during render — so by the time anything else reads
      // these fields the ":00" is already gone. Harmless because the rewrite
      // is idempotent and the computed rebuilds the objects, but surprising
      // enough to pin down.
      const wrapper = mountArea([event()])
      const item = section(wrapper, 'Upcoming events').items[0]
      expect(item.fromTime).toBe('3 pm')
      expect(item.toTime).toBe('4 pm')
    })
  })

  describe('the time label', () => {
    const label = (wrapper, e) => wrapper.vm.formattedDateTime(e)

    it('says All Day for an all-day event', () => {
      expect(label(mountArea([]), { allDay: true })).toBe('All Day')
    })

    it('drops the redundant :00 from whole hours', () => {
      const out = label(mountArea([]), {
        fromTime: '9:00 am',
        toTime: '5:00 pm',
      })
      expect(out).not.toContain(':00')
      expect(out).toContain('9 am')
      expect(out).toContain('5 pm')
    })

    it('keeps the meridiem once when both ends share it', () => {
      // "9 - 11 am" reads better than "9 am - 11 am".
      expect(
        label(mountArea([]), { fromTime: '9:00 am', toTime: '11:00 am' }).trim(),
      ).toBe('9 - 11 am')
    })

    it('keeps both when the range crosses midday', () => {
      expect(label(mountArea([]), { fromTime: '11:00 am', toTime: '1:00 pm' })).toBe(
        '11 am - 1 pm',
      )
    })

    it('leaves part-hour times intact', () => {
      expect(
        label(mountArea([]), { fromTime: '9:30 am', toTime: '10:45 am' }).trim(),
      ).toBe('9:30 - 10:45 am')
    })
  })

  describe('the date chip', () => {
    it('splits the date into a day and a short month', () => {
      expect(mountArea([]).vm.eventDate({ fromDate: '2026-06-05' })).toEqual({
        day: '05',
        month: 'Jun',
      })
    })
  })

  describe('opening an event', () => {
    it('navigates to the calendar on that day', () => {
      const wrapper = mountArea([])
      wrapper.vm.handleEventClick({ id: 'EVENT-9', fromDate: '2026-08-21' })
      expect(nav.push).toHaveBeenCalledWith({
        name: 'Calendar',
        query: { eventId: 'EVENT-9', date: '2026-08-21' },
      })
    })

    it('closes the notification panel on the way out', () => {
      // Leaving it open would cover the calendar you just navigated to.
      const wrapper = mountArea([])
      wrapper.vm.handleEventClick({ id: 'EVENT-9', fromDate: '2026-08-21' })
      expect(store.toggle).toHaveBeenCalled()
    })
  })
})
