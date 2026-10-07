const api = vi.hoisted(() => ({
  toast: null,
  call: vi.fn(async () => ({})),
  showModal: vi.fn(),
  capture: vi.fn(),
  updateOnboardingStep: vi.fn(),
  callLog: null,
  events: null,
}))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  api.toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
  return {
    ...actual,
    toast: api.toast,
    call: (...a) => api.call(...a),
    createResource: (options = {}) => {
      api.callLog = reactive({ ...options, data: null, fetch: vi.fn(), reload: vi.fn() })
      return api.callLog
    },
  }
})

vi.mock('frappe-ui/frappe', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useTelemetry: () => ({ capture: api.capture }),
    useOnboarding: () => ({ updateOnboardingStep: api.updateOnboardingStep }),
  }
})

vi.mock('@/composables/doctypeModal', () => ({
  useDoctypeModal: () => ({ showModal: api.showModal }),
}))

vi.mock('@/composables/event', async () => {
  const { ref } = await import('vue')
  api.events = {
    showEventModal: ref(false),
    activeEvent: ref(null),
    events: ref([]),
  }
  return {
    showEventModal: api.events.showEventModal,
    activeEvent: api.events.activeEvent,
    useEvent: () => ({
      events: api.events.events,
      startEndTime: () => '',
      startDate: () => '',
    }),
  }
})

vi.mock('@/composables/useTimelinePreferences', async () => {
  const { ref } = await import('vue')
  return { useTimelinePreferences: () => ({ showExactTimestamp: ref(false) }) }
})

const nav = vi.hoisted(() => ({ push: vi.fn() }))
const ROUTE = vi.hoisted(() => ({ name: 'Deal', params: {}, query: {}, hash: '' }))
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useRouter: () => nav, useRoute: () => ROUTE }
})

import AllModals from '@/components/Activities/AllModals.vue'
import EventArea from '@/components/Activities/EventArea.vue'
import CallArea from '@/components/Activities/CallArea.vue'
import { mountComponent } from '../helpers/mount'
import { reactive } from 'vue'
import { flushPromises } from '@vue/test-utils'

const STUBS = {
  EventModal: true, EmptyState: true, CalendarIcon: true, MultipleAvatar: true,
  Avatar: true, TimelineTimestamp: true, PlayIcon: true, DurationIcon: true,
  AudioPlayer: true, CallLogDetailModal: true, Badge: true,
}

let activities

const mountModals = () => {
  activities = reactive({ reload: vi.fn() })
  return mountComponent(AllModals, {
    props: {
      doctype: 'CRM Deal',
      doc: { name: 'DEAL-1' },
      modelValue: activities,
    },
    global: { stubs: STUBS, mocks: { $route: ROUTE } },
  })
}

describe('AllModals', () => {
  beforeEach(() => {
    api.toast.error.mockClear()
    api.showModal.mockClear()
    api.capture.mockClear()
    api.updateOnboardingStep.mockClear()
    api.call.mockReset().mockResolvedValue({})
    nav.push.mockClear()
    ROUTE.name = 'Deal'
    ROUTE.hash = ''
  })

  describe('opening a task', () => {
    it('attaches it to the record it was opened from', () => {
      // Without the reference the task is created unlinked.
      mountModals().vm.showTask({ name: 'TASK-1' })
      expect(api.showModal).toHaveBeenCalledWith(
        expect.objectContaining({
          doctype: 'CRM Task',
          defaults: {
            reference_doctype: 'CRM Deal',
            reference_docname: 'DEAL-1',
          },
        }),
      )
    })

    it('opens a blank one when given nothing', () => {
      mountModals().vm.showTask()
      expect(api.showModal.mock.calls[0][0].name).toBeUndefined()
    })
  })

  describe('opening a note', () => {
    it('attaches it to the record too', () => {
      mountModals().vm.showNote({ name: 'NOTE-1' })
      expect(api.showModal).toHaveBeenCalledWith(
        expect.objectContaining({ doctype: 'FCRM Note' }),
      )
    })

    it('opens a blank one when given nothing', () => {
      // Both "New Note" entry points call this with no argument, so the
      // optional access is the common path, not the defensive one.
      const wrapper = mountModals()
      expect(() => wrapper.vm.showNote()).not.toThrow()
      expect(api.showModal.mock.calls[0][0].name).toBeUndefined()
    })

    it('still points a blank note at the record', () => {
      mountModals().vm.showNote()
      expect(api.showModal.mock.calls[0][0].defaults).toMatchObject({
        reference_doctype: 'CRM Deal',
        reference_docname: 'DEAL-1',
      })
    })
  })

  describe('creating a call log', () => {
    it('passes the whole record for the log to reference', () => {
      mountModals().vm.createCallLog()
      const defaults = api.showModal.mock.calls[0][0].defaults
      expect(defaults.reference_doc).toEqual({ name: 'DEAL-1' })
    })

    it('sends a copy, not the live document', () => {
      const wrapper = mountModals()
      wrapper.vm.createCallLog()
      expect(api.showModal.mock.calls[0][0].defaults.reference_doc).not.toBe(
        wrapper.props('doc'),
      )
    })
  })

  describe('after a record is saved', () => {
    const afterFor = (doctype) => {
      const wrapper = mountModals()
      wrapper.vm.showTask({})
      return { wrapper, doc: { doctype, name: 'X-1' } }
    }

    it('refreshes the timeline', () => {
      const { wrapper, doc } = afterFor('CRM Task')
      api.showModal.mock.calls[0][0].callbacks.afterUpdate(doc)
      expect(activities.reload).toHaveBeenCalled()
    })

    it('marks the onboarding step on a first insert', () => {
      const { doc } = afterFor('CRM Task')
      api.showModal.mock.calls[0][0].callbacks.afterInsert(doc)
      expect(api.updateOnboardingStep).toHaveBeenCalledWith('create_first_task')
      expect(api.capture).toHaveBeenCalledWith('task_created')
    })

    it('records an update separately', () => {
      const { doc } = afterFor('CRM Task')
      api.showModal.mock.calls[0][0].callbacks.afterUpdate(doc)
      expect(api.updateOnboardingStep).not.toHaveBeenCalled()
      expect(api.capture).toHaveBeenCalledWith('task_updated')
    })

    it('names a note correctly', () => {
      const { doc } = afterFor('FCRM Note')
      api.showModal.mock.calls[0][0].callbacks.afterInsert({
        doctype: 'FCRM Note',
        name: 'N-1',
      })
      expect(api.capture).toHaveBeenCalledWith('note_created')
    })

    it('switches to the tab the record belongs in', () => {
      const { doc } = afterFor('CRM Task')
      api.showModal.mock.calls[0][0].callbacks.afterUpdate(doc)
      expect(nav.push).toHaveBeenCalledWith(
        expect.objectContaining({ hash: '#tasks' }),
      )
    })

    it('uses the calls tab for a call log, not "call_logs"', () => {
      // The tab is named `calls`; the telemetry event is `call_log_*`.
      const { doc } = afterFor('CRM Call Log')
      api.showModal.mock.calls[0][0].callbacks.afterUpdate({
        doctype: 'CRM Call Log',
        name: 'C-1',
      })
      expect(nav.push).toHaveBeenCalledWith(
        expect.objectContaining({ hash: '#calls' }),
      )
      expect(api.capture).toHaveBeenCalledWith('call_log_updated')
    })

    it('does not navigate when already on that tab', () => {
      ROUTE.hash = '#tasks'
      const { doc } = afterFor('CRM Task')
      api.showModal.mock.calls[0][0].callbacks.afterUpdate(doc)
      expect(nav.push).not.toHaveBeenCalled()
    })

    it('does not navigate from a page with no tabs', () => {
      // Only the lead and deal pages have a tabbed timeline.
      ROUTE.name = 'Contact'
      const { doc } = afterFor('CRM Task')
      api.showModal.mock.calls[0][0].callbacks.afterUpdate(doc)
      expect(nav.push).not.toHaveBeenCalled()
    })
  })

  describe('deleting a task', () => {
    it('deletes and refreshes', async () => {
      const wrapper = mountModals()
      await wrapper.vm.deleteTask('TASK-1')
      expect(api.call).toHaveBeenCalledWith('frappe.client.delete', {
        doctype: 'CRM Task',
        name: 'TASK-1',
      })
      expect(activities.reload).toHaveBeenCalled()
    })

    it('says why it could not, instead of rejecting into nothing', async () => {
      // Regression: no catch at all — the task stayed on screen unexplained.
      api.call.mockRejectedValue({ messages: ['Not permitted'] })
      const wrapper = mountModals()
      await wrapper.vm.deleteTask('TASK-1')
      expect(api.toast.error).toHaveBeenCalledWith('Not permitted')
      expect(activities.reload).not.toHaveBeenCalled()
    })
  })

  describe('changing a task status', () => {
    it('writes the new status and refreshes', async () => {
      const wrapper = mountModals()
      wrapper.vm.updateTaskStatus('Done', { name: 'TASK-1' })
      await flushPromises()
      expect(api.call).toHaveBeenCalledWith('frappe.client.set_value', {
        doctype: 'CRM Task',
        name: 'TASK-1',
        fieldname: 'status',
        value: 'Done',
      })
      expect(activities.reload).toHaveBeenCalled()
    })

    it('says why it could not', async () => {
      // Regression: the status silently snapped back on the next reload.
      api.call.mockRejectedValue(new Error('offline'))
      const wrapper = mountModals()
      wrapper.vm.updateTaskStatus('Done', { name: 'TASK-1' })
      await flushPromises()
      expect(api.toast.error).toHaveBeenCalledWith('offline')
    })
  })

  describe('opening an event', () => {
    it('selects it and opens the modal', () => {
      mountModals().vm.showEvent({ name: 'EVENT-1' })
      expect(api.events.showEventModal.value).toBe(true)
      expect(api.events.activeEvent.value).toEqual({ name: 'EVENT-1' })
    })
  })
})

describe('EventArea', () => {
  const mount = () =>
    mountComponent(EventArea, {
      props: { doctype: 'CRM Deal', docname: 'DEAL-1' },
      global: { stubs: STUBS },
    })

  beforeEach(() => {
    api.events.showEventModal.value = false
    api.events.activeEvent.value = null
  })

  it('opens an existing event', () => {
    mount().vm.showEvent({ name: 'EVENT-1' })
    expect(api.events.showEventModal.value).toBe(true)
    expect(api.events.activeEvent.value).toEqual({ name: 'EVENT-1' })
  })

  it('opens a blank one when given nothing', () => {
    // The "add event" button calls this with no argument.
    mount().vm.showEvent()
    expect(api.events.showEventModal.value).toBe(true)
    expect(api.events.activeEvent.value).toEqual({})
  })
})

describe('CallArea', () => {
  // The row arrives already decorated by the server — `_caller`, `_receiver`
  // and `_duration` are computed in crm_call_log.py, and the template reads
  // them directly rather than through a guard.
  const callRow = (over = {}) => ({
    name: 'CALL-1',
    type: 'Incoming',
    status: 'Completed',
    creation: '2026-03-15 09:00:00',
    recording_url: '',
    show_recording: 0,
    _caller: { image: '', label: 'Ada' },
    _receiver: { image: '', label: 'Grace' },
    _duration: '1m 30s',
    ...over,
  })

  const mount = (over = {}) =>
    mountComponent(CallArea, {
      props: { activity: callRow(over) },
      global: { stubs: STUBS },
    })

  it('fetches the full log for the row', () => {
    mount({ name: 'CALL-9' })
    expect(api.callLog.params).toEqual({ name: 'CALL-9' })
  })

  it('caches per call, so two rows do not share one log', () => {
    mount({ name: 'CALL-9' })
    expect(api.callLog.cache).toEqual(['call_log', 'CALL-9'])
  })

  it('shows both parties', () => {
    expect(mount().text()).toContain('Ada')
  })

  it('keeps the detail modal shut until asked', () => {
    expect(mount().vm.showCallLogDetailModal).toBe(false)
  })
})
