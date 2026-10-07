const api = vi.hoisted(() => ({ toast: null, capture: vi.fn(), created: [] }))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  api.toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn() }
  return {
    ...actual,
    toast: api.toast,
    createResource: (options = {}) => {
      const r = reactive({ ...options, data: null, submit: vi.fn(), fetch: vi.fn(), reload: vi.fn() })
      api.created.push(r)
      return r
    },
  }
})

vi.mock('frappe-ui/frappe', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useTelemetry: () => ({ capture: api.capture }) }
})

import AssignmentRuleListItem from '@/components/Settings/AssignmentRules/AssignmentRuleListItem.vue'
import AssignmentRulesSection from '@/components/Settings/AssignmentRules/AssignmentRulesSection.vue'
import AssignmentRules from '@/components/Settings/AssignmentRules/AssignmentRules.vue'
import AssignmentRulePage from '@/components/Settings/AssignmentRules/AssignmentRulePage.vue'
import { mountComponent } from '../helpers/mount'
import { reactive, ref } from 'vue'

const rule = (over = {}) => ({
  name: 'Lead Rotation',
  priority: '2',
  disabled: 0,
  users_exists: 1,
  document_type: 'CRM Lead',
  ...over,
})

const STUBS = {
  Dropdown: true, Dialog: true, EmptyState: true, SkeletonLoader: true,
  CFConditions: true, ErrorMessage: true, SettingsIcon2: true,
  AssignmentRuleListItem: true, AssignmentRulesList: true,
  AssignmentRules: true, AssignmentRuleView: true,
  Switch: { props: ['modelValue', 'size'], template: '<button class="local-switch" />' },
}

let rulesList
let updateStep

describe('AssignmentRuleListItem', () => {
  const mount = (data = rule()) => {
    rulesList = reactive({ data: [], reload: vi.fn(), loading: false })
    updateStep = vi.fn()
    api.created = []
    return mountComponent(AssignmentRuleListItem, {
      props: { data },
      global: {
        stubs: STUBS,
        provide: { assignmentRulesList: rulesList, updateStep },
      },
    })
  }

  const last = () => api.created.at(-1)

  beforeEach(() => {
    api.toast.success.mockClear()
    api.toast.error.mockClear()
    api.capture.mockClear()
  })

  describe('priority', () => {
    it('offers five levels', () => {
      expect(mount().vm.priorityOptions.map((o) => o.value)).toEqual([
        '0', '1', '2', '3', '4',
      ])
    })

    it('saves the chosen level', () => {
      const wrapper = mount()
      wrapper.vm.localData.priority = '4'
      wrapper.vm.onPriorityChange()
      expect(last().params).toEqual({
        doctype: 'Assignment Rule',
        name: 'Lead Rotation',
        fieldname: 'priority',
        value: '4',
      })
    })

    it('refreshes the list once saved', () => {
      const wrapper = mount()
      wrapper.vm.onPriorityChange()
      last().onSuccess()
      expect(rulesList.reload).toHaveBeenCalled()
      expect(api.toast.success).toHaveBeenCalledWith(
        'Assignment Rule priority Updated',
      )
    })
  })

  describe('enabling and disabling', () => {
    it('sends the opposite of the current state', () => {
      const wrapper = mount(rule({ disabled: 0 }))
      wrapper.vm.onToggle()
      expect(last().params.fieldname).toBe('disabled')
      expect(last().params.value).toBe(true)
    })

    it('refuses to enable a rule with nobody in it', () => {
      // An enabled rule with no assignees would silently route nothing.
      const wrapper = mount(rule({ disabled: 1, users_exists: 0 }))
      const before = api.created.length
      wrapper.vm.onToggle()
      expect(api.created.length).toBe(before)
      expect(api.toast.error).toHaveBeenCalledWith(
        'Cannot enable rule without adding users in it',
      )
    })

    it('still allows disabling a rule with nobody in it', () => {
      const wrapper = mount(rule({ disabled: 0, users_exists: 0 }))
      wrapper.vm.onToggle()
      expect(last().params.fieldname).toBe('disabled')
    })

    it('records which way it went', () => {
      const wrapper = mount(rule({ disabled: 1 }))
      wrapper.vm.onToggle()
      expect(api.capture).toHaveBeenCalledWith('assignment_rule_toggled', {
        enabled: true,
      })
    })

    it('names the field status in the confirmation', () => {
      // "disabled Updated" would read as though it had been disabled.
      const wrapper = mount()
      wrapper.vm.onToggle()
      last().onSuccess()
      expect(api.toast.success).toHaveBeenCalledWith(
        'Assignment Rule status Updated',
      )
    })
  })

  describe('deleting', () => {
    it('deletes the rule', () => {
      const wrapper = mount()
      wrapper.vm.deleteAssignmentRule()
      expect(last().params).toEqual({
        doctype: 'Assignment Rule',
        name: 'Lead Rotation',
      })
    })

    it('refreshes and disarms afterwards', () => {
      const wrapper = mount()
      wrapper.vm.isConfirmingDelete = true
      wrapper.vm.deleteAssignmentRule()
      last().onSuccess()
      expect(rulesList.reload).toHaveBeenCalled()
      expect(wrapper.vm.isConfirmingDelete).toBe(false)
      expect(api.toast.success).toHaveBeenCalledWith('Assignment Rule Deleted')
    })
  })

  describe('duplicating', () => {
    it('proposes a name marked as a copy', () => {
      const wrapper = mount()
      wrapper.vm.dropdownOptions
        .find((o) => o.label === 'Duplicate')
        .onClick()
      expect(wrapper.vm.duplicateDialog).toEqual({
        show: true,
        name: 'Lead Rotation (Copy)',
      })
    })

    it('sends the original and the new name', () => {
      const wrapper = mount()
      wrapper.vm.duplicateDialog = { show: true, name: 'Lead Rotation v2' }
      wrapper.vm.duplicate()
      expect(last().params).toEqual({
        docname: 'Lead Rotation',
        new_name: 'Lead Rotation v2',
      })
    })

    it('opens the copy once it exists', () => {
      const wrapper = mount()
      wrapper.vm.duplicateDialog = { show: true, name: 'Lead Rotation v2' }
      wrapper.vm.duplicate()
      last().onSuccess({ name: 'Lead Rotation v2' })
      expect(updateStep).toHaveBeenCalledWith('view', {
        name: 'Lead Rotation v2',
      })
      expect(wrapper.vm.duplicateDialog).toEqual({ show: false, name: '' })
    })
  })

  describe('staying in step with the list', () => {
    it('picks up a change to the underlying rule', async () => {
      // The list reloads after every write; the row must follow rather than
      // keep showing the value it was mounted with.
      const wrapper = mount(rule({ priority: '2' }))
      await wrapper.setProps({ data: rule({ priority: '4' }) })
      expect(wrapper.vm.localData.priority).toBe('4')
    })
  })
})

describe('AssignmentRulesSection', () => {
  const mount = (conditions = [], name = 'assign_condition') =>
    mountComponent(AssignmentRulesSection, {
      props: { conditions, name, doctype: 'CRM Lead' },
      global: {
        stubs: STUBS,
        provide: { validateAssignmentRule: vi.fn() },
      },
    })

  it('defaults the joining word to and', () => {
    expect(mount().vm.getConjunction()).toBe('and')
  })

  it('reuses the joining word already in the list', () => {
    expect(mount([['a', '=', '1'], 'or', ['b', '=', '2']]).vm.getConjunction()).toBe(
      'or',
    )
  })

  it('appends a conjunction and a blank row', () => {
    const conditions = [['a', '=', '1']]
    mount(conditions).vm.addCondition()
    expect(conditions).toEqual([['a', '=', '1'], 'and', ['', '', '']])
  })

  it('refuses while an existing condition is incomplete', () => {
    const conditions = [['', '', '']]
    mount(conditions).vm.addCondition()
    expect(conditions).toEqual([['', '', '']])
  })

  it('adds a nested group', () => {
    const conditions = [['a', '=', '1']]
    mount(conditions).vm.dropdownOptions[1].onClick()
    expect(conditions).toEqual([['a', '=', '1'], 'and', [[]]])
  })

  it('copes with no conditions passed at all', () => {
    expect(() => mount(undefined)).not.toThrow()
  })
})

describe('AssignmentRules', () => {
  const mount = () => {
    updateStep = vi.fn()
    api.created = []
    return mountComponent(AssignmentRules, {
      global: { stubs: STUBS, provide: { updateStep } },
    })
  }

  it('fetches the rule list on arrival', () => {
    mount()
    expect(api.created[0].url).toBe(
      'xbr_crm.api.assignment_rule.get_assignment_rules_list',
    )
    expect(api.created[0].auto).toBe(true)
  })

  it('opens the editor with no record for a new rule', () => {
    mount().vm.goToNew()
    expect(updateStep).toHaveBeenCalledWith('view', null)
  })
})

describe('AssignmentRulePage', () => {
  const mount = () =>
    mountComponent(AssignmentRulePage, { global: { stubs: STUBS } })

  it('opens on the list', () => {
    expect(mount().vm.step).toEqual({ screen: 'list', data: null })
  })

  it('switches screen when a child asks', () => {
    const wrapper = mount()
    wrapper.vm.updateStep('view', { name: 'Lead Rotation' })
    expect(wrapper.vm.step).toEqual({
      screen: 'view',
      data: { name: 'Lead Rotation' },
    })
  })
})
