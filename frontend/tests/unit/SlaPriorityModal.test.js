const api = vi.hoisted(() => ({ toast: null }))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  api.toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn() }
  return { ...actual, toast: api.toast }
})

import EditResponseResolutionModal from '@/components/Settings/Sla/EditResponseResolutionModal.vue'
import { slaData } from '@/components/Settings/Sla/utils'
import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'

const priority = (name, over = {}) => ({
  priority: name,
  first_response_time: 3600,
  default_priority: false,
  ...over,
})

const PRIORITY_OPTIONS = [
  { label: 'Low', value: 'Low' },
  { label: 'Medium', value: 'Medium' },
  { label: 'High', value: 'High' },
]

const mount = (target, priorities) => {
  slaData.value.priorities = priorities
  return mountComponent(EditResponseResolutionModal, {
    props: { modelValue: false, priority: target },
    global: {
      stubs: { Dialog: true, Checkbox: true, FormLabel: true, DurationInput: true },
      provide: { priorityOptions: PRIORITY_OPTIONS },
    },
  })
}

const open = async (wrapper) => {
  await wrapper.setProps({ modelValue: true })
  await nextTick()
}

describe('EditResponseResolutionModal', () => {
  beforeEach(() => {
    api.toast.error.mockClear()
  })

  describe('loading the priority', () => {
    it('copies the values into the form when opened', async () => {
      const high = priority('High', { first_response_time: 1800 })
      const wrapper = mount(high, [high])
      await open(wrapper)
      expect(wrapper.vm.priorityData).toMatchObject({
        priority: 'High',
        first_response_time: 1800,
      })
    })

    it('edits a copy, so cancelling changes nothing', async () => {
      const high = priority('High')
      const wrapper = mount(high, [high])
      await open(wrapper)
      wrapper.vm.priorityData.first_response_time = 60
      expect(high.first_response_time).toBe(3600)
    })

    it('reloads the original each time it is opened', async () => {
      const high = priority('High')
      const wrapper = mount(high, [high])
      await open(wrapper)
      wrapper.vm.priorityData.priority = 'Low'
      await wrapper.setProps({ modelValue: false })
      await open(wrapper)
      expect(wrapper.vm.priorityData.priority).toBe('High')
    })
  })

  describe('validation', () => {
    it('needs a priority', async () => {
      const high = priority('High')
      const wrapper = mount(high, [high])
      await open(wrapper)
      wrapper.vm.priorityData.priority = ''
      expect(wrapper.vm.validateForm()).toBe(false)
      expect(api.toast.error).toHaveBeenCalledWith('Please select a Priority')
    })

    it('needs a response time above zero', async () => {
      const high = priority('High')
      const wrapper = mount(high, [high])
      await open(wrapper)
      wrapper.vm.priorityData.first_response_time = 0
      expect(wrapper.vm.validateForm()).toBe(false)
      expect(api.toast.error).toHaveBeenCalledWith('Response Time is required')
    })

    it('rejects a negative response time', async () => {
      const high = priority('High')
      const wrapper = mount(high, [high])
      await open(wrapper)
      wrapper.vm.priorityData.first_response_time = -60
      expect(wrapper.vm.validateForm()).toBe(false)
    })

    it('rejects a response time that is not a number', async () => {
      const high = priority('High')
      const wrapper = mount(high, [high])
      await open(wrapper)
      wrapper.vm.priorityData.first_response_time = ''
      expect(wrapper.vm.validateForm()).toBe(false)
    })

    it('accepts a positive response time', async () => {
      const high = priority('High')
      const wrapper = mount(high, [high])
      await open(wrapper)
      expect(wrapper.vm.validateForm()).toBe(true)
    })
  })

  describe('the default priority', () => {
    it('clears the flag on every other priority', async () => {
      // Exactly one priority may be the default; two would make the SLA
      // ambiguous about which applies to an unclassified record.
      const high = priority('High')
      const low = priority('Low', { default_priority: true })
      const wrapper = mount(high, [high, low])
      await open(wrapper)
      wrapper.vm.priorityData.default_priority = true
      wrapper.vm.validateForm()
      expect(low.default_priority).toBe(false)
    })

    it('leaves the others alone when this one is not the default', async () => {
      const high = priority('High')
      const low = priority('Low', { default_priority: true })
      const wrapper = mount(high, [high, low])
      await open(wrapper)
      wrapper.vm.validateForm()
      expect(low.default_priority).toBe(true)
    })
  })

  describe('saving', () => {
    it('writes the edits back onto the row', async () => {
      const high = priority('High')
      const wrapper = mount(high, [high])
      await open(wrapper)
      wrapper.vm.priorityData.first_response_time = 900
      wrapper.vm.onSave()
      expect(high.first_response_time).toBe(900)
    })

    it('closes afterwards', async () => {
      const high = priority('High')
      const wrapper = mount(high, [high])
      await open(wrapper)
      wrapper.vm.onSave()
      expect(wrapper.emitted('update:modelValue').at(-1)).toEqual([false])
    })

    it('stays open when the form is invalid', async () => {
      const high = priority('High')
      const wrapper = mount(high, [high])
      await open(wrapper)
      wrapper.vm.priorityData.priority = ''
      wrapper.vm.onSave()
      expect(high.priority).toBe('High')
    })
  })

  describe('deleting', () => {
    const evt = () => ({ preventDefault: vi.fn() })

    it('asks for confirmation first', async () => {
      const high = priority('High')
      const list = [high, priority('Low')]
      const wrapper = mount(high, list)
      await open(wrapper)
      wrapper.vm.deleteItem(evt())
      expect(wrapper.vm.isConfirmingDelete).toBe(true)
      expect(list).toHaveLength(2)
    })

    it('removes it on the second press', async () => {
      const high = priority('High')
      const list = [high, priority('Low')]
      const wrapper = mount(high, list)
      await open(wrapper)
      wrapper.vm.deleteItem(evt())
      wrapper.vm.deleteItem(evt())
      expect(list.map((p) => p.priority)).toEqual(['Low'])
    })

    it('does not submit the surrounding form', async () => {
      const high = priority('High')
      const wrapper = mount(high, [high])
      await open(wrapper)
      const e = evt()
      wrapper.vm.deleteItem(e)
      expect(e.preventDefault).toHaveBeenCalled()
    })

    it('forgets a primed confirmation when reopened', async () => {
      // Regression: nothing cleared this flag, and the Delete button's label is
      // driven by it — so reopening the dialog on a different priority showed a
      // button already reading "Confirm Delete", and one press removed it.
      // The dropdown-based lists escape this because their trigger resets it.
      const high = priority('High')
      const low = priority('Low')
      const list = [high, low]
      const wrapper = mount(high, list)
      await open(wrapper)
      wrapper.vm.deleteItem(evt())
      expect(wrapper.vm.isConfirmingDelete).toBe(true)

      await wrapper.setProps({ modelValue: false, priority: low })
      await open(wrapper)

      expect(wrapper.vm.isConfirmingDelete).toBe(false)
      wrapper.vm.deleteItem(evt())
      expect(list).toHaveLength(2)
    })
  })
})
