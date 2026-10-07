import FieldLayoutDialogContainer from '@/components/Modals/FieldLayoutDialogContainer.vue'
import { fieldLayoutDialogs } from '@/utils/renderFieldLayoutDialog'
import { mountComponent } from '../helpers/mount'

const mountContainer = () =>
  mountComponent(FieldLayoutDialogContainer, {
    global: { stubs: { FieldLayoutDialog: true } },
  })

describe('FieldLayoutDialogContainer', () => {
  beforeEach(() => {
    fieldLayoutDialogs.value = []
  })

  describe('preparing props for each dialog', () => {
    it('keeps everything the dialog needs', () => {
      const wrapper = mountContainer()
      const props = wrapper.vm.dialogProps({
        props: {
          title: 'Edit',
          fields: [{ fieldname: 'a' }],
          submitLabel: 'Save',
          onResolve: vi.fn(),
        },
      })
      expect(props).toMatchObject({
        title: 'Edit',
        fields: [{ fieldname: 'a' }],
        submitLabel: 'Save',
      })
    })

    it('strips onResolve out of the bound props', () => {
      // It is attached separately via @resolve. Leaving it in v-bind would
      // register the handler twice and resolve the promise on the first call
      // while also firing the listener.
      const wrapper = mountContainer()
      const props = wrapper.vm.dialogProps({
        props: { title: 'Edit', onResolve: vi.fn() },
      })
      expect('onResolve' in props).toBe(false)
    })

    it('does not modify the stored dialog entry', () => {
      const onResolve = vi.fn()
      const entry = { props: { title: 'Edit', onResolve } }
      mountContainer().vm.dialogProps(entry)
      expect(entry.props.onResolve).toBe(onResolve)
    })

    it('copes with a dialog that has no extra props', () => {
      const wrapper = mountContainer()
      expect(wrapper.vm.dialogProps({ props: { onResolve: vi.fn() } })).toEqual({})
    })
  })

  describe('rendering', () => {
    it('renders nothing when no dialog is open', () => {
      const wrapper = mountContainer()
      expect(wrapper.findAll('field-layout-dialog-stub')).toHaveLength(0)
    })

    it('renders one dialog per queued entry', async () => {
      fieldLayoutDialogs.value = [
        { key: 'a', props: { title: 'First', onResolve: vi.fn() } },
        { key: 'b', props: { title: 'Second', onResolve: vi.fn() } },
      ]
      const wrapper = mountContainer()
      expect(wrapper.findAll('field-layout-dialog-stub')).toHaveLength(2)
    })
  })
})
