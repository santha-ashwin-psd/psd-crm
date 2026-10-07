vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { fakeResource } = await import('../helpers/pinia.js')
  return { ...actual, createResource: (options) => fakeResource(options) }
})

import {
  notificationsStore,
  notifications,
  visible,
} from '@/stores/notifications'
import { withPinia } from '../helpers/pinia'

const ROWS = [
  { name: 'n1', read: 0, message: 'You were assigned a deal' },
  { name: 'n2', read: 1, message: 'Task completed' },
  { name: 'n3', read: 0, message: 'New comment' },
]

describe('notifications store', () => {
  beforeEach(() => {
    withPinia()
    visible.value = false
    notifications._seed([])
  })

  describe('unreadNotificationsCount', () => {
    it('counts only the unread entries', () => {
      const store = notificationsStore()
      notifications._seed(structuredClone(ROWS))
      expect(store.unreadNotificationsCount).toBe(2)
    })

    it('is zero when everything is read', () => {
      const store = notificationsStore()
      notifications._seed([{ name: 'n1', read: 1 }])
      expect(store.unreadNotificationsCount).toBe(0)
    })

    it('is zero for an empty list', () => {
      const store = notificationsStore()
      expect(store.unreadNotificationsCount).toBe(0)
    })

    it('is zero rather than NaN when data is null', () => {
      // The badge must never render "NaN" during the first load.
      const store = notificationsStore()
      notifications.data = null
      expect(store.unreadNotificationsCount).toBe(0)
    })

    it('recomputes when the list changes', () => {
      const store = notificationsStore()
      notifications._seed(structuredClone(ROWS))
      expect(store.unreadNotificationsCount).toBe(2)
      notifications._seed([{ name: 'n1', read: 1 }])
      expect(store.unreadNotificationsCount).toBe(0)
    })
  })

  describe('toggle', () => {
    it('flips the panel open and shut', () => {
      const store = notificationsStore()
      store.toggle()
      expect(visible.value).toBe(true)
      store.toggle()
      expect(visible.value).toBe(false)
    })
  })

  describe('mark_doc_as_read', () => {
    it('sends the doc, reloads, and closes the panel', () => {
      const store = notificationsStore()
      visible.value = true
      store.mark_doc_as_read('CRM Deal::DEAL-001')

      expect(store.mark_as_read.params).toEqual({
        doc: 'CRM Deal::DEAL-001',
      })
      expect(store.mark_as_read.reload).toHaveBeenCalled()
      expect(visible.value).toBe(false)
    })

    it('clears its params and refreshes the list once the call lands', () => {
      const store = notificationsStore()
      store.mark_doc_as_read('CRM Deal::DEAL-001')
      store.mark_as_read.options.onSuccess()
      expect(store.mark_as_read.params).toEqual({})
      expect(notifications.reload).toHaveBeenCalled()
    })
  })
})
