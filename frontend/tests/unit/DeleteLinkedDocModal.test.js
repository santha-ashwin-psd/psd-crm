const api = vi.hoisted(() => ({ call: vi.fn(() => Promise.resolve()) }))
const created = vi.hoisted(() => [])

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  return {
    ...actual,
    call: api.call,
    // Reactive: `linkedDocs` is a computed over `resource.data`. A plain object
    // is not tracked, so the computed would cache its first (empty) read and
    // never see the seeded rows.
    createResource: (options) => {
      const resource = reactive({
        options,
        data: null,
        loading: false,
        fetch: vi.fn(),
        reload: vi.fn(),
      })
      created.push(resource)
      return resource
    },
  }
})

const router = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useRouter: () => router }
})

import DeleteLinkedDocModal from '@/components/DeleteLinkedDocModal.vue'
import { mountComponent } from '../helpers/mount'

const STUBS = {
  Dialog: { name: 'Dialog', template: '<div><slot name="body" /><slot /></div>' },
  ListView: { name: 'ListView', template: '<div class="list" />' },
}

const LINKED = [
  { reference_doctype: 'CRM Task', reference_docname: 'TASK-1' },
  { reference_doctype: 'FCRM Note', reference_docname: 'NOTE-1' },
  { reference_doctype: 'CRM Call Log', reference_docname: 'CALL-1' },
]

function mountModal() {
  created.length = 0
  api.call.mockClear()
  router.push.mockClear()
  const wrapper = mountComponent(DeleteLinkedDocModal, {
    props: {
      modelValue: true,
      name: 'Deals',
      doctype: 'CRM Deal',
      docname: 'DEAL-1',
    },
    global: { stubs: STUBS },
  })
  created[0].data = structuredClone(LINKED)
  return { wrapper, resource: created[0] }
}

describe('DeleteLinkedDocModal', () => {
  describe('the linked list', () => {
    it('gives each row an id so it can be selected', () => {
      const { wrapper } = mountModal()
      expect(wrapper.vm.linkedDocs.map((d) => d.id)).toEqual([
        'TASK-1',
        'NOTE-1',
        'CALL-1',
      ])
    })

    it('is empty before the fetch lands', () => {
      const { wrapper, resource } = mountModal()
      resource.data = null
      expect(wrapper.vm.linkedDocs).toEqual([])
    })

    it('does not fetch without a document to look up', () => {
      // The resource validates its params rather than calling with undefined.
      const { resource } = mountModal()
      expect(resource.options.validate({ doctype: '', docname: '' })).toBe(false)
      expect(resource.options.validate({})).toBe(false)
      expect(
        resource.options.validate({ doctype: 'CRM Deal', docname: 'DEAL-1' }),
      ).toBeUndefined()
    })
  })

  describe('confirming', () => {
    it('says "all" when nothing is ticked', () => {
      // With no selection the action applies to every linked item.
      const { wrapper } = mountModal()
      wrapper.vm.confirmDelete()
      expect(wrapper.vm.confirmDeleteInfo.message).toContain('all')
    })

    it('counts the ticked items', () => {
      const { wrapper } = mountModal()
      wrapper.vm.viewControls.updateSelections(['TASK-1', 'NOTE-1'])
      wrapper.vm.confirmDelete()
      expect(wrapper.vm.confirmDeleteInfo.message).toContain('2')
    })

    it('distinguishes delete from unlink', () => {
      const { wrapper } = mountModal()

      wrapper.vm.confirmDelete()
      expect(wrapper.vm.confirmDeleteInfo.title).toBe('Delete Linked Item')
      expect(wrapper.vm.confirmDeleteInfo.delete).toBe(true)

      wrapper.vm.confirmUnlink()
      expect(wrapper.vm.confirmDeleteInfo.title).toBe('Unlink Linked Item')
      expect(wrapper.vm.confirmDeleteInfo.delete).toBe(false)
    })

    it('clears the selection on cancel', () => {
      const { wrapper } = mountModal()
      wrapper.vm.viewControls.updateSelections(['TASK-1'])
      wrapper.vm.confirmDelete()
      wrapper.vm.cancel()
      expect(wrapper.vm.confirmDeleteInfo.show).toBe(false)
      expect(wrapper.vm.viewControls.selections).toEqual([])
    })
  })

  describe('unlinking', () => {
    it('acts on every linked item when nothing is ticked', () => {
      const { wrapper } = mountModal()
      wrapper.vm.unlinkLinkedDoc({
        reference_doctype: 'CRM Deal',
        reference_docname: 'DEAL-1',
        delete: false,
      })
      const [, params] = api.call.mock.calls[0]
      expect(params.items).toHaveLength(3)
    })

    it('acts only on the ticked items', () => {
      const { wrapper } = mountModal()
      wrapper.vm.viewControls.updateSelections(['NOTE-1'])
      wrapper.vm.unlinkLinkedDoc({
        reference_doctype: 'CRM Deal',
        reference_docname: 'DEAL-1',
        delete: false,
      })
      const [, params] = api.call.mock.calls[0]
      expect(params.items).toEqual([
        { doctype: 'FCRM Note', docname: 'NOTE-1' },
      ])
    })

    it('flags contact removal only for contacts', () => {
      const { wrapper } = mountModal()
      wrapper.vm.unlinkLinkedDoc({ delete: false })
      expect(api.call.mock.calls[0][1].remove_contact).toBe(false)
    })

    it('carries the delete flag through', () => {
      const { wrapper } = mountModal()
      wrapper.vm.unlinkLinkedDoc({ delete: true })
      expect(api.call.mock.calls[0][1].delete).toBe(true)
    })

    it('clears the selection after acting', () => {
      const { wrapper } = mountModal()
      wrapper.vm.viewControls.updateSelections(['NOTE-1'])
      wrapper.vm.removeDocLinks()
      expect(wrapper.vm.viewControls.selections).toEqual([])
    })
  })

  describe('deleting the document itself', () => {
    it('deletes it and navigates back to the list', async () => {
      const { wrapper } = mountModal()
      await wrapper.vm.deleteDoc()
      expect(api.call).toHaveBeenCalledWith('frappe.client.delete', {
        doctype: 'CRM Deal',
        name: 'DEAL-1',
      })
      expect(router.push).toHaveBeenCalledWith({ name: 'Deals' })
    })

    it('runs the caller reload hook when one is given', async () => {
      const reload = vi.fn()
      created.length = 0
      const wrapper = mountComponent(DeleteLinkedDocModal, {
        props: {
          modelValue: true,
          name: 'Deals',
          doctype: 'CRM Deal',
          docname: 'DEAL-1',
          reload,
        },
        global: { stubs: STUBS },
      })
      await wrapper.vm.deleteDoc()
      expect(reload).toHaveBeenCalled()
    })

    it('tolerates no reload hook', async () => {
      const { wrapper } = mountModal()
      await expect(wrapper.vm.deleteDoc()).resolves.toBeUndefined()
    })
  })
})
