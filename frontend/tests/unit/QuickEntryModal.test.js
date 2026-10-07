const api = vi.hoisted(() => ({ call: vi.fn(), capture: vi.fn(), resource: null }))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  return {
    ...actual,
    call: api.call,
    createResource: (options) => {
      api.resource = reactive({
        ...options,
        data: null,
        originalData: null,
        fetch: vi.fn(),
        reload: vi.fn(),
      })
      return api.resource
    },
  }
})

vi.mock('frappe-ui/frappe', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useTelemetry: () => ({ capture: api.capture }) }
})

import QuickEntryModal from '@/components/Modals/QuickEntryModal.vue'
import { mountComponent } from '../helpers/mount'
import { flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

const layout = (fields) => [
  { sections: [{ columns: [{ fields }] }] },
]

const mountModal = (props = {}) =>
  mountComponent(QuickEntryModal, {
    props: { modelValue: true, doctype: 'CRM Lead', ...props },
    global: {
      stubs: { Dialog: true, Badge: true, FieldLayout: true, FieldLayoutEditor: true },
    },
  })

describe('QuickEntryModal', () => {
  beforeEach(() => {
    api.call.mockReset().mockResolvedValue({})
    api.capture.mockClear()
  })

  describe('which layout it edits', () => {
    it('asks for the Quick Entry layout by default', () => {
      const wrapper = mountModal()
      expect(wrapper.vm.getParams()).toEqual({
        doctype: 'CRM Lead',
        type: 'Quick Entry',
      })
    })

    it('asks for the required-fields layout when told to', () => {
      const wrapper = mountModal({ onlyRequired: true })
      expect(wrapper.vm.getParams()).toEqual({
        doctype: 'CRM Lead',
        type: 'Required Fields',
      })
    })

    it('reloads with the right params on open', async () => {
      mountModal()
      await vi.waitFor(() => expect(api.resource.reload).toHaveBeenCalled())
      expect(api.resource.params).toEqual({
        doctype: 'CRM Lead',
        type: 'Quick Entry',
      })
    })
  })

  describe('tracking unsaved changes', () => {
    it('is clean once the layout loads', async () => {
      const wrapper = mountModal()
      const data = layout([{ fieldname: 'first_name' }])
      api.resource.onSuccess(data)
      api.resource.data = data
      await nextTick()
      expect(wrapper.vm.dirty).toBe(false)
    })

    it('notices a field being added', async () => {
      const wrapper = mountModal()
      const data = layout([{ fieldname: 'first_name' }])
      api.resource.onSuccess(data)
      api.resource.data = data
      await nextTick()
      api.resource.data[0].sections[0].columns[0].fields.push({ fieldname: 'email' })
      await nextTick()
      expect(wrapper.vm.dirty).toBe(true)
    })

    it('keeps the pristine copy separate from the edited one', async () => {
      // Editing tabs.data must not also change what it is compared against.
      const wrapper = mountModal()
      const data = layout([{ fieldname: 'first_name' }])
      api.resource.onSuccess(data)
      api.resource.data = data
      await nextTick()
      api.resource.data[0].sections[0].columns[0].fields.push({ fieldname: 'email' })
      await nextTick()
      expect(
        api.resource.originalData[0].sections[0].columns[0].fields,
      ).toHaveLength(1)
    })
  })

  describe('saving the layout', () => {
    const seed = async (wrapper, fields) => {
      const data = layout(fields)
      api.resource.onSuccess(data)
      api.resource.data = data
      await nextTick()
    }

    it('reduces each field to its fieldname', async () => {
      // The server stores an ordered list of names, not whole field objects.
      const wrapper = mountModal()
      await seed(wrapper, [
        { fieldname: 'first_name', label: 'First Name', fieldtype: 'Data' },
        { fieldname: 'email', label: 'Email', fieldtype: 'Data' },
      ])
      wrapper.vm.saveChanges()
      const sent = JSON.parse(api.call.mock.calls[0][1].layout)
      expect(sent[0].sections[0].columns[0].fields).toEqual([
        'first_name',
        'email',
      ])
    })

    it('does not mutate the live layout while serialising', async () => {
      const wrapper = mountModal()
      await seed(wrapper, [{ fieldname: 'first_name', label: 'First Name' }])
      wrapper.vm.saveChanges()
      expect(
        api.resource.data[0].sections[0].columns[0].fields[0],
      ).toMatchObject({ fieldname: 'first_name', label: 'First Name' })
    })

    it('sends the doctype and layout type', async () => {
      const wrapper = mountModal({ onlyRequired: true })
      await seed(wrapper, [{ fieldname: 'first_name' }])
      wrapper.vm.saveChanges()
      expect(api.call.mock.calls[0][1]).toMatchObject({
        doctype: 'CRM Lead',
        type: 'Required Fields',
      })
    })

    it('tolerates a tab with no sections', async () => {
      const wrapper = mountModal()
      api.resource.onSuccess([{ label: 'Empty tab' }])
      api.resource.data = [{ label: 'Empty tab' }]
      await nextTick()
      expect(() => wrapper.vm.saveChanges()).not.toThrow()
    })

    it('tolerates a column with no fields', async () => {
      const wrapper = mountModal()
      const data = [{ sections: [{ columns: [{ label: 'col' }] }] }]
      api.resource.onSuccess(data)
      api.resource.data = data
      await nextTick()
      expect(() => wrapper.vm.saveChanges()).not.toThrow()
    })

    it('tolerates a section with no columns', async () => {
      // Complements the tab and column guards; all three save modals now
      // guard every level of the tree.
      const wrapper = mountModal()
      const data = [{ sections: [{ name: 's' }] }]
      api.resource.onSuccess(data)
      api.resource.data = data
      await nextTick()
      expect(() => wrapper.vm.saveChanges()).not.toThrow()
    })

    it('closes and reports once saved', async () => {
      const wrapper = mountModal()
      await seed(wrapper, [{ fieldname: 'first_name' }])
      wrapper.vm.saveChanges()
      await flushPromises()
      expect(wrapper.vm.loading).toBe(false)
      expect(wrapper.emitted('update:modelValue').at(-1)[0]).toBe(false)
      expect(api.capture).toHaveBeenCalledWith('quick_entry_layout_builder', {
        doctype: 'CRM Lead',
      })
    })

    it('shows a busy state while in flight', async () => {
      const wrapper = mountModal()
      await seed(wrapper, [{ fieldname: 'first_name' }])
      wrapper.vm.saveChanges()
      expect(wrapper.vm.loading).toBe(true)
    })
  })
})
