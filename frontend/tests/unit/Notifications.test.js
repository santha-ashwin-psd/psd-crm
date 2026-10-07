const socket = vi.hoisted(() => ({ on: vi.fn(), off: vi.fn() }))
vi.mock('@/stores/global', () => ({ globalStore: () => ({ $socket: socket }) }))

const store = vi.hoisted(() => ({
  markAsReadReload: vi.fn(),
  markDocAsRead: vi.fn(),
  toggle: vi.fn(),
  reload: vi.fn(),
}))

vi.mock('@/stores/notifications', async () => {
  const { ref, reactive } = await import('vue')
  return {
    visible: ref(false),
    notifications: reactive({ data: [], reload: store.reload }),
    notificationsStore: () => ({
      mark_as_read: { reload: store.markAsReadReload },
      mark_doc_as_read: store.markDocAsRead,
      toggle: store.toggle,
      unreadNotificationsCount: 0,
    }),
  }
})

const alerts = vi.hoisted(() => ({ handle: vi.fn() }))
vi.mock('@/data/notifications', () => ({
  useEventNotificationAlert: () => ({
    handleEventNotification: alerts.handle,
    eventNotificationAlerts: { value: [] },
    completeEventNotificationAlert: vi.fn(),
    removeCompletedEventNotificationAlerts: vi.fn(),
  }),
}))

vi.mock('frappe-ui/frappe', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useTelemetry: () => ({ capture: vi.fn() }) }
})

import Notifications from '@/components/Notifications.vue'
import { mountComponent } from '../helpers/mount'
import { visible, notifications } from '@/stores/notifications'

const STUBS = {
  TabButtons: { name: 'TabButtons', props: ['buttons'], template: '<div class="tabs" />' },
  EventNotificationsArea: { name: 'EventNotificationsArea', template: '<div />' },
  EmptyState: { name: 'EmptyState', props: ['title'], template: '<div class="empty" />' },
  UserAvatar: { name: 'UserAvatar', template: '<span />' },
  'router-link': { name: 'RouterLink', props: ['to'], template: '<a><slot /></a>' },
}

const mountPanel = () =>
  mountComponent(Notifications, { global: { stubs: STUBS } })

describe('Notifications', () => {
  beforeEach(() => {
    Object.values(store).forEach((fn) => fn.mockClear())
    socket.on.mockClear()
    socket.off.mockClear()
    alerts.handle.mockClear()
    visible.value = false
    notifications.data = []
  })

  describe('routing to the source document', () => {
    it('opens a lead by its lead id', () => {
      const wrapper = mountPanel()
      expect(
        wrapper.vm.getRoute({ route_name: 'Lead', reference_name: 'LEAD-1' }),
      ).toMatchObject({ name: 'Lead', params: { leadId: 'LEAD-1' } })
    })

    it('opens a deal by its deal id', () => {
      // The two routes take differently-named params for the same value.
      const wrapper = mountPanel()
      expect(
        wrapper.vm.getRoute({ route_name: 'Deal', reference_name: 'DEAL-1' }),
      ).toMatchObject({ name: 'Deal', params: { dealId: 'DEAL-1' } })
    })

    it('carries the hash so the right tab opens', () => {
      const wrapper = mountPanel()
      expect(
        wrapper.vm.getRoute({
          route_name: 'Deal',
          reference_name: 'DEAL-1',
          hash: '#comments',
        }).hash,
      ).toBe('#comments')
    })

    it('defaults unknown routes to the lead param', () => {
      const wrapper = mountPanel()
      expect(
        wrapper.vm.getRoute({ route_name: 'Task', reference_name: 'TASK-1' })
          .params,
      ).toEqual({ leadId: 'TASK-1' })
    })
  })

  describe('marking as read', () => {
    it('marks a single notification', () => {
      const wrapper = mountPanel()
      wrapper.vm.markAsRead('CRM Deal::DEAL-1')
      expect(store.markDocAsRead).toHaveBeenCalledWith('CRM Deal::DEAL-1')
    })

    it('marks everything', () => {
      const wrapper = mountPanel()
      wrapper.vm.markAllAsRead()
      expect(store.markAsReadReload).toHaveBeenCalled()
    })
  })

  describe('live updates', () => {
    it('subscribes to both notification channels on mount', () => {
      mountPanel()
      const events = socket.on.mock.calls.map(([name]) => name)
      expect(events).toContain('crm_notification')
      expect(events).toContain('event_notification')
    })

    it('refreshes the list when one arrives', () => {
      mountPanel()
      const handler = socket.on.mock.calls.find(
        ([name]) => name === 'crm_notification',
      )[1]
      handler()
      expect(store.reload).toHaveBeenCalled()
    })

    it('routes event notifications to the alert popup', () => {
      mountPanel()
      const handler = socket.on.mock.calls.find(
        ([name]) => name === 'event_notification',
      )[1]
      handler({ event_name: 'EVENT-1' })
      expect(alerts.handle).toHaveBeenCalledWith({ event_name: 'EVENT-1' })
    })

    it('unsubscribes from both on unmount', () => {
      // Otherwise every open of the panel adds another live listener.
      const wrapper = mountPanel()
      socket.off.mockClear()
      wrapper.unmount()
      const events = socket.off.mock.calls.map(([name]) => name)
      expect(events).toContain('crm_notification')
      expect(events).toContain('event_notification')
    })
  })

  describe('tabs', () => {
    it('starts on All', () => {
      expect(mountPanel().vm.activeTab).toBe('all')
    })

    it('offers All and Events', () => {
      expect(mountPanel().vm.tabs.map((t) => t.value)).toEqual([
        'all',
        'events',
      ])
    })
  })
})
