const api = vi.hoisted(() => ({
  user: 'ada@x.com',
  push: null,
  dialog: null,
  call: null,
  toast: null,
  docResources: [],
  activeEvent: null,
  shortcuts: null,
  serverDoc: null,
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: (...a) => api.push(...a) }),
  useRoute: () => ({ name: 'Calendar', params: {}, query: {} }),
}))

vi.mock('@/stores/global', () => ({
  globalStore: () => ({ $dialog: (...a) => api.dialog(...a), $socket: { on: vi.fn(), off: vi.fn() } }),
}))

vi.mock('@/stores/session', () => ({
  sessionStore: () => ({ user: api.user }),
}))

vi.mock('@/stores/users', () => ({
  usersStore: () => ({
    getUser: (e) => ({ name: e, full_name: e === 'ada@x.com' ? 'Ada' : e, user_image: '' }),
  }),
}))

vi.mock('@/composables/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: (config) => {
    api.shortcuts = config
  },
}))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive, ref } = await import('vue')
  api.toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
  api.activeEvent = ref('')
  return {
    ...actual,
    toast: api.toast,
    call: (...a) => api.call(...a),
    CalendarActiveEvent: api.activeEvent,
    CalendarColorMap: {
      green: { color: '#22c55e' },
      blue: { color: '#3b82f6' },
      red: { color: '#ef4444' },
    },
    // Hands back the document straight away, as a warm resource does. Tests
    // that want the fetching path set `api.serverDoc = null`.
    createDocumentResource: (opts = {}) => {
      const r = reactive({ ...opts, doc: api.serverDoc, reload: vi.fn() })
      api.docResources.push(r)
      return r
    },
  }
})

import CalendarEventPanel from '@/components/Calendar/CalendarEventPanel.vue'
import { mountComponent } from '../helpers/mount'
import { nextTick, ref, reactive } from 'vue'
import { flushPromises } from '@vue/test-utils'

const quiet = { inheritAttrs: false, template: '<div><slot /></div>' }
const STUBS = {
  Attendee: { ...quiet, name: 'AttendeeStub' },
  EventNotifications: { ...quiet, name: 'EventNotificationsStub' },
  ShortcutTooltip: { ...quiet, name: 'ShortcutTooltipStub' },
  TabButtons: {
    name: 'TabButtonsStub',
    inheritAttrs: false,
    props: ['modelValue', 'buttons'],
    template: '<div />',
  },
  // Exposes `el`, as the real one does — the panel focuses through it.
  TextInput: {
    name: 'TextInputStub',
    inheritAttrs: false,
    template: '<input ref="el" />',
    computed: {
      el() {
        return this.$refs.el
      },
    },
  },
  Switch: { ...quiet, name: 'SwitchStub' },
  DatePicker: { ...quiet, name: 'S1' },
  TimePicker: { ...quiet, name: 'S2' },
  TextEditor: { ...quiet, name: 'S3' },
  ErrorMessage: {
    name: 'ErrorMessageStub',
    inheritAttrs: false,
    props: ['message'],
    template: '<div class="err">{{ message }}</div>',
  },
  Dropdown: {
    name: 'DropdownStub',
    inheritAttrs: false,
    props: ['options'],
    template: '<div><slot /></div>',
  },
  Tooltip: { ...quiet, name: 'TooltipStub' },
  Avatar: { ...quiet, name: 'AvatarStub' },
  UserAvatar: { ...quiet, name: 'UserAvatarStub' },
  DescriptionIcon: { ...quiet, name: 'S4' },
  CalendarIcon: { ...quiet, name: 'S5' },
  Link: { ...quiet, name: 'LinkStub' },
}

// The Event document as the server stores it. The panel parses this itself,
// so the tests exercise the same conversion the app does.
const eventDoc = (over = {}) => ({
  name: 'EVENT-1',
  subject: 'Kickoff',
  description: '',
  starts_on: '2026-03-04 10:00:00',
  ends_on: '2026-03-04 11:00:00',
  all_day: 0,
  event_type: 'Private',
  color: '#22c55e',
  owner: 'ada@x.com',
  attending: 'Yes',
  event_participants: [],
  notifications: [],
  ...over,
})

// What the calendar grid passes in: just enough to identify the event.
const savedEvent = (over = {}) => ({ id: 'EVENT-1', ...over })

// The placeholder object the calendar page builds for an unsaved event.
const tempEvent = (over = {}) => ({
  id: 'new-event',
  title: '',
  description: '',
  fromDate: '2026-03-04',
  toDate: '2026-03-04',
  fromTime: '10:00:00',
  toTime: '11:00:00',
  isFullDay: false,
  eventType: 'Private',
  color: '#22c55e',
  attending: 'Yes',
  event_participants: [],
  notifications: [],
  ...over,
})

describe('CalendarEventPanel', () => {
  const mount = (event, mode = 'details') =>
    mountComponent(CalendarEventPanel, {
      props: { modelValue: true, event, mode },
      global: {
        stubs: STUBS,
        // `events` is the page's list resource, not a plain array — the save
        // button reads `events.insert.loading` / `events.setValue.loading`.
        provide: {
          events: reactive({
            data: [],
            insert: { loading: false, submit: vi.fn() },
            setValue: { loading: false, submit: vi.fn() },
            delete: { loading: false, submit: vi.fn() },
            reload: vi.fn(),
          }),
        },
      },
    })

  // Mount against a particular server document.
  const withDoc = (over, mode = 'details') => {
    api.serverDoc = eventDoc(over)
    return mount(savedEvent(), mode)
  }

  beforeEach(() => {
    api.user = 'ada@x.com'
    api.serverDoc = eventDoc()
    api.push = vi.fn()
    api.dialog = vi.fn()
    api.call = vi.fn(async () => ({}))
    api.docResources = []
    api.activeEvent.value = ''
    api.toast.success.mockClear()
    api.toast.error.mockClear()
  })

  describe('loading an event', () => {
    it('fetches a saved event by id', () => {
      mount(savedEvent())
      expect(api.docResources[0].doctype).toBe('Event')
      expect(api.docResources[0].name).toBe('EVENT-1')
      expect(api.docResources[0].doc.subject).toBe('Kickoff')
    })

    it('uses the document it already has rather than refetching', () => {
      mount(savedEvent())
      expect(api.docResources[0].reload).not.toHaveBeenCalled()
    })

    it('fetches when it has nothing cached', () => {
      api.serverDoc = null
      mount(savedEvent())
      expect(api.docResources[0].reload).toHaveBeenCalled()
    })

    it('refetches when the caller asks it to', () => {
      mount(savedEvent({ reloadEvent: true }))
      expect(api.docResources[0].reload).toHaveBeenCalled()
    })

    it('reads the document the server sent', () => {
      const wrapper = mount(savedEvent())
      expect(wrapper.vm._event.title).toBe('Kickoff')
      expect(wrapper.vm._event.fromTime).toBe('10:00')
    })

    it('takes the document from a late response too', () => {
      api.serverDoc = null
      const wrapper = mount(savedEvent())
      api.docResources[0].onSuccess(eventDoc({ subject: 'Arrived late' }))
      expect(wrapper.vm._event.title).toBe('Arrived late')
    })

    it('asks the server for nothing when the event is not saved yet', () => {
      mount(tempEvent(), 'new')
      expect(api.docResources).toHaveLength(0)
    })

    it('works from the placeholder object directly', () => {
      const e = tempEvent({ title: 'Draft' })
      const wrapper = mount(e, 'new')
      expect(wrapper.vm._event.title).toBe('Draft')
    })

    it('marks a duplicate as a copy', () => {
      const wrapper = mount(
        tempEvent({ id: 'duplicate-event', title: 'Kickoff' }),
        'duplicate',
      )
      expect(wrapper.vm._event.title).toBe('Kickoff (Copy)')
    })

    it('does not add "(Copy)" again while still duplicating', async () => {
      // The watcher re-runs on any event change, and the title is already
      // marked — appending each time would give "Kickoff (Copy) (Copy)".
      const wrapper = mount(
        tempEvent({ id: 'duplicate-event', title: 'Kickoff' }),
        'duplicate',
      )
      await wrapper.setProps({
        event: tempEvent({ id: 'duplicate-event', title: 'Kickoff (Copy)' }),
      })
      expect(wrapper.vm._event.title).toBe('Kickoff (Copy)')
    })

    it('collapses the participant list again for each event', async () => {
      const wrapper = mount(savedEvent())
      wrapper.vm.showAllParticipants = true
      await wrapper.setProps({ event: savedEvent({ id: 'EVENT-2' }) })
      expect(wrapper.vm.showAllParticipants).toBe(false)
    })

    it('clears any error from the last event', async () => {
      const wrapper = mount(savedEvent())
      wrapper.vm.error = 'Title is required'
      await wrapper.setProps({ mode: 'edit' })
      expect(wrapper.vm.error).toBeNull()
    })
  })

  describe('who may change it', () => {
    it('lets the owner edit', () => {
      expect(mount(savedEvent()).vm.readonly).toBe(false)
    })

    it('does not let anyone else', () => {
      api.user = 'grace@x.com'
      expect(mount(savedEvent()).vm.readonly).toBe(true)
    })

    it('sends a non-owner back to the details view if editing was opened', () => {
      // Deep-linking to the edit view of someone else's event.
      api.user = 'grace@x.com'
      const wrapper = mount(savedEvent(), 'edit')
      expect(wrapper.emitted('details')).toBeTruthy()
    })

    it('refuses to edit or delete for a non-owner', () => {
      api.user = 'grace@x.com'
      const wrapper = mount(savedEvent())
      wrapper.vm.editDetails()
      wrapper.vm.deleteEvent()
      expect(wrapper.emitted('edit')).toBeUndefined()
      expect(wrapper.emitted('delete')).toBeUndefined()
    })

    it('lets the owner delete', () => {
      const wrapper = mount(savedEvent())
      wrapper.vm.deleteEvent()
      expect(wrapper.emitted('delete').at(-1)).toEqual(['EVENT-1'])
    })
  })

  describe('the panel heading', () => {
    it('names the mode it is in', () => {
      expect(mount(savedEvent(), 'details').vm.title).toBe('Event Details')
      expect(mount(savedEvent(), 'edit').vm.title).toBe('Editing Event')
      expect(mount(tempEvent(), 'new').vm.title).toBe('New Event')
      expect(mount(tempEvent(), 'duplicate').vm.title).toBe('Duplicate Event')
    })
  })

  describe('the date and time line', () => {
        const line = (over) => {
      api.serverDoc = eventDoc(over)
      return mount(savedEvent()).vm.formattedDateTime
    }

    it('is empty before there is a date', () => {
      expect(line({ starts_on: null })).toBe('')
    })

    it('shows just the start when no end was recorded', () => {
      // Regression: `ends_on` is not required on Event, and the emptiness
      // guard could never fire because dayjs formats an invalid date to the
      // *string* "Invalid Date". The panel read "10 - Invalid Date Wed, ...".
      expect(line({ ends_on: null })).toBe('10 am Wed, 4 Mar 2026')
    })

    it('says so for an all-day event', () => {
      expect(line({ all_day: 1 })).toBe('All Day - Wed, 4 Mar 2026')
    })

    it('reads a timed event back', () => {
      expect(line({ starts_on: '2026-03-04 14:30:00', ends_on: '2026-03-04 15:45:00' })).toBe(
        '2:30 - 3:45 pm Wed, 4 Mar 2026',
      )
    })

    it('drops the minutes when they are zero', () => {
      expect(line({})).toBe(
        '10 - 11 am Wed, 4 Mar 2026',
      )
    })

    it('says am and pm when the event crosses midday', () => {
      expect(line({ starts_on: '2026-03-04 11:30:00', ends_on: '2026-03-04 13:00:00' })).toBe(
        '11:30 am - 1 pm Wed, 4 Mar 2026',
      )
    })
  })

  describe('changing the time', () => {
    it('moves both ends when the date changes', () => {
      const wrapper = mount(savedEvent(), 'edit')
      wrapper.vm.updateDate('2026-03-09')
      expect(wrapper.vm._event.fromDate).toBe('2026-03-09')
      expect(wrapper.vm._event.toDate).toBe('2026-03-09')
      expect(wrapper.emitted('sync')).toBeTruthy()
    })

    it('sets the end time', () => {
      const wrapper = mount(savedEvent(), 'edit')
      wrapper.vm.updateTime('12:00:00')
      expect(wrapper.vm._event.toTime).toBe('12:00:00')
      expect(wrapper.vm.error).toBeNull()
    })

    it('pushes the end out when the start passes it', () => {
      // Otherwise the event would end before it began.
      const wrapper = mount(savedEvent(), 'edit')
      wrapper.vm.updateTime('14:00:00', true)
      expect(wrapper.vm._event.fromTime).toBe('14:00:00')
      expect(wrapper.vm._event.toTime > '14:00:00').toBe(true)
    })

    it('leaves a still-valid end alone', () => {
      const wrapper = withDoc({ ends_on: '2026-03-04 17:00:00' }, 'edit')
      wrapper.vm.updateTime('14:00:00', true)
      expect(wrapper.vm._event.toTime).toBe('17:00')
    })

    it('refuses an end before the start, and puts the old one back', () => {
      const wrapper = mount(savedEvent(), 'edit')
      wrapper.vm.updateTime('09:00:00')
      expect(wrapper.vm.error).toBeTruthy()
      expect(wrapper.vm._event.toTime).toBe('11:00')
    })

    it('does not report a change it rejected', () => {
      const wrapper = mount(savedEvent(), 'edit')
      const before = wrapper.emitted('sync')?.length || 0
      wrapper.vm.updateTime('09:00:00')
      expect((wrapper.emitted('sync') || []).length).toBe(before)
    })

    it('clears the previous error on a good change', () => {
      const wrapper = mount(savedEvent(), 'edit')
      wrapper.vm.updateTime('09:00:00')
      expect(wrapper.vm.error).toBeTruthy()
      wrapper.vm.updateTime('12:00:00')
      expect(wrapper.vm.error).toBeNull()
    })

    it('offers end times from the start onwards', () => {
      const wrapper = mount(savedEvent(), 'edit')
      expect(wrapper.vm.toOptions.length).toBeGreaterThan(0)
    })
  })

  describe('saving', () => {
    it('does nothing when nothing has changed', () => {
      const wrapper = mount(savedEvent(), 'edit')
      wrapper.vm.saveEvent()
      expect(wrapper.emitted('save')).toBeUndefined()
    })

    it('saves a changed event', () => {
      const wrapper = mount(savedEvent(), 'edit')
      wrapper.vm._event.title = 'Kickoff, moved'
      wrapper.vm.saveEvent()
      expect(wrapper.emitted('save').at(-1)[0].title).toBe('Kickoff, moved')
    })

    it('refuses to save without a title', () => {
      const wrapper = mount(tempEvent(), 'new')
      wrapper.vm._event.description = 'something'
      wrapper.vm.saveEvent()
      expect(wrapper.vm.error).toBe('Title is required')
      expect(wrapper.emitted('save')).toBeUndefined()
    })

    it('refuses to save an impossible time range', () => {
      const wrapper = mount(savedEvent(), 'edit')
      wrapper.vm._event.toTime = '09:00:00'
      wrapper.vm.saveEvent()
      expect(wrapper.vm.error).toBeTruthy()
      expect(wrapper.emitted('save')).toBeUndefined()
    })

    it('stops being dirty once saved', () => {
      const wrapper = mount(savedEvent(), 'edit')
      wrapper.vm._event.title = 'Renamed'
      expect(wrapper.vm.dirty).toBe(true)
      wrapper.vm.saveEvent()
      expect(wrapper.vm.dirty).toBe(false)
    })
  })

  describe('unsaved changes', () => {
    const dirtied = (mode = 'edit', event = savedEvent()) => {
      const wrapper = mount(event, mode)
      wrapper.vm._event.title = 'Changed'
      return wrapper
    }

    it('asks before leaving for the details view', () => {
      const wrapper = dirtied()
      wrapper.vm.details()
      expect(api.dialog).toHaveBeenCalled()
      expect(wrapper.emitted('details')).toBeUndefined()
    })

    it('goes straight there when nothing changed', () => {
      const wrapper = mount(savedEvent(), 'edit')
      wrapper.vm.details()
      expect(api.dialog).not.toHaveBeenCalled()
      expect(wrapper.emitted('details')).toBeTruthy()
    })

    it('puts the event back when the change is discarded', () => {
      const wrapper = dirtied()
      wrapper.vm.details()
      api.dialog.mock.calls[0][0].actions[1].onClick(vi.fn())
      expect(wrapper.vm._event.title).toBe('Kickoff')
    })

    it('keeps the change when the prompt is cancelled', () => {
      const wrapper = dirtied()
      wrapper.vm.details()
      api.dialog.mock.calls[0][0].actions[0].onClick(vi.fn())
      expect(wrapper.vm._event.title).toBe('Changed')
    })

    it('asks before duplicating', () => {
      const wrapper = dirtied()
      wrapper.vm.duplicateEvent()
      expect(api.dialog).toHaveBeenCalled()
      expect(wrapper.emitted('duplicate')).toBeUndefined()
    })

    it('duplicates straight away when nothing changed', () => {
      const wrapper = mount(savedEvent(), 'details')
      wrapper.vm.duplicateEvent()
      expect(wrapper.emitted('duplicate')).toBeTruthy()
    })

    it('asks before closing', () => {
      const wrapper = dirtied()
      wrapper.vm.close()
      expect(api.dialog).toHaveBeenCalled()
      expect(wrapper.emitted('close')).toBeUndefined()
    })

    it('closes straight away when nothing changed', () => {
      const wrapper = mount(savedEvent())
      wrapper.vm.close()
      expect(wrapper.emitted('close')).toBeTruthy()
      expect(wrapper.emitted('update:modelValue').at(-1)).toEqual([false])
      expect(api.activeEvent.value).toBe('')
    })

    it('closes an unsaved event outright once discarded', () => {
      // There is nothing to go back to; the placeholder should not linger.
      const wrapper = dirtied('new', tempEvent())
      wrapper.vm.close()
      api.dialog.mock.calls[0][0].actions[1].onClick(vi.fn())
      expect(wrapper.emitted('close')).toBeTruthy()
    })

    it('keeps a saved event open after discarding, showing what was stored', () => {
      const wrapper = dirtied()
      wrapper.vm.close()
      api.dialog.mock.calls[0][0].actions[1].onClick(vi.fn())
      expect(wrapper.emitted('close')).toBeUndefined()
      expect(wrapper.vm._event.title).toBe('Kickoff')
    })
  })

  describe('who is coming', () => {
    const withPeople = (people, over = {}) =>
      withDoc({ event_participants: people, ...over })

    it('counts the owner in', () => {
      expect(withPeople([]).vm.attendees).toBe('1 yes')
    })

    it('counts every answer', () => {
      const wrapper = withPeople([
        { email: 'b@x.com', attending: 'Yes' },
        { email: 'c@x.com', attending: 'No' },
        { email: 'd@x.com', attending: 'Maybe' },
        { email: 'e@x.com' },
      ])
      expect(wrapper.vm.attendees).toBe('2 yes, 1 no, 1 maybe, 1 awaiting')
    })

    it('leaves out the answers nobody gave', () => {
      const wrapper = withPeople([{ email: 'b@x.com', attending: 'Yes' }])
      expect(wrapper.vm.attendees).toBe('2 yes')
    })

    it('counts an owner who has not answered as awaiting', () => {
      const wrapper = withPeople([], { attending: null })
      expect(wrapper.vm.attendees).toBe('0 yes, 1 awaiting')
    })

    it('shows two participants until asked for more', () => {
      const wrapper = withPeople([
        { email: 'b@x.com' },
        { email: 'c@x.com' },
        { email: 'd@x.com' },
      ])
      expect(wrapper.vm.displayedPeoples).toHaveLength(2)
      wrapper.vm.showAllParticipants = true
      expect(wrapper.vm.displayedPeoples).toHaveLength(3)
    })

    it('reports a change to the participant list', () => {
      const wrapper = mount(savedEvent(), 'edit')
      wrapper.vm.peoples = [{ email: 'grace@x.com' }]
      expect(wrapper.vm._event.event_participants[0].email).toBe('grace@x.com')
      expect(wrapper.emitted('sync')).toBeTruthy()
    })

    it('reports a change to the reminders', () => {
      const wrapper = mount(savedEvent(), 'edit')
      wrapper.vm.notifications = [{ before: 10, interval: 'minutes' }]
      expect(wrapper.vm._event.notifications).toHaveLength(1)
      expect(wrapper.emitted('sync')).toBeTruthy()
    })
  })

  describe('answering "Going?"', () => {
    it('reads the owner\'s own answer', () => {
      expect(withDoc({ attending: 'Maybe' }).vm.attending).toBe('Maybe')
    })

    it('reads a participant\'s answer', () => {
      api.user = 'grace@x.com'
      const wrapper = withDoc({
        event_participants: [{ email: 'grace@x.com', attending: 'No' }],
      })
      expect(wrapper.vm.attending).toBe('No')
    })

    it('treats an unrecognised answer as unanswered', () => {
      api.user = 'grace@x.com'
      const wrapper = withDoc({
        event_participants: [{ email: 'grace@x.com', attending: 'Perhaps' }],
      })
      expect(wrapper.vm.attending).toBeNull()
    })

    it('records the owner\'s answer', async () => {
      const wrapper = mount(savedEvent())
      wrapper.vm.attending = 'No'
      await flushPromises()
      expect(wrapper.vm._event.attending).toBe('No')
      expect(api.call).toHaveBeenCalledWith(
        'frappe.desk.doctype.event.event.update_attending_status',
        { event_name: 'EVENT-1', attendee: 'ada@x.com', status: 'No' },
      )
      expect(api.toast.success).toHaveBeenCalled()
    })

    it('records a participant\'s answer against them', async () => {
      api.user = 'grace@x.com'
      const wrapper = withDoc({
        event_participants: [{ email: 'grace@x.com', attending: 'Awaiting' }],
      })
      wrapper.vm.attending = 'Yes'
      await flushPromises()
      expect(api.call).toHaveBeenCalledWith(
        expect.stringContaining('update_attending_status'),
        expect.objectContaining({ attendee: 'grace@x.com', status: 'Yes' }),
      )
    })

    it('does nothing for a viewer who is neither owner nor participant', async () => {
      // Regression: the getter allows for this — an event you can see but were
      // not invited to — and the setter dereferenced the missing participant,
      // so answering threw and took the panel down.
      api.user = 'mallory@x.com'
      const wrapper = withDoc({ event_participants: [{ email: 'grace@x.com' }] })
      expect(() => {
        wrapper.vm.attending = 'Yes'
      }).not.toThrow()
      await flushPromises()
      expect(api.call).not.toHaveBeenCalled()
    })

    it('says why it could not record the answer', async () => {
      api.call.mockRejectedValue({ messages: ['Event is cancelled'] })
      const wrapper = mount(savedEvent())
      wrapper.vm.attending = 'No'
      await flushPromises()
      expect(api.toast.error).toHaveBeenCalledWith('Event is cancelled')
      expect(wrapper.vm.error).toBe('Event is cancelled')
    })

    it('does not tell the server about an event it has never seen', async () => {
      // Regression: a duplicated event carries its participants across but has
      // no record yet, so this asked the server to update `duplicate-event`.
      api.user = 'grace@x.com'
      const wrapper = mount(
        tempEvent({
          id: 'duplicate-event',
          event_participants: [{ email: 'grace@x.com' }],
        }),
        'duplicate',
      )
      wrapper.vm.attending = 'Yes'
      await flushPromises()
      expect(api.call).not.toHaveBeenCalled()
      expect(wrapper.vm._event.event_participants[0].attending).toBe('Yes')
    })
  })

  describe('the colour picker', () => {
    it('offers every calendar colour', () => {
      const wrapper = mount(savedEvent(), 'edit')
      expect(wrapper.vm.colors.map((c) => c.label)).toEqual([
        'Green',
        'Blue',
        'Red',
      ])
    })

    it('applies the one chosen and reports it', () => {
      const wrapper = mount(savedEvent(), 'edit')
      wrapper.vm.colors[1].onClick()
      expect(wrapper.vm._event.color).toBe('#3b82f6')
      expect(wrapper.emitted('sync')).toBeTruthy()
    })
  })

  describe('the record the event belongs to', () => {
    it('opens a lead', () => {
      const wrapper = withDoc({
        reference_doctype: 'CRM Lead',
        reference_docname: 'LEAD-1',
      })
      wrapper.vm.redirect()
      expect(api.push).toHaveBeenCalledWith({
        name: 'Lead',
        params: { leadId: 'LEAD-1' },
      })
    })

    it('opens a deal', () => {
      const wrapper = withDoc({
        reference_doctype: 'CRM Deal',
        reference_docname: 'DEAL-1',
      })
      wrapper.vm.redirect()
      expect(api.push).toHaveBeenCalledWith({
        name: 'Deal',
        params: { dealId: 'DEAL-1' },
      })
    })

    it('goes nowhere when the event stands alone', () => {
      mount(savedEvent()).vm.redirect()
      expect(api.push).not.toHaveBeenCalled()
    })

    it('names the record in a participant tooltip', () => {
      const wrapper = mount(savedEvent())
      expect(
        wrapper.vm.getTooltip({
          reference_doctype: 'Contact',
          reference_docname: 'CONTACT-1',
        }),
      ).toBe('Contact: CONTACT-1')
      expect(wrapper.vm.getTooltip({})).toBe('')
      expect(wrapper.vm.getTooltip(null)).toBe('')
    })
  })

  describe('keyboard shortcuts', () => {
    const shortcut = (keys) =>
      api.shortcuts.shortcuts.find((s) =>
        Array.isArray(s.keys) ? s.keys.includes(keys) : s.keys === keys,
      )

    it('are only live while the panel is open', () => {
      const wrapper = mount(savedEvent())
      expect(api.shortcuts.active()).toBe(true)
      wrapper.vm.show = false
      expect(api.shortcuts.active()).toBe(false)
    })

    it('close the panel on Escape', () => {
      const wrapper = mount(savedEvent())
      shortcut('Escape').action()
      expect(wrapper.emitted('close')).toBeTruthy()
    })

    it('open editing on Enter from the details view', () => {
      const wrapper = mount(savedEvent(), 'details')
      expect(shortcut('Enter').guard()).toBe(true)
      shortcut('Enter').action()
      expect(wrapper.emitted('edit')).toBeTruthy()
    })

    it('do not re-open editing from the edit view', () => {
      mount(savedEvent(), 'edit')
      expect(shortcut('Enter').guard()).toBe(false)
    })

    it('delete only from the views where deleting makes sense', () => {
      mount(savedEvent(), 'details')
      expect(shortcut('Delete').guard()).toBe(true)
      mount(tempEvent(), 'new')
      expect(shortcut('Delete').guard()).toBe(false)
    })
  })

  describe('updates arriving from the calendar', () => {
    it('merges them into the open event', () => {
      // Dragging the event on the grid while its panel is open.
      const wrapper = mount(savedEvent())
      wrapper.vm.updateEvent({ fromTime: '15:00:00', toTime: '16:00:00' })
      expect(wrapper.vm._event.fromTime).toBe('15:00:00')
      expect(wrapper.vm._event.title).toBe('Kickoff')
    })
  })
})
