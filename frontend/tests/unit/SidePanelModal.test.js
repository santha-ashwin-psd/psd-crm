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

import SidePanelModal from '@/components/Modals/SidePanelModal.vue'
import { mountComponent } from '../helpers/mount'
import { flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

/** A one-tab tree whose single section holds the given fields. */
const tree = (fields) => [
  { sections: [{ name: 'details', columns: [{ fields }] }] },
]

const mountModal = (props = {}) =>
  mountComponent(SidePanelModal, {
    props: { modelValue: true, doctype: 'CRM Lead', ...props },
    global: {
      stubs: {
        Dialog: true, Badge: true,
        SidePanelLayout: true, SidePanelLayoutEditor: true,
      },
    },
  })

const seed = async (data) => {
  api.resource.onSuccess(data)
  api.resource.data = data
  await nextTick()
}

describe('SidePanelModal', () => {
  beforeEach(() => {
    api.call.mockReset().mockResolvedValue({})
    api.capture.mockClear()
  })

  describe('which layout it edits', () => {
    it('asks for the Side Panel layout', () => {
      const wrapper = mountModal()
      expect(wrapper.vm.getParams()).toEqual({
        doctype: 'CRM Lead',
        type: 'Side Panel',
      })
    })

    it('reloads on open with those params', async () => {
      mountModal({ doctype: 'CRM Deal' })
      await vi.waitFor(() => expect(api.resource.reload).toHaveBeenCalled())
      expect(api.resource.params).toEqual({
        doctype: 'CRM Deal',
        type: 'Side Panel',
      })
    })
  })

  describe('tracking unsaved changes', () => {
    it('is clean once loaded', async () => {
      const wrapper = mountModal()
      await seed(tree([{ fieldname: 'status' }]))
      expect(wrapper.vm.dirty).toBe(false)
    })

    it('notices a field being added', async () => {
      const wrapper = mountModal()
      await seed(tree([{ fieldname: 'status' }]))
      api.resource.data[0].sections[0].columns[0].fields.push({
        fieldname: 'email',
      })
      await nextTick()
      expect(wrapper.vm.dirty).toBe(true)
    })
  })

  describe('saving the layout', () => {
    it('sends only the sections, not the wrapping tab', async () => {
      // The side panel has no tabs; the server stores a bare section list.
      const wrapper = mountModal()
      await seed(tree([{ fieldname: 'status' }, { fieldname: 'email' }]))
      wrapper.vm.saveChanges()
      const sent = JSON.parse(api.call.mock.calls[0][1].layout)
      expect(Array.isArray(sent)).toBe(true)
      expect(sent[0].name).toBe('details')
    })

    it('reduces each field to its fieldname', async () => {
      const wrapper = mountModal()
      await seed(
        tree([
          { fieldname: 'status', label: 'Status', fieldtype: 'Select' },
          { fieldname: 'email', label: 'Email', fieldtype: 'Data' },
        ]),
      )
      wrapper.vm.saveChanges()
      const sent = JSON.parse(api.call.mock.calls[0][1].layout)
      expect(sent[0].columns[0].fields).toEqual(['status', 'email'])
    })

    it('drops an entry that has no fieldname', async () => {
      // A half-built row from the editor must not be persisted as null.
      const wrapper = mountModal()
      await seed(tree([{ fieldname: 'status' }, { label: 'unsaved row' }]))
      wrapper.vm.saveChanges()
      const sent = JSON.parse(api.call.mock.calls[0][1].layout)
      expect(sent[0].columns[0].fields).toEqual(['status'])
    })

    it('does not mutate the live layout while serialising', async () => {
      const wrapper = mountModal()
      await seed(tree([{ fieldname: 'status', label: 'Status' }]))
      wrapper.vm.saveChanges()
      expect(
        api.resource.data[0].sections[0].columns[0].fields[0],
      ).toMatchObject({ fieldname: 'status', label: 'Status' })
    })

    it('tolerates a section with no columns', async () => {
      const wrapper = mountModal()
      await seed([{ sections: [{ name: 'empty' }] }])
      expect(() => wrapper.vm.saveChanges()).not.toThrow()
    })

    it('tolerates a column with no fields', async () => {
      const wrapper = mountModal()
      await seed([{ sections: [{ name: 's', columns: [{ label: 'col' }] }] }])
      expect(() => wrapper.vm.saveChanges()).not.toThrow()
    })

    it('tolerates a tab with no sections', async () => {
      const wrapper = mountModal()
      await seed([{ label: 'Empty tab' }])
      expect(() => wrapper.vm.saveChanges()).not.toThrow()
    })

    it('tolerates an empty layout', async () => {
      const wrapper = mountModal()
      await seed([])
      expect(() => wrapper.vm.saveChanges()).not.toThrow()
    })

    it('closes and reports once saved', async () => {
      const wrapper = mountModal()
      await seed(tree([{ fieldname: 'status' }]))
      wrapper.vm.saveChanges()
      await flushPromises()
      expect(wrapper.vm.loading).toBe(false)
      expect(wrapper.emitted('update:modelValue').at(-1)[0]).toBe(false)
      expect(wrapper.emitted('reload')).toBeTruthy()
      expect(api.capture).toHaveBeenCalledWith('side_panel_layout_builder', {
        doctype: 'CRM Lead',
      })
    })

    it('shows a busy state while in flight', async () => {
      const wrapper = mountModal()
      await seed(tree([{ fieldname: 'status' }]))
      wrapper.vm.saveChanges()
      expect(wrapper.vm.loading).toBe(true)
    })
  })
})
