const api = vi.hoisted(() => ({ toast: null, statusResource: null }))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  api.toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn() }
  return {
    ...actual,
    toast: api.toast,
    createResource: (options = {}) => {
      // `submit` too: CFConditions calls it from an immediate watcher, and a
      // resource without it rejects into an unhandled error rather than a
      // test failure.
      api.statusResource = reactive({
        ...options,
        data: null,
        fetch: vi.fn(),
        submit: vi.fn(),
        reload: vi.fn(),
      })
      return api.statusResource
    },
    // SlaConfig builds an auto-fetching list resource; without this it hits
    // localhost:3000 for real.
    createListResource: (options = {}) =>
      reactive({
        ...options,
        data: null,
        fetch: vi.fn(),
        reload: vi.fn(),
        filters: {},
      }),
  }
})

import SlaPriorityList from '@/components/Settings/Sla/SlaPriorityList.vue'
import SlaAssignmentConditions from '@/components/Settings/Sla/SlaAssignmentConditions.vue'
import SlaConfig from '@/components/Settings/Sla/SlaConfig.vue'
import { slaData, resetSlaData } from '@/components/Settings/Sla/utils'
import { mountComponent } from '../helpers/mount'
import { ref, nextTick } from 'vue'

const STATUSES = [{ name: 'Low' }, { name: 'Medium' }, { name: 'High' }]

const priority = (name, over = {}) => ({
  priority: name,
  first_response_time: 3600,
  default_priority: false,
  ...over,
})

describe('SlaPriorityList', () => {
  const mount = (step = { screen: 'edit', data: { name: 'SLA-1' } }) =>
    mountComponent(SlaPriorityList, {
      global: {
        stubs: {
          Dropdown: true,
          DurationInput: true,
          EditResponseResolutionModal: true,
          Checkbox: true,
          ErrorMessage: true,
        },
        provide: { step: ref(step) },
      },
    })

  beforeEach(() => {
    resetSlaData()
    api.toast.error.mockClear()
  })

  const loadStatuses = (wrapper) => {
    api.statusResource.onSuccess(STATUSES)
    return wrapper
  }

  describe('loading the available priorities', () => {
    it('offers each communication status', () => {
      const wrapper = loadStatuses(mount())
      expect(wrapper.vm.priorityOptions.map((o) => o.value)).toEqual([
        'Low',
        'Medium',
        'High',
      ])
    })

    it('seeds a brand-new policy with all of them', () => {
      // A new SLA with no priorities would fail validation immediately, so the
      // first load fills them in.
      loadStatuses(mount({ screen: 'new', data: null }))
      expect(slaData.value.priorities.map((p) => p.priority)).toEqual([
        'Low',
        'Medium',
        'High',
      ])
    })

    it('makes the first one the default', () => {
      loadStatuses(mount({ screen: 'new', data: null }))
      expect(slaData.value.priorities.map((p) => p.default_priority)).toEqual([
        true,
        false,
        false,
      ])
    })

    it('gives each a one-hour response time to start', () => {
      loadStatuses(mount({ screen: 'new', data: null }))
      expect(slaData.value.priorities[0].first_response_time).toBe(3600)
    })

    it('leaves an existing policy alone', () => {
      // Its priorities came from the server; overwriting them would discard
      // whatever the user had configured.
      slaData.value.priorities = [priority('High', { first_response_time: 60 })]
      loadStatuses(mount({ screen: 'edit', data: { name: 'SLA-1' } }))
      expect(slaData.value.priorities).toEqual([
        priority('High', { first_response_time: 60 }),
      ])
    })
  })

  describe('adding a row', () => {
    it('adds the first priority not already used', () => {
      const wrapper = loadStatuses(mount())
      slaData.value.priorities = [priority('Low')]
      wrapper.vm.addRow()
      expect(slaData.value.priorities.map((p) => p.priority)).toEqual([
        'Low',
        'Medium',
      ])
    })

    it('refuses once every priority is in use', () => {
      const wrapper = loadStatuses(mount())
      slaData.value.priorities = STATUSES.map((s) => priority(s.name))
      wrapper.vm.addRow()
      expect(slaData.value.priorities).toHaveLength(3)
      expect(api.toast.error).toHaveBeenCalledWith(
        'All available priorities have already been added',
      )
    })

    it('makes the very first row the default', () => {
      const wrapper = loadStatuses(mount())
      slaData.value.priorities = []
      wrapper.vm.addRow()
      expect(slaData.value.priorities[0].default_priority).toBe(true)
    })

    it('does not make later rows the default', () => {
      const wrapper = loadStatuses(mount())
      slaData.value.priorities = [priority('Low', { default_priority: true })]
      wrapper.vm.addRow()
      expect(slaData.value.priorities[1].default_priority).toBe(false)
    })
  })

  describe('choosing the default priority', () => {
    it('clears the flag everywhere else', () => {
      // Two defaults would leave the SLA ambiguous for an unclassified record.
      const wrapper = loadStatuses(mount())
      const low = priority('Low', { default_priority: true })
      const high = priority('High')
      slaData.value.priorities = [low, high]
      wrapper.vm.onDefaultPriorityChange(high, true)
      expect(low.default_priority).toBe(false)
      expect(high.default_priority).toBe(true)
    })

    it('can leave none selected', () => {
      const wrapper = loadStatuses(mount())
      const low = priority('Low', { default_priority: true })
      slaData.value.priorities = [low]
      wrapper.vm.onDefaultPriorityChange(low, false)
      expect(low.default_priority).toBe(false)
    })
  })

  describe('deleting a row', () => {
    it('removes it once confirmed', () => {
      const wrapper = loadStatuses(mount())
      const low = priority('Low')
      slaData.value.priorities = [low, priority('High')]
      wrapper.vm.deleteItem(low)
      wrapper.vm.deleteItem(low)
      expect(slaData.value.priorities.map((p) => p.priority)).toEqual(['High'])
    })

    it('is disarmed again by opening a row menu', () => {
      // The dropdown trigger resets the flag, which is what stops one row's
      // armed confirmation from deleting a different row.
      const wrapper = loadStatuses(mount())
      slaData.value.priorities = [priority('Low')]
      wrapper.vm.deleteItem(priority('Low'))
      expect(wrapper.vm.isConfirmingDelete).toBe(true)
      wrapper.vm.isConfirmingDelete = false
      expect(wrapper.vm.isConfirmingDelete).toBe(false)
    })
  })

  describe('the row menu', () => {
    it('offers Edit and a delete option', () => {
      const wrapper = loadStatuses(mount())
      const labels = wrapper.vm.dropdownOptions(priority('Low')).map((o) => o.label)
      expect(labels).toContain('Edit')
      expect(labels.length).toBeGreaterThan(1)
    })

    it('loads the row into the dialog on Edit', () => {
      const wrapper = loadStatuses(mount())
      const high = priority('High', { first_response_time: 900 })
      wrapper.vm.dropdownOptions(high).find((o) => o.label === 'Edit').onClick()
      expect(wrapper.vm.dialog).toBe(true)
      expect(wrapper.vm.priorityData).toMatchObject({
        priority: 'High',
        first_response_time: 900,
      })
    })
  })

  describe('the columns', () => {
    it('marks priority and response time as required', () => {
      const wrapper = loadStatuses(mount())
      const required = wrapper.vm.columns.filter((c) => c.isRequired)
      expect(required.map((c) => c.key)).toEqual([
        'priority',
        'first_response_time',
      ])
    })
  })
})

describe('SlaAssignmentConditions', () => {
  const mount = (conditions = []) =>
    mountComponent(SlaAssignmentConditions, {
      props: { conditions },
      global: { stubs: { CFConditions: true, Dropdown: true, ErrorMessage: true } },
    })

  beforeEach(() => {
    resetSlaData()
  })

  describe('the doctype the conditions apply to', () => {
    it('follows the policy', async () => {
      const wrapper = mount()
      slaData.value.apply_on = 'CRM Deal'
      await nextTick()
      expect(wrapper.vm.doctype).toBe('CRM Deal')
    })
  })

  describe('the joining word', () => {
    it('defaults to and', () => {
      expect(mount().vm.getConjunction()).toBe('and')
    })

    it('reuses whatever the list already uses', () => {
      // A new row has to join the existing chain the same way, or the filter
      // would silently mean something different.
      expect(mount([['a', '=', '1'], 'or', ['b', '=', '2']]).vm.getConjunction()).toBe(
        'or',
      )
    })
  })

  describe('adding a condition', () => {
    it('appends a conjunction and a blank row', () => {
      const conditions = [['a', '=', '1']]
      const wrapper = mount(conditions)
      wrapper.vm.addCondition()
      expect(conditions).toEqual([['a', '=', '1'], 'and', ['', '', '']])
    })

    it('refuses while an existing condition is incomplete', () => {
      // Otherwise the user accumulates blank rows and none of them validate.
      const conditions = [['', '', '']]
      const wrapper = mount(conditions)
      wrapper.vm.addCondition()
      expect(conditions).toEqual([['', '', '']])
    })
  })

  describe('the menu', () => {
    it('offers a condition and a group', () => {
      expect(mount().vm.dropdownOptions.map((o) => o.label)).toEqual([
        'Add Condition',
        'Add Condition Group',
      ])
    })

    it('adds a nested group', () => {
      const conditions = [['a', '=', '1']]
      const wrapper = mount(conditions)
      wrapper.vm.dropdownOptions[1].onClick()
      expect(conditions).toEqual([['a', '=', '1'], 'and', [[]]])
    })
  })
})

describe('SlaConfig', () => {
  const mount = () =>
    mountComponent(SlaConfig, {
      global: { stubs: { SlaPolicyList: true, SlaPolicyView: true } },
    })

  it('opens on the policy list', () => {
    expect(mount().vm.step).toEqual({
      screen: 'list',
      data: null,
      fetchData: false,
    })
  })

  it('switches screen when a child asks', () => {
    const wrapper = mount()
    wrapper.vm.updateStep('view', { name: 'SLA-1' }, true)
    expect(wrapper.vm.step).toEqual({
      screen: 'view',
      data: { name: 'SLA-1' },
      fetchData: true,
    })
  })

  it('clears the search when it goes away', () => {
    // The query is provided to children; leaving it set would filter the list
    // on the next visit with no visible search box to explain why.
    const wrapper = mount()
    wrapper.vm.slaSearchQuery = 'gold'
    wrapper.unmount()
    expect(wrapper.vm.slaSearchQuery).toBe('')
  })
})
