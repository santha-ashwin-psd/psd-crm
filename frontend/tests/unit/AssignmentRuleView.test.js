const api = vi.hoisted(() => ({
  toast: null,
  call: vi.fn(async () => ({})),
  capture: vi.fn(),
  dialog: vi.fn(),
  created: [],
}))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  api.toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn() }
  return {
    ...actual,
    toast: api.toast,
    call: (...args) => api.call(...args),
    createResource: (options = {}) => {
      const r = reactive({
        ...options,
        data: null,
        loading: false,
        submit: vi.fn(async () => ({})),
        fetch: vi.fn(),
        reload: vi.fn(async () => ({})),
      })
      api.created.push(r)
      return r
    },
  }
})

vi.mock('frappe-ui/frappe', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useTelemetry: () => ({ capture: api.capture }) }
})

vi.mock('@/stores/global', () => ({
  globalStore: () => ({ $dialog: api.dialog, $socket: { on: vi.fn(), off: vi.fn() } }),
}))

vi.mock('@/stores/users', () => ({
  usersStore: () => ({
    users: { data: { crmUsers: [] } },
    getUser: (e) => ({ name: e, email: e, full_name: e }),
    isManager: () => true,
  }),
}))

vi.mock('@/composables/settings', async () => {
  const { ref } = await import('vue')
  return {
    disableSettingModalOutsideClick: ref(false),
    activeSettingsPage: ref(''),
    isMobileView: ref(false),
  }
})

import AssignmentRuleView from '@/components/Settings/AssignmentRules/AssignmentRuleView.vue'
import { mountComponent } from '../helpers/mount'
import { ref, nextTick } from 'vue'
import { flushPromises } from '@vue/test-utils'

let step
let updateStep

const mount = (stepValue = { screen: 'view', data: null }) => {
  step = ref(stepValue)
  updateStep = vi.fn()
  api.created = []
  return mountComponent(AssignmentRuleView, {
    global: {
      stubs: {
        AssignmentRulesSection: true,
        AssignmentSchedule: true,
        AssigneeRules: true,
        ConfirmDialog: true,
        Popover: true,
        LoadingIndicator: true,
        ErrorMessage: true,
        FormLabel: true,
        Select: true,
        Switch: { props: ['modelValue', 'size'], template: '<button />' },
      },
      provide: { step, updateStep },
    },
  })
}

const getResource = () => api.created[0]

const serverRule = (over = {}) => ({
  name: 'Lead Rotation',
  document_type: 'CRM Lead',
  rule: 'Round Robin',
  priority: '2',
  users: [{ user: 'ada@x.com' }],
  disabled: 0,
  description: 'Rotate leads',
  assign_condition: '',
  assign_condition_json: '[]',
  unassign_condition: '',
  unassign_condition_json: '[]',
  assignment_days: [{ day: 'Monday' }, { day: 'Tuesday' }],
  ...over,
})

const fillValid = (wrapper) => {
  Object.assign(wrapper.vm.assignmentRuleData, {
    assignmentRuleName: 'Lead Rotation',
    description: 'Rotate leads',
    users: [{ user: 'ada@x.com' }],
    assignConditionJson: [['status', '=', 'Open']],
  })
}

describe('AssignmentRuleView', () => {
  beforeEach(() => {
    api.toast.success.mockClear()
    api.toast.error.mockClear()
    api.call.mockReset().mockResolvedValue({})
    api.capture.mockClear()
    // Easy to forget, and a leaked call from the previous test reads as the
    // component having done something it did not.
    api.dialog.mockClear()
  })

  describe('the default assignment days', () => {
    it('start as the whole week', () => {
      expect(mount().vm.assignmentRuleData.assignmentDays).toEqual([
        'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
      ])
    })

    it('are not shared between rules', async () => {
      // The day switches push/splice this array in place. It is declared inside
      // <script setup>, which runs per component instance, so each rule gets
      // its own — unlike the SLA equivalent, where the same list lived in a
      // module and editing one policy rewrote the defaults for the next.
      const first = mount()
      first.vm.assignmentRuleData.assignmentDays.splice(0, 2)
      // Let the deep watcher settle before unmounting, or Vue patches a tree
      // that is already gone and throws from inside its own scheduler.
      await nextTick()
      first.unmount()

      const second = mount()
      expect(second.vm.assignmentRuleData.assignmentDays).toHaveLength(7)
      expect(second.vm.assignmentRuleData.assignmentDays[0]).toBe('Monday')
    })
  })

  describe('loading an existing rule', () => {
    const load = (over = {}) => {
      const wrapper = mount({ screen: 'view', data: { name: 'Lead Rotation' } })
      getResource().onSuccess(serverRule(over))
      return wrapper
    }

    it('flattens the assignment days to plain names', () => {
      expect(load().vm.assignmentRuleData.assignmentDays).toEqual([
        'Monday',
        'Tuesday',
      ])
    })

    it('parses the stored conditions', () => {
      const wrapper = load({
        assign_condition_json: '[["status","=","Open"]]',
      })
      expect(wrapper.vm.assignmentRuleData.assignConditionJson).toEqual([
        ['status', '=', 'Open'],
      ])
    })

    it('treats a missing condition as none', () => {
      const wrapper = load({ assign_condition_json: null })
      expect(wrapper.vm.assignmentRuleData.assignConditionJson).toEqual([])
    })

    it('falls back to the old editor for a rule that predates the new one', () => {
      // An old rule has an expression string but no structured JSON; the new
      // builder would show it as empty and overwrite it on save.
      const wrapper = load({
        assign_condition: 'doc.status == "Open"',
        assign_condition_json: '[]',
      })
      expect(wrapper.vm.useNewUI).toBe(false)
      expect(wrapper.vm.isOldSla).toBe(true)
    })

    it('uses the new editor once structured conditions exist', () => {
      const wrapper = load({
        assign_condition: 'doc.status == "Open"',
        assign_condition_json: '[["status","=","Open"]]',
      })
      expect(wrapper.vm.useNewUI).toBe(true)
    })

    it('starts clean', async () => {
      const wrapper = load()
      await nextTick()
      expect(wrapper.vm.isDirty).toBe(false)
    })

    it('notices an edit', async () => {
      const wrapper = load()
      await nextTick()
      wrapper.vm.assignmentRuleData.description = 'Changed'
      await nextTick()
      expect(wrapper.vm.isDirty).toBe(true)
    })
  })

  describe('validation', () => {
    it('requires a name', () => {
      const wrapper = mount()
      wrapper.vm.assignmentRuleData.assignmentRuleName = ''
      wrapper.vm.validateAssignmentRule('assignmentRuleName')
      expect(wrapper.vm.assignmentRuleErrors.assignmentRuleName).toBe(
        'Name is required',
      )
    })

    it('requires a description', () => {
      const wrapper = mount()
      wrapper.vm.assignmentRuleData.description = ''
      wrapper.vm.validateAssignmentRule('description')
      expect(wrapper.vm.assignmentRuleErrors.description).toBe(
        'Description is required',
      )
    })

    it('requires at least one assignment day', () => {
      const wrapper = mount()
      wrapper.vm.assignmentRuleData.assignmentDays = []
      wrapper.vm.validateAssignmentRule('assignmentDays')
      expect(wrapper.vm.assignmentRuleErrors.assignmentDays).toBeTruthy()
    })

    it('accepts a filled-in name', () => {
      const wrapper = mount()
      wrapper.vm.assignmentRuleData.assignmentRuleName = 'Lead Rotation'
      wrapper.vm.validateAssignmentRule('assignmentRuleName')
      expect(wrapper.vm.assignmentRuleErrors.assignmentRuleName).toBe('')
    })

    it('accepts a filled-in description', () => {
      const wrapper = mount()
      wrapper.vm.assignmentRuleData.description = 'Rotate leads'
      wrapper.vm.validateAssignmentRule('description')
      expect(wrapper.vm.assignmentRuleErrors.description).toBe('')
    })

    // A rule saved elsewhere can come back with these fields null rather than
    // empty — the reset only guarantees '' for a rule created in this UI.
    // Validation runs on every keystroke, so a throw here freezes the form.
    it.each(['assignmentRuleName', 'description'])(
      'treats a null %s as missing rather than throwing',
      (field) => {
        const wrapper = mount()
        wrapper.vm.assignmentRuleData[field] = null
        expect(() => wrapper.vm.validateAssignmentRule(field)).not.toThrow()
        expect(wrapper.vm.assignmentRuleErrors[field]).toBeTruthy()
      },
    )

    it('treats a null condition tree as missing rather than throwing', () => {
      const wrapper = mount()
      wrapper.vm.assignmentRuleData.assignConditionJson = null
      expect(() =>
        wrapper.vm.validateAssignmentRule('assignCondition'),
      ).not.toThrow()
    })
  })

  describe('naming the record type', () => {
    it('says leads for a lead rule', () => {
      expect(mount().vm.documentType).toBe('leads')
    })

    it('says deals for a deal rule', async () => {
      const wrapper = mount()
      wrapper.vm.assignmentRuleData.documentType = 'CRM Deal'
      await nextTick()
      expect(wrapper.vm.documentType).toBe('deals')
    })
  })

  describe('creating', () => {
    it('sends the days as child rows', () => {
      // The doctype stores them as an Assignment Rule Day child table.
      const wrapper = mount({ screen: 'view', data: null })
      fillValid(wrapper)
      wrapper.vm.createAssignmentRule()
      const doc = api.created.at(-1).params.doc
      expect(doc.assignment_days[0]).toEqual({ day: 'Monday' })
    })

    it('sends both the expression and the JSON for the conditions', () => {
      const wrapper = mount({ screen: 'view', data: null })
      fillValid(wrapper)
      wrapper.vm.createAssignmentRule()
      const doc = api.created.at(-1).params.doc
      expect(typeof doc.assign_condition).toBe('string')
      expect(doc.assign_condition_json).toBe('[["status","=","Open"]]')
    })

    it('opens the created rule and confirms', async () => {
      const wrapper = mount({ screen: 'view', data: null })
      fillValid(wrapper)
      wrapper.vm.createAssignmentRule()
      api.created.at(-1).onSuccess({ name: 'Lead Rotation' })
      await flushPromises()
      expect(updateStep).toHaveBeenCalledWith('view', { name: 'Lead Rotation' })
      expect(api.toast.success).toHaveBeenCalledWith('Assignment Rule Created')
    })

    it('stops the spinner when creation fails', () => {
      const wrapper = mount({ screen: 'view', data: null })
      fillValid(wrapper)
      wrapper.vm.createAssignmentRule()
      expect(wrapper.vm.isLoading).toBe(true)
      api.created.at(-1).onError({})
      expect(wrapper.vm.isLoading).toBe(false)
    })
  })

  describe('updating', () => {
    const setup = () => {
      const wrapper = mount({ screen: 'view', data: { name: 'Lead Rotation' } })
      getResource().onSuccess(serverRule())
      return wrapper
    }

    it('reports success when it lands', async () => {
      const wrapper = setup()
      await wrapper.vm.updateAssignmentRule()
      await flushPromises()
      expect(api.toast.success).toHaveBeenCalledWith('Assignment Rule Updated')
    })

    it('does not claim success when the save was refused', async () => {
      // Regression: the .catch handled the error but did not stop the
      // function, so the success toast landed underneath it.
      const wrapper = setup()
      api.call.mockRejectedValue({ messages: ['Not permitted'] })
      await wrapper.vm.updateAssignmentRule()
      await flushPromises()
      expect(api.toast.error).toHaveBeenCalledWith('Not permitted')
      expect(api.toast.success).not.toHaveBeenCalled()
    })

    it('shows a plain Error message rather than burying it', async () => {
      const wrapper = setup()
      api.call.mockRejectedValue(new Error('offline'))
      await wrapper.vm.updateAssignmentRule()
      await flushPromises()
      expect(api.toast.error).toHaveBeenCalledWith('offline')
    })

    it('stops the spinner after a refused save', async () => {
      const wrapper = setup()
      api.call.mockRejectedValue({})
      await wrapper.vm.updateAssignmentRule()
      await flushPromises()
      expect(wrapper.vm.isLoading).toBe(false)
    })

    it('renames when the name changed', async () => {
      const wrapper = setup()
      wrapper.vm.assignmentRuleData.assignmentRuleName = 'Deal Rotation'
      await wrapper.vm.updateAssignmentRule()
      await flushPromises()
      const renameCall = api.call.mock.calls.find(
        (c) => c[0] === 'frappe.client.rename_doc',
      )
      expect(renameCall[1]).toMatchObject({
        old_name: 'Lead Rotation',
        new_name: 'Deal Rotation',
      })
    })

    it('stops after a refused rename rather than fetching a name that does not exist', async () => {
      const wrapper = setup()
      wrapper.vm.assignmentRuleData.assignmentRuleName = 'Deal Rotation'
      api.call.mockImplementation(async (method) => {
        if (method === 'frappe.client.rename_doc') {
          throw { messages: ['Duplicate name'] }
        }
        return {}
      })
      await wrapper.vm.updateAssignmentRule()
      await flushPromises()
      expect(api.toast.error).toHaveBeenCalledWith('Duplicate name')
      expect(api.toast.success).not.toHaveBeenCalled()
    })

    it('does not rename when the name is unchanged', async () => {
      const wrapper = setup()
      await wrapper.vm.updateAssignmentRule()
      await flushPromises()
      const renameCall = api.call.mock.calls.find(
        (c) => c[0] === 'frappe.client.rename_doc',
      )
      expect(renameCall).toBeUndefined()
    })
  })

  describe('priority levels', () => {
    it('offers five', () => {
      expect(mount().vm.priorityOptions.map((o) => o.label)).toEqual([
        'Low', 'Low-Medium', 'Medium', 'Medium-High', 'High',
      ])
    })
  })

  describe('leaving with unsaved edits', () => {
    it('asks before discarding them', async () => {
      const wrapper = mount({ screen: 'view', data: { name: 'Lead Rotation' } })
      getResource().onSuccess(serverRule())
      await nextTick()
      wrapper.vm.assignmentRuleData.description = 'Changed'
      await nextTick()
      wrapper.vm.goBack()
      expect(api.dialog).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Unsaved Changes' }),
      )
    })

    it('leaves straight away when nothing changed', async () => {
      const wrapper = mount({ screen: 'view', data: { name: 'Lead Rotation' } })
      getResource().onSuccess(serverRule())
      await nextTick()
      wrapper.vm.goBack()
      expect(api.dialog).not.toHaveBeenCalled()
      expect(updateStep).toHaveBeenCalledWith('list', null)
    })
  })
})
