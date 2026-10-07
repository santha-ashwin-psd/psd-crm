const api = vi.hoisted(() => ({ call: vi.fn(), fields: [], capture: vi.fn() }))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  return {
    ...actual,
    call: api.call,
    createResource: (options) =>
      reactive({
        ...options,
        get data() {
          return options.transform ? options.transform(api.fields) : api.fields
        },
        fetch: vi.fn(),
      }),
  }
})

vi.mock('frappe-ui/frappe', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useTelemetry: () => ({ capture: api.capture }) }
})

import EditValueModal from '@/components/Modals/EditValueModal.vue'
import { mountComponent } from '../helpers/mount'
import { flushPromises } from '@vue/test-utils'

const mountModal = (selected = ['DEAL-1', 'DEAL-2']) =>
  mountComponent(EditValueModal, {
    props: {
      doctype: 'CRM Deal',
      selectedValues: new Set(selected),
      modelValue: true,
    },
    global: {
      stubs: { Dialog: true, Link: true, Autocomplete: true, DatePicker: true },
    },
  })

const payload = () => api.call.mock.calls[0][1].data

describe('EditValueModal', () => {
  beforeEach(() => {
    api.call.mockReset().mockResolvedValue({})
    api.capture.mockClear()
    api.fields = [
      { label: 'Status', fieldname: 'status', fieldtype: 'Select', options: 'Open\nWon', hidden: 0, read_only: 0 },
      { label: 'Hidden', fieldname: 'secret', fieldtype: 'Data', hidden: 1, read_only: 0 },
      { label: 'Locked', fieldname: 'locked', fieldtype: 'Data', hidden: 0, read_only: 1 },
    ]
  })

  describe('which fields can be bulk-edited', () => {
    it('leaves out hidden and read-only fields', () => {
      // Offering a field the server will reject is worse than not offering it.
      const wrapper = mountModal()
      expect(wrapper.vm.fields.data.map((f) => f.fieldname)).toEqual(['status'])
    })
  })

  describe('the record count', () => {
    it('counts the selection', () => {
      expect(mountModal(['A', 'B', 'C']).vm.recordCount).toBe(3)
    })

    it('is zero for an empty selection', () => {
      expect(mountModal([]).vm.recordCount).toBe(0)
    })
  })

  describe('choosing a field', () => {
    it('records the chosen field', () => {
      const wrapper = mountModal()
      wrapper.vm.changeField(api.fields[0])
      expect(wrapper.vm.field.fieldname).toBe('status')
    })

    it('clears any value carried over from the previous field', () => {
      // A "Won" left over from Status is meaningless on Annual Revenue.
      const wrapper = mountModal()
      wrapper.vm.newValue = 'Won'
      wrapper.vm.changeField({ fieldname: 'annual_revenue', fieldtype: 'Currency' })
      expect(wrapper.vm.newValue).toBe('')
    })

    it('clears the value even when the field is cleared', () => {
      const wrapper = mountModal()
      wrapper.vm.newValue = 'Won'
      wrapper.vm.changeField(null)
      expect(wrapper.vm.newValue).toBe('')
    })
  })

  describe('reading the entered value', () => {
    it('unwraps an input event', () => {
      const wrapper = mountModal()
      wrapper.vm.updateValue({ target: { value: 'Won' } })
      expect(wrapper.vm.newValue).toBe('Won')
    })

    it('takes a plain value as-is', () => {
      const wrapper = mountModal()
      wrapper.vm.updateValue('Won')
      expect(wrapper.vm.newValue).toBe('Won')
    })
  })

  describe('submitting the update', () => {
    it('posts the field against every selected record', async () => {
      const wrapper = mountModal(['DEAL-1', 'DEAL-2'])
      wrapper.vm.changeField(api.fields[0])
      wrapper.vm.newValue = 'Won'
      wrapper.vm.updateValues()
      await flushPromises()
      expect(api.call).toHaveBeenCalledWith(
        'frappe.desk.doctype.bulk_update.bulk_update.submit_cancel_or_update_docs',
        expect.objectContaining({
          doctype: 'CRM Deal',
          docnames: ['DEAL-1', 'DEAL-2'],
          action: 'update',
          data: { status: 'Won' },
        }),
      )
    })

    it('sends a ticked checkbox as 1', async () => {
      const wrapper = mountModal()
      wrapper.vm.changeField({ fieldname: 'converted', fieldtype: 'Check' })
      wrapper.vm.newValue = 'Yes'
      wrapper.vm.updateValues()
      await flushPromises()
      expect(payload()).toEqual({ converted: 1 })
    })

    it('sends an unticked checkbox as 0, not null', async () => {
      // Setting a checkbox to No is a real value, not a request to clear it.
      const wrapper = mountModal()
      wrapper.vm.changeField({ fieldname: 'converted', fieldtype: 'Check' })
      wrapper.vm.newValue = 'No'
      wrapper.vm.updateValues()
      await flushPromises()
      expect(payload()).toEqual({ converted: 0 })
    })

    it('sends a numeric zero as 0, not null', async () => {
      // Zeroing a currency field is a legitimate bulk edit.
      const wrapper = mountModal()
      wrapper.vm.changeField({ fieldname: 'annual_revenue', fieldtype: 'Currency' })
      wrapper.vm.newValue = 0
      wrapper.vm.updateValues()
      await flushPromises()
      expect(payload()).toEqual({ annual_revenue: 0 })
    })

    it('sends an empty entry as null so the field is cleared', async () => {
      const wrapper = mountModal()
      wrapper.vm.changeField(api.fields[0])
      wrapper.vm.newValue = ''
      wrapper.vm.updateValues()
      await flushPromises()
      expect(payload()).toEqual({ status: null })
    })

    it('closes and resets once the server confirms', async () => {
      const wrapper = mountModal()
      wrapper.vm.changeField(api.fields[0])
      wrapper.vm.newValue = 'Won'
      wrapper.vm.updateValues()
      await flushPromises()
      expect(wrapper.vm.newValue).toBe('')
      expect(wrapper.vm.field.fieldname).toBe('')
      expect(wrapper.vm.loading).toBe(false)
      expect(wrapper.emitted('update:modelValue').at(-1)[0]).toBe(false)
    })

    it('asks the list to reload', async () => {
      const wrapper = mountModal()
      wrapper.vm.changeField(api.fields[0])
      wrapper.vm.newValue = 'Won'
      wrapper.vm.updateValues()
      await flushPromises()
      expect(wrapper.emitted('reload')).toBeTruthy()
    })

    it('shows a loading state while in flight', () => {
      const wrapper = mountModal()
      wrapper.vm.changeField(api.fields[0])
      wrapper.vm.newValue = 'Won'
      wrapper.vm.updateValues()
      expect(wrapper.vm.loading).toBe(true)
    })
  })

  describe('picking the input control for a fieldtype', () => {
    it('returns a control for every branch', () => {
      const wrapper = mountModal()
      const types = [
        'Select', 'Check', 'Link', 'Dynamic Link', 'Int', 'Currency',
        'Date', 'Datetime', 'Text Editor', 'Data',
      ]
      for (const fieldtype of types) {
        expect(
          wrapper.vm.getValueComponent({ fieldtype, options: 'A\nB' }),
        ).toBeTruthy()
      }
    })

    it('offers Yes and No for a checkbox', () => {
      const wrapper = mountModal()
      const vnode = wrapper.vm.getValueComponent({ fieldtype: 'Check' })
      expect(vnode.props.options.map((o) => o.value)).toEqual(['Yes', 'No'])
    })

    it('splits select options on newlines', () => {
      const wrapper = mountModal()
      const vnode = wrapper.vm.getValueComponent({
        fieldtype: 'Select',
        options: 'Open\nWon\nLost',
      })
      expect(vnode.props.options.map((o) => o.value)).toEqual([
        'Open', 'Won', 'Lost',
      ])
    })
  })
})
