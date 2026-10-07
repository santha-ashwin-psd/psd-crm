const api = vi.hoisted(() => ({ capture: vi.fn(), resources: [], submitted: null }))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  return {
    ...actual,
    createResource: (options) => {
      api.resources.push(options)
      return reactive({
        ...options,
        data: null,
        fetch: vi.fn(),
        reload: vi.fn(),
        submit: vi.fn((params) => {
          api.submitted = params
        }),
      })
    },
  }
})

vi.mock('frappe-ui/frappe', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useTelemetry: () => ({ capture: api.capture }) }
})

const doc = vi.hoisted(() => ({ ref: null }))
vi.mock('@/data/document', async () => {
  const { reactive } = await import('vue')
  doc.ref = reactive({ doc: {} })
  return {
    useDocument: () => ({ document: doc.ref, triggerOnBeforeCreate: vi.fn() }),
  }
})

vi.mock('@/stores/users', () => ({
  usersStore: () => ({ isManager: () => true, getUser: () => ({ name: 'ada' }) }),
}))

const modal = vi.hoisted(() => ({ showModal: vi.fn() }))
vi.mock('@/composables/doctypeModal', () => ({
  useDoctypeModal: () => ({ showModal: modal.showModal }),
}))

const nav = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useRouter: () => nav }
})

import ContactModal from '@/components/Modals/ContactModal.vue'
import { mountComponent } from '../helpers/mount'
import { flushPromises } from '@vue/test-utils'

/** A Quick Entry layout containing the given fields in one section. */
const layout = (fields) => [
  { sections: [{ name: 's', columns: [{ fields }] }] },
]

const mountModal = ({ contact = {}, options, fields = null } = {}) => {
  doc.ref.doc = {}
  api.resources = []
  api.submitted = null
  const wrapper = mountComponent(ContactModal, {
    props: {
      modelValue: true,
      contact,
      ...(options ? { options } : {}),
    },
    global: { stubs: { Dialog: true, FieldLayout: true, EditIcon: true, FeatherIcon: true } },
  })
  const tabs = api.resources.find((r) => r.url?.includes('get_fields_layout'))
  // validateRequiredFields reads tabs.data, so seed it through the real transform.
  const tree = layout(fields ?? [{ fieldname: 'first_name', label: 'First Name' }])
  tabs.transform(tree)
  wrapper.vm.tabs.data = tree
  return wrapper
}

const insertOptions = () =>
  api.resources.find((r) => r.url === 'frappe.client.insert')

describe('ContactModal', () => {
  beforeEach(() => {
    api.capture.mockClear()
    modal.showModal.mockClear()
    nav.push.mockClear()
  })

  describe('required fields', () => {
    it('names the field that is missing', () => {
      const wrapper = mountModal()
      expect(wrapper.vm.validateRequiredFields()).toBe('First Name is required')
    })

    it('passes once it is filled', () => {
      const wrapper = mountModal()
      wrapper.vm._contact.doc.first_name = 'Ada'
      expect(wrapper.vm.validateRequiredFields()).toBeNull()
    })

    it('lists every missing field at once', () => {
      // One round trip per missing field would be tedious.
      const wrapper = mountModal({
        fields: [
          { fieldname: 'first_name', label: 'First Name' },
          { fieldname: 'company_name', label: 'Company', reqd: 1 },
        ],
      })
      expect(wrapper.vm.validateRequiredFields()).toBe(
        'First Name, Company is required',
      )
    })

    it('honours a conditional mandatory rule', () => {
      const wrapper = mountModal({
        fields: [
          { fieldname: 'first_name', label: 'First Name' },
          {
            fieldname: 'company_name',
            label: 'Company',
            mandatory_depends_on: 'eval:doc.salutation=="Dr"',
          },
        ],
      })
      wrapper.vm._contact.doc.first_name = 'Ada'
      wrapper.vm._contact.doc.salutation = 'Dr'
      expect(wrapper.vm.validateRequiredFields()).toBe('Company is required')
    })

    it('skips a conditional rule that does not apply', () => {
      const wrapper = mountModal({
        fields: [
          { fieldname: 'first_name', label: 'First Name' },
          {
            fieldname: 'company_name',
            label: 'Company',
            mandatory_depends_on: 'eval:doc.salutation=="Dr"',
          },
        ],
      })
      wrapper.vm._contact.doc.first_name = 'Ada'
      wrapper.vm._contact.doc.salutation = 'Mr'
      expect(wrapper.vm.validateRequiredFields()).toBeNull()
    })

    it('validates nothing before the layout loads', () => {
      const wrapper = mountModal()
      wrapper.vm.tabs.data = null
      expect(wrapper.vm.validateRequiredFields()).toBeNull()
    })
  })

  describe('format checks', () => {
    it('rejects an address with no @', () => {
      const wrapper = mountModal()
      wrapper.vm._contact.doc.first_name = 'Ada'
      wrapper.vm._contact.doc.email_id = 'nope'
      expect(wrapper.vm.validateRequiredFields()).toBe('Invalid Email Address')
    })

    it('rejects a mobile number containing letters', () => {
      const wrapper = mountModal()
      wrapper.vm._contact.doc.first_name = 'Ada'
      wrapper.vm._contact.doc.mobile_no = '12ab'
      expect(wrapper.vm.validateRequiredFields()).toBe(
        'Mobile No. should be a number',
      )
    })

    it('accepts a formatted mobile number', () => {
      const wrapper = mountModal()
      wrapper.vm._contact.doc.first_name = 'Ada'
      wrapper.vm._contact.doc.mobile_no = '+44 (0)20 7946-0958'
      expect(wrapper.vm.validateRequiredFields()).toBeNull()
    })
  })

  describe('shaping the document for the server', () => {
    it('does not submit when validation fails', async () => {
      const wrapper = mountModal()
      await wrapper.vm.createContact()
      expect(api.submitted).toBeNull()
      expect(wrapper.vm.error).toBe('First Name is required')
    })

    it('moves the email into the child table Contact expects', async () => {
      const wrapper = mountModal()
      wrapper.vm._contact.doc.first_name = 'Ada'
      wrapper.vm._contact.doc.email_id = 'ada@example.com'
      await wrapper.vm.createContact()
      await flushPromises()
      expect(api.submitted.doc.email_ids).toEqual([
        { email_id: 'ada@example.com', is_primary: 1 },
      ])
      expect(api.submitted.doc.email_id).toBeUndefined()
    })

    it('moves the mobile number into its child table', async () => {
      const wrapper = mountModal()
      wrapper.vm._contact.doc.first_name = 'Ada'
      wrapper.vm._contact.doc.mobile_no = '123456'
      await wrapper.vm.createContact()
      await flushPromises()
      expect(api.submitted.doc.phone_nos).toEqual([
        { phone: '123456', is_primary_mobile_no: 1 },
      ])
    })

    it('omits the child tables when nothing was entered', async () => {
      const wrapper = mountModal()
      wrapper.vm._contact.doc.first_name = 'Ada'
      await wrapper.vm.createContact()
      await flushPromises()
      expect(api.submitted.doc.email_ids).toBeUndefined()
      expect(api.submitted.doc.phone_nos).toBeUndefined()
    })

    it('sends the right doctype', async () => {
      const wrapper = mountModal()
      wrapper.vm._contact.doc.first_name = 'Ada'
      await wrapper.vm.createContact()
      await flushPromises()
      expect(api.submitted.doc.doctype).toBe('Contact')
    })
  })

  describe('after the server accepts', () => {
    it('opens the new contact by default', () => {
      const wrapper = mountModal()
      insertOptions().onSuccess({ name: 'CONTACT-9' })
      expect(nav.push).toHaveBeenCalledWith({
        name: 'Contact',
        params: { contactId: 'CONTACT-9' },
      })
    })

    it('stays put when the caller asks it not to redirect', () => {
      // Creating a contact from inside a deal should not navigate away.
      const wrapper = mountModal({ options: { redirect: false } })
      insertOptions().onSuccess({ name: 'CONTACT-9' })
      expect(nav.push).not.toHaveBeenCalled()
      expect(wrapper.emitted('update:modelValue').at(-1)[0]).toBe(false)
    })

    it('calls back with the created document', () => {
      const afterInsert = vi.fn()
      mountModal({ options: { redirect: false, afterInsert } })
      insertOptions().onSuccess({ name: 'CONTACT-9' })
      expect(afterInsert).toHaveBeenCalledWith({ name: 'CONTACT-9' })
    })

    it('refreshes the caller’s contact resource', () => {
      const reload = vi.fn()
      mountModal({ contact: { reload } })
      insertOptions().onSuccess({ name: 'CONTACT-9' })
      expect(reload).toHaveBeenCalled()
    })
  })

  describe('when the server refuses', () => {
    it('shows the server message', () => {
      const wrapper = mountModal()
      insertOptions().onError({ messages: ['Contact already exists'] })
      expect(wrapper.vm.error).toBe('Contact already exists')
    })

    it('shows something for a plain error', () => {
      // A network failure has no messages array; the box must not go blank.
      const wrapper = mountModal()
      insertOptions().onError(new Error('offline'))
      expect(wrapper.vm.error).toBeTruthy()
    })
  })

  describe('the address field', () => {
    it('opens the address modal for a new address', () => {
      const wrapper = mountModal()
      wrapper.vm.showAddressModal()
      expect(modal.showModal).toHaveBeenCalledWith(
        expect.objectContaining({ doctype: 'Address', name: null }),
      )
    })

    it('opens it against an existing address', () => {
      const wrapper = mountModal()
      wrapper.vm.showAddressModal('ADDR-1')
      expect(modal.showModal).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'ADDR-1' }),
      )
    })

    it('stores the address once it is created', () => {
      const wrapper = mountModal()
      wrapper.vm.showAddressModal()
      modal.showModal.mock.calls[0][0].callbacks.afterInsert({ name: 'ADDR-9' })
      expect(wrapper.vm._contact.doc.address).toBe('ADDR-9')
    })
  })
})
