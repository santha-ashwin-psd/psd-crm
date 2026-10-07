const api = vi.hoisted(() => ({ call: vi.fn(), resources: [] }))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  return {
    ...actual,
    call: api.call,
    toast: { success: vi.fn(), error: vi.fn() },
    createResource: (options) => {
      const r = reactive({ ...options, data: null, fetch: vi.fn(), submit: vi.fn() })
      api.resources.push(r)
      return r
    },
  }
})

const docs = vi.hoisted(() => ({
  ref: null,
  trigger: vi.fn(),
  render: vi.fn(),
  save: { submit: vi.fn() },
}))
vi.mock('@/data/document', async () => {
  const { reactive } = await import('vue')
  return {
    useDocument: () => {
      docs.ref = reactive({ doc: {}, save: docs.save })
      return {
        document: docs.ref,
        scripts: reactive({ data: [] }),
        triggerOnRender: docs.render,
        triggerOnBeforeCreate: docs.trigger,
      }
    },
  }
})

vi.mock('@/stores/users', () => ({
  usersStore: () => ({ isManager: () => true }),
}))
vi.mock('@/stores/global', () => ({
  globalStore: () => ({ $dialog: vi.fn(), $socket: { on: vi.fn(), off: vi.fn() } }),
}))
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useRouter: () => ({ push: vi.fn() }) }
})

import DoctypeModal from '@/components/Modals/DoctypeModal.vue'
import { showQuickEntryModal, quickEntryProps } from '@/composables/modals'
import { mountComponent } from '../helpers/mount'
import { flushPromises } from '@vue/test-utils'

let mounted = []

const mountModal = ({ doctype = 'CRM Task', docname = '', defaults = {} } = {}) => {
  api.resources = []
  const wrapper = mountComponent(DoctypeModal, {
    props: { modelValue: true, doctype, docname, defaults },
    global: {
      stubs: {
        Dialog: true, FieldLayout: true, CustomActions: true,
        EditIcon: true, FeatherIcon: true, ErrorMessage: true,
      },
    },
  })
  mounted.push(wrapper)
  return wrapper
}

const insertResource = () =>
  api.resources.find((r) => r.url === 'frappe.client.insert')

describe('DoctypeModal', () => {
  beforeEach(() => {
    api.call.mockReset().mockResolvedValue({})
    docs.trigger.mockClear()
    docs.render.mockClear().mockResolvedValue(undefined)
    docs.save.submit.mockClear()
  })

  afterEach(() => {
    mounted.forEach((w) => w.unmount())
    mounted = []
  })

  describe('create versus edit', () => {
    it('is in create mode for a document with no name', async () => {
      const wrapper = mountModal()
      await flushPromises()
      expect(wrapper.vm.editMode).toBe(false)
    })

    it('is in edit mode once the document has a name', async () => {
      const wrapper = mountModal()
      wrapper.vm.document.doc = { name: 'TASK-1' }
      await flushPromises()
      expect(wrapper.vm.editMode).toBe(true)
    })
  })

  describe('opening', () => {
    it('seeds the document from the defaults', async () => {
      const wrapper = mountModal({ defaults: { status: 'Backlog' } })
      await flushPromises()
      expect(wrapper.vm.doc.status).toBe('Backlog')
    })

    it('runs the on-render hook', async () => {
      mountModal()
      await flushPromises()
      expect(docs.render).toHaveBeenCalled()
    })

    it('requests the Quick Entry layout for the doctype', () => {
      mountModal({ doctype: 'CRM Task' })
      const layout = api.resources.find((r) => r.url?.includes('get_fields_layout'))
      expect(layout.params).toEqual({ doctype: 'CRM Task', type: 'Quick Entry' })
    })
  })

  describe('creating', () => {
    it('runs the before-create hook first', async () => {
      const wrapper = mountModal()
      await wrapper.vm.create()
      expect(docs.trigger).toHaveBeenCalled()
    })

    it('posts the document with its doctype', async () => {
      const wrapper = mountModal({ doctype: 'CRM Task' })
      wrapper.vm.document.doc.subject = 'Call Ada'
      await wrapper.vm.create()
      expect(insertResource().submit).toHaveBeenCalledWith({
        doc: expect.objectContaining({ doctype: 'CRM Task', subject: 'Call Ada' }),
      })
    })

    it('closes, clears and reports the new document', async () => {
      const wrapper = mountModal()
      await flushPromises()
      insertResource().onSuccess({ name: 'TASK-9' })
      expect(wrapper.emitted('afterInsert').at(-1)[0]).toEqual({ name: 'TASK-9' })
      expect(wrapper.vm.document.doc).toEqual({})
      expect(wrapper.emitted('update:modelValue').at(-1)[0]).toBe(false)
    })
  })

  describe('when creating fails', () => {
    it('names the missing mandatory fields', async () => {
      const wrapper = mountModal()
      await flushPromises()
      insertResource().onError({
        exc_type: 'MandatoryError',
        messages: ['CRM Task TASK-1: Subject', 'CRM Task TASK-1: Status'],
      })
      expect(wrapper.vm.error).toBe('Mandatory field error: Subject, Status')
    })

    it('shows any other server message', async () => {
      const wrapper = mountModal()
      await flushPromises()
      insertResource().onError({ messages: ['Not permitted'] })
      expect(wrapper.vm.error).toBe('Not permitted')
    })

    it('falls back rather than showing nothing', async () => {
      // An error with no messages must still say something.
      const wrapper = mountModal()
      await flushPromises()
      insertResource().onError(new Error('offline'))
      expect(wrapper.vm.error).toBe('Could not create document')
    })

    it('stays open so the entry is not lost', async () => {
      const wrapper = mountModal()
      await flushPromises()
      insertResource().onError({ messages: ['Nope'] })
      expect(wrapper.emitted('afterInsert')).toBeUndefined()
    })
  })

  describe('updating an existing document', () => {
    it('saves through the document resource', () => {
      const wrapper = mountModal({ docname: 'TASK-1' })
      wrapper.vm.update()
      expect(docs.save.submit).toHaveBeenCalled()
    })

    it('closes and reports the saved document', () => {
      const wrapper = mountModal({ docname: 'TASK-1' })
      wrapper.vm.update()
      docs.save.submit.mock.calls[0][1].onSuccess({ name: 'TASK-1' })
      expect(wrapper.emitted('afterUpdate').at(-1)[0]).toEqual({ name: 'TASK-1' })
      expect(wrapper.emitted('update:modelValue').at(-1)[0]).toBe(false)
    })

    it('reports a failure without closing', () => {
      const wrapper = mountModal({ docname: 'TASK-1' })
      wrapper.vm.update()
      docs.save.submit.mock.calls[0][1].onError({ messages: ['Conflict'] })
      expect(wrapper.vm.error).toBe('Conflict')
      expect(wrapper.emitted('afterUpdate')).toBeUndefined()
    })

    it('falls back when the failure carries no message', () => {
      const wrapper = mountModal({ docname: 'TASK-1' })
      wrapper.vm.update()
      docs.save.submit.mock.calls[0][1].onError(new Error('offline'))
      expect(wrapper.vm.error).toBe('Could not update document')
    })
  })

  describe('switching to the full form', () => {
    it('hands over to quick entry and closes', async () => {
      const wrapper = mountModal({ doctype: 'CRM Task' })
      wrapper.vm.openQuickEntryModal()
      expect(showQuickEntryModal.value).toBe(true)
      expect(quickEntryProps.value).toEqual({ doctype: 'CRM Task' })
      await flushPromises()
      expect(wrapper.emitted('update:modelValue').at(-1)[0]).toBe(false)
    })
  })
})
