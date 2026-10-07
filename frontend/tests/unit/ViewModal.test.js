const api = vi.hoisted(() => ({ call: vi.fn() }))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, call: api.call }
})

import ViewModal from '@/components/Modals/ViewModal.vue'
import { mountComponent } from '../helpers/mount'
import { flushPromises } from '@vue/test-utils'

const mountModal = ({ view = {}, options = {}, open = true } = {}) =>
  mountComponent(ViewModal, {
    props: {
      modelValue: open,
      view,
      doctype: 'CRM Lead',
      options,
    },
    global: { stubs: { Dialog: true, IconPicker: true, FormControl: true } },
  })

describe('ViewModal', () => {
  beforeEach(() => {
    api.call.mockReset().mockResolvedValue({ name: 'VIEW-9' })
  })

  describe('creating a view', () => {
    it('stamps the doctype onto the view before sending', async () => {
      const wrapper = mountModal({ view: { label: 'My leads' } })
      await wrapper.vm.create()
      expect(api.call).toHaveBeenCalledWith(
        'crm.fcrm.doctype.crm_view_settings.crm_view_settings.create',
        { view: expect.objectContaining({ doctype: 'CRM Lead', label: 'My leads' }) },
      )
    })

    it('closes and reports the created view', async () => {
      const afterCreate = vi.fn()
      const wrapper = mountModal({ view: { label: 'My leads' }, options: { afterCreate } })
      await wrapper.vm.create()
      expect(afterCreate).toHaveBeenCalledWith({ name: 'VIEW-9' })
      expect(wrapper.emitted('update:modelValue').at(-1)[0]).toBe(false)
    })

    it('does not require a callback', async () => {
      const wrapper = mountModal({ view: { label: 'My leads' } })
      await expect(wrapper.vm.create()).resolves.not.toThrow()
    })
  })

  describe('updating a view', () => {
    it('sends the whole view including its doctype', async () => {
      const wrapper = mountModal({ view: { name: 'VIEW-1', label: 'Renamed' } })
      await wrapper.vm.update()
      expect(api.call).toHaveBeenCalledWith(
        'crm.fcrm.doctype.crm_view_settings.crm_view_settings.update',
        { view: expect.objectContaining({ name: 'VIEW-1', doctype: 'CRM Lead' }) },
      )
    })

    it('reports the updated view, not the server response', async () => {
      // update() returns nothing useful; the caller needs the local copy.
      const afterUpdate = vi.fn()
      const view = { name: 'VIEW-1', label: 'Renamed' }
      const wrapper = mountModal({ view, options: { afterUpdate } })
      await wrapper.vm.update()
      expect(afterUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'VIEW-1', label: 'Renamed' }),
      )
    })
  })

  describe('opening the dialog', () => {
    it('copies the view into the local form', async () => {
      const wrapper = mountModal({ open: false })
      await wrapper.setProps({ view: { label: 'Hot leads' }, modelValue: true })
      await flushPromises()
      expect(wrapper.vm._view.label).toBe('Hot leads')
    })

    it('enters edit mode when asked', async () => {
      const wrapper = mountModal({ open: false })
      await wrapper.setProps({ view: { label: 'X', mode: 'edit' }, modelValue: true })
      await flushPromises()
      expect(wrapper.vm.editMode).toBe(true)
      expect(wrapper.vm.duplicateMode).toBe(false)
    })

    it('enters duplicate mode when asked', async () => {
      const wrapper = mountModal({ open: false })
      await wrapper.setProps({ view: { label: 'X', mode: 'duplicate' }, modelValue: true })
      await flushPromises()
      expect(wrapper.vm.duplicateMode).toBe(true)
      expect(wrapper.vm.editMode).toBe(false)
    })

    it('creates a new view when no mode is given', async () => {
      const wrapper = mountModal({ open: false })
      await wrapper.setProps({ view: { label: 'X' }, modelValue: true })
      await flushPromises()
      expect(wrapper.vm.editMode).toBe(false)
      expect(wrapper.vm.duplicateMode).toBe(false)
    })

    it('does not carry a mode over from the previous open', async () => {
      // Editing one view then creating another must not stay in edit mode.
      const wrapper = mountModal({ open: false })
      await wrapper.setProps({ view: { label: 'X', mode: 'edit' }, modelValue: true })
      await flushPromises()
      await wrapper.setProps({ modelValue: false })
      await wrapper.setProps({ view: { label: 'Y' }, modelValue: true })
      await flushPromises()
      expect(wrapper.vm.editMode).toBe(false)
    })

    it('leaves the form alone while closing', async () => {
      // The watcher fires on both transitions; only the open one should act.
      const wrapper = mountModal({ open: false })
      await wrapper.setProps({ view: { label: 'X', mode: 'edit' }, modelValue: true })
      await flushPromises()
      expect(wrapper.vm._view.label).toBe('X')
      await wrapper.setProps({ modelValue: false })
      await flushPromises()
      expect(wrapper.vm._view.label).toBe('X')
      expect(wrapper.vm.editMode).toBe(true)
    })

    it('does not populate the form until it is opened', async () => {
      const wrapper = mountModal({ view: { label: 'X' }, open: true })
      await flushPromises()
      expect(wrapper.vm._view.label).toBe('')
    })
  })
})
