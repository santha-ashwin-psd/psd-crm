const res = vi.hoisted(() => ({
  insert: { submit: vi.fn() },
  setValue: { submit: vi.fn() },
  delete: { submit: vi.fn() },
  reload: vi.fn(),
}))

vi.mock('@/composables/event', async (importOriginal) => {
  // Keep the real helpers — buildEndTimeOptions, computeAutoToTime and
  // validateTimeRange are the logic under test here, and they have their own
  // suite in eventComposable.test.js.
  const actual = await importOriginal()
  return { ...actual, useEvent: () => ({ eventsResource: res }) }
})

const dialog = vi.hoisted(() => ({ open: vi.fn() }))
vi.mock('@/stores/global', () => ({
  globalStore: () => ({ $dialog: dialog.open, $socket: { on: vi.fn(), off: vi.fn() } }),
}))

import EventModal from '@/components/Modals/EventModal.vue'
import { mountComponent } from '../helpers/mount'
import { flushPromises } from '@vue/test-utils'

const EXISTING = {
  name: 'EVENT-1',
  subject: 'Kickoff',
  description: '<p>Agenda</p>',
  starts_on: '2026-08-20 09:00:00',
  ends_on: '2026-08-20 10:00:00',
  all_day: 0,
  event_type: 'Public',
  location: 'Room 1',
  color: 'green',
  event_participants: [],
  notifications: [],
}

const mountModal = (event = EXISTING, props = {}) =>
  mountComponent(EventModal, {
    props: {
      modelValue: true,
      event,
      doctype: 'CRM Deal',
      docname: 'DEAL-1',
      ...props,
    },
    global: {
      stubs: {
        Dialog: true, Switch: true, TextEditor: true, DatePicker: true,
        TimePicker: true, Dropdown: true, ErrorMessage: true,
        EventNotifications: true, Attendee: true,
      },
    },
  })

const payload = (fn) => fn.submit.mock.calls[0][0]
const handlers = (fn) => fn.submit.mock.calls[0][1]

describe('EventModal', () => {
  beforeEach(() => {
    // Pinned: a new event defaults to now → now+1h, so the suite's behaviour
    // otherwise changes depending on what time of day it runs.
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 20, 9, 0, 0))
    res.insert.submit.mockClear()
    res.setValue.submit.mockClear()
    res.delete.submit.mockClear()
    res.reload.mockClear().mockResolvedValue(undefined)
    dialog.open.mockClear()
  })

  afterEach(() => vi.useRealTimers())

  describe('which mode it opens in', () => {
    it('edits an event that already exists', () => {
      expect(mountModal().vm.mode).toBe('edit')
    })

    it('creates when there is no event yet', () => {
      expect(mountModal({}).vm.mode).toBe('create')
    })

    it('loads the existing values into the form', () => {
      const e = mountModal().vm._event
      expect(e).toMatchObject({
        id: 'EVENT-1',
        title: 'Kickoff',
        location: 'Room 1',
        fromDate: '2026-08-20',
        fromTime: '09:00',
        toTime: '10:00',
      })
    })

    it('defaults a new event to an hour from now', () => {
      // A brand-new event has no starts_on to read.
      const e = mountModal({}).vm._event
      expect(e.fromDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(e.fromTime).toMatch(/^\d{2}:\d{2}$/)
      expect(e.id).toBe('')
    })
  })

  describe('tracking unsaved changes', () => {
    it('starts clean', () => {
      expect(mountModal().vm.dirty).toBe(false)
    })

    it('notices an edit', () => {
      const wrapper = mountModal()
      wrapper.vm._event.title = 'Kickoff v2'
      expect(wrapper.vm.dirty).toBe(true)
    })
  })

  describe('picking a date', () => {
    it('moves both ends of a single-day event together', () => {
      const wrapper = mountModal()
      wrapper.vm.updateDate('2026-09-01')
      expect(wrapper.vm._event.fromDate).toBe('2026-09-01')
      expect(wrapper.vm._event.toDate).toBe('2026-09-01')
    })
  })

  describe('picking times', () => {
    it('pushes the end time along when the start passes it', () => {
      // Leaving an end before the start would be invalid the moment it is set.
      const wrapper = mountModal()
      wrapper.vm.updateTime('11:00', true)
      expect(wrapper.vm._event.fromTime).toBe('11:00')
      expect(wrapper.vm._event.toTime > '11:00').toBe(true)
    })

    it('leaves a still-valid end time alone', () => {
      const wrapper = mountModal()
      wrapper.vm.updateTime('09:30', true)
      expect(wrapper.vm._event.toTime).toBe('10:00')
    })

    it('accepts a later end time', () => {
      const wrapper = mountModal()
      wrapper.vm.updateTime('11:00', false)
      expect(wrapper.vm._event.toTime).toBe('11:00')
      expect(wrapper.vm.error).toBeNull()
    })

    it('accepts an end time on the following day', () => {
      // An overnight event is legitimate; both ends were previously compared
      // against fromDate, which made every one of them invalid.
      const wrapper = mountModal()
      wrapper.vm._event.toDate = '2026-08-21'
      wrapper.vm.updateTime('01:00', false)
      expect(wrapper.vm.error).toBeNull()
      expect(wrapper.vm._event.toTime).toBe('01:00')
    })

    it('rejects an end before the start and keeps the old value', () => {
      const wrapper = mountModal()
      wrapper.vm.updateTime('08:00', false)
      expect(wrapper.vm.error).toBeTruthy()
      expect(wrapper.vm._event.toTime).toBe('10:00')
    })

    it('clears a previous error on the next valid pick', () => {
      const wrapper = mountModal()
      wrapper.vm.updateTime('08:00', false)
      wrapper.vm.updateTime('11:00', false)
      expect(wrapper.vm.error).toBeNull()
    })
  })

  describe('saving', () => {
    it('refuses an event with no title', () => {
      const wrapper = mountModal({ ...EXISTING, subject: '' })
      wrapper.vm.update()
      expect(wrapper.vm.error).toBe('Title is required')
      expect(res.setValue.submit).not.toHaveBeenCalled()
    })

    it('updates an existing event rather than creating a second one', () => {
      const wrapper = mountModal()
      wrapper.vm.update()
      expect(res.setValue.submit).toHaveBeenCalled()
      expect(res.insert.submit).not.toHaveBeenCalled()
      expect(payload(res.setValue).name).toBe('EVENT-1')
    })

    it('creates when there is no existing event', () => {
      const wrapper = mountModal({})
      wrapper.vm._event.title = 'New thing'
      wrapper.vm.update()
      expect(res.insert.submit).toHaveBeenCalled()
      expect(res.setValue.submit).not.toHaveBeenCalled()
    })

    it('joins date and time into the timestamps the server wants', () => {
      const wrapper = mountModal()
      wrapper.vm.update()
      expect(payload(res.setValue)).toMatchObject({
        starts_on: '2026-08-20 09:00',
        ends_on: '2026-08-20 10:00',
      })
    })

    it('carries the reference document through', () => {
      // An event created from a deal must stay attached to that deal.
      const wrapper = mountModal()
      wrapper.vm.update()
      expect(payload(res.setValue)).toMatchObject({
        reference_doctype: 'CRM Deal',
        reference_docname: 'DEAL-1',
      })
    })

    it('closes and refreshes once saved', async () => {
      const wrapper = mountModal()
      wrapper.vm.update()
      await handlers(res.setValue).onSuccess()
      await flushPromises()
      expect(res.reload).toHaveBeenCalled()
      expect(wrapper.emitted('update:modelValue').at(-1)[0]).toBe(false)
    })
  })

  describe('duplicating', () => {
    it('marks the copy as new so saving inserts it', () => {
      const wrapper = mountModal()
      wrapper.vm.duplicateEvent()
      expect(wrapper.vm.mode).toBe('duplicate')
      wrapper.vm.update()
      expect(res.insert.submit).toHaveBeenCalled()
      expect(res.setValue.submit).not.toHaveBeenCalled()
    })

    it('names the copy distinctly', () => {
      const wrapper = mountModal()
      wrapper.vm.duplicateEvent()
      expect(wrapper.vm._event.title).toBe('Kickoff (Copy)')
    })

    it('does nothing for an event that was never saved', () => {
      const wrapper = mountModal({})
      wrapper.vm.duplicateEvent()
      expect(wrapper.vm.mode).toBe('create')
    })
  })

  describe('deleting', () => {
    it('asks first', () => {
      const wrapper = mountModal()
      wrapper.vm.deleteEvent()
      expect(dialog.open).toHaveBeenCalled()
      expect(res.delete.submit).not.toHaveBeenCalled()
    })

    it('deletes once confirmed', () => {
      const wrapper = mountModal()
      wrapper.vm.deleteEvent()
      dialog.open.mock.calls[0][0].actions[0].onClick(vi.fn())
      expect(res.delete.submit).toHaveBeenCalledWith('EVENT-1', expect.anything())
    })

    it('closes everything after deleting', async () => {
      const close = vi.fn()
      const wrapper = mountModal()
      wrapper.vm.deleteEvent()
      dialog.open.mock.calls[0][0].actions[0].onClick(close)
      await res.delete.submit.mock.calls[0][1].onSuccess()
      await flushPromises()
      expect(res.reload).toHaveBeenCalled()
      expect(close).toHaveBeenCalled()
      expect(wrapper.emitted('update:modelValue').at(-1)[0]).toBe(false)
    })

    it('does nothing for an event that was never saved', () => {
      const wrapper = mountModal({})
      wrapper.vm.deleteEvent()
      expect(dialog.open).not.toHaveBeenCalled()
    })
  })

  describe('participants', () => {
    it('normalises whatever the picker hands back', () => {
      const wrapper = mountModal()
      wrapper.vm.peoples = [{ email: 'ada@example.com' }]
      expect(wrapper.vm._event.event_participants).toEqual([
        { email: 'ada@example.com', reference_doctype: 'Contact', reference_docname: '' },
      ])
    })

    it('drops duplicates and entries with no address', () => {
      const wrapper = mountModal()
      wrapper.vm.peoples = [
        { email: 'ada@example.com' },
        { email: 'ada@example.com' },
        { reference_doctype: 'Contact' },
      ]
      expect(wrapper.vm._event.event_participants).toHaveLength(1)
    })

    it('reads back as a list even when unset', () => {
      const wrapper = mountModal({})
      wrapper.vm._event.event_participants = null
      expect(wrapper.vm.peoples).toEqual([])
    })
  })

  describe('end-time options', () => {
    it('offers only times after the start', () => {
      const wrapper = mountModal()
      const options = wrapper.vm.toOptions
      expect(options.length).toBeGreaterThan(0)
      for (const o of options) {
        expect((o.value ?? o) > '09:00').toBe(true)
      }
    })
  })
})
