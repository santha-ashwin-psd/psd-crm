const api = vi.hoisted(() => ({
  socket: { on: vi.fn(), off: vi.fn() },
  markAllAsRead: { reload: vi.fn() },
  markDocAsRead: vi.fn(),
  notifications: null,
}))

// The notifications store is spread from the original below, so its
// module-scope `createResource({ auto: true })` still runs — neutering the
// factory here is what keeps it off the network.
vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  const inert = (options = {}) =>
    reactive({ ...options, data: null, fetch: vi.fn(), reload: vi.fn(), submit: vi.fn() })
  return {
    ...actual,
    createResource: inert,
    createListResource: inert,
    createDocumentResource: inert,
  }
})

vi.mock('@/stores/global', () => ({
  globalStore: () => ({ $socket: api.socket }),
}))

// Spread the original rather than replacing the module: importing it for real
// is what runs `dayjs.extend(isBetween)`, and a bare factory mock dropped that
// side effect and broke unrelated date helpers.
vi.mock('@/stores/notifications', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  api.notifications = reactive({ data: [], reload: vi.fn() })
  return {
    ...actual,
    notifications: api.notifications,
    notificationsStore: () => ({
      mark_as_read: api.markAllAsRead,
      mark_doc_as_read: api.markDocAsRead,
    }),
  }
})

vi.mock('@/stores/settings', async () => {
  const { ref } = await import('vue')
  return {
    getSettings: () => ({
      brand: ref({ favicon: '/f.ico' }),
      _settings: { doc: {} },
    }),
    isTranslatable: () => false,
  }
})

import MobileNotification from '@/pages/MobileNotification.vue'
import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'

const STUBS = {
  // Not `true`: the "Mark all as read" button lives in this component's
  // #right-header slot, and an auto-stub renders no slots at all.
  LayoutHeader: {
    name: 'LayoutHeader',
    template:
      '<div class="stub-header"><slot name="left-header" /><slot name="right-header" /></div>',
  },
  Breadcrumbs: true,
  UserAvatar: true,
  WhatsAppIcon: true,
  NotificationsIcon: true,
  RouterLink: {
    props: ['to'],
    template: '<a class="stub-link" @click="$emit(\'click\')"><slot /></a>',
  },
}

const notification = (over = {}) => ({
  comment: 'COMMENT-1',
  notification_type_doc: 'TASK-1',
  read: false,
  type: 'Mention',
  from_user: { name: 'ada@x.com', full_name: 'Ada' },
  reference_doctype: 'CRM Lead',
  reference_name: 'LEAD-1',
  route_name: 'Lead',
  creation: '2026-03-15 09:00:00',
  ...over,
})

const mountPage = () => mountComponent(MobileNotification, { global: { stubs: STUBS } })

describe('Mobile notifications page', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T10:00:00'))
    api.socket.on.mockClear()
    api.socket.off.mockClear()
    api.markAllAsRead.reload.mockClear()
    api.markDocAsRead.mockClear()
    api.notifications.data = []
    api.notifications.reload.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('where a notification links to', () => {
    it('routes a lead mention to the lead', () => {
      const route = mountPage().vm.getRoute(notification())
      expect(route.name).toBe('Lead')
      expect(route.params).toEqual({ leadId: 'LEAD-1' })
    })

    it('routes a deal mention to the deal', () => {
      // Deals take a different route param, so this branch is the only thing
      // stopping a deal notification opening a lead page.
      const route = mountPage().vm.getRoute(
        notification({ route_name: 'Deal' }),
      )
      expect(route.name).toBe('Deal')
      expect(route.params).toEqual({ dealId: 'LEAD-1' })
    })

    it('anchors on the comment that triggered it', () => {
      expect(mountPage().vm.getRoute(notification()).hash).toBe('#COMMENT-1')
    })

    it('falls back to the source document when there is no comment', () => {
      // Regression: `'#' + comment || type_doc` parsed as
      // `('#' + comment) || type_doc`, so a comment-less notification produced
      // the literal '#undefined' and the fallback never ran.
      const route = mountPage().vm.getRoute(
        notification({ comment: undefined }),
      )
      expect(route.hash).toBe('#TASK-1')
      expect(route.hash).not.toContain('undefined')
    })
  })

  describe('the empty state', () => {
    it('says there is nothing rather than showing a blank page', () => {
      expect(mountPage().text()).toContain('No New Notifications')
    })

    it('gives way to the list once notifications arrive', async () => {
      const wrapper = mountPage()
      api.notifications.data = [notification()]
      await nextTick()
      expect(wrapper.text()).not.toContain('No New Notifications')
      expect(wrapper.findAll('.stub-link')).toHaveLength(1)
    })
  })

  describe('marking as read', () => {
    it('marks everything from the header button', async () => {
      const wrapper = mountPage()
      await wrapper.find('.stub-button').trigger('click')
      expect(api.markAllAsRead.reload).toHaveBeenCalled()
    })

    it('marks the one you opened by its comment', async () => {
      const wrapper = mountPage()
      api.notifications.data = [notification()]
      await nextTick()
      await wrapper.find('.stub-link').trigger('click')
      expect(api.markDocAsRead).toHaveBeenCalledWith('COMMENT-1')
    })

    it('falls back to the source document when there is no comment', async () => {
      const wrapper = mountPage()
      api.notifications.data = [notification({ comment: undefined })]
      await nextTick()
      await wrapper.find('.stub-link').trigger('click')
      expect(api.markDocAsRead).toHaveBeenCalledWith('TASK-1')
    })
  })

  describe('live updates', () => {
    it('subscribes to the notification channel on arrival', () => {
      mountPage()
      expect(api.socket.on).toHaveBeenCalledWith(
        'crm_notification',
        expect.any(Function),
      )
    })

    it('reloads the list when one comes in', () => {
      mountPage()
      const handler = api.socket.on.mock.calls[0][1]
      handler()
      expect(api.notifications.reload).toHaveBeenCalled()
    })

    it('unsubscribes only its own listener on the way out', () => {
      // Left attached, every visit to this page would stack another listener
      // and multiply the reloads. But `off(event)` with no handler removes
      // EVERY listener for that event — including the one in Notifications.vue,
      // which is mounted for the whole session, so a single visit here used to
      // stop desktop notifications refreshing until a full page reload. The
      // handler argument is what keeps the removal targeted.
      mountPage().unmount()
      expect(api.socket.off).toHaveBeenCalledWith(
        'crm_notification',
        expect.any(Function),
      )
    })
  })
})
