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

import DataFieldsModal from '@/components/Modals/DataFieldsModal.vue'
import { mountComponent } from '../helpers/mount'
import { flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

const layout = (fields) => [{ sections: [{ columns: [{ fields }] }] }]

const mountModal = (props = {}) =>
  mountComponent(DataFieldsModal, {
    props: { modelValue: true, doctype: 'CRM Lead', ...props },
    global: {
      stubs: { Dialog: true, Badge: true, FieldLayout: true, FieldLayoutEditor: true },
    },
  })

const seed = async (data) => {
  api.resource.onSuccess(data)
  api.resource.data = data
  await nextTick()
}

describe('DataFieldsModal', () => {
  beforeEach(() => {
    api.call.mockReset().mockResolvedValue({})
    api.capture.mockClear()
  })

  describe('which layout it edits', () => {
    it('asks for the Data Fields layout', () => {
      expect(mountModal().vm.getParams()).toEqual({
        doctype: 'CRM Lead',
        type: 'Data Fields',
      })
    })

    it('reloads on open with those params', async () => {
      mountModal({ doctype: 'CRM Deal' })
      await vi.waitFor(() => expect(api.resource.reload).toHaveBeenCalled())
      expect(api.resource.params).toEqual({
        doctype: 'CRM Deal',
        type: 'Data Fields',
      })
    })
  })

  describe('tracking unsaved changes', () => {
    it('is clean once loaded', async () => {
      const wrapper = mountModal()
      await seed(layout([{ fieldname: 'first_name' }]))
      expect(wrapper.vm.dirty).toBe(false)
    })

    it('notices a field being added', async () => {
      const wrapper = mountModal()
      await seed(layout([{ fieldname: 'first_name' }]))
      api.resource.data[0].sections[0].columns[0].fields.push({
        fieldname: 'email',
      })
      await nextTick()
      expect(wrapper.vm.dirty).toBe(true)
    })
  })

  describe('saving the layout', () => {
    it('reduces each field to its fieldname', async () => {
      const wrapper = mountModal()
      await seed(
        layout([
          { fieldname: 'first_name', label: 'First Name' },
          { fieldname: 'email', label: 'Email' },
        ]),
      )
      wrapper.vm.saveChanges()
      const sent = JSON.parse(api.call.mock.calls[0][1].layout)
      expect(sent[0].sections[0].columns[0].fields).toEqual([
        'first_name',
        'email',
      ])
    })

    it('falls back to name when a row has no fieldname', async () => {
      // This modal accepts either key, unlike its two siblings.
      const wrapper = mountModal()
      await seed(layout([{ name: 'custom_block' }]))
      wrapper.vm.saveChanges()
      const sent = JSON.parse(api.call.mock.calls[0][1].layout)
      expect(sent[0].sections[0].columns[0].fields).toEqual(['custom_block'])
    })

    it('does not mutate the live layout while serialising', async () => {
      const wrapper = mountModal()
      await seed(layout([{ fieldname: 'first_name', label: 'First Name' }]))
      wrapper.vm.saveChanges()
      expect(
        api.resource.data[0].sections[0].columns[0].fields[0],
      ).toMatchObject({ fieldname: 'first_name', label: 'First Name' })
    })

    it('tolerates a tab with no sections', async () => {
      const wrapper = mountModal()
      await seed([{ label: 'Empty tab' }])
      expect(() => wrapper.vm.saveChanges()).not.toThrow()
    })

    it('tolerates a section with no columns', async () => {
      // Added alongside the sibling guards — Save carries no :disabled binding,
      // so an incomplete layout from the server is reachable here.
      const wrapper = mountModal()
      await seed([{ sections: [{ name: 's' }] }])
      expect(() => wrapper.vm.saveChanges()).not.toThrow()
    })

    it('tolerates a column with no fields', async () => {
      const wrapper = mountModal()
      await seed([{ sections: [{ columns: [{ label: 'col' }] }] }])
      expect(() => wrapper.vm.saveChanges()).not.toThrow()
    })

    it('closes and reports once saved', async () => {
      const wrapper = mountModal()
      await seed(layout([{ fieldname: 'first_name' }]))
      wrapper.vm.saveChanges()
      await flushPromises()
      expect(wrapper.vm.loading).toBe(false)
      expect(wrapper.emitted('update:modelValue').at(-1)[0]).toBe(false)
      expect(wrapper.emitted('reload')).toBeTruthy()
      expect(api.capture).toHaveBeenCalledWith('data_fields_layout_builder', {
        doctype: 'CRM Lead',
      })
    })

    it('shows a busy state while in flight', async () => {
      const wrapper = mountModal()
      await seed(layout([{ fieldname: 'first_name' }]))
      wrapper.vm.saveChanges()
      expect(wrapper.vm.loading).toBe(true)
    })
  })
})
