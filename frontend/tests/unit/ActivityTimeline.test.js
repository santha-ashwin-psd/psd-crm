const api = vi.hoisted(() => ({
  toast: null,
  activities: null,
  whatsappMessages: null,
  template: null,
  socket: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
  capture: vi.fn(),
  newestFirst: null,
  document: null,
}))

// Loaded through the AI draft composable (composables/aiDraft.js); the real
// store fetches FCRM Settings as soon as it is imported. AI stays off here.
vi.mock('@/stores/settings', async () => {
  const { ref } = await import('vue')
  return {
    getSettings: () => ({ brand: ref({}), _settings: { doc: {} } }),
    isTranslatable: () => false,
  }
})

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  api.toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
  return {
    ...actual,
    toast: api.toast,
    createResource: (options = {}) => {
      const r = reactive({
        ...options,
        data: null,
        fetch: vi.fn(),
        reload: vi.fn(),
        submit: vi.fn(),
      })
      if (options.url?.includes('get_activities')) api.activities = r
      if (options.url?.includes('get_whatsapp_messages')) api.whatsappMessages = r
      if (options.url?.includes('send_whatsapp_template')) api.template = r
      return r
    },
  }
})

vi.mock('frappe-ui/frappe', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useTelemetry: () => ({ capture: api.capture }) }
})

vi.mock('@/stores/global', () => ({
  globalStore: () => ({ $socket: api.socket, $dialog: vi.fn() }),
}))

vi.mock('@/stores/users', () => ({
  usersStore: () => ({
    // The real store never returns undefined — it stubs an unknown address
    // into `{ full_name: local-part }` — so this mirrors that.
    getUser: (e) => ({
      name: e,
      full_name: e === 'ada@x.com' ? 'Ada' : String(e || '').split('@')[0],
    }),
    isManager: () => true,
    users: { data: { crmUsers: [] } },
  }),
}))

vi.mock('@/stores/session', () => ({
  sessionStore: () => ({ user: 'ada@x.com' }),
}))

vi.mock('@/composables/useTimelinePreferences', async () => {
  const { ref } = await import('vue')
  api.newestFirst = ref(false)
  return {
    useTimelinePreferences: () => ({
      isNewestFirst: api.newestFirst,
      showExactTimestamp: ref(false),
    }),
  }
})

vi.mock('@/composables/whatsapp', async () => {
  const { ref } = await import('vue')
  return { whatsappEnabled: ref(true), isWhatsappInstalled: ref(true) }
})

vi.mock('@/data/document', async () => {
  const { reactive } = await import('vue')
  return {
    useDocument: () => {
      api.document = reactive({
        doc: { name: 'DEAL-1', mobile_no: '+911234' },
        get: { loading: false },
        save: { submit: vi.fn(), loading: false },
        reload: vi.fn(),
        isDirty: false,
      })
      return { document: api.document }
    },
  }
})

const ROUTE = vi.hoisted(() => ({ name: 'Deal', params: {}, query: {}, hash: '' }))
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useRoute: () => ROUTE }
})

import Activities from '@/components/Activities/Activities.vue'
import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'

const quiet = { inheritAttrs: false, template: '<div />' }
const STUBS = Object.fromEntries(
  [
    'ActivityHeader', 'EmailArea', 'CommentArea', 'CallArea', 'NoteArea',
    'TaskArea', 'AttachmentArea', 'DataFields', 'EventArea', 'WhatsAppArea',
    'WhatsAppBox', 'AllModals', 'CommunicationArea', 'FilesUploader',
    'SkeletonLoader', 'EmptyState', 'FadedScrollableDiv', 'TimelineTimestamp',
    'WhatsappTemplateSelectorModal', 'UserAvatar',
  ].map((name) => [name, { ...quiet, name: `${name}Stub` }]),
)

const TABS = [
  { name: 'Activity' }, { name: 'Emails' }, { name: 'Comments' },
  { name: 'Calls' }, { name: 'Tasks' }, { name: 'Notes' },
  { name: 'Attachments' },
]

const mount = (tabIndex = 0) =>
  mountComponent(Activities, {
    props: { doctype: 'CRM Deal', docname: 'DEAL-1', tabs: TABS, tabIndex },
    global: { stubs: STUBS, mocks: { $route: ROUTE } },
  })

const note = (over = {}) => ({
  name: 'N1',
  title: 'Call notes',
  content: 'Spoke to Ada',
  owner: 'ada@x.com',
  creation: '2026-03-01 09:00:00',
  modified: '2026-03-01 09:00:00',
  ...over,
})

describe('Activities — ordering, change descriptions and WhatsApp', () => {
  beforeEach(() => {
    for (const t of Object.values(api.toast)) t.mockClear()
    api.capture.mockClear()
    api.socket.on.mockClear()
    api.newestFirst.value = false
    ROUTE.hash = ''
  })

  describe('sorting', () => {
    it('puts the most recently modified first', () => {
      // Named `(b, a)` rather than reversed afterwards — the operand order is
      // what makes it descending, which is easy to "tidy" into the opposite.
      const wrapper = mount()
      const sorted = wrapper.vm.sortByModified([
        { name: 'old', modified: '2026-01-01 00:00:00' },
        { name: 'new', modified: '2026-06-01 00:00:00' },
        { name: 'mid', modified: '2026-03-01 00:00:00' },
      ])
      expect(sorted.map((r) => r.name)).toEqual(['new', 'mid', 'old'])
    })

    it('sorts by creation oldest-first by default', () => {
      const wrapper = mount()
      const sorted = wrapper.vm.sortByCreation([
        { name: 'new', creation: '2026-06-01 00:00:00' },
        { name: 'old', creation: '2026-01-01 00:00:00' },
      ])
      expect(sorted.map((r) => r.name)).toEqual(['old', 'new'])
    })

    it('reverses when the reader prefers newest first', () => {
      const wrapper = mount()
      const sorted = wrapper.vm.sortByCreation(
        [
          { name: 'old', creation: '2026-01-01 00:00:00' },
          { name: 'new', creation: '2026-06-01 00:00:00' },
        ],
        true,
      )
      expect(sorted.map((r) => r.name)).toEqual(['new', 'old'])
    })

    it('is stable enough to sort the same list twice', () => {
      // The list is reactive and sorted in place, so a comparator that is not
      // consistent would re-trigger the computed that called it.
      const wrapper = mount()
      const rows = [
        { name: 'a', creation: '2026-01-01 00:00:00' },
        { name: 'b', creation: '2026-01-01 00:00:00' },
      ]
      const once = wrapper.vm.sortByCreation(rows).map((r) => r.name)
      const twice = wrapper.vm.sortByCreation(rows).map((r) => r.name)
      expect(twice).toEqual(once)
    })
  })

  describe('describing a change on the timeline', () => {
    const describe_ = (activity) => {
      const wrapper = mount()
      const a = { owner: 'ada@x.com', ...activity }
      wrapper.vm.update_activities_details(a)
      return a
    }

    it('names who made the change', () => {
      expect(describe_({ activity_type: 'changed' }).owner_name).toBe('Ada')
    })

    it('falls back to the local part for someone not in the list', () => {
      expect(
        describe_({ activity_type: 'changed', owner: 'nobody@x.com' }).owner_name,
      ).toBe('nobody')
    })

    it('reads a record being created', () => {
      const a = describe_({ activity_type: 'creation', data: 'created this deal' })
      expect(a.type).toBe('created this deal')
      expect(a.value).toBe('')
    })

    it('reads a value being added', () => {
      const a = describe_({ activity_type: 'added' })
      expect([a.type, a.value, a.to]).toEqual(['added', 'as', ''])
    })

    it('reads a value being removed', () => {
      const a = describe_({ activity_type: 'removed' })
      expect([a.type, a.value, a.to]).toEqual(['removed', 'value', ''])
    })

    it('reads a value being changed, which needs both ends', () => {
      const a = describe_({ activity_type: 'changed' })
      expect([a.type, a.value, a.to]).toEqual(['changed', 'from', 'to'])
    })

    it('leaves the wording blank for a type it does not know', () => {
      const a = describe_({ activity_type: 'something_else' })
      expect([a.type, a.value, a.to]).toEqual(['', '', ''])
    })

    it('clears wording left over from a previous pass', () => {
      // The same object is re-described when the timeline reloads.
      const a = describe_({
        activity_type: 'added',
        type: 'changed',
        value: 'from',
        to: 'to',
      })
      expect(a.to).toBe('')
    })
  })

  describe('comments arriving from elsewhere', () => {
    const update = (wrapper, over = {}) =>
      wrapper.vm.handleDocinfoUpdate({
        key: 'comments',
        doc: {
          reference_doctype: 'CRM Deal',
          reference_name: 'DEAL-1',
          ...over,
        },
      })

    it('reloads the timeline for a comment on this record', () => {
      const wrapper = mount()
      update(wrapper)
      expect(api.activities.reload).toHaveBeenCalled()
      expect(api.document.reload).toHaveBeenCalled()
    })

    it('ignores an update about anything but comments', () => {
      const wrapper = mount()
      wrapper.vm.handleDocinfoUpdate({
        key: 'attachments',
        doc: { reference_doctype: 'CRM Deal', reference_name: 'DEAL-1' },
      })
      expect(api.activities.reload).not.toHaveBeenCalled()
    })

    it('ignores a comment on a different doctype', () => {
      const wrapper = mount()
      update(wrapper, { reference_doctype: 'CRM Lead' })
      expect(api.activities.reload).not.toHaveBeenCalled()
    })

    it('ignores a comment on a different record of the same doctype', () => {
      // Two deals open in two tabs must not refresh each other.
      const wrapper = mount()
      update(wrapper, { reference_name: 'DEAL-2' })
      expect(api.activities.reload).not.toHaveBeenCalled()
    })
  })

  describe('sending a WhatsApp template', () => {
    it("sends it to the record's number", () => {
      const wrapper = mount()
      wrapper.vm.sendTemplate('welcome')
      expect(api.template.params).toEqual({
        reference_doctype: 'CRM Deal',
        reference_name: 'DEAL-1',
        to: '+911234',
        template: 'welcome',
      })
    })

    it('closes the picker', () => {
      const wrapper = mount()
      wrapper.vm.showWhatsappTemplates = true
      wrapper.vm.sendTemplate('welcome')
      expect(wrapper.vm.showWhatsappTemplates).toBe(false)
    })

    it('records that a template was used', () => {
      mount().vm.sendTemplate('welcome')
      expect(api.capture).toHaveBeenCalledWith('send_whatsapp_template', {
        doctype: 'CRM Deal',
      })
    })

    it('refreshes the conversation once it is sent', () => {
      const wrapper = mount()
      wrapper.vm.sendTemplate('welcome')
      api.template.onSuccess()
      expect(api.whatsappMessages.reload).toHaveBeenCalled()
    })

    it('says why it could not be sent', () => {
      const wrapper = mount()
      wrapper.vm.sendTemplate('welcome')
      api.template.onError({ messages: ['Number is not on WhatsApp'] })
      expect(api.toast.error).toHaveBeenCalledWith('Number is not on WhatsApp')
    })

    it('falls back to a general message', () => {
      const wrapper = mount()
      wrapper.vm.sendTemplate('welcome')
      api.template.onError({})
      expect(api.toast.error).toHaveBeenCalledWith(
        'Failed to send WhatsApp template',
      )
    })
  })

  describe('the notes tab', () => {
    const withNotes = (rows) => {
      const wrapper = mount(5)
      api.activities.data = { notes: rows }
      return wrapper
    }

    it('shows every note before anything is searched', () => {
      const wrapper = withNotes([note(), note({ name: 'N2', title: 'Second' })])
      expect(wrapper.vm.visibleNotes).toHaveLength(2)
    })

    it('narrows to a search term', () => {
      const wrapper = withNotes([
        note({ title: 'Pricing call' }),
        note({ name: 'N2', title: 'Kickoff' }),
      ])
      wrapper.vm.noteSearch = 'pricing'
      expect(wrapper.vm.visibleNotes.map((n) => n.title)).toEqual(['Pricing call'])
    })

    it('offers a scope to narrow by', () => {
      const wrapper = withNotes([])
      expect(wrapper.vm.scopeOptions.length).toBeGreaterThan(1)
    })

    it('copes with no notes at all', () => {
      const wrapper = mount(5)
      expect(wrapper.vm.visibleNotes).toEqual([])
    })
  })

  describe('moving between tabs', () => {
    it('switches to the one named', async () => {
      const wrapper = mount(0)
      wrapper.vm.changeTabTo('emails')
      await nextTick()
      expect(wrapper.vm.tabIndex).toBe(1)
    })

    it('ignores a tab that is not there', async () => {
      const wrapper = mount(0)
      wrapper.vm.changeTabTo('nonexistent')
      await nextTick()
      expect(wrapper.vm.tabIndex).toBe(0)
    })
  })
})
