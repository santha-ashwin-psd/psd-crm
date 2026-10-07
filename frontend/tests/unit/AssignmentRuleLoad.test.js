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
  globalStore: () => ({
    $dialog: api.dialog,
    $socket: { on: vi.fn(), off: vi.fn() },
  }),
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
import { ref } from 'vue'

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

const loadResource = () => api.created[0]

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

describe('AssignmentRuleView — loading, resetting and leaving', () => {
  beforeEach(() => {
    api.call.mockReset().mockResolvedValue({})
    for (const t of Object.values(api.toast)) t.mockClear()
    api.capture.mockClear()
    api.dialog.mockClear()
  })

  describe('opening an existing rule', () => {
    const opened = (over = {}) => {
      const wrapper = mount({ screen: 'view', data: { name: 'Lead Rotation' } })
      loadResource().onSuccess(serverRule(over))
      return wrapper
    }

    it('asks the server for the rule named in the step', () => {
      mount({ screen: 'view', data: { name: 'Lead Rotation' } })
      expect(loadResource().params).toEqual({
        doctype: 'Assignment Rule',
        name: 'Lead Rotation',
      })
      expect(loadResource().auto).toBe(true)
    })

    it('fetches nothing when creating a new rule', () => {
      mount({ screen: 'view', data: null })
      expect(loadResource().auto).toBe(false)
    })

    it('reads the stored rule into the form', () => {
      const d = opened().vm.assignmentRuleData
      expect(d).toMatchObject({
        assignmentRuleName: 'Lead Rotation',
        documentType: 'CRM Lead',
        rule: 'Round Robin',
        description: 'Rotate leads',
      })
    })

    it('flattens the assignment days out of their child rows', () => {
      expect(opened().vm.assignmentRuleData.assignmentDays).toEqual([
        'Monday',
        'Tuesday',
      ])
    })

    it('parses the stored condition trees', () => {
      const d = opened({
        assign_condition_json: '[["status","==","Open"]]',
      }).vm.assignmentRuleData
      expect(d.assignConditionJson).toEqual([['status', '==', 'Open']])
    })

    it('treats a rule with no stored tree as having no conditions', () => {
      const d = opened({
        assign_condition_json: null,
        unassign_condition_json: '',
      }).vm.assignmentRuleData
      expect(d.assignConditionJson).toEqual([])
      expect(d.unassignConditionJson).toEqual([])
    })

    it('remembers what was loaded so changes can be detected', () => {
      const wrapper = opened()
      expect(JSON.parse(wrapper.vm.initialData).assignmentRuleName).toBe(
        'Lead Rotation',
      )
    })

    it('starts clean', () => {
      expect(opened().vm.isDirty).toBe(false)
    })
  })

  describe('a rule built outside this UI', () => {
    const opened = (over) => {
      const wrapper = mount({ screen: 'view', data: { name: 'X' } })
      loadResource().onSuccess(serverRule(over))
      return wrapper
    }

    it('falls back to the read-only view when there is a condition but no tree', () => {
      // A rule written in the desk has an expression the visual builder cannot
      // represent; editing it here would silently rewrite it.
      const wrapper = opened({
        assign_condition: 'doc.status == "Open"',
        assign_condition_json: '[]',
      })
      expect(wrapper.vm.useNewUI).toBe(false)
      expect(wrapper.vm.isOldSla).toBe(true)
    })

    it('uses the builder when the tree is there', () => {
      const wrapper = opened({
        assign_condition: 'doc.status == "Open"',
        assign_condition_json: '[["status","==","Open"]]',
      })
      expect(wrapper.vm.useNewUI).toBe(true)
      expect(wrapper.vm.isOldSla).toBe(false)
    })

    it('uses the builder for a rule with no conditions at all', () => {
      const wrapper = opened({ assign_condition: '', assign_condition_json: '[]' })
      expect(wrapper.vm.useNewUI).toBe(true)
    })

    it('offers a link to the desk record', () => {
      const wrapper = mount({ screen: 'view', data: { name: 'Lead Rotation' } })
      expect(wrapper.vm.deskUrl).toContain('/app/assignment-rule/Lead Rotation')
    })
  })

  describe('a new rule', () => {
    it('starts on every day of the week', () => {
      // A rule that assigns on no days assigns nothing.
      expect(mount().vm.assignmentRuleData.assignmentDays).toEqual([
        'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday',
        'Saturday', 'Sunday',
      ])
    })

    it('starts on round robin against leads', () => {
      const d = mount().vm.assignmentRuleData
      expect(d.rule).toBe('Round Robin')
      expect(d.documentType).toBe('CRM Lead')
      expect(d.priority).toBe(1)
      expect(d.disabled).toBe(false)
    })

    it('starts with no users and no conditions', () => {
      const d = mount().vm.assignmentRuleData
      expect(d.users).toEqual([])
      expect(d.assignConditionJson).toEqual([])
      expect(d.assignCondition).toBe('')
    })
  })

  describe('clearing the form', () => {
    it('puts every field back', () => {
      const wrapper = mount()
      Object.assign(wrapper.vm.assignmentRuleData, {
        assignmentRuleName: 'Something',
        rule: 'Load Balancing',
        priority: 5,
        users: ['ada@x.com'],
      })
      wrapper.vm.resetAssignmentRuleData()
      expect(wrapper.vm.assignmentRuleData).toMatchObject({
        assignmentRuleName: '',
        rule: 'Round Robin',
        priority: 1,
        users: [],
      })
    })

    it('clears every error without dropping the keys', () => {
      // The template reads each key, so removing them would break the bindings.
      const wrapper = mount()
      wrapper.vm.assignmentRuleErrors.assignmentRuleName = 'Name is required'
      wrapper.vm.assignmentRuleErrors.users = 'Pick someone'
      const keys = Object.keys(wrapper.vm.assignmentRuleErrors)
      wrapper.vm.resetAssignmentRuleErrors()
      expect(Object.keys(wrapper.vm.assignmentRuleErrors)).toEqual(keys)
      expect(Object.values(wrapper.vm.assignmentRuleErrors).every((v) => v === '')).toBe(
        true,
      )
    })
  })

  describe('leaving the page with unsaved work', () => {
    it('warns the browser when something has changed', () => {
      const wrapper = mount()
      wrapper.vm.isDirty = true
      const event = { preventDefault: vi.fn(), returnValue: false }
      wrapper.vm.beforeUnloadHandler(event)
      expect(event.preventDefault).toHaveBeenCalled()
      expect(event.returnValue).toBe(true)
    })

    it('says nothing when there is nothing to lose', () => {
      const wrapper = mount()
      wrapper.vm.isDirty = false
      const event = { preventDefault: vi.fn(), returnValue: false }
      wrapper.vm.beforeUnloadHandler(event)
      expect(event.preventDefault).not.toHaveBeenCalled()
    })

    it('stops listening once the page is gone', () => {
      const remove = vi.spyOn(window, 'removeEventListener')
      const wrapper = mount()
      wrapper.unmount()
      expect(remove).toHaveBeenCalledWith('beforeunload', expect.any(Function))
      remove.mockRestore()
    })

    it('removes the very listener it added', () => {
      const added = []
      const removed = []
      const a = vi.spyOn(window, 'addEventListener').mockImplementation((t, h) =>
        added.push([t, h]),
      )
      const r = vi.spyOn(window, 'removeEventListener').mockImplementation((t, h) =>
        removed.push([t, h]),
      )
      const wrapper = mount()
      wrapper.unmount()
      const beforeUnload = added.filter(([t]) => t === 'beforeunload')
      expect(beforeUnload).toHaveLength(1)
      expect(removed).toContainEqual(beforeUnload[0])
      a.mockRestore()
      r.mockRestore()
    })
  })
})
