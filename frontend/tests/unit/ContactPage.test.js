const api = vi.hoisted(() => ({
  toast: null,
  call: vi.fn(),
  save: { submit: vi.fn() },
  docReload: vi.fn(),
  showModal: vi.fn(),
}))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  api.toast = { error: vi.fn(), success: vi.fn(), warning: vi.fn() }
  const inert = (options = {}) =>
    reactive({
      ...options,
      data: null,
      doc: null,
      fetch: vi.fn(),
      reload: vi.fn(),
      submit: vi.fn(),
      setValue: { submit: vi.fn() },
      insert: { submit: vi.fn() },
      delete: { submit: vi.fn() },
    })
  return {
    ...actual,
    toast: api.toast,
    call: api.call,
    createResource: inert,
    createDocumentResource: inert,
    createListResource: inert,
  }
})

vi.mock('frappe-ui/frappe', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useTelemetry: () => ({ capture: vi.fn() }),
    useOnboarding: () => ({ updateOnboardingStep: vi.fn() }),
    usePageMeta: vi.fn(),
  }
})

vi.mock('@/data/document', async () => {
  const { reactive } = await import('vue')
  return {
    useDocument: () => ({
      document: reactive({
        doc: { name: 'CONTACT-1' },
        save: api.save,
        reload: api.docReload,
      }),
      triggerOnChange: vi.fn(),
      assignees: { reload: vi.fn(), data: [] },
      sections: { reload: vi.fn(), data: [] },
      permissions: { data: { permissions: { delete: true } } },
      scripts: { data: [] },
      triggerOnRender: vi.fn(),
    }),
  }
})

vi.mock('@/stores/statuses', () => ({
  statusesStore: () => ({
    getDealStatus: () => ({ type: 'Open', color: 'text-gray-600' }),
    statusOptions: () => [],
  }),
}))

vi.mock('@/stores/organizations', () => ({
  organizationsStore: () => ({
    getOrganization: (n) => (n === 'Acme' ? { organization_logo: '/acme.png' } : undefined),
  }),
}))

vi.mock('@/stores/users', () => ({
  usersStore: () => ({
    getUser: (e) => ({ full_name: e, user_image: '' }),
    isManager: () => true,
  }),
}))

vi.mock('@/stores/global', () => ({
  globalStore: () => ({
    $dialog: vi.fn(),
    $socket: { on: vi.fn(), off: vi.fn() },
    makeCall: vi.fn(),
  }),
}))

vi.mock('@/stores/settings', async () => {
  const { ref } = await import('vue')
  return {
    getSettings: () => ({
      brand: ref({ favicon: '/f.ico' }),
      _settings: { doc: {} },
    }),
    isTranslatable: () => false,
  }
})

vi.mock('@/stores/meta', async () => {
  const { ref } = await import('vue')
  return {
    getMeta: () => ({
      doctypeMeta: ref({ title_field: 'full_name' }),
      getFormattedCurrency: (f, d) => `₹${d[f]}`,
      getFields: () => [],
      doctypesMeta: {},
    }),
  }
})

vi.mock('@/utils/view', () => ({ getView: () => null }))

vi.mock('@/composables/doctypeModal', () => ({
  useDoctypeModal: () => ({ showModal: api.showModal }),
}))

vi.mock('@/composables/useBroadcast', () => ({
  useBroadcast: () => ({ on: vi.fn(), send: vi.fn(), off: vi.fn() }),
}))

const nav = vi.hoisted(() => ({ push: vi.fn() }))
const ROUTE = vi.hoisted(() => ({ query: {}, params: {}, hash: '' }))
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useRouter: () => nav, useRoute: () => ROUTE }
})

import ContactPage from '@/pages/Contact.vue'
import { mountComponent } from '../helpers/mount'
import { flushPromises } from '@vue/test-utils'

const STUBS = {
  LayoutHeader: true, Breadcrumbs: true, Activities: true,
  SidePanelLayout: true, Dropdown: true, Tooltip: true, Tabs: true,
  FileUploader: true, DeleteLinkedDocModal: true, ErrorPage: true,
  CustomActions: true, Avatar: true, Button: true, ListView: true,
  AddressModal: true, ContactModal: true,
}

const mountPage = () =>
  mountComponent(ContactPage, {
    props: { contactId: 'CONTACT-1' },
    global: { stubs: STUBS, mocks: { $route: ROUTE } },
  })

describe('Contact page', () => {
  beforeEach(() => {
    api.call.mockReset().mockResolvedValue({ name: 'ok' })
    api.save.submit.mockClear()
    api.toast.success.mockClear()
    api.docReload.mockClear()
    api.showModal.mockClear()
    nav.push.mockClear()
  })

  describe('setting a value as primary', () => {
    it('posts the field and value against the contact', async () => {
      const wrapper = mountPage()
      await wrapper.vm.setAsPrimary('email_id', 'ada@x.com')
      expect(api.call).toHaveBeenCalledWith('crm.api.contact.set_as_primary', {
        contact: 'CONTACT-1',
        field: 'email_id',
        value: 'ada@x.com',
      })
    })

    it('refreshes and confirms once it lands', async () => {
      const wrapper = mountPage()
      await wrapper.vm.setAsPrimary('email_id', 'ada@x.com')
      await flushPromises()
      expect(api.docReload).toHaveBeenCalled()
      expect(api.toast.success).toHaveBeenCalledWith('Contact Updated')
    })

    it('stays quiet when the server returns nothing', async () => {
      api.call.mockResolvedValue(null)
      const wrapper = mountPage()
      await wrapper.vm.setAsPrimary('email_id', 'ada@x.com')
      await flushPromises()
      expect(api.toast.success).not.toHaveBeenCalled()
    })
  })

  describe('adding a new email or phone', () => {
    it('posts the new value', async () => {
      const wrapper = mountPage()
      await wrapper.vm.createNew('email_id', 'new@x.com')
      expect(api.call).toHaveBeenCalledWith('crm.api.contact.create_new', {
        contact: 'CONTACT-1',
        field: 'email_id',
        value: 'new@x.com',
      })
    })

    it('does nothing for an empty value', async () => {
      // The inline editor fires on blur, including when nothing was typed.
      const wrapper = mountPage()
      await wrapper.vm.createNew('email_id', '')
      expect(api.call).not.toHaveBeenCalled()
    })

    it('refreshes once it lands', async () => {
      const wrapper = mountPage()
      await wrapper.vm.createNew('email_id', 'new@x.com')
      await flushPromises()
      expect(api.docReload).toHaveBeenCalled()
    })
  })

  describe('editing an existing option', () => {
    it('sets the value on the child row', async () => {
      const wrapper = mountPage()
      await wrapper.vm.editOption('Contact Email', 'ROW-1', 'email_id', 'e@x.com')
      expect(api.call).toHaveBeenCalledWith('frappe.client.set_value', {
        doctype: 'Contact Email',
        name: 'ROW-1',
        fieldname: 'email_id',
        value: 'e@x.com',
      })
    })

    it('refreshes once it lands', async () => {
      const wrapper = mountPage()
      await wrapper.vm.editOption('Contact Email', 'ROW-1', 'email_id', 'e@x.com')
      await flushPromises()
      expect(api.docReload).toHaveBeenCalled()
    })
  })

  describe('deleting an option', () => {
    it('deletes the child row', async () => {
      const wrapper = mountPage()
      await wrapper.vm.deleteOption('Contact Email', 'ROW-1')
      expect(api.call).toHaveBeenCalledWith('frappe.client.delete', {
        doctype: 'Contact Email',
        name: 'ROW-1',
      })
    })

    it('confirms even though delete returns nothing', async () => {
      // Unlike the others, this path does not gate on a return value.
      api.call.mockResolvedValue(undefined)
      const wrapper = mountPage()
      await wrapper.vm.deleteOption('Contact Email', 'ROW-1')
      await flushPromises()
      expect(api.docReload).toHaveBeenCalled()
      expect(api.toast.success).toHaveBeenCalledWith('Contact Updated')
    })
  })

  describe('linked deals', () => {
    it('shapes a deal row for the list', () => {
      const wrapper = mountPage()
      const row = wrapper.vm.getDealRowObject({
        name: 'DEAL-1',
        organization: 'Acme',
        annual_revenue: 5000,
        status: 'Open',
        modified: '2026-08-20 09:00:00',
      })
      expect(row.name).toBe('DEAL-1')
      expect(row.annual_revenue).toBe('₹5000')
      expect(row.status).toMatchObject({ label: 'Open' })
    })
  })

  // FileUploader hands back the uploaded file, but the same handler is used to
  // clear the image, and then it is called with nothing.
  describe('the contact photo', () => {
    it('stores the uploaded file and saves', () => {
      const wrapper = mountPage()
      wrapper.vm.changeContactImage({ file_url: '/files/ada.png' })
      expect(wrapper.vm.contact.doc.image).toBe('/files/ada.png')
      expect(api.save.submit).toHaveBeenCalled()
    })

    it('clears the image when called with nothing', () => {
      const wrapper = mountPage()
      wrapper.vm.contact.doc.image = '/files/ada.png'
      expect(() => wrapper.vm.changeContactImage()).not.toThrow()
      expect(wrapper.vm.contact.doc.image).toBe('')
      expect(api.save.submit).toHaveBeenCalled()
    })

    it('confirms the change to the user', async () => {
      const wrapper = mountPage()
      wrapper.vm.changeContactImage({ file_url: '/files/ada.png' })
      api.save.submit.mock.calls.at(-1)[1].onSuccess()
      expect(api.toast.success).toHaveBeenCalledWith('Contact image updated')
    })
  })

  describe('the address field', () => {
    it('opens the address modal', () => {
      const wrapper = mountPage()
      wrapper.vm.showAddressModal()
      expect(api.showModal).toHaveBeenCalledWith(
        expect.objectContaining({ doctype: 'Address' }),
      )
    })
  })

  // A contact holds many addresses and numbers but exactly one of each is
  // primary. The side panel renders them as a dropdown whose ticked row is the
  // primary one — get that wrong and the panel shows the right list marked
  // against the wrong entry, which reads as data corruption rather than a UI
  // slip.
  describe('the multi-value dropdowns', () => {
    const withValues = (fields) => {
      const wrapper = mountPage()
      Object.assign(wrapper.vm.contact.doc, {
        email_id: 'ada@x.com',
        email_ids: [
          { name: 'ROW-1', email_id: 'ada@x.com' },
          { name: 'ROW-2', email_id: 'grace@x.com' },
        ],
        mobile_no: '222',
        phone_nos: [
          { name: 'PH-1', phone: '111' },
          { name: 'PH-2', phone: '222' },
        ],
      })
      wrapper.vm.sections.data = [
        { name: 'S', columns: [{ fields }] },
      ]
      return wrapper
    }

    const fieldNamed = (wrapper, fieldname) =>
      wrapper.vm.parsedSections[0].columns[0].fields.find(
        (f) => f.fieldname === fieldname,
      )

    it('ticks the primary email and no other', () => {
      const wrapper = withValues([{ fieldname: 'email_id', label: 'Email' }])
      expect(
        fieldNamed(wrapper, 'email_id').options.map((o) => [o.value, o.selected]),
      ).toEqual([
        ['ada@x.com', true],
        ['grace@x.com', false],
      ])
    })

    it('ticks the primary number and no other', () => {
      const wrapper = withValues([{ fieldname: 'mobile_no', label: 'Mobile' }])
      expect(
        fieldNamed(wrapper, 'mobile_no').options.map((o) => [o.value, o.selected]),
      ).toEqual([
        ['111', false],
        ['222', true],
      ])
    })

    it('ticks nothing when no value has been made primary', () => {
      const wrapper = withValues([{ fieldname: 'email_id', label: 'Email' }])
      wrapper.vm.contact.doc.email_id = ''
      expect(
        fieldNamed(wrapper, 'email_id').options.every((o) => !o.selected),
      ).toBe(true)
    })

    it('turns the field into a dropdown that can still be edited', () => {
      const wrapper = withValues([
        { fieldname: 'email_id', label: 'Email', read_only: 1 },
      ])
      const f = fieldNamed(wrapper, 'email_id')
      expect(f.fieldtype).toBe('Dropdown')
      expect(f.read_only).toBe(false)
    })

    it('leaves an unrelated field alone', () => {
      const wrapper = withValues([
        { fieldname: 'company_name', label: 'Company', fieldtype: 'Data' },
      ])
      const f = fieldNamed(wrapper, 'company_name')
      expect(f.fieldtype).toBe('Data')
      expect(f.options).toBeUndefined()
    })
  })
})
