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

// The document fixture is rebuilt per mount so a test that mutates
// `contact.doc.email_ids` cannot leak into the next one.
const state = vi.hoisted(() => ({
  contact: null,
  canDelete: true,
  docFields: null,
}))

vi.mock('@/data/document', async () => {
  const { reactive } = await import('vue')
  return {
    useDocument: () => {
      state.contact = reactive({
        doc: state.docFields,
        save: api.save,
        reload: api.docReload,
      })
      return {
        document: state.contact,
        permissions: reactive({
          data: { permissions: { delete: state.canDelete } },
        }),
        sections: { reload: vi.fn(), data: [] },
        assignees: { reload: vi.fn(), data: [] },
        scripts: { data: [] },
        triggerOnChange: vi.fn(),
        triggerOnRender: vi.fn(),
        triggerOnBeforeCreate: vi.fn(),
      }
    },
  }
})

vi.mock('@/stores/statuses', () => ({
  statusesStore: () => ({
    getDealStatus: (s) => (s === 'Open' ? { color: 'text-green-600' } : undefined),
    statusOptions: () => [],
  }),
}))

vi.mock('@/stores/organizations', () => ({
  organizationsStore: () => ({
    getOrganization: (n) =>
      n === 'Acme' ? { organization_logo: '/acme.png' } : undefined,
  }),
}))

vi.mock('@/stores/users', () => ({
  usersStore: () => ({
    getUser: (e) => ({ full_name: `User ${e}`, user_image: '' }),
    isManager: () => true,
  }),
}))

const globals = vi.hoisted(() => ({ dialog: vi.fn(), makeCall: vi.fn() }))
vi.mock('@/stores/global', () => ({
  globalStore: () => ({
    $dialog: globals.dialog,
    $socket: { on: vi.fn(), off: vi.fn() },
    makeCall: globals.makeCall,
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

const views = vi.hoisted(() => ({ current: null }))
vi.mock('@/utils/view', () => ({ getView: () => views.current }))

vi.mock('@/composables/doctypeModal', () => ({
  useDoctypeModal: () => ({ showModal: api.showModal }),
}))

vi.mock('@/composables/useBroadcast', () => ({
  useBroadcast: () => ({ on: vi.fn(), send: vi.fn(), off: vi.fn() }),
}))

const tel = vi.hoisted(() => ({ callEnabled: null }))
vi.mock('@/composables/telephony', async () => {
  const { ref, computed } = await import('vue')
  tel.callEnabled = ref(false)
  return {
    callEnabled: tel.callEnabled,
    defaultCallingMedium: ref(''),
    setEnabled: vi.fn(),
    useTelephony: () => ({
      integrations: computed(() => []),
      isEnabled: () => false,
      isAnyEnabled: computed(() => false),
    }),
  }
})

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }))
const ROUTE = vi.hoisted(() => ({
  query: {},
  params: {},
  hash: '',
  name: 'MobileContact',
  path: '/contacts/CONTACT-1',
}))
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useRouter: () => nav, useRoute: () => ROUTE }
})

import MobileContact from '@/pages/MobileContact.vue'
import { mountComponent } from '../helpers/mount'
import { flushPromises } from '@vue/test-utils'

// Renders both slots so the mobile tab strip and the panel bodies are real
// output rather than an opaque stub.
const TabsStub = {
  props: ['tabs', 'modelValue'],
  template: `
    <div class="stub-tabs">
      <div class="stub-tablist">
        <template v-for="(tab, i) in tabs" :key="i">
          <slot name="tab-item" :tab="tab" :selected="i === modelValue" />
        </template>
      </div>
      <div class="stub-tabpanel" v-for="(tab, i) in tabs" :key="'p' + i">
        <slot name="tab-panel" :tab="tab" />
      </div>
    </div>`,
}

const FileUploaderStub = {
  props: ['validateFile'],
  template: `
    <div class="stub-uploader">
      <slot :openFileSelector="() => {}" :error="null" />
    </div>`,
}

const STUBS = {
  LayoutHeader: true,
  Breadcrumbs: true,
  SidePanelLayout: true,
  DealsListView: true,
  Dropdown: true,
  Avatar: true,
  Tabs: TabsStub,
  FileUploader: FileUploaderStub,
}

const contactDoc = () => ({
  name: 'CONTACT-1',
  full_name: 'Ada Lovelace',
  salutation: 'Ms',
  image: '',
  company_name: 'Acme',
  mobile_no: '+1-555-0100',
  email_id: 'ada@x.com',
  email_ids: [
    { name: 'EMAIL-1', email_id: 'ada@x.com' },
    { name: 'EMAIL-2', email_id: 'grace@x.com' },
  ],
  phone_nos: [
    { name: 'PHONE-1', phone: '+1-555-0100' },
    { name: 'PHONE-2', phone: '+1-555-0199' },
  ],
})

const sectionsFixture = () => [
  {
    name: 'contact_details',
    label: 'Contact Details',
    columns: [
      {
        fields: [
          { fieldname: 'email_id', label: 'Email', fieldtype: 'Data' },
          { fieldname: 'mobile_no', label: 'Mobile No', fieldtype: 'Data' },
          { fieldname: 'address', label: 'Address', fieldtype: 'Link' },
          { fieldname: 'company_name', label: 'Organization', fieldtype: 'Link' },
        ],
      },
    ],
  },
]

const emailField = (parsed) => parsed[0].columns[0].fields[0]
const mobileField = (parsed) => parsed[0].columns[0].fields[1]
const addressField = (parsed) => parsed[0].columns[0].fields[2]

const mountPage = () =>
  mountComponent(MobileContact, {
    props: { contactId: 'CONTACT-1' },
    global: { stubs: STUBS, mocks: { $route: ROUTE } },
  })

describe('Mobile contact page', () => {
  beforeEach(() => {
    api.call.mockReset().mockResolvedValue({ name: 'ok' })
    api.save.submit.mockClear()
    api.showModal.mockClear()
    api.toast.success.mockClear()
    api.toast.error.mockClear()
    api.docReload.mockClear()
    globals.dialog.mockClear()
    globals.makeCall.mockClear()
    nav.push.mockClear()
    tel.callEnabled.value = false
    views.current = null
    state.canDelete = true
    state.docFields = contactDoc()
    ROUTE.query = {}
  })

  describe('setting a value as primary', () => {
    it('posts the field and value against the contact', async () => {
      const wrapper = mountPage()
      await wrapper.vm.setAsPrimary('email', 'grace@x.com')
      expect(api.call).toHaveBeenCalledWith('crm.api.contact.set_as_primary', {
        contact: 'CONTACT-1',
        field: 'email',
        value: 'grace@x.com',
      })
    })

    it('refreshes and confirms once it lands', async () => {
      const wrapper = mountPage()
      await wrapper.vm.setAsPrimary('email', 'grace@x.com')
      await flushPromises()
      expect(api.docReload).toHaveBeenCalled()
      expect(api.toast.success).toHaveBeenCalledWith('Contact Updated')
    })

    it('stays quiet when the server returns nothing', async () => {
      api.call.mockResolvedValue(null)
      const wrapper = mountPage()
      await wrapper.vm.setAsPrimary('email', 'grace@x.com')
      await flushPromises()
      expect(api.docReload).not.toHaveBeenCalled()
      expect(api.toast.success).not.toHaveBeenCalled()
    })
  })

  describe('adding a new email or phone', () => {
    it('posts the new value', async () => {
      const wrapper = mountPage()
      await wrapper.vm.createNew('phone', '+1-555-0200')
      expect(api.call).toHaveBeenCalledWith('crm.api.contact.create_new', {
        contact: 'CONTACT-1',
        field: 'phone',
        value: '+1-555-0200',
      })
    })

    it('does nothing for an empty value', async () => {
      // The inline editor fires on blur, including when nothing was typed.
      const wrapper = mountPage()
      await wrapper.vm.createNew('email', '')
      expect(api.call).not.toHaveBeenCalled()
    })

    it('refreshes once it lands', async () => {
      const wrapper = mountPage()
      await wrapper.vm.createNew('email', 'new@x.com')
      await flushPromises()
      expect(api.docReload).toHaveBeenCalled()
      expect(api.toast.success).toHaveBeenCalledWith('Contact Updated')
    })
  })

  describe('editing an existing option', () => {
    it('sets the value on the child row', async () => {
      const wrapper = mountPage()
      await wrapper.vm.editOption('Contact Phone', 'PHONE-1', 'phone', '+1-555-0300')
      expect(api.call).toHaveBeenCalledWith('frappe.client.set_value', {
        doctype: 'Contact Phone',
        name: 'PHONE-1',
        fieldname: 'phone',
        value: '+1-555-0300',
      })
    })

    it('stays quiet when the server returns nothing', async () => {
      api.call.mockResolvedValue(null)
      const wrapper = mountPage()
      await wrapper.vm.editOption('Contact Email', 'EMAIL-1', 'email_id', 'e@x.com')
      await flushPromises()
      expect(api.docReload).not.toHaveBeenCalled()
    })
  })

  describe('deleting an option', () => {
    it('deletes the child row', async () => {
      const wrapper = mountPage()
      await wrapper.vm.deleteOption('Contact Email', 'EMAIL-2')
      expect(api.call).toHaveBeenCalledWith('frappe.client.delete', {
        doctype: 'Contact Email',
        name: 'EMAIL-2',
      })
    })

    it('confirms even though delete returns nothing', () => {
      // Unlike the others, this path does not gate on a return value.
      api.call.mockResolvedValue(undefined)
      const wrapper = mountPage()
      return wrapper.vm.deleteOption('Contact Email', 'EMAIL-2').then(() => {
        expect(api.docReload).toHaveBeenCalled()
        expect(api.toast.success).toHaveBeenCalledWith('Contact Updated')
      })
    })
  })

  describe('the email dropdown built for the side panel', () => {
    it('turns every stored email into an option and marks the primary one', () => {
      const wrapper = mountPage()
      const field = emailField(wrapper.vm.getParsedSections(sectionsFixture()))
      expect(field.options.map((o) => o.value)).toEqual([
        'ada@x.com',
        'grace@x.com',
      ])
      expect(field.options.map((o) => o.selected)).toEqual([true, false])
    })

    it('promotes an email to primary when its option is clicked', async () => {
      const wrapper = mountPage()
      const field = emailField(wrapper.vm.getParsedSections(sectionsFixture()))
      field.options[1].onClick()
      await flushPromises()
      expect(api.call).toHaveBeenCalledWith('crm.api.contact.set_as_primary', {
        contact: 'CONTACT-1',
        field: 'email',
        value: 'grace@x.com',
      })
    })

    it('creates a row for a brand new option and edits an existing one', async () => {
      const wrapper = mountPage()
      const field = emailField(wrapper.vm.getParsedSections(sectionsFixture()))
      field.options[0].onSave({ name: 'new-1', value: 'new@x.com' }, true)
      await flushPromises()
      expect(api.call).toHaveBeenLastCalledWith('crm.api.contact.create_new', {
        contact: 'CONTACT-1',
        field: 'email',
        value: 'new@x.com',
      })

      field.options[0].onSave({ name: 'EMAIL-1', value: 'ada2@x.com' }, false)
      await flushPromises()
      expect(api.call).toHaveBeenLastCalledWith('frappe.client.set_value', {
        doctype: 'Contact Email',
        name: 'EMAIL-1',
        fieldname: 'email_id',
        value: 'ada2@x.com',
      })
    })

    it('drops an unsaved option locally without calling the server', async () => {
      const wrapper = mountPage()
      const field = emailField(wrapper.vm.getParsedSections(sectionsFixture()))
      await field.options[1].onDelete({ name: 'EMAIL-2' }, true)
      expect(wrapper.vm.contact.doc.email_ids.map((e) => e.name)).toEqual([
        'EMAIL-1',
      ])
      expect(api.call).not.toHaveBeenCalled()
    })

    it('deletes a saved option on the server as well', async () => {
      const wrapper = mountPage()
      const field = emailField(wrapper.vm.getParsedSections(sectionsFixture()))
      await field.options[1].onDelete({ name: 'EMAIL-2' }, false)
      expect(api.call).toHaveBeenCalledWith('frappe.client.delete', {
        doctype: 'Contact Email',
        name: 'EMAIL-2',
      })
    })

    it('appends a blank row when the panel asks for a new email', () => {
      const wrapper = mountPage()
      const field = emailField(wrapper.vm.getParsedSections(sectionsFixture()))
      field.create()
      expect(wrapper.vm.contact.doc.email_ids.at(-1)).toMatchObject({
        name: 'new-1',
        value: '',
        isNew: true,
      })
    })

    it('tags the field with an unrecognised dropdown key', () => {
      // BUG: SidePanelLayout branches on `fieldtype === 'Dropdown'`, but this
      // page writes `type: 'dropdown'`, so the editor never renders on mobile.
      const wrapper = mountPage()
      const field = emailField(wrapper.vm.getParsedSections(sectionsFixture()))
      expect(field.type).toBe('dropdown')
      expect(field.fieldtype).toBe('Data')
    })
  })

  describe('the mobile number and address fields', () => {
    it('leaves the mobile field untouched', () => {
      // BUG: the branch tests `field.name`, but sidepanel fields are keyed by
      // `fieldname` — so phone numbers never become an editable dropdown.
      const wrapper = mountPage()
      const field = mobileField(wrapper.vm.getParsedSections(sectionsFixture()))
      expect(field.options).toBeUndefined()
      expect(field.fieldtype).toBe('Data')
    })

    it('leaves the address field without its create and edit hooks', () => {
      // BUG: same `field.name` mismatch — the address modal is unreachable
      // from the mobile side panel.
      const wrapper = mountPage()
      const field = addressField(wrapper.vm.getParsedSections(sectionsFixture()))
      expect(field.create).toBeUndefined()
      expect(field.edit).toBeUndefined()
    })
  })

  describe('breadcrumbs', () => {
    it('walks from the contact list to this contact', () => {
      const wrapper = mountPage()
      expect(wrapper.vm.breadcrumbs).toEqual([
        { label: 'Contacts', route: { name: 'Contacts' } },
        {
          label: 'Ada Lovelace',
          route: { name: 'Contact', params: { contactId: 'CONTACT-1' } },
        },
      ])
    })

    it('slots the saved view in between when the url names one', () => {
      ROUTE.query = { view: 'my-view', viewType: 'list' }
      views.current = { label: 'My View', icon: 'star' }
      const wrapper = mountPage()
      expect(wrapper.vm.breadcrumbs[1]).toEqual({
        label: 'My View',
        icon: 'star',
        route: {
          name: 'Contacts',
          params: { viewType: 'list' },
          query: { view: 'my-view' },
        },
      })
    })

    it('skips the view crumb when the view no longer exists', () => {
      ROUTE.query = { view: 'deleted-view' }
      views.current = null
      const wrapper = mountPage()
      expect(wrapper.vm.breadcrumbs).toHaveLength(2)
    })

    it('falls back to the contact id when the title field is blank', () => {
      state.docFields = { ...contactDoc(), full_name: '' }
      const wrapper = mountPage()
      expect(wrapper.vm.title).toBe('CONTACT-1')
    })
  })

  describe('the contact image', () => {
    it('saves the uploaded file url', () => {
      const wrapper = mountPage()
      wrapper.vm.changeContactImage({ file_url: '/files/ada.png' })
      expect(wrapper.vm.contact.doc.image).toBe('/files/ada.png')
      expect(api.save.submit).toHaveBeenCalled()
    })

    it('clears the image when removal passes no file', () => {
      const wrapper = mountPage()
      wrapper.vm.changeContactImage('')
      expect(wrapper.vm.contact.doc.image).toBe('')
    })

    it('confirms the save through a toast', () => {
      const wrapper = mountPage()
      wrapper.vm.changeContactImage({ file_url: '/files/ada.png' })
      const [, options] = api.save.submit.mock.calls[0]
      options.onSuccess()
      expect(api.toast.success).toHaveBeenCalledWith('Contact Image Updated')
    })
  })

  describe('deleting the contact', () => {
    it('offers a delete button only when the user may delete', () => {
      const withPermission = mountPage()
      expect(withPermission.text()).toContain('Delete')

      state.canDelete = false
      const withoutPermission = mountPage()
      expect(withoutPermission.text()).not.toContain('Delete')
    })

    it('asks for confirmation before deleting anything', async () => {
      const wrapper = mountPage()
      await wrapper.vm.deleteContact()
      expect(globals.dialog).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Delete Contact' }),
      )
      expect(api.call).not.toHaveBeenCalled()
    })

    it('deletes and returns to the list once confirmed', async () => {
      const wrapper = mountPage()
      await wrapper.vm.deleteContact()
      const close = vi.fn()
      await globals.dialog.mock.calls[0][0].actions[0].onClick(close)
      expect(api.call).toHaveBeenCalledWith('frappe.client.delete', {
        doctype: 'Contact',
        name: 'CONTACT-1',
      })
      expect(close).toHaveBeenCalled()
      expect(nav.push).toHaveBeenCalledWith({ name: 'Contacts' })
    })
  })

  describe('calling the contact', () => {
    it('hides the call button while no telephony integration is on', () => {
      const wrapper = mountPage()
      expect(wrapper.text()).not.toContain('Make a Call')
    })

    it('dials the mobile number once telephony is enabled', async () => {
      tel.callEnabled.value = true
      const wrapper = mountPage()
      const button = wrapper
        .findAll('button')
        .find((b) => b.text().includes('Make a Call'))
      expect(button).toBeTruthy()
      await button.trigger('click')
      expect(globals.makeCall).toHaveBeenCalledWith('+1-555-0100')
    })

    it('hides the call button for a contact with no mobile number', () => {
      tel.callEnabled.value = true
      state.docFields = { ...contactDoc(), mobile_no: '' }
      const wrapper = mountPage()
      expect(wrapper.text()).not.toContain('Make a Call')
    })
  })

  describe('the linked deals tab', () => {
    it('shapes a deal row for the list', () => {
      const wrapper = mountPage()
      const row = wrapper.vm.getDealRowObject({
        name: 'DEAL-1',
        organization: 'Acme',
        annual_revenue: 5000,
        status: 'Open',
        email: 'ada@x.com',
        mobile_no: '+1-555-0100',
        deal_owner: 'sales@x.com',
        modified: '2026-03-14 09:00:00',
      })
      expect(row).toMatchObject({
        name: 'DEAL-1',
        organization: { label: 'Acme', logo: '/acme.png' },
        annual_revenue: '₹5000',
        status: { label: 'Open', color: 'text-green-600' },
        deal_owner: { label: 'User sales@x.com' },
      })
      expect(row.modified.label).toBeTruthy()
    })

    it('leaves the owner blank when a deal is unassigned', () => {
      const wrapper = mountPage()
      const row = wrapper.vm.getDealRowObject({
        name: 'DEAL-2',
        organization: 'Nowhere Ltd',
        annual_revenue: 0,
        status: 'Open',
        deal_owner: '',
        modified: '2026-03-14 09:00:00',
      })
      expect(row.deal_owner.label).toBe('')
      expect(row.organization.logo).toBeUndefined()
    })

    it('reports no rows until the linked deals arrive', () => {
      const wrapper = mountPage()
      expect(wrapper.vm.rows).toEqual([])
      expect(wrapper.vm.tabs[1].count.value).toBeUndefined()
    })

    it('shows the empty state instead of the list when there are no deals', () => {
      const wrapper = mountPage()
      expect(wrapper.text()).toContain('No deals found')
      expect(wrapper.find('deals-list-view-stub').exists()).toBe(false)
    })

    it('renders the deals list once the resource returns rows', async () => {
      const wrapper = mountPage()
      wrapper.vm.deals.data = [
        {
          name: 'DEAL-1',
          organization: 'Acme',
          annual_revenue: 5000,
          status: 'Open',
          deal_owner: 'sales@x.com',
          modified: '2026-03-14 09:00:00',
        },
      ]
      await flushPromises()
      expect(wrapper.vm.rows).toHaveLength(1)
      expect(wrapper.vm.tabs[1].count.value).toBe(1)
      expect(wrapper.find('deals-list-view-stub').exists()).toBe(true)
      expect(wrapper.text()).not.toContain('No deals found')
    })
  })

  describe('the details tab', () => {
    it('holds the side panel back until the layout sections load', async () => {
      const wrapper = mountPage()
      expect(wrapper.find('side-panel-layout-stub').exists()).toBe(false)

      wrapper.vm.sections.data = sectionsFixture()
      await flushPromises()
      expect(wrapper.find('side-panel-layout-stub').exists()).toBe(true)
    })

    it('renders no tab trigger for details', () => {
      // BUG: the `tab-item` slot replaces the default trigger for every tab
      // but only renders markup for Deals, so Details has no button and a
      // reader who switches away cannot switch back.
      const wrapper = mountPage()
      const triggers = wrapper.findAll('.stub-tablist button')
      expect(triggers).toHaveLength(1)
      expect(triggers[0].text()).toContain('Deals')
    })
  })
})
