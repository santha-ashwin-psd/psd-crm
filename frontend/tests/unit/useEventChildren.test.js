// useEvent reads attendees and reminders for every listed event. Before, it
// only set the filters and never fetched, so an event always opened with no
// reminders — and saving it deleted them.
const made = vi.hoisted(() => ({ list: [] }))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  return {
    ...actual,
    createListResource: (options) => {
      const resource = reactive({
        doctype: options.doctype,
        filters: options.filters,
        data: null,
        reload: vi.fn(),
      })
      resource.update = vi.fn((o) => Object.assign(resource, o))
      made.list.push(resource)
      return resource
    },
  }
})

vi.mock('@/stores/users', () => ({
  usersStore: () => ({
    getUser: (email) => ({ full_name: email, user_image: '' }),
  }),
}))

import { effectScope, nextTick } from 'vue'
import { useEvent } from '@/composables/event'

const byDoctype = (doctype) => made.list.find((r) => r.doctype === doctype)

describe('useEvent attendees and reminders', () => {
  let scope, api

  beforeEach(() => {
    made.list.length = 0
    scope = effectScope()
    api = scope.run(() => useEvent({ doctype: 'CRM Deal', docname: 'DEAL-1' }))
  })

  afterEach(() => scope.stop())

  const loadEvents = async (names) => {
    byDoctype('Event').data = names.map((name) => ({
      name,
      owner: 'ada@example.com',
    }))
    await nextTick()
  }

  it('fetches them for the listed events', async () => {
    await loadEvents(['EV1', 'EV2'])
    for (const [doctype, parentfield] of [
      ['Event Notifications', 'notifications'],
      ['Event Participants', 'event_participants'],
    ]) {
      const resource = byDoctype(doctype)
      expect(resource.filters).toEqual({
        parenttype: 'Event',
        parentfield,
        parent: ['in', ['EV1', 'EV2']],
      })
      expect(resource.reload).toHaveBeenCalledTimes(1)
    }
  })

  it('fetches them again after the list reloads (an event was edited)', async () => {
    await loadEvents(['EV1'])
    await loadEvents(['EV1'])
    expect(byDoctype('Event Notifications').reload).toHaveBeenCalledTimes(2)
  })

  it('attaches each event its own reminders and attendees', async () => {
    await loadEvents(['EV1', 'EV2'])
    byDoctype('Event Notifications').data = [
      { parent: 'EV1', before: 10, interval: 'minutes' },
      { parent: 'EV1', before: 1, interval: 'hours' },
      { parent: 'EV2', before: 1, interval: 'days' },
    ]
    byDoctype('Event Participants').data = [
      { parent: 'EV2', email: 'guest@example.org' },
    ]

    const [ev1, ev2] = api.events.value
    expect(ev1.notifications.map((n) => n.before)).toEqual([10, 1])
    expect(ev2.notifications.map((n) => n.before)).toEqual([1])
    expect(ev1.event_participants).toEqual([])
    expect(ev2.participants.map((p) => p.name)).toEqual([
      'ada@example.com',
      'guest@example.org',
    ])
  })

  it('does not fetch anything when there are no events', async () => {
    await loadEvents([])
    expect(byDoctype('Event Notifications').reload).not.toHaveBeenCalled()
  })
})
