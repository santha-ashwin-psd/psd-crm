const api = vi.hoisted(() => ({
  toast: null,
  activities: null,
  // `emit` too: the component subscribes to the document on mount, so a
  // socket without it throws before any test reaches an assertion.
  socket: { on: vi.fn(), off: vi.fn(), emit: vi.fn() },
  capture: vi.fn(),
  newestFirst: null,
}))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  api.toast = {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  }
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
    getUser: (e) => ({ name: e, full_name: e === 'ada@x.com' ? 'Ada' : e }),
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
  return { whatsappEnabled: ref(false), isWhatsappInstalled: ref(false) }
})

vi.mock('@/data/document', async () => {
  const { reactive } = await import('vue')
  return {
    useDocument: () => ({
      document: reactive({
        doc: { name: 'DEAL-1' },
        get: { loading: false },
        save: { submit: vi.fn(), loading: false },
        reload: vi.fn(),
        isDirty: false,
      }),
    }),
  }
})

const ROUTE = vi.hoisted(() => ({
  name: 'Deal',
  params: {},
  query: {},
  hash: '',
}))
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useRoute: () => ROUTE }
})

import Activities from '@/components/Activities/Activities.vue'
import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'

// `inheritAttrs: false`, not `true` auto-stubs. The timeline passes
// component objects around (`activity.icon` is a markRaw'd component), and an
// auto-stub lets undeclared props fall through to the DOM — where Vue calls
// setAttribute with an object and throws "Cannot convert object to primitive
// value" on every render. Tests still passed; the run was full of unhandled
// errors underneath them.
const quiet = { inheritAttrs: false, template: '<div />' }
const STUBS = Object.fromEntries(
  [
    'ActivityHeader',
    'EmailArea',
    'CommentArea',
    'CallArea',
    'NoteArea',
    'TaskArea',
    'AttachmentArea',
    'DataFields',
    'EventArea',
    'WhatsAppArea',
    'WhatsAppBox',
    'AllModals',
    'CommunicationArea',
    'FilesUploader',
    'SkeletonLoader',
    'EmptyState',
    'FadedScrollableDiv',
    'TimelineTimestamp',
    'WhatsappTemplateSelectorModal',
    'UserAvatar',
  ].map((name) => [name, { ...quiet, name: `${name}Stub` }]),
)

const TABS = [
  { name: 'Activity' },
  { name: 'Emails' },
  { name: 'Comments' },
  { name: 'Calls' },
  { name: 'Tasks' },
  { name: 'Notes' },
  { name: 'Attachments' },
]

const mount = (tabIndex = 0) =>
  mountComponent(Activities, {
    props: { doctype: 'CRM Deal', docname: 'DEAL-1', tabs: TABS, tabIndex },
    global: { stubs: STUBS, mocks: { $route: ROUTE } },
  })

const version = (over = {}) => ({
  name: 'V-1',
  activity_type: 'changed',
  owner: 'ada@x.com',
  creation: '2026-03-15 09:00:00',
  modified: '2026-03-15 09:00:00',
  // The timeline renders these directly, so a bare `{}` leaves the template
  // stringifying undefined values on re-render.
  data: { field_label: 'Status', value: 'Open', old_value: 'New' },
  ...over,
})

const withData = (data, tabIndex = 0) => {
  const wrapper = mount(tabIndex)
  api.activities.data = data
  return wrapper
}

describe('Activities', () => {
  beforeEach(() => {
    api.newestFirst.value = false
    api.socket.on.mockClear()
    api.socket.off.mockClear()
    ROUTE.hash = ''
  })

  describe('assembling the Activity tab', () => {
    it('is empty before anything loads', () => {
      expect(mount().vm.activities).toEqual([])
    })

    it('shows versions when there are no calls', () => {
      const wrapper = withData({ versions: [version()], calls: [] })
      expect(wrapper.vm.activities).toHaveLength(1)
    })

    it('merges calls in with the versions', () => {
      const wrapper = withData({
        versions: [version()],
        calls: [version({ name: 'C-1', activity_type: 'incoming_call' })],
      })
      expect(wrapper.vm.activities).toHaveLength(2)
    })

    it('survives a payload with no calls key at all', () => {
      // The API always sends one, but the guard on the line above already
      // allowed for a missing key and this one did not — a throw here is
      // inside a computed and would take the whole timeline down.
      const wrapper = withData({ versions: [version()] })
      expect(() => wrapper.vm.activities).not.toThrow()
      expect(wrapper.vm.activities).toHaveLength(1)
    })
  })

  describe('the per-tab filters', () => {
    const data = {
      versions: [
        version({ name: 'E-1', activity_type: 'communication' }),
        version({ name: 'C-1', activity_type: 'comment' }),
        version({ name: 'V-1', activity_type: 'changed' }),
      ],
      calls: [version({ name: 'CALL-1', activity_type: 'incoming_call' })],
      tasks: [version({ name: 'T-1' })],
      notes: [version({ name: 'N-1' })],
      attachments: [version({ name: 'A-1' })],
    }

    it('shows only emails on the Emails tab', () => {
      const wrapper = withData(data, 1)
      expect(wrapper.vm.activities.map((a) => a.name)).toEqual(['E-1'])
    })

    it('shows only comments on the Comments tab', () => {
      const wrapper = withData(data, 2)
      expect(wrapper.vm.activities.map((a) => a.name)).toEqual(['C-1'])
    })

    it('shows calls on the Calls tab', () => {
      const wrapper = withData(data, 3)
      expect(wrapper.vm.activities.map((a) => a.name)).toEqual(['CALL-1'])
    })

    it.each([
      [4, 'T-1'],
      [5, 'N-1'],
      [6, 'A-1'],
    ])('shows the right records on tab %i', (index, expected) => {
      const wrapper = withData(data, index)
      expect(wrapper.vm.activities.map((a) => a.name)).toEqual([expected])
    })

    it('is empty for a tab whose data has not arrived', () => {
      const wrapper = withData({ versions: [] }, 4)
      expect(wrapper.vm.activities).toEqual([])
    })
  })

  describe('ordering', () => {
    const two = {
      versions: [
        version({ name: 'OLD', creation: '2026-03-01 09:00:00' }),
        version({ name: 'NEW', creation: '2026-03-20 09:00:00' }),
      ],
      calls: [],
    }

    it('runs oldest first by default', () => {
      // A timeline reads top-down like a conversation.
      const wrapper = withData(two)
      expect(wrapper.vm.activities.map((a) => a.name)).toEqual(['OLD', 'NEW'])
    })

    it('reverses on request', () => {
      api.newestFirst.value = true
      const wrapper = withData(two)
      expect(wrapper.vm.activities.map((a) => a.name)).toEqual(['NEW', 'OLD'])
    })

    it('re-orders when the preference is changed while open', async () => {
      // The setting is changed from a menu on this very screen, so the
      // timeline has to follow without a reload.
      const wrapper = withData(two)
      expect(wrapper.vm.activities.map((a) => a.name)).toEqual(['OLD', 'NEW'])
      api.newestFirst.value = true
      await nextTick()
      expect(wrapper.vm.activities.map((a) => a.name)).toEqual(['NEW', 'OLD'])
    })

    it('sorts a list either way on demand', () => {
      // The comparator directly, independent of any render.
      const wrapper = mount()
      const list = () => [
        { creation: '2026-03-01 09:00:00', name: 'OLD' },
        { creation: '2026-03-20 09:00:00', name: 'NEW' },
      ]
      expect(
        wrapper.vm.sortByCreation(list(), false).map((a) => a.name),
      ).toEqual(['OLD', 'NEW'])
      expect(
        wrapper.vm.sortByCreation(list(), true).map((a) => a.name),
      ).toEqual(['NEW', 'OLD'])
    })

    it('is stable when computed twice', () => {
      // The sort mutates the array in place, so an unstable comparator would
      // make this computed re-trigger itself forever.
      const wrapper = withData(two)
      const first = wrapper.vm.activities.map((a) => a.name)
      expect(wrapper.vm.activities.map((a) => a.name)).toEqual(first)
    })

    it('orders tasks and notes by when they were last touched', () => {
      const wrapper = withData(
        {
          versions: [],
          tasks: [
            version({ name: 'STALE', modified: '2026-03-01 09:00:00' }),
            version({ name: 'FRESH', modified: '2026-03-20 09:00:00' }),
          ],
        },
        4,
      )
      expect(wrapper.vm.activities.map((a) => a.name)).toEqual([
        'FRESH',
        'STALE',
      ])
    })
  })

  describe('describing a change', () => {
    const detailed = (activity_type, data) => {
      const wrapper = withData({
        versions: [version({ activity_type, data })],
        calls: [],
      })
      return wrapper.vm.activities[0]
    }

    it('names the person who made it', () => {
      expect(detailed('changed').owner_name).toBe('Ada')
    })

    it('reads a change as "from … to"', () => {
      const a = detailed('changed')
      expect(a.type).toBe('changed')
      expect(a.value).toBe('from')
      expect(a.to).toBe('to')
    })

    it('reads an addition as "added … as"', () => {
      const a = detailed('added')
      expect(a.type).toBe('added')
      expect(a.value).toBe('as')
      expect(a.to).toBe('')
    })

    it('reads a removal as "removed … value"', () => {
      const a = detailed('removed')
      expect(a.type).toBe('removed')
      expect(a.value).toBe('value')
    })

    it('carries the payload through for a creation', () => {
      expect(detailed('creation', 'created this deal').type).toBe(
        'created this deal',
      )
    })

    // Calls and emails render through their own components, which read the raw
    // record. Decorating them blanks `type`/`value`/`to` and stamps an
    // `owner_name`, so the check has to cover all three types — an earlier
    // version tested only `communication`, and the two call types went through
    // the same branch untested.
    it.each(['incoming_call', 'outgoing_call', 'communication'])(
      'leaves a %s entry undecorated',
      (activity_type) => {
        const a = detailed(activity_type)
        expect(a.type).toBeUndefined()
        expect(a.value).toBeUndefined()
        expect(a.owner_name).toBeUndefined()
      },
    )

    it('still gives an undecorated entry its icon', () => {
      // The icon is assigned before the early return; losing it would leave a
      // gap in the timeline rail.
      expect(detailed('incoming_call').icon).toBeTruthy()
    })
  })

  describe('timeline icons', () => {
    const icon = (type, isLead) => mount().vm.timelineIcon(type, isLead)

    it('distinguishes an inbound from an outbound call', () => {
      expect(icon('incoming_call')).not.toBe(icon('outgoing_call'))
    })

    it('uses the record type for a creation entry', () => {
      expect(icon('creation', true)).not.toBe(icon('creation', false))
    })

    it('gives comments, events and attachments their own icons', () => {
      const icons = new Set([
        icon('comment'),
        icon('event'),
        icon('attachment_log'),
      ])
      expect(icons.size).toBe(3)
    })

    it('falls back to a dot for anything unrecognised', () => {
      expect(icon('something_new')).toBe(icon('changed'))
    })
  })

  describe('the empty state', () => {
    it('describes the tab it is on', () => {
      const forTab = (i) => {
        const wrapper = withData({ versions: [], calls: [] }, i)
        return wrapper.vm.emptyText
      }
      const texts = [0, 1, 2, 3, 4, 5, 6].map(forTab)
      expect(new Set(texts).size).toBeGreaterThan(1)
      for (const t of texts) expect(t).toBeTruthy()
    })

    it('gives every tab a description and an icon', () => {
      for (const i of [0, 1, 2, 3, 4, 5, 6]) {
        const wrapper = withData({ versions: [], calls: [] }, i)
        expect(wrapper.vm.emptyTextDescription, String(i)).toBeTruthy()
        expect(wrapper.vm.emptyTextIcon, String(i)).toBeTruthy()
      }
    })
  })

  describe('live updates', () => {
    it('subscribes on arrival and unsubscribes on the way out', () => {
      const wrapper = mount()
      expect(api.socket.on).toHaveBeenCalled()
      wrapper.unmount()
      expect(api.socket.off).toHaveBeenCalled()
    })
  })

  describe('scrolling into view', () => {
    it('does nothing on the tabs that manage their own scroll', () => {
      // Tasks, notes and events render their own lists rather than a timeline.
      for (const hash of ['#tasks', '#notes', '#events']) {
        ROUTE.hash = hash
        expect(() => mount().vm.scroll()).not.toThrow()
      }
    })
  })
})

describe('Activities — the Notes tab heading', () => {
  const mountNotes = (doctype = 'CRM Deal') =>
    mountComponent(Activities, {
      props: {
        doctype,
        docname: 'REC-1',
        tabs: TABS,
        tabIndex: TABS.findIndex((t) => t.name === 'Notes'),
      },
      global: { stubs: STUBS, mocks: { $route: ROUTE } },
    })

  it('does not render a heading of its own', () => {
    // Regression: this panel used to print "Notes" and the standfirst above
    // the search controls, while ActivityHeader was already printing both for
    // every tab — so the tab opened with the title and the sentence twice.
    // The heading belongs to ActivityHeader (covered in its own suite, along
    // with naming the record type); all this panel owns is the search + scope.
    const text = mountNotes().text()
    expect(text).not.toContain('Capture important details')
  })

  it('no longer carries its own copy of the subtitle', () => {
    // The duplicate came with a second, lead/deal-only source for the
    // sentence. utils/emptyState.notesSubtitle() is the single source now and
    // covers contacts and organizations too.
    expect(mountNotes().vm.notesSubtitle).toBeUndefined()
  })
})
