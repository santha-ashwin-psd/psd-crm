const api = vi.hoisted(() => ({ call: vi.fn(), resources: [] }))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  return {
    ...actual,
    call: api.call,
    createResource: (options) => {
      const r = reactive({ ...options, data: null, fetch: vi.fn() })
      api.resources.push(r)
      return r
    },
  }
})

const docs = vi.hoisted(() => ({ ref: null, trigger: vi.fn() }))
vi.mock('@/data/document', async () => {
  const { reactive } = await import('vue')
  return {
    // A fresh document per mount. Sharing one leaked values between tests,
    // because every still-mounted instance re-runs its immediate watcher when
    // the doctype meta changes.
    useDocument: () => {
      docs.ref = reactive({ doc: {} })
      return { document: docs.ref, triggerOnBeforeCreate: docs.trigger }
    },
  }
})

const meta = vi.hoisted(() => ({ ref: null }))
vi.mock('@/stores/meta', async () => {
  const { ref } = await import('vue')
  meta.ref = ref(null)
  return { getMeta: () => ({ doctypeMeta: meta.ref }) }
})

vi.mock('@/stores/users', () => ({
  usersStore: () => ({ isManager: () => true }),
}))

import CreateDocumentModal from '@/components/Modals/CreateDocumentModal.vue'
import { showQuickEntryModal, quickEntryProps } from '@/composables/modals'
import { mountComponent } from '../helpers/mount'
import { flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

const layout = (fields = []) => [
  { sections: [{ columns: [{ fields }] }] },
]

let mounted = []

const mountModal = ({ doctype = 'CRM Task', data = {}, docMeta = {} } = {}) => {
  api.resources = []
  meta.ref.value = docMeta
  const wrapper = mountComponent(CreateDocumentModal, {
    props: { modelValue: true, doctype, data },
    global: {
      stubs: { Dialog: true, FieldLayout: true, EditIcon: true, FeatherIcon: true, ErrorMessage: true },
    },
  })
  mounted.push(wrapper)
  return wrapper
}

const tabsResource = () => api.resources[0]

describe('CreateDocumentModal', () => {
  beforeEach(() => {
    api.call.mockReset().mockResolvedValue({ name: 'TASK-9' })
    docs.trigger.mockClear()
  })

  afterEach(() => {
    mounted.forEach((w) => w.unmount())
    mounted = []
  })

  describe('the dialog title', () => {
    it('drops the CRM prefix', () => {
      expect(mountModal({ doctype: 'CRM Task' }).vm.dialogOptions.title).toBe(
        'New Task',
      )
    })

    it('drops the FCRM prefix too', () => {
      expect(mountModal({ doctype: 'FCRM Note' }).vm.dialogOptions.title).toBe(
        'New Note',
      )
    })

    it('leaves a plain doctype alone', () => {
      expect(mountModal({ doctype: 'Contact' }).vm.dialogOptions.title).toBe(
        'New Contact',
      )
    })

    it('only strips the prefix, not the word wherever it appears', () => {
      // "CRM Deal" → "Deal", never "Deal" → "".
      expect(mountModal({ doctype: 'CRM Deal' }).vm.dialogOptions.title).toBe(
        'New Deal',
      )
    })

    it('offers a single Create action', () => {
      const actions = mountModal().vm.dialogOptions.actions
      expect(actions).toHaveLength(1)
      expect(actions[0].label).toBe('Create')
    })
  })

  describe('the header icon', () => {
    const icon = (doctype) => mountModal({ doctype }).vm.headerIcon

    it('picks one per doctype family', () => {
      expect(icon('CRM Lead')).toBe('user-plus')
      expect(icon('CRM Deal')).toBe('zap')
      expect(icon('Contact')).toBe('user')
      expect(icon('CRM Organization')).toBe('briefcase')
      expect(icon('CRM Task')).toBe('check-square')
      expect(icon('CRM Call Log')).toBe('phone')
      expect(icon('Event')).toBe('calendar')
      expect(icon('FCRM Note')).toBe('file-text')
    })

    it('falls back to a plus for anything unrecognised', () => {
      expect(icon('Some Other Doctype')).toBe('plus')
      expect(icon('')).toBe('plus')
    })
  })

  describe('seeding the form from the passed data', () => {
    it('copies an object straight in', async () => {
      const wrapper = mountModal({ data: { subject: 'Call Ada' } })
      await flushPromises()
      expect(wrapper.vm._data.doc.subject).toBe('Call Ada')
    })

    it('puts a bare string into the autoname field', async () => {
      const wrapper = mountModal({
        data: 'Acme Ltd',
        docMeta: { autoname: 'field:organization_name' },
      })
      await flushPromises()
      expect(wrapper.vm._data.doc.organization_name).toBe('Acme Ltd')
    })

    it('puts a bare string into __newname when the name is prompted', async () => {
      const wrapper = mountModal({ data: 'My Record', docMeta: { autoname: 'prompt' } })
      await flushPromises()
      expect(wrapper.vm._data.doc.__newname).toBe('My Record')
    })

    it('falls back to the title field', async () => {
      const wrapper = mountModal({ data: 'A title', docMeta: { title_field: 'subject' } })
      await flushPromises()
      expect(wrapper.vm._data.doc.subject).toBe('A title')
    })
  })

  describe('the prompted-name field', () => {
    it('adds a Name field when the doctype prompts for one', async () => {
      const wrapper = mountModal({ docMeta: { autoname: 'prompt' } })
      tabsResource().data = layout([{ fieldname: 'subject', label: 'Subject' }])
      await nextTick()
      const fields = wrapper.vm.tabs.data[0].sections[0].columns[0].fields
      expect(fields[0]).toMatchObject({ fieldname: '__newname', reqd: 1 })
    })

    it('does not add it for a doctype that names itself', async () => {
      const wrapper = mountModal({ docMeta: { autoname: 'hash' } })
      tabsResource().data = layout([{ fieldname: 'subject', label: 'Subject' }])
      await nextTick()
      const fields = wrapper.vm.tabs.data[0].sections[0].columns[0].fields
      expect(fields.map((f) => f.fieldname)).not.toContain('__newname')
    })

    it('does not add a second one if the layout already has it', async () => {
      const wrapper = mountModal({ docMeta: { autoname: 'prompt' } })
      tabsResource().data = layout([{ fieldname: '__newname', label: 'Name' }])
      await nextTick()
      const fields = wrapper.vm.tabs.data[0].sections[0].columns[0].fields
      expect(fields.filter((f) => f.fieldname === '__newname')).toHaveLength(1)
    })

    it('matches autoname case-insensitively', async () => {
      const wrapper = mountModal({ docMeta: { autoname: 'Prompt' } })
      tabsResource().data = layout([{ fieldname: 'subject' }])
      await nextTick()
      const fields = wrapper.vm.tabs.data[0].sections[0].columns[0].fields
      expect(fields[0].fieldname).toBe('__newname')
    })
  })

  describe('creating', () => {
    it('posts the document with its doctype', async () => {
      const wrapper = mountModal({ doctype: 'CRM Task' })
      wrapper.vm._data.doc.subject = 'Call Ada'
      await wrapper.vm.create()
      expect(api.call).toHaveBeenCalledWith(
        'frappe.client.insert',
        expect.objectContaining({
          doc: expect.objectContaining({ doctype: 'CRM Task', subject: 'Call Ada' }),
        }),
        expect.anything(),
      )
    })

    it('runs any before-create hook first', async () => {
      const wrapper = mountModal()
      await wrapper.vm.create()
      expect(docs.trigger).toHaveBeenCalled()
    })

    it('closes and hands the document back', async () => {
      const wrapper = mountModal()
      await wrapper.vm.create()
      expect(wrapper.emitted('callback').at(-1)[0]).toEqual({ name: 'TASK-9' })
      expect(wrapper.emitted('update:modelValue').at(-1)[0]).toBe(false)
      expect(wrapper.vm.loading).toBe(false)
    })

    it('empties the form so the next open starts clean', async () => {
      const wrapper = mountModal()
      wrapper.vm._data.doc.subject = 'Call Ada'
      await wrapper.vm.create()
      expect(wrapper.vm._data.doc).toEqual({})
    })
  })

  describe('when the server refuses', () => {
    const failWith = (messages) => {
      api.call.mockImplementation(async (_m, _a, options) => {
        const e = new Error('failed')
        e.messages = messages
        options?.onError?.({ response: {}, status: 417, error: e })
        throw e
      })
    }

    it('shows the server message', async () => {
      failWith(['Subject is required'])
      const wrapper = mountModal()
      await expect(wrapper.vm.create()).rejects.toThrow()
      expect(wrapper.vm.error).toBe('Subject is required')
    })

    it('clears the busy flag', async () => {
      failWith(['Nope'])
      const wrapper = mountModal()
      await expect(wrapper.vm.create()).rejects.toThrow()
      expect(wrapper.vm.loading).toBe(false)
    })

    it('stays open so the entry is not lost', async () => {
      // Closing on failure would discard everything the user typed.
      failWith(['Nope'])
      const wrapper = mountModal()
      wrapper.vm._data.doc.subject = 'Call Ada'
      await expect(wrapper.vm.create()).rejects.toThrow()
      expect(wrapper.vm._data.doc.subject).toBe('Call Ada')
      expect(wrapper.emitted('callback')).toBeUndefined()
    })
  })

  describe('switching to the full form', () => {
    it('hands over to quick entry for the same doctype', async () => {
      const wrapper = mountModal({ doctype: 'CRM Task' })
      wrapper.vm.openQuickEntryModal()
      expect(showQuickEntryModal.value).toBe(true)
      expect(quickEntryProps.value).toEqual({ doctype: 'CRM Task' })
      await flushPromises()
      expect(wrapper.emitted('update:modelValue').at(-1)[0]).toBe(false)
    })
  })
})
