const api = vi.hoisted(() => ({
  toast: null,
  call: vi.fn(),
  dialog: vi.fn(),
  settings: null,
  events: null,
  listOptions: null,
  panel: { updateEvent: vi.fn() },
  calendar: { onMonthYearChange: vi.fn() },
  header: null,
}))

// The children are replaced wholesale rather than stubbed by name so the page
// is the only real component in the tree, and so the calendar's #header slot
// (which is this page's own toolbar markup) still renders.
const parts = vi.hoisted(() => ({
  CalendarStub: {
    // Deliberately NOT named `Calendar`: the page under test is
    // src/pages/Calendar.vue, so a stub of the same name makes
    // findComponent() match the root wrapper instead of the child.
    name: 'FrappeCalendarGrid',
    props: ['config', 'events', 'onClick', 'onDblClick', 'onCellClick'],
    emits: ['create', 'update', 'delete', 'rangeChange'],
    data: () => ({ header: api.header }),
    methods: {
      onMonthYearChange(date) {
        api.calendar.onMonthYearChange(date)
      },
    },
    template:
      '<div class="stub-calendar"><slot name="header" v-bind="header" /></div>',
  },
  DatePickerStub: {
    name: 'DatePicker',
    props: ['modelValue', 'clearable'],
    emits: ['update:modelValue'],
    template:
      '<div class="stub-datepicker"><slot name="target" :togglePopover="() => {}" /></div>',
  },
  TooltipStub: {
    name: 'Tooltip',
    props: ['text'],
    template: '<div class="stub-tooltip"><slot /></div>',
  },
  LinkStub: {
    name: 'Link',
    props: ['value', 'doctype', 'placeholder', 'filters', 'hideMe'],
    emits: ['change'],
    template: '<div class="stub-link"><slot name="prefix" /></div>',
  },
  PanelStub: {
    name: 'CalendarEventPanel',
    props: ['modelValue', 'event', 'mode'],
    emits: [
      'update:modelValue',
      'update:event',
      'new',
      'save',
      'edit',
      'delete',
      'duplicate',
      'details',
      'close',
      'sync',
    ],
    methods: {
      updateEvent(patch) {
        api.panel.updateEvent(patch)
      },
    },
    template: '<div class="stub-event-panel" />',
  },
}))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  api.toast = { error: vi.fn(), success: vi.fn(), warning: vi.fn() }
  const inert = (options = {}) =>
    reactive({
      ...options,
      data: null,
      doc: null,
      fetch: vi.fn(),
      reload: vi.fn(),
      update: vi.fn(),
      submit: vi.fn(),
      setValue: { submit: vi.fn() },
      insert: { submit: vi.fn() },
      delete: { submit: vi.fn() },
    })
  return {
    ...actual,
    toast: api.toast,
    call: api.call,
    createResource: inert,
    createDocumentResource: inert,
    createListResource: (options = {}) => {
      // The page builds exactly one list resource; keep the raw options so the
      // filters it was born with can be asserted.
      api.listOptions = options
      api.events = inert(options)
      return api.events
    },
    Calendar: parts.CalendarStub,
    DatePicker: parts.DatePickerStub,
    Tooltip: parts.TooltipStub,
  }
})

vi.mock('@/stores/session', () => ({
  sessionStore: () => ({ user: 'ada@example.com' }),
}))

vi.mock('@/stores/global', () => ({
  globalStore: () => ({
    $dialog: api.dialog,
    $socket: { on: vi.fn(), off: vi.fn() },
    makeCall: vi.fn(),
  }),
}))

vi.mock('@/stores/settings', async () => {
  const { ref, reactive } = await import('vue')
  api.settings = ref({})
  return {
    getSettings: () => ({
      settings: api.settings,
      brand: reactive({ favicon: '/f.ico' }),
      _settings: { doc: {} },
      setupBrand: vi.fn(),
    }),
    isTranslatable: () => false,
  }
})

vi.mock('@/stores/users', async () => {
  const { reactive } = await import('vue')
  const users = reactive({
    data: {
      crmUsers: [{ name: 'ada@example.com' }, { name: 'bob@example.com' }],
    },
  })
  return {
    usersStore: () => ({
      users,
      getUser: (email) => ({
        full_name: email === 'ada@example.com' ? 'Ada Lovelace' : email,
        user_image: '',
      }),
      isManager: () => true,
    }),
  }
})

vi.mock('@/components/Calendar/CalendarEventPanel.vue', () => ({
  default: parts.PanelStub,
}))
vi.mock('@/components/Controls/Link.vue', () => ({ default: parts.LinkStub }))
vi.mock('@/components/LayoutHeader.vue', () => ({
  default: {
    name: 'LayoutHeader',
    template:
      '<div class="stub-layout-header"><slot name="left-header" /><slot name="right-header" /></div>',
  },
}))
vi.mock('@/components/ViewBreadcrumbs.vue', () => ({
  default: {
    name: 'ViewBreadcrumbs',
    props: ['routeName'],
    template: '<div class="stub-breadcrumbs" />',
  },
}))
vi.mock('@/components/ShortcutTooltip.vue', () => ({
  default: { name: 'ShortcutTooltip', template: '<div><slot /></div>' },
}))

const ROUTE = vi.hoisted(() => ({
  query: {},
  params: {},
  hash: '',
  name: 'Calendar',
  path: '/calendar',
}))
const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }))
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useRouter: () => nav, useRoute: () => ROUTE }
})

import CalendarPage from '@/pages/Calendar.vue'
import { pageCreateAction } from '@/composables/pageActions'
import { mountComponent } from '../helpers/mount'
import { flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { CalendarActiveEvent as activeEvent, dayjs } from 'frappe-ui'

const NOW = '2026-03-15T10:07:00'

let wrapper = null
let errorSpy = null

async function mountPage() {
  wrapper = mountComponent(CalendarPage, {
    global: { stubs: { UserAvatar: true }, mocks: { $route: ROUTE } },
  })
  await flushPromises()
  return wrapper
}

/** The three Day / Week / Month buttons in the page's own toolbar. */
const viewButtons = (w) =>
  w.findAll('button').filter((b) => ['Day', 'Week', 'Month'].includes(b.text()))

const A_EVENT = {
  id: 'EV-1',
  title: 'Discovery call',
  description: 'Intro',
  fromDate: '2026-03-15',
  toDate: '2026-03-15',
  fromTime: '09:00',
  toTime: '10:00',
  location: 'Zoom',
  color: 'green',
  eventType: 'Private',
  attending: 'Yes',
}

describe('Calendar page', () => {
  beforeEach(() => {
    // Only Date is faked: the page derives "now" in several places, but the
    // suite still needs real microtask/timer behaviour for flushPromises.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(NOW))
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    api.call.mockReset().mockResolvedValue({ name: 'CONTACT-9' })
    api.dialog.mockReset()
    api.toast.error.mockClear()
    api.toast.success.mockClear()
    api.toast.warning.mockClear()
    api.panel.updateEvent.mockClear()
    api.calendar.onMonthYearChange.mockClear()
    api.settings.value = {}
    api.header = {
      currentMonthYear: 'March 2026',
      activeView: 'Week',
      selectedMonthDate: new Date('2026-03-15T00:00:00'),
      decrement: vi.fn(),
      increment: vi.fn(),
      updateActiveView: vi.fn(),
      onMonthYearChange: vi.fn(),
      setCalendarDate: vi.fn(),
    }
    ROUTE.query = {}
    activeEvent.value = ''
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    errorSpy.mockRestore()
    vi.useRealTimers()
  })

  describe('the starting view', () => {
    it('honours the saved calendar preference', async () => {
      api.settings.value = { default_calendar_view: 'Daily' }
      const w = await mountPage()
      expect(w.vm.defaultMode).toBe('Day')
      expect(w.findComponent(parts.CalendarStub).props('config')).toMatchObject({
        defaultMode: 'Day',
      })
    })

    it('translates the monthly preference too', async () => {
      api.settings.value = { default_calendar_view: 'Monthly' }
      expect((await mountPage()).vm.defaultMode).toBe('Month')
    })

    it('falls back to the week view when nothing is saved', async () => {
      expect((await mountPage()).vm.defaultMode).toBe('Week')
    })

    it('falls back to the week view for an unknown preference', async () => {
      api.settings.value = { default_calendar_view: 'Yearly' }
      expect((await mountPage()).vm.defaultMode).toBe('Week')
    })
  })

  describe('the toolbar', () => {
    it('offers the three views and highlights the active one', async () => {
      api.header.activeView = 'Month'
      const w = await mountPage()
      const buttons = viewButtons(w)
      expect(buttons.map((b) => b.text())).toEqual(['Day', 'Week', 'Month'])
      expect(buttons[2].attributes('class')).toContain('--crm-accent-primary')
      expect(buttons[0].attributes('class')).not.toContain(
        '--crm-accent-primary',
      )
    })

    it('switches the view when one is picked', async () => {
      const w = await mountPage()
      await viewButtons(w)[0].trigger('click')
      expect(api.header.updateActiveView).toHaveBeenCalledWith('Day')
    })

    it('wires previous, today and next to the calendar', async () => {
      const w = await mountPage()
      await w.find('button[aria-label="Previous"]').trigger('click')
      await w.find('button[aria-label="Next"]').trigger('click')
      const today = w.findAll('button').find((b) => b.text() === 'Today')
      await today.trigger('click')
      expect(api.header.decrement).toHaveBeenCalled()
      expect(api.header.increment).toHaveBeenCalled()
      expect(api.header.setCalendarDate).toHaveBeenCalled()
    })

    it('jumps the grid when a month is picked', async () => {
      const w = await mountPage()
      const picked = new Date('2026-07-01T00:00:00')
      w.findComponent(parts.DatePickerStub).vm.$emit('update:modelValue', picked)
      expect(api.header.onMonthYearChange).toHaveBeenCalledWith(picked)
    })

    it('limits the user picker to CRM users', async () => {
      const w = await mountPage()
      const link = w.findComponent(parts.LinkStub)
      expect(link.props('filters')).toEqual({
        name: ['in', ['ada@example.com', 'bob@example.com']],
        ignore_user_type: 1,
      })
      expect(link.props('value')).toBe('Ada Lovelace')
    })
  })

  describe('the event query', () => {
    it('asks only for open events before any range is known', async () => {
      await mountPage()
      expect(api.listOptions.filters).toEqual([['status', '=', 'Open']])
    })

    it('matches events the user owns or is invited to', async () => {
      await mountPage()
      expect(api.listOptions.orFilters).toEqual([
        ['owner', '=', 'ada@example.com'],
        ['Event Participants', 'email', '=', 'ada@example.com'],
      ])
    })

    it('widens a range to whole days at both ends', async () => {
      const w = await mountPage()
      expect(
        w.vm.buildEventFilters({
          startDate: '2026-03-01',
          endDate: '2026-03-31',
        }),
      ).toEqual([
        ['status', '=', 'Open'],
        ['starts_on', '<=', '2026-03-31 23:59:59'],
        ['ends_on', '>=', '2026-03-01 00:00:00'],
      ])
    })

    it('asks for overlaps, not for events contained in the range', async () => {
      // starts_on <= end AND ends_on >= start, so a multi-day event that merely
      // straddles the visible window is still returned.
      const w = await mountPage()
      const filters = w.vm.buildEventFilters({
        startDate: '2026-03-10',
        endDate: '2026-03-10',
      })
      expect(filters).toContainEqual(['starts_on', '<=', '2026-03-10 23:59:59'])
      expect(filters).toContainEqual(['ends_on', '>=', '2026-03-10 00:00:00'])
    })

    it('ignores a half-specified range', async () => {
      const w = await mountPage()
      expect(w.vm.buildEventFilters({ startDate: '2026-03-01' })).toEqual([
        ['status', '=', 'Open'],
      ])
      expect(w.vm.buildEventFilters()).toEqual([['status', '=', 'Open']])
    })
  })

  describe('switching to another user', () => {
    it('refetches with that user on both sides of the or-filter', async () => {
      const w = await mountPage()
      await w.vm.updateUser('bob@example.com')
      expect(api.events.update).toHaveBeenCalledWith({
        orFilters: [
          ['owner', '=', 'bob@example.com'],
          ['Event Participants', 'email', '=', 'bob@example.com'],
        ],
      })
      expect(api.events.reload).toHaveBeenCalled()
    })

    it('leaves the visible date window in place', async () => {
      // Only orFilters is sent, so the range set by the last rangeChange stands.
      const w = await mountPage()
      await w.vm.updateUser('bob@example.com')
      expect(Object.keys(api.events.update.mock.calls[0][0])).toEqual([
        'orFilters',
      ])
    })
  })

  describe('shaping rows for the grid', () => {
    const DOC = {
      name: 'EV-1',
      subject: 'Discovery call',
      description: 'Intro',
      status: 'Open',
      starts_on: '2026-03-15 09:30:00',
      ends_on: '2026-03-15 10:45:00',
      all_day: 0,
      event_type: 'Private',
      location: 'Zoom',
      color: '#2563eb',
      attending: 1,
      reference_doctype: 'CRM Deal',
      reference_docname: 'DEAL-1',
    }

    it('splits each timestamp into a date and a time', async () => {
      await mountPage()
      const [row] = api.events.transform([DOC])
      expect(row).toMatchObject({
        fromDate: '2026-03-15',
        toDate: '2026-03-15',
        fromTime: '09:30',
        toTime: '10:45',
      })
    })

    it('renames the doc fields to what the grid reads', async () => {
      await mountPage()
      const [row] = api.events.transform([DOC])
      expect(row).toMatchObject({
        id: 'EV-1',
        title: 'Discovery call',
        isFullDay: 0,
        eventType: 'Private',
        referenceDoctype: 'CRM Deal',
        referenceDocname: 'DEAL-1',
        color: '#2563eb',
      })
    })

    it('keeps one row per event', async () => {
      // The participant or-filter makes the server return an event once per
      // matching participant row; drawing it twice stacks chips on the grid.
      await mountPage()
      const rows = api.events.transform([DOC, { ...DOC }, { ...DOC, name: 'EV-2' }])
      expect(rows.map((r) => r.id)).toEqual(['EV-1', 'EV-2'])
    })

    it('keeps the first copy of a duplicated event', async () => {
      await mountPage()
      const rows = api.events.transform([
        DOC,
        { ...DOC, subject: 'Renamed by a later row' },
      ])
      expect(rows[0].title).toBe('Discovery call')
    })

    it('copes with an empty result', async () => {
      await mountPage()
      expect(api.events.transform([])).toEqual([])
    })
  })

  describe('opening an event', () => {
    it('shows the details panel for the event that was clicked', async () => {
      const w = await mountPage()
      w.vm.showDetails({ id: 'EV-1' })
      expect(w.vm.showEventPanel).toBe(true)
      expect(w.vm.mode).toBe('details')
      expect(w.vm.event).toEqual({ id: 'EV-1', reloadEvent: false })
      expect(activeEvent.value).toBe('EV-1')
    })

    it('unwraps the payload the grid hands over', async () => {
      const w = await mountPage()
      w.vm.showDetails({ calendarEvent: { id: 'EV-9' } })
      expect(w.vm.event.id).toBe('EV-9')
    })

    it('opens for editing on a double click', async () => {
      const w = await mountPage()
      w.vm.editDetails({ id: 'EV-1' })
      expect(w.vm.mode).toBe('edit')
    })

    it('passes the reload flag through to the panel', async () => {
      const w = await mountPage()
      w.vm.showDetails({ id: 'EV-1' }, true)
      expect(w.vm.event.reloadEvent).toBe(true)
    })

    it('ignores a click that carries no event', async () => {
      const w = await mountPage()
      w.vm.showDetails(null)
      w.vm.showDetails({})
      expect(w.vm.showEventPanel).toBe(false)
      expect(w.vm.mode).toBe('')
    })

    it('ignores a click on the placeholder being created', async () => {
      // The unsaved chip has no server record to open.
      const w = await mountPage()
      w.vm.newEvent()
      w.vm.showDetails({ id: 'new-event' })
      w.vm.showDetails({ id: 'duplicate-event' })
      expect(w.vm.mode).toBe('new')
    })

    it('clears the placeholder when a real event is opened', async () => {
      const w = await mountPage()
      w.vm.newEvent()
      expect(api.events.data).toHaveLength(1)
      w.vm.showDetails({ id: 'EV-1' })
      expect(api.events.data).toEqual([])
    })
  })

  describe('creating an event', () => {
    it('refuses an event with no title', async () => {
      const w = await mountPage()
      w.vm.createEvent({ id: 'new-event', fromDate: '2026-03-15' })
      expect(api.events.insert.submit).not.toHaveBeenCalled()
    })

    it('joins the date and time parts into the stored timestamps', async () => {
      const w = await mountPage()
      w.vm.createEvent({ ...A_EVENT, id: 'new-event' })
      expect(api.events.insert.submit.mock.calls[0][0]).toMatchObject({
        subject: 'Discovery call',
        starts_on: '2026-03-15 09:00',
        ends_on: '2026-03-15 10:00',
        all_day: false,
        location: 'Zoom',
        event_type: 'Private',
      })
    })

    it('announces the new event and opens it', async () => {
      const w = await mountPage()
      w.vm.createEvent({ ...A_EVENT, id: 'new-event' })
      await api.events.insert.submit.mock.calls[0][1].onSuccess({ name: 'EV-7' })
      expect(api.toast.success).toHaveBeenCalledWith('Event created successfully')
      expect(w.vm.mode).toBe('details')
      expect(w.vm.event.id).toBe('EV-7')
    })

    it('refetches as the signed-in user so the new event is visible', async () => {
      const w = await mountPage()
      await w.vm.updateUser('bob@example.com')
      w.vm.createEvent({ ...A_EVENT, id: 'new-event' })
      await api.events.insert.submit.mock.calls[0][1].onSuccess({ name: 'EV-7' })
      expect(api.events.update).toHaveBeenLastCalledWith({
        orFilters: [
          ['owner', '=', 'ada@example.com'],
          ['Event Participants', 'email', '=', 'ada@example.com'],
        ],
      })
    })

    it("reports the server's reason when it fails", async () => {
      const w = await mountPage()
      w.vm.createEvent({ ...A_EVENT, id: 'new-event' })
      api.events.insert.submit.mock.calls[0][1].onError({
        messages: ['Not permitted'],
      })
      expect(api.toast.error).toHaveBeenCalledWith('Not permitted')
    })

    it('falls back to a generic message when the error is bare', async () => {
      const w = await mountPage()
      w.vm.createEvent({ ...A_EVENT, id: 'new-event' })
      api.events.insert.submit.mock.calls[0][1].onError(null)
      expect(api.toast.error).toHaveBeenCalledWith('Failed to create event')
    })
  })

  describe('saving from the panel', () => {
    it('creates when the panel holds a placeholder', async () => {
      const w = await mountPage()
      w.vm.saveEvent({ ...A_EVENT, id: 'new-event' })
      expect(api.events.insert.submit).toHaveBeenCalled()
      expect(api.events.setValue.submit).not.toHaveBeenCalled()
    })

    it('creates when the panel holds no id at all', async () => {
      const w = await mountPage()
      w.vm.saveEvent({ ...A_EVENT, id: undefined })
      expect(api.events.insert.submit).toHaveBeenCalled()
    })

    it('updates when the panel holds a saved event', async () => {
      const w = await mountPage()
      w.vm.saveEvent({ ...A_EVENT })
      await flushPromises()
      expect(api.events.setValue.submit).toHaveBeenCalled()
      expect(api.events.insert.submit).not.toHaveBeenCalled()
    })
  })

  describe('updating an event', () => {
    it('ignores an event with no id', async () => {
      const w = await mountPage()
      await w.vm.updateEvent({ ...A_EVENT, id: undefined })
      expect(api.events.setValue.submit).not.toHaveBeenCalled()
    })

    it('writes the change back against the event name', async () => {
      const w = await mountPage()
      await w.vm.updateEvent({ ...A_EVENT })
      expect(api.events.setValue.submit.mock.calls[0][0]).toMatchObject({
        name: 'EV-1',
        subject: 'Discovery call',
        starts_on: '2026-03-15 09:00',
        ends_on: '2026-03-15 10:00',
      })
    })

    it('reloads and reopens the event once it lands', async () => {
      const w = await mountPage()
      w.vm.showDetails({ id: 'EV-1' })
      await w.vm.updateEvent({ ...A_EVENT })
      await api.events.setValue.submit.mock.calls[0][1].onSuccess({
        name: 'EV-1',
      })
      expect(api.events.reload).toHaveBeenCalled()
      expect(w.vm.event).toEqual({ id: 'EV-1', reloadEvent: true })
    })

    it('does not pop the panel open when it was closed', async () => {
      const w = await mountPage()
      await w.vm.updateEvent({ ...A_EVENT })
      await api.events.setValue.submit.mock.calls[0][1].onSuccess({
        name: 'EV-1',
      })
      expect(w.vm.showEventPanel).toBe(false)
    })

    it('reports a failed update', async () => {
      const w = await mountPage()
      await w.vm.updateEvent({ ...A_EVENT })
      api.events.setValue.submit.mock.calls[0][1].onError('Timestamp mismatch')
      expect(api.toast.error).toHaveBeenCalledWith('Timestamp mismatch')
    })

    it('hands a drag made while editing to the panel, not the server', async () => {
      // The panel owns the unsaved draft; writing straight through would
      // discard the edits the user has not saved yet.
      const w = await mountPage()
      w.vm.editDetails({ id: 'EV-1' })
      await nextTick()
      await w.vm.updateEvent({ ...A_EVENT, fromTime: '11:00', toTime: '12:00' }, true)
      expect(api.panel.updateEvent).toHaveBeenCalledWith({
        fromDate: '2026-03-15',
        toDate: '2026-03-15',
        fromTime: '11:00',
        toTime: '12:00',
      })
      expect(api.events.setValue.submit).not.toHaveBeenCalled()
    })

    it('switches a dragged saved event out of new mode and saves it', async () => {
      const w = await mountPage()
      w.vm.newEvent()
      await w.vm.updateEvent({ ...A_EVENT }, true)
      expect(w.vm.mode).toBe('details')
      expect(activeEvent.value).toBe('EV-1')
      expect(api.events.setValue.submit).toHaveBeenCalled()
    })

    it('keeps a dragged placeholder local', async () => {
      // Nothing exists on the server yet, so a drag only moves the draft.
      const w = await mountPage()
      w.vm.newEvent()
      await w.vm.updateEvent(
        { ...A_EVENT, id: 'new-event', fromTime: '13:00', toTime: '14:00' },
        true,
      )
      expect(api.events.setValue.submit).not.toHaveBeenCalled()
      expect(w.vm.mode).toBe('new')
      expect(w.vm.event.fromTime).toBe('13:00')
    })
  })

  describe('participants that are not contacts yet', () => {
    it('creates a Contact for a brand-new email', async () => {
      const w = await mountPage()
      const result = await w.vm.ensureParticipantContacts([
        {
          email: 'zoe@example.com',
          reference_doctype: 'Contact',
          reference_docname: 'new',
        },
      ])
      expect(api.call).toHaveBeenCalledWith('frappe.client.insert', {
        doc: {
          doctype: 'Contact',
          first_name: 'zoe',
          email_ids: [{ email_id: 'zoe@example.com', is_primary: 1 }],
        },
      })
      expect(result[0].reference_docname).toBe('CONTACT-9')
    })

    it('leaves an already-linked participant alone', async () => {
      const w = await mountPage()
      const result = await w.vm.ensureParticipantContacts([
        {
          email: 'ada@example.com',
          reference_doctype: 'Contact',
          reference_docname: 'CONTACT-1',
        },
        { email: 'lead@example.com', reference_doctype: 'CRM Lead' },
      ])
      expect(api.call).not.toHaveBeenCalled()
      expect(result).toHaveLength(2)
    })

    it('still saves the participant when the contact cannot be created', async () => {
      api.call.mockRejectedValue(new Error('duplicate'))
      const w = await mountPage()
      const result = await w.vm.ensureParticipantContacts([
        {
          email: 'zoe@example.com',
          reference_doctype: 'Contact',
          reference_docname: 'new',
        },
      ])
      expect(result[0].email).toBe('zoe@example.com')
      expect(result[0].reference_docname).toBe('new')
    })

    it('resolves the contacts before writing the event', async () => {
      const w = await mountPage()
      await w.vm.updateEvent({
        ...A_EVENT,
        event_participants: [
          {
            email: 'zoe@example.com',
            reference_doctype: 'Contact',
            reference_docname: '',
          },
        ],
      })
      expect(
        api.events.setValue.submit.mock.calls[0][0].event_participants[0]
          .reference_docname,
      ).toBe('CONTACT-9')
    })
  })

  describe('deleting an event', () => {
    it('does nothing without an id', async () => {
      const w = await mountPage()
      w.vm.deleteEvent(undefined)
      expect(api.dialog).not.toHaveBeenCalled()
    })

    it('asks before deleting', async () => {
      const w = await mountPage()
      w.vm.deleteEvent('EV-1')
      const config = api.dialog.mock.calls[0][0]
      expect(config.message).toBe('Are you sure you want to delete this event?')
      expect(config.actions[0]).toMatchObject({
        label: 'Delete',
        theme: 'red',
        variant: 'solid',
      })
      expect(api.events.delete.submit).not.toHaveBeenCalled()
    })

    it('deletes, closes the panel and drops the selection', async () => {
      const w = await mountPage()
      w.vm.showDetails({ id: 'EV-1' })
      w.vm.deleteEvent('EV-1')
      const close = vi.fn()
      api.dialog.mock.calls[0][0].actions[0].onClick(close)
      expect(api.events.delete.submit.mock.calls[0][0]).toBe('EV-1')
      expect(w.vm.showEventPanel).toBe(false)
      expect(w.vm.event).toEqual({})
      expect(w.vm.mode).toBe('')
      expect(activeEvent.value).toBe('')
      expect(close).toHaveBeenCalled()
    })

    it('announces and refreshes once the server confirms', async () => {
      const w = await mountPage()
      w.vm.deleteEvent('EV-1')
      api.dialog.mock.calls[0][0].actions[0].onClick(vi.fn())
      api.events.delete.submit.mock.calls[0][1].onSuccess()
      expect(api.toast.success).toHaveBeenCalledWith('Event deleted successfully')
      expect(api.events.reload).toHaveBeenCalled()
    })

    it('reports a refused delete', async () => {
      const w = await mountPage()
      w.vm.deleteEvent('EV-1')
      api.dialog.mock.calls[0][0].actions[0].onClick(vi.fn())
      api.events.delete.submit.mock.calls[0][1].onError({
        messages: ['Linked to a deal'],
      })
      expect(api.toast.error).toHaveBeenCalledWith('Linked to a deal')
    })
  })

  describe('keeping the grid in step with the panel', () => {
    it('applies the panel edits to the matching chip', async () => {
      const w = await mountPage()
      api.events.data = [{ id: 'EV-1', title: 'Old' }, { id: 'EV-2', title: 'Other' }]
      w.vm.syncEvent('EV-1', { title: 'New', color: 'red' })
      expect(api.events.data[0]).toEqual({
        id: 'EV-1',
        title: 'New',
        color: 'red',
      })
      expect(api.events.data[1].title).toBe('Other')
    })

    it('stays quiet when the event is not on the grid', async () => {
      const w = await mountPage()
      api.events.data = [{ id: 'EV-2', title: 'Other' }]
      expect(() => w.vm.syncEvent('EV-1', { title: 'New' })).not.toThrow()
      expect(api.events.data[0].title).toBe('Other')
    })

    it('stays quiet before the first fetch', async () => {
      const w = await mountPage()
      expect(() => w.vm.syncEvent('EV-1', { title: 'New' })).not.toThrow()
    })
  })

  describe('following the visible range', () => {
    const RANGE = {
      view: 'Month',
      startDate: '2026-03-01',
      endDate: '2026-03-31',
    }

    it('refetches for a range it has not seen', async () => {
      const w = await mountPage()
      await w.vm.handleRangeChange(RANGE)
      expect(api.events.update).toHaveBeenCalledWith({
        filters: [
          ['status', '=', 'Open'],
          ['starts_on', '<=', '2026-03-31 23:59:59'],
          ['ends_on', '>=', '2026-03-01 00:00:00'],
        ],
        orFilters: [
          ['owner', '=', 'ada@example.com'],
          ['Event Participants', 'email', '=', 'ada@example.com'],
        ],
      })
      expect(api.events.reload).toHaveBeenCalledTimes(1)
    })

    it('treats the same dates under a different view as a new range', async () => {
      const w = await mountPage()
      await w.vm.handleRangeChange(RANGE)
      api.events.list = { fetched: true }
      await w.vm.handleRangeChange({ ...RANGE, view: 'Week' })
      expect(api.events.reload).toHaveBeenCalledTimes(2)
    })

    it('skips a repeat of the range it has already fetched', async () => {
      // The grid re-emits its range on every redraw; refetching each time
      // would put the page in a request loop.
      const w = await mountPage()
      await w.vm.handleRangeChange(RANGE)
      api.events.list = { fetched: true }
      await w.vm.handleRangeChange({ ...RANGE })
      expect(api.events.reload).toHaveBeenCalledTimes(1)
    })

    it('skips a repeat while the first fetch is still in flight', async () => {
      const w = await mountPage()
      await w.vm.handleRangeChange(RANGE)
      api.events.list = { loading: true, fetched: false }
      await w.vm.handleRangeChange({ ...RANGE })
      expect(api.events.reload).toHaveBeenCalledTimes(1)
    })

    it('retries the same range when nothing has been fetched yet', async () => {
      const w = await mountPage()
      await w.vm.handleRangeChange(RANGE)
      api.events.list = { loading: false, fetched: false }
      await w.vm.handleRangeChange({ ...RANGE })
      expect(api.events.reload).toHaveBeenCalledTimes(2)
    })

    it('ignores an incomplete range', async () => {
      const w = await mountPage()
      await w.vm.handleRangeChange({ view: 'Month', startDate: '2026-03-01' })
      await w.vm.handleRangeChange(null)
      expect(api.events.update).not.toHaveBeenCalled()
    })
  })

  describe('starting a new event', () => {
    it('drops a placeholder on the grid and opens the panel', async () => {
      const w = await mountPage()
      w.vm.newEvent({ date: '2026-04-02', time: '14:00', isFullDay: false })
      expect(w.vm.showEventPanel).toBe(true)
      expect(w.vm.mode).toBe('new')
      expect(activeEvent.value).toBe('new-event')
      expect(api.events.data).toEqual([w.vm.event])
      expect(w.vm.event).toMatchObject({
        id: 'new-event',
        fromDate: '2026-04-02',
        toDate: '2026-04-02',
        fromTime: '14:00',
        toTime: '15:00',
      })
    })

    it('fills in the usual defaults for a blank event', async () => {
      const w = await mountPage()
      w.vm.newEvent()
      expect(w.vm.event).toMatchObject({
        eventType: 'Private',
        color: 'green',
        attending: 'Yes',
        description: '',
        location: '',
        event_participants: [],
        notifications: [],
      })
    })

    it('defaults an untimed click to the current quarter hour', async () => {
      // Clock pinned at 10:07 -> the slot the user is looking at is 10:00.
      const w = await mountPage()
      w.vm.newEvent()
      expect(w.vm.event).toMatchObject({
        fromDate: '2026-03-15',
        fromTime: '10:00',
        toTime: '11:00',
      })
    })

    it('reads a twelve-hour slot label', async () => {
      const w = await mountPage()
      w.vm.newEvent({ date: '2026-03-15', time: '3pm' })
      expect([w.vm.event.fromTime, w.vm.event.toTime]).toEqual(['15:00', '16:00'])
    })

    it('reads midnight and midday correctly', async () => {
      const w = await mountPage()
      w.vm.newEvent({ date: '2026-03-15', time: '12am' })
      expect(w.vm.event.fromTime).toBe('00:00')
      w.vm.newEvent({ date: '2026-03-15', time: '12pm' })
      expect(w.vm.event.fromTime).toBe('12:00')
    })

    it('reads a twenty-four hour slot label', async () => {
      const w = await mountPage()
      w.vm.newEvent({ date: '2026-03-15', time: '09:30' })
      expect([w.vm.event.fromTime, w.vm.event.toTime]).toEqual(['09:30', '10:30'])
    })

    it('reads a bare hour', async () => {
      const w = await mountPage()
      w.vm.newEvent({ date: '2026-03-15', time: '7' })
      expect([w.vm.event.fromTime, w.vm.event.toTime]).toEqual(['07:00', '08:00'])
    })

    it('wraps the end time past midnight without moving the end date', async () => {
      // Current behaviour, and a bug: 23:15 -> 00:15 on the SAME toDate, which
      // the panel's own validateTimeRange then rejects as "End Time Should Be
      // After Start Time", so the event cannot be saved. Reported separately.
      const w = await mountPage()
      w.vm.newEvent({ date: '2026-03-15', time: '23:15' })
      expect(w.vm.event.fromTime).toBe('23:15')
      expect(w.vm.event.toTime).toBe('00:15')
      expect(w.vm.event.toDate).toBe('2026-03-15')
    })

    it('replaces an earlier placeholder rather than stacking them', async () => {
      const w = await mountPage()
      w.vm.newEvent({ date: '2026-03-15', time: '09:00' })
      w.vm.newEvent({ date: '2026-03-16', time: '11:00' })
      expect(api.events.data).toHaveLength(1)
      expect(api.events.data[0].fromDate).toBe('2026-03-16')
    })

    it('starts the list when the grid has not loaded yet', async () => {
      const w = await mountPage()
      expect(api.events.data).toBeNull()
      w.vm.newEvent()
      expect(api.events.data).toHaveLength(1)
    })

    it('keeps the original times when duplicating', async () => {
      const w = await mountPage()
      w.vm.duplicateEvent({
        ...A_EVENT,
        fromDate: '2026-03-10',
        toDate: '2026-03-10',
        fromTime: '09:00',
        toTime: '09:30',
      })
      expect(w.vm.mode).toBe('duplicate')
      expect(activeEvent.value).toBe('duplicate-event')
      expect(w.vm.event).toMatchObject({
        id: 'duplicate-event',
        title: 'Discovery call',
        fromDate: '2026-03-10',
        toDate: '2026-03-10',
        fromTime: '09:00',
        toTime: '09:30',
      })
    })
  })

  describe('closing the panel', () => {
    it('clears the selection and the placeholder', async () => {
      const w = await mountPage()
      w.vm.newEvent()
      w.vm.close()
      expect(w.vm.showEventPanel).toBe(false)
      expect(w.vm.event).toEqual({})
      expect(w.vm.mode).toBe('')
      expect(activeEvent.value).toBe('')
      expect(api.events.data).toEqual([])
    })
  })

  describe('the header create button', () => {
    it('starts a new event while the page is open', async () => {
      const w = await mountPage()
      pageCreateAction.value()
      expect(w.vm.mode).toBe('new')
    })

    it('does nothing while an event is already being edited', async () => {
      // Otherwise +Create would throw away the draft in the open panel.
      const w = await mountPage()
      w.vm.editDetails({ id: 'EV-1' })
      pageCreateAction.value()
      expect(w.vm.mode).toBe('edit')
    })

    it('is released when the page goes away', async () => {
      await mountPage()
      wrapper.unmount()
      wrapper = null
      expect(pageCreateAction.value).toBeNull()
    })
  })

  describe('the new-event shortcut', () => {
    const pressCmdE = () =>
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'e', metaKey: true, bubbles: true }),
      )

    it('opens a new event at the current time', async () => {
      const w = await mountPage()
      pressCmdE()
      expect(w.vm.mode).toBe('new')
      expect(w.vm.event).toMatchObject({
        fromDate: '2026-03-15',
        fromTime: '10:07',
        toTime: '11:07',
      })
    })

    it('stays quiet while an event is already open for editing', async () => {
      const w = await mountPage()
      w.vm.editDetails({ id: 'EV-1' })
      pressCmdE()
      expect(w.vm.mode).toBe('edit')
    })
  })

  describe('a link straight to one event', () => {
    it("moves the grid to the event's date and opens it", async () => {
      ROUTE.query = { eventId: 'EV-7', date: '2026-04-02' }
      const w = await mountPage()
      expect(api.calendar.onMonthYearChange).toHaveBeenCalledWith(
        dayjs('2026-04-02').toDate(),
      )
      expect(w.vm.mode).toBe('details')
      expect(w.vm.event.id).toBe('EV-7')
      expect(w.vm.showEventPanel).toBe(true)
    })

    it('ignores an event id with no date beside it', async () => {
      ROUTE.query = { eventId: 'EV-7' }
      const w = await mountPage()
      expect(api.calendar.onMonthYearChange).not.toHaveBeenCalled()
      expect(w.vm.showEventPanel).toBe(false)
    })

    it('opens nothing on a plain visit', async () => {
      const w = await mountPage()
      expect(w.vm.showEventPanel).toBe(false)
      expect(w.vm.mode).toBe('')
      expect(activeEvent.value).toBe('')
    })
  })
})
