const api = vi.hoisted(() => ({ resource: null }))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  return {
    ...actual,
    createResource: (opts = {}) => {
      api.resource = reactive({
        ...opts,
        data: null,
        fetch: vi.fn(),
        reload: vi.fn(),
        update: vi.fn(function (o) {
          Object.assign(this, o)
        }),
      })
      return api.resource
    },
  }
})

import Attendee from '@/components/Calendar/Attendee.vue'
import EventNotifications from '@/components/Calendar/EventNotifications.vue'
import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'

const quiet = { inheritAttrs: false, template: '<div><slot /></div>' }
const STUBS = {
  UserAvatar: { ...quiet, name: 'UserAvatarStub' },
  BellIcon: { ...quiet, name: 'S1' },
  TimePicker: { ...quiet, name: 'S2' },
  FormControl: { ...quiet, name: 'FormControlStub' },
  ComboboxRoot: { ...quiet, name: 'C1' },
  ComboboxAnchor: { ...quiet, name: 'C2' },
  ComboboxInput: { ...quiet, name: 'C3' },
  ComboboxPortal: { ...quiet, name: 'C4' },
  ComboboxContent: { ...quiet, name: 'C5' },
  ComboboxViewport: { ...quiet, name: 'C6' },
  ComboboxItem: { ...quiet, name: 'C7' },
  ComboboxEmpty: { ...quiet, name: 'C8' },
}

describe('Attendee', () => {
  const mount = (props = {}, values = []) =>
    mountComponent(Attendee, {
      props: { modelValue: values, ...props },
      global: { stubs: STUBS },
    })

  const isEmail = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)

  describe('the list it offers', () => {
    it('offers nothing before anything has been typed', () => {
      expect(mount().vm.options).toEqual([])
    })

    it('offers what the server found', () => {
      const wrapper = mount()
      api.resource.data = [{ label: 'Ada', name: 'CONTACT-1', value: 'ada@x.com' }]
      expect(wrapper.vm.options.map((o) => o.value)).toEqual(['ada@x.com'])
    })

    it('offers what was typed when the server found nothing', () => {
      const wrapper = mount()
      api.resource.data = []
      wrapper.vm.query = 'someone@x.com'
      expect(wrapper.vm.options).toEqual([
        { name: 'new', label: 'someone@x.com', value: 'someone@x.com' },
      ])
    })

    it('offers what was typed before the first response arrives', () => {
      // Regression: `data` is null until the first search returns, and the
      // "use what you typed" entry was pushed onto it — which threw inside the
      // computed and left the picker blank.
      const wrapper = mount()
      wrapper.vm.query = 'someone@x.com'
      expect(() => wrapper.vm.options).not.toThrow()
      expect(wrapper.vm.options[0].value).toBe('someone@x.com')
    })

    it('does not leave what was typed behind in the next search', () => {
      // Regression: the entry was pushed into the resource's own data, so it
      // came back as a result for every later query.
      const wrapper = mount()
      api.resource.data = []
      wrapper.vm.query = 'someone@x.com'
      wrapper.vm.options
      expect(api.resource.data).toEqual([])
    })

    it('offers only what was typed when contact search is off', () => {
      const wrapper = mount({ fetchContacts: false })
      wrapper.vm.query = 'someone@x.com'
      expect(wrapper.vm.options[0].value).toBe('someone@x.com')
    })

    it('says what to do when there is nothing to show', () => {
      expect(mount().vm.emptyStateText).toBe('No results found')
      expect(mount({ fetchContacts: false }).vm.emptyStateText).toBe(
        'Type an email address to add attendee',
      )
    })

    it('leaves out addresses already on the event', () => {
      const wrapper = mount({ existingEmails: ['ada@x.com'] })
      const transformed = api.resource.transform([
        ['Ada', 'ada@x.com', 'CONTACT-1'],
        ['Grace', 'grace@x.com', 'CONTACT-2'],
      ])
      expect(transformed.map((o) => o.value)).toEqual(['grace@x.com'])
    })

    it('labels a contact by name, then by id, then by address', () => {
      mount()
      expect(
        api.resource.transform([
          ['Ada Lovelace', 'ada@x.com', 'CONTACT-1'],
          ['', 'grace@x.com', 'CONTACT-2'],
          ['', 'unknown@x.com', ''],
        ]).map((o) => o.label),
      ).toEqual(['Ada Lovelace', 'CONTACT-2', 'unknown@x.com'])
    })

    it('does not search when contact search is off', () => {
      const wrapper = mount({ fetchContacts: false })
      api.resource.reload.mockClear()
      wrapper.vm.reload('a')
      expect(api.resource.reload).not.toHaveBeenCalled()
    })

    it('searches for what was typed', () => {
      const wrapper = mount()
      wrapper.vm.reload('ada')
      expect(api.resource.params).toEqual({ txt: 'ada' })
      expect(api.resource.reload).toHaveBeenCalled()
    })
  })

  describe('adding an attendee', () => {
    it('adds the address', () => {
      const wrapper = mount()
      wrapper.vm.addValue({ value: 'ada@x.com' })
      expect(wrapper.emitted('update:modelValue').at(-1)).toEqual([
        [{ email: 'ada@x.com' }],
      ])
    })

    it('records which contact it came from', () => {
      const wrapper = mount()
      wrapper.vm.addValue({ value: 'ada@x.com', name: 'CONTACT-1' })
      expect(wrapper.emitted('update:modelValue').at(-1)[0][0]).toEqual({
        email: 'ada@x.com',
        reference_docname: 'CONTACT-1',
      })
    })

    it('records no contact for an address that was just typed', () => {
      // Regression: `new` is the marker for "the user typed this", and it was
      // written into the attendee as if it were a docname.
      const wrapper = mount()
      wrapper.vm.addValue({ value: 'someone@x.com', name: 'new' })
      expect(wrapper.emitted('update:modelValue').at(-1)[0][0]).toEqual({
        email: 'someone@x.com',
      })
    })

    it('splits a pasted list', () => {
      const wrapper = mount()
      wrapper.vm.addValue({ value: 'ada@x.com, grace@x.com' })
      expect(
        wrapper.emitted('update:modelValue').at(-1)[0].map((a) => a.email),
      ).toEqual(['ada@x.com', 'grace@x.com'])
    })

    it('records no contact against a pasted list', () => {
      // One contact cannot stand for several addresses.
      const wrapper = mount()
      wrapper.vm.addValue({ value: 'ada@x.com, grace@x.com', name: 'CONTACT-1' })
      expect(
        wrapper.emitted('update:modelValue').at(-1)[0].every((a) => !a.reference_docname),
      ).toBe(true)
    })

    it('ignores the blanks in a sloppy paste', () => {
      const wrapper = mount()
      wrapper.vm.addValue({ value: 'ada@x.com, , grace@x.com,' })
      expect(wrapper.emitted('update:modelValue').at(-1)[0]).toHaveLength(2)
    })

    it('says so rather than adding the same address twice', () => {
      const wrapper = mount({}, [{ email: 'ada@x.com' }])
      wrapper.vm.addValue({ value: 'ada@x.com' })
      expect(wrapper.vm.info).toBe('Email Already Exists')
      expect(wrapper.emitted('update:modelValue').at(-1)[0]).toHaveLength(1)
    })

    it('catches a duplicate inside one paste', () => {
      const wrapper = mount()
      wrapper.vm.addValue({ value: 'ada@x.com, ada@x.com' })
      expect(wrapper.emitted('update:modelValue').at(-1)[0]).toHaveLength(1)
    })

    it('ignores an empty choice', () => {
      const wrapper = mount()
      wrapper.vm.addValue(null)
      wrapper.vm.addValue({ value: '' })
      expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })

    it('keeps what is already there', () => {
      const wrapper = mount({}, [{ email: 'ada@x.com' }])
      wrapper.vm.addValue({ value: 'grace@x.com' })
      expect(
        wrapper.emitted('update:modelValue').at(-1)[0].map((a) => a.email),
      ).toEqual(['ada@x.com', 'grace@x.com'])
    })

    describe('when the caller validates addresses', () => {
      it('refuses one that does not look like an address', () => {
        const wrapper = mount({ validate: isEmail })
        wrapper.vm.addValue({ value: 'not-an-email' })
        expect(wrapper.vm.error).toBe('not-an-email is an Invalid value')
        expect(wrapper.emitted('update:modelValue').at(-1)[0]).toEqual([])
      })

      it('leaves the bad one in the box to be corrected', () => {
        const wrapper = mount({ validate: isEmail })
        wrapper.vm.addValue({ value: 'not-an-email' })
        expect(wrapper.vm.query).toBe('not-an-email')
      })

      it('keeps the good ones out of a mixed paste', () => {
        const wrapper = mount({ validate: isEmail })
        wrapper.vm.addValue({ value: 'ada@x.com, nope' })
        expect(
          wrapper.emitted('update:modelValue').at(-1)[0].map((a) => a.email),
        ).toEqual(['ada@x.com'])
      })

      it("uses the caller's wording", () => {
        const wrapper = mount({
          validate: isEmail,
          errorMessage: (v) => `${v} is not allowed here`,
        })
        wrapper.vm.addValue({ value: 'nope' })
        expect(wrapper.vm.error).toBe('nope is not allowed here')
      })
    })
  })

  describe('choosing from the list', () => {
    it('clears the box and closes the list', async () => {
      const wrapper = mount()
      wrapper.vm.query = 'ada@x.com'
      wrapper.vm.showOptions = true
      wrapper.vm.onSelect('ada@x.com')
      await nextTick()
      expect(wrapper.vm.query).toBe('')
      expect(wrapper.vm.showOptions).toBe(false)
    })

    it('leaves the box alone when the address was refused', () => {
      const wrapper = mount({ validate: isEmail })
      wrapper.vm.onSelect('nope')
      expect(wrapper.vm.query).toBe('nope')
    })

    it('ignores an empty choice', () => {
      const wrapper = mount()
      wrapper.vm.onSelect('')
      expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })

    it('takes what was typed when Enter is pressed', () => {
      const wrapper = mount()
      wrapper.vm.query = 'someone@x.com'
      wrapper.vm.handleEnter()
      expect(wrapper.emitted('update:modelValue').at(-1)[0][0].email).toBe(
        'someone@x.com',
      )
    })

    it('does nothing on Enter in an empty box', () => {
      const wrapper = mount()
      wrapper.vm.handleEnter()
      expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })

    it('opens the list as soon as something is typed', () => {
      const wrapper = mount()
      wrapper.vm.onInput({ target: { value: 'a' } })
      expect(wrapper.vm.query).toBe('a')
      expect(wrapper.vm.showOptions).toBe(true)
    })
  })

  describe('removing an attendee', () => {
    it('removes the one named', () => {
      const wrapper = mount({}, [{ email: 'ada@x.com' }, { email: 'grace@x.com' }])
      wrapper.vm.removeValue('ada@x.com')
      expect(
        wrapper.emitted('update:modelValue').at(-1)[0].map((a) => a.email),
      ).toEqual(['grace@x.com'])
    })

    it('copes with there being none', () => {
      const wrapper = mount({}, null)
      expect(() => wrapper.vm.removeValue('ada@x.com')).not.toThrow()
    })
  })

  describe('the tooltip on a chip', () => {
    it('names the record the attendee came from', () => {
      const wrapper = mount({}, [
        {
          email: 'ada@x.com',
          reference_doctype: 'Contact',
          reference_docname: 'CONTACT-1',
        },
      ])
      expect(wrapper.vm.getTooltip('ada@x.com')).toBe('Contact: CONTACT-1')
    })

    it('falls back to the address', () => {
      const wrapper = mount({}, [{ email: 'ada@x.com' }])
      expect(wrapper.vm.getTooltip('ada@x.com')).toBe('ada@x.com')
      expect(wrapper.vm.getTooltip('unknown@x.com')).toBe('unknown@x.com')
    })
  })
})

describe('EventNotifications', () => {
  const mount = (notifications = [], props = {}) =>
    mountComponent(EventNotifications, {
      props: { modelValue: notifications, ...props },
      global: { stubs: STUBS },
    })

  describe('adding one', () => {
    it('defaults to an email ten minutes before a timed event', () => {
      const list = []
      mount(list).vm.addNotification()
      expect(list).toEqual([
        { type: 'Email', before: 10, interval: 'minutes' },
      ])
    })

    it('defaults to the morning before an all-day event', () => {
      // "Ten minutes before" is meaningless for something with no start time.
      const list = []
      mount(list, { isAllDay: true }).vm.addNotification()
      expect(list).toEqual([
        { type: 'Email', before: 1, interval: 'days', time: '08:00' },
      ])
    })

    it('copes with there being no list yet', () => {
      const wrapper = mount(null)
      expect(() => wrapper.vm.addNotification()).not.toThrow()
    })

    it('adds one and opens the panel on the first click', () => {
      const list = []
      const wrapper = mount(list)
      wrapper.vm.addShowNotifications()
      expect(list).toHaveLength(1)
      expect(wrapper.vm.show).toBe(true)
    })

    it('just toggles the panel once there is one', () => {
      const list = [{ type: 'Notification', before: 10, interval: 'minutes' }]
      const wrapper = mount(list)
      wrapper.vm.addShowNotifications()
      expect(list).toHaveLength(1)
      expect(wrapper.vm.show).toBe(true)
      wrapper.vm.addShowNotifications()
      expect(wrapper.vm.show).toBe(false)
    })
  })

  describe('the intervals it offers', () => {
    it('offers minutes through weeks for a timed event', () => {
      const n = { before: 10, interval: 'minutes' }
      expect(mount([n]).vm.intervalOptions(n).map((o) => o.value)).toEqual([
        'minutes',
        'hours',
        'days',
        'weeks',
      ])
    })

    // Every interval label is singular or plural on the count. Only the day
    // variant was pinned, so "1 hours before" and "1 weeks before" could ship.
    it.each([
      [1, ['minute before', 'hour before', 'day before', 'week before']],
      [2, ['minutes before', 'hours before', 'days before', 'weeks before']],
    ])('labels %i correctly across every interval', (before, expected) => {
      const n = { before, interval: 'minutes' }
      expect(mount([n]).vm.intervalOptions(n).map((o) => o.label)).toEqual(
        expected,
      )
    })

    it('labels an all-day event’s intervals on the count too', () => {
      const n = { before: 1, interval: 'days' }
      expect(
        mount([n], { isAllDay: true }).vm.intervalOptions(n).map((o) => o.label),
      ).toEqual(['day before', 'week before'])
    })

    it('offers only days and weeks for an all-day event', () => {
      const n = { before: 1, interval: 'days' }
      expect(
        mount([n], { isAllDay: true }).vm.intervalOptions(n).map((o) => o.value),
      ).toEqual(['days', 'weeks'])
    })

    it('moves a minutes reminder to days when the event becomes all-day', () => {
      const n = { before: 10, interval: 'minutes' }
      mount([n], { isAllDay: true }).vm.intervalOptions(n)
      expect(n.interval).toBe('days')
      expect(n.time).toBe('08:00')
    })

    it('keeps a time that was already set', () => {
      const n = { before: 1, interval: 'days', time: '17:30' }
      mount([n], { isAllDay: true }).vm.intervalOptions(n)
      expect(n.time).toBe('17:30')
    })

    it('says "day" for one and "days" for more', () => {
      const one = { before: 1, interval: 'days' }
      const many = { before: 2, interval: 'days' }
      const wrapper = mount([one])
      expect(wrapper.vm.intervalOptions(one)[2].label).toBe('day before')
      expect(wrapper.vm.intervalOptions(many)[2].label).toBe('days before')
    })
  })

  describe('the summary line', () => {
    it('prompts when there is nothing set', () => {
      expect(mount([]).vm.notificationSummary).toBe('Add Notification')
      expect(mount(null).vm.notificationSummary).toBe('Add Notification')
    })

    it('reads back a timed reminder', () => {
      expect(
        mount([{ before: 10, interval: 'minutes' }]).vm.notificationSummary,
      ).toBe('10 minutes before')
    })

    it('uses the singular for one', () => {
      expect(mount([{ before: 1, interval: 'hour' }]).vm.notificationSummary).toBe(
        '1  before',
      )
      expect(mount([{ before: 1, interval: 'hours' }]).vm.notificationSummary).toBe(
        '1 hour before',
      )
    })

    it('names every interval it knows', () => {
      const wrapper = mount([
        { before: 2, interval: 'minutes' },
        { before: 2, interval: 'hours' },
        { before: 2, interval: 'days' },
        { before: 2, interval: 'weeks' },
      ])
      expect(wrapper.vm.notificationSummary).toBe(
        '2 minutes before, 2 hours before, 2 days before, 2 weeks before',
      )
    })

    it('includes the time of day for an all-day event', () => {
      expect(
        mount([{ before: 1, interval: 'days', time: '17:30' }], {
          isAllDay: true,
        }).vm.notificationSummary,
      ).toBe('1 day before at 5:30 pm')
    })

    it('assumes the morning when no time is set', () => {
      expect(
        mount([{ before: 1, interval: 'days' }], { isAllDay: true }).vm
          .notificationSummary,
      ).toBe('1 day before at 8:00 am')
    })
  })

  describe('reading a time back', () => {
    const format = (t) => mount([]).vm.formatTime(t)

    it('turns the clock into twelve hours', () => {
      expect(format('00:00')).toBe('12:00 am')
      expect(format('09:05')).toBe('9:05 am')
      expect(format('12:00')).toBe('12:00 pm')
      expect(format('13:45')).toBe('1:45 pm')
      expect(format('23:59')).toBe('11:59 pm')
    })

    it('pads the minutes', () => {
      expect(format('9:5')).toBe('9:05 am')
    })
  })
})
