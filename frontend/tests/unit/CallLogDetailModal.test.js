const api = vi.hoisted(() => ({
  call: vi.fn(),
  capture: vi.fn(),
  onboarding: vi.fn(),
  toast: null,
}))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  api.toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn() }
  return { ...actual, call: api.call, toast: api.toast }
})

vi.mock('frappe-ui/frappe', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useTelemetry: () => ({ capture: api.capture }),
    useOnboarding: () => ({ updateOnboardingStep: api.onboarding }),
  }
})

const modal = vi.hoisted(() => ({ showModal: vi.fn() }))
// stores/settings.js builds a createDocumentResource with `auto: true` at
// module scope, and the frappe-ui mock above passes that factory through — so
// merely importing this page fired a real fetch at localhost:3000 and left an
// unhandled rejection behind the (otherwise green) run.
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

// Same class of leak, one module along: stores/meta.js auto-loads the doctype
// meta for CRM Call Log. Nothing here reads it — it arrives transitively — so
// an inert stand-in is enough.
vi.mock('@/stores/meta', async () => {
  const { ref } = await import('vue')
  return {
    getMeta: () => ({
      doctypeMeta: ref({}),
      getFormattedCurrency: (f, d) => String(d?.[f] ?? ''),
      getFields: () => [],
      doctypesMeta: {},
    }),
  }
})

vi.mock('@/composables/doctypeModal', () => ({
  useDoctypeModal: () => ({ showModal: modal.showModal }),
}))

vi.mock('@/data/document', async () => {
  const { reactive } = await import('vue')
  return { useDocument: () => ({ document: reactive({ doc: {} }) }) }
})

const nav = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useRouter: () => nav }
})

import CallLogDetailModal from '@/components/Modals/CallLogDetailModal.vue'
import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'
import { flushPromises } from '@vue/test-utils'

// getCallLogDetail reads the underscore-prefixed companions (_caller,
// _receiver, _duration) rather than the raw columns, so both must be present.
const LOG = {
  id: 'CALL-SID-1',
  name: 'CALL-1',
  type: 'Incoming',
  status: 'Completed',
  caller: 'ada@example.com',
  _caller: { label: 'Ada Lovelace', image: '/ada.png' },
  receiver: 'bob@example.com',
  _receiver: { label: 'Bob Brown', image: '' },
  duration: 125,
  _duration: '2m 5s',
  creation: '2026-08-20 09:00:00',
  _notes: [],
  _tasks: [],
}

const mountModal = (data = LOG) => {
  const callLog = { data, reload: vi.fn() }
  const wrapper = mountComponent(CallLogDetailModal, {
    props: { modelValue: true, callLog },
    global: {
      stubs: {
        Dialog: true, Dropdown: true, Avatar: true, Tooltip: true,
        FeatherIcon: true, FadedScrollableDiv: true, EditIcon: true,
        ArrowUpRightIcon: true, DurationIcon: true, ContactsIcon: true,
        LeadsIcon: true, DealsIcon: true, CalendarIcon: true,
        NoteIcon: true, TaskIcon: true, CheckCircleIcon: true,
      },
    },
  })
  return { wrapper, callLog }
}

describe('CallLogDetailModal', () => {
  beforeEach(() => {
    api.call.mockReset().mockResolvedValue('LEAD-9')
    api.capture.mockClear()
    api.onboarding.mockClear()
    modal.showModal.mockClear()
    nav.push.mockClear()
    // createLead does not await its own promise chain, so a rejection from the
    // previous test can land here if these are not reset.
    Object.values(api.toast).forEach((fn) => fn.mockClear())
  })

  describe('the hero summary', () => {
    it('surfaces the key facts about the call', () => {
      const { wrapper } = mountModal()
      const s = wrapper.vm.summary
      expect(s).toMatchObject({
        type: expect.anything(),
        caller: expect.anything(),
        receiver: expect.anything(),
        status: expect.anything(),
      })
      expect(s.duration).toBeTruthy()
      expect(s.time).toBeTruthy()
    })

    it('is absent until a call log is loaded', () => {
      const { wrapper } = mountModal(null)
      expect(wrapper.vm.summary).toBeNull()
    })
  })

  describe('the detail list', () => {
    it('is empty until a call log is loaded', () => {
      const { wrapper } = mountModal(null)
      expect(wrapper.vm.detailFields).toEqual([])
    })

    it('builds a row per detail', () => {
      const { wrapper } = mountModal()
      expect(wrapper.vm.detailFields.length).toBeGreaterThan(0)
    })

    it('keeps only the non-hero rows in the extras', () => {
      // The hero already shows type/caller/receiver/status/time/duration.
      const { wrapper } = mountModal()
      const names = wrapper.vm.extraFields.map((f) => f.name)
      for (const name of names) {
        expect(['reference_doc', 'recording_url_path', 'note', 'task']).toContain(
          name,
        )
      }
    })

    it('does not mutate the call log while formatting it', () => {
      // detailFields reformats every key; it works on a copy.
      const { wrapper, callLog } = mountModal()
      void wrapper.vm.detailFields
      expect(callLog.data.duration).toBe(125)
      expect(callLog.data.type).toBe('Incoming')
    })
  })

  describe('status colours', () => {
    // The modal's private `statusColorClass` colour map is gone; the status
    // renders through the shared StatusBadge, which derives its tone from the
    // status value rather than from a per-component colour name. Tone mapping
    // is covered exhaustively in statusTheme.test.js.
    it('delegates its status colour to the shared badge', () => {
      const { wrapper } = mountModal()
      expect(wrapper.vm.statusColorClass).toBeUndefined()
      expect(wrapper.findComponent({ name: 'StatusBadge' }).exists()).toBe(true)
    })
  })

  describe('linked note and task', () => {
    it('picks up an existing note and task', async () => {
      const { wrapper } = mountModal({
        ...LOG,
        _notes: [{ name: 'NOTE-1' }],
        _tasks: [{ name: 'TASK-1' }],
      })
      await nextTick()
      expect(wrapper.vm.note).toBe('NOTE-1')
      expect(wrapper.vm.task).toBe('TASK-1')
    })

    it('leaves them null when there are none', async () => {
      const { wrapper } = mountModal()
      await nextTick()
      expect(wrapper.vm.note).toBeNull()
      expect(wrapper.vm.task).toBeNull()
    })
  })

  describe('adding a note', () => {
    it('opens the note modal', () => {
      const { wrapper } = mountModal()
      wrapper.vm.showNote()
      expect(modal.showModal).toHaveBeenCalledWith(
        expect.objectContaining({ doctype: 'FCRM Note' }),
      )
    })

    it('links a newly created note to the call', async () => {
      const { wrapper, callLog } = mountModal()
      await wrapper.vm.addNoteToCallLog({ name: 'NOTE-9' }, true)
      expect(api.call).toHaveBeenCalledWith(
        'crm.integrations.api.add_note_to_call_log',
        expect.objectContaining({ call_sid: 'CALL-SID-1' }),
      )
      expect(callLog.reload).toHaveBeenCalled()
    })

    it('does not re-link on an edit', async () => {
      // Editing an existing note must not attach a second copy.
      const { wrapper } = mountModal()
      await wrapper.vm.addNoteToCallLog({ name: 'NOTE-9' }, false)
      expect(api.call).not.toHaveBeenCalled()
      expect(api.capture).toHaveBeenCalledWith('note_updated')
    })

    it('ticks off the onboarding step for a first note', async () => {
      const { wrapper } = mountModal()
      await wrapper.vm.addNoteToCallLog({ name: 'NOTE-9' }, true)
      expect(api.onboarding).toHaveBeenCalledWith('create_first_note')
    })
  })

  describe('adding a task', () => {
    it('opens the task modal with sensible defaults', () => {
      const { wrapper } = mountModal()
      wrapper.vm.showTask()
      expect(modal.showModal).toHaveBeenCalledWith(
        expect.objectContaining({
          doctype: 'CRM Task',
          defaults: { status: 'Backlog', priority: 'Low' },
        }),
      )
    })

    it('links a newly created task to the call', async () => {
      const { wrapper, callLog } = mountModal()
      await wrapper.vm.addTaskToCallLog({ name: 'TASK-9' }, true)
      expect(api.call).toHaveBeenCalledWith(
        'crm.integrations.api.add_task_to_call_log',
        expect.objectContaining({ call_sid: 'CALL-SID-1' }),
      )
      expect(callLog.reload).toHaveBeenCalled()
    })

    it('does not re-link on an edit', async () => {
      const { wrapper } = mountModal()
      await wrapper.vm.addTaskToCallLog({ name: 'TASK-9' }, false)
      expect(api.call).not.toHaveBeenCalled()
      expect(api.capture).toHaveBeenCalledWith('task_updated')
    })
  })

  // The two tests above call the handler directly. These check the wiring —
  // which callback gets the insert flag. Swap them and a task created from a
  // call log is never linked back to it, while editing an existing one links
  // it a second time.
  describe('what the modal calls back into', () => {
    const callbacksFor = (open) => {
      const { wrapper } = mountModal()
      wrapper.vm[open]()
      return modal.showModal.mock.calls.at(-1)[0].callbacks
    }

    it('treats a new task as an insert and an edit as an update', async () => {
      const cb = callbacksFor('showTask')
      await cb.afterInsert({ name: 'TASK-9' })
      expect(api.call).toHaveBeenCalledWith(
        'crm.integrations.api.add_task_to_call_log',
        expect.objectContaining({ call_sid: 'CALL-SID-1' }),
      )
      api.call.mockClear()
      await cb.afterUpdate({ name: 'TASK-9' })
      expect(api.call).not.toHaveBeenCalled()
    })

    it('treats a new note as an insert and an edit as an update', async () => {
      const cb = callbacksFor('showNote')
      await cb.afterInsert({ name: 'NOTE-9' })
      expect(api.call).toHaveBeenCalledWith(
        'crm.integrations.api.add_note_to_call_log',
        expect.objectContaining({ call_sid: 'CALL-SID-1' }),
      )
      api.call.mockClear()
      await cb.afterUpdate({ name: 'NOTE-9' })
      expect(api.call).not.toHaveBeenCalled()
    })
  })

  describe('creating a lead from the call', () => {
    it('posts the call log and the entered details', async () => {
      const { wrapper } = mountModal()
      wrapper.vm.leadDetails = { first_name: 'Ada' }
      await wrapper.vm.createLead()
      expect(api.call).toHaveBeenCalledWith(
        'crm.fcrm.doctype.crm_call_log.crm_call_log.create_lead_from_call_log',
        expect.objectContaining({ lead_details: { first_name: 'Ada' } }),
      )
    })

    it('opens the new lead', async () => {
      const { wrapper } = mountModal()
      await wrapper.vm.createLead()
      await flushPromises()
      expect(nav.push).toHaveBeenCalledWith({
        name: 'Lead',
        params: { leadId: 'LEAD-9' },
      })
    })

    it('reports a failure without the word undefined', async () => {
      api.call.mockRejectedValue(new Error('offline'))
      const { wrapper } = mountModal()
      await wrapper.vm.createLead()
      await flushPromises()
      expect(api.toast.error).toHaveBeenCalled()
      expect(api.toast.error.mock.calls[0][0]).not.toContain('undefined')
    })

    it('prefers the server message when there is one', async () => {
      api.call.mockRejectedValue({ messages: ['Duplicate lead'] })
      const { wrapper } = mountModal()
      await wrapper.vm.createLead()
      await flushPromises()
      expect(api.toast.error.mock.calls[0][0]).toContain('Duplicate lead')
    })
  })

  describe('editing the call log', () => {
    it('opens the call log modal for this record', () => {
      const { wrapper } = mountModal()
      wrapper.vm.openCallLogModal()
      expect(modal.showModal).toHaveBeenCalledWith(
        expect.objectContaining({ doctype: 'CRM Call Log', name: 'CALL-1' }),
      )
    })

    it('refreshes after an edit', () => {
      const { wrapper, callLog } = mountModal()
      wrapper.vm.openCallLogModal()
      modal.showModal.mock.calls[0][0].callbacks.afterUpdate()
      expect(callLog.reload).toHaveBeenCalled()
      expect(api.capture).toHaveBeenCalledWith('call_log_updated')
    })
  })
})
