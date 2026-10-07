const api = vi.hoisted(() => ({
  toast: null,
  call: vi.fn(),
  save: { submit: vi.fn() },
  openExternal: vi.fn(),
  docReload: vi.fn(),
  showModal: vi.fn(),
  capture: vi.fn(),
  dialog: vi.fn(),
  lists: {},
}))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  api.toast = { error: vi.fn(), success: vi.fn(), warning: vi.fn() }
  const inert = (options = {}) => {
    const resource = reactive({
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
    // The page builds one list resource per doctype; keep them addressable so
    // a test can hand them rows.
    if (options.doctype) api.lists[options.doctype] = resource
    if (options.url?.includes('get_sidepanel_sections')) api.sections = resource
    return resource
  }
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
    useTelemetry: () => ({ capture: api.capture }),
    useOnboarding: () => ({ updateOnboardingStep: vi.fn() }),
    usePageMeta: vi.fn(),
  }
})

const perms = vi.hoisted(() => ({ data: { permissions: { delete: true } } }))
const docs = vi.hoisted(() => ({ ref: null }))
vi.mock('@/data/document', async () => {
  const { reactive } = await import('vue')
  return {
    useDocument: () => {
      docs.ref = reactive({
        doc: {},
        save: api.save,
        reload: api.docReload,
      })
      return {
        document: docs.ref,
        triggerOnChange: vi.fn(),
        triggerOnBeforeCreate: vi.fn(),
        assignees: { reload: vi.fn(), data: [] },
        sections: { reload: vi.fn(), data: [] },
        permissions: perms,
        scripts: { data: [] },
        triggerOnRender: vi.fn(),
      }
    },
  }
})

vi.mock('@/composables/doctypeModal', () => ({
  useDoctypeModal: () => ({
    show: { value: false },
    doctype: { value: '' },
    name: { value: '' },
    title: { value: '' },
    defaults: { value: {} },
    showModal: api.showModal,
    triggerCallback: vi.fn(),
  }),
}))

vi.mock('@/stores/statuses', () => ({
  statusesStore: () => ({
    getDealStatus: () => ({ type: 'Open', color: 'text-gray-600' }),
    statusOptions: () => [],
  }),
}))

vi.mock('@/stores/users', () => ({
  usersStore: () => ({
    getUser: (e) => ({ full_name: `User ${e}`, user_image: '/u.png' }),
    isManager: () => true,
  }),
}))

vi.mock('@/stores/global', () => ({
  globalStore: () => ({
    $dialog: api.dialog,
    $socket: { on: vi.fn(), off: vi.fn() },
    makeCall: vi.fn(),
  }),
}))

vi.mock('@/stores/settings', async () => {
  const { ref } = await import('vue')
  return {
    // timestampCell reads getSettings()._settings.doc, so it must exist.
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
      doctypeMeta: ref({ title_field: 'organization_name' }),
      getFormattedCurrency: (f, d) => `₹${d[f]}`,
      getFields: () => [],
      doctypesMeta: {},
    }),
  }
})

// The page imports it as `openWebsite as openExternalWebsite`, so the export
// to override is `openWebsite`.
vi.mock('@/utils', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, openWebsite: api.openExternal }
})

// utils/view.js calls viewsStore() at module scope, so importing it without
// an active Pinia throws before any test runs.
const view = vi.hoisted(() => ({ current: null }))
vi.mock('@/utils/view', () => ({ getView: () => view.current }))

vi.mock('@/composables/useBroadcast', () => ({
  useBroadcast: () => ({ on: vi.fn(), send: vi.fn(), off: vi.fn() }),
}))

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }))
const ROUTE = vi.hoisted(() => ({
  query: {},
  params: {},
  hash: '',
  name: 'Organization',
  path: '/organizations/ORG-1',
}))
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useRouter: () => nav, useRoute: () => ROUTE }
})

import MobileOrganizationPage from '@/pages/MobileOrganization.vue'
import { mountComponent } from '../helpers/mount'
import { flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

// The real Tabs keeps every panel mounted; rendering only the selected one is
// enough to see what each tab hands its list view.
const TabsStub = {
  name: 'Tabs',
  props: ['modelValue', 'tabs'],
  template:
    '<div class="stub-tabs"><slot name="tab-panel" :tab="tabs[modelValue]" /></div>',
}

const FileUploaderStub = {
  name: 'FileUploader',
  props: ['validateFile'],
  setup: () => ({ openFileSelector: () => {} }),
  template:
    '<div class="stub-uploader"><slot :openFileSelector="openFileSelector" :error="\'\'" /></div>',
}

const SidePanelLayoutStub = {
  name: 'SidePanelLayout',
  props: ['sections', 'doctype', 'docname'],
  template: '<div class="stub-side-panel" :data-docname="docname" />',
}

const DealsListViewStub = {
  name: 'DealsListView',
  props: ['rows', 'columns', 'options'],
  template: '<div class="stub-deals-list" />',
}

const ContactsListViewStub = {
  name: 'ContactsListView',
  props: ['rows', 'columns', 'options'],
  template: '<div class="stub-contacts-list" />',
}

const STUBS = {
  LayoutHeader: true,
  Breadcrumbs: true,
  Dropdown: true,
  Tooltip: true,
  Avatar: true,
  Tabs: TabsStub,
  FileUploader: FileUploaderStub,
  SidePanelLayout: SidePanelLayoutStub,
  DealsListView: DealsListViewStub,
  ContactsListView: ContactsListViewStub,
}

const mountPage = () =>
  mountComponent(MobileOrganizationPage, {
    props: { organizationId: 'ORG-1' },
    global: { stubs: STUBS, mocks: { $route: ROUTE } },
  })

describe('Mobile organization page', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T10:00:00'))
    api.call.mockReset().mockResolvedValue({ name: 'ok' })
    api.save.submit.mockClear()
    api.toast.error.mockClear()
    api.openExternal.mockClear()
    api.docReload.mockClear()
    api.showModal.mockClear()
    api.capture.mockClear()
    api.dialog.mockClear()
    api.lists = {}
    nav.push.mockClear()
    perms.data = { permissions: { delete: true } }
    view.current = null
    ROUTE.query = {}
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('breadcrumbs', () => {
    it('files the organization under the organization list', () => {
      const wrapper = mountPage()
      const items = wrapper.vm.breadcrumbs
      expect(items).toHaveLength(2)
      expect(items[0]).toEqual({
        label: 'Organizations',
        route: { name: 'Organizations' },
      })
      expect(items[1].route).toEqual({
        name: 'Organization',
        params: { organizationId: 'ORG-1' },
      })
    })

    it('keeps the originating view in the trail', () => {
      ROUTE.query = { view: 'my-view', viewType: 'group_by' }
      view.current = { label: 'Key accounts', icon: 'star' }
      const wrapper = mountPage()
      const items = wrapper.vm.breadcrumbs
      expect(items).toHaveLength(3)
      expect(items[1]).toEqual({
        label: 'Key accounts',
        icon: 'star',
        route: {
          name: 'Organizations',
          params: { viewType: 'group_by' },
          query: { view: 'my-view' },
        },
      })
    })

    it('drops the view crumb when the view no longer exists', () => {
      ROUTE.query = { view: 'deleted-view' }
      view.current = null
      const wrapper = mountPage()
      expect(wrapper.vm.breadcrumbs).toHaveLength(2)
    })
  })

  describe('the page title', () => {
    it('uses the doctype title field', async () => {
      const wrapper = mountPage()
      wrapper.vm.organization.doc = { organization_name: 'Acme Inc' }
      await nextTick()
      expect(wrapper.vm.title).toBe('Acme Inc')
      expect(wrapper.vm.breadcrumbs[1].label).toBe('Acme Inc')
    })

    it('falls back to the id while the document has no name yet', () => {
      const wrapper = mountPage()
      expect(wrapper.vm.title).toBe('ORG-1')
    })
  })

  describe('the organization logo', () => {
    it('stores the uploaded file against the organization', async () => {
      const wrapper = mountPage()
      await wrapper.vm.changeOrganizationImage({ file_url: '/files/logo.png' })
      expect(api.call).toHaveBeenCalledWith('frappe.client.set_value', {
        doctype: 'CRM Organization',
        name: 'ORG-1',
        fieldname: 'organization_logo',
        value: '/files/logo.png',
      })
    })

    it('clears the field when the image is removed', async () => {
      const wrapper = mountPage()
      await wrapper.vm.changeOrganizationImage('')
      expect(api.call).toHaveBeenCalledWith(
        'frappe.client.set_value',
        expect.objectContaining({ value: '' }),
      )
    })

    it('waits for the server before reloading the document', async () => {
      // Reloading early would pull the old logo back into view.
      let finish
      api.call.mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve
        }),
      )
      const wrapper = mountPage()
      const pending = wrapper.vm.changeOrganizationImage({ file_url: '/a.png' })
      await flushPromises()
      expect(api.docReload).not.toHaveBeenCalled()
      finish({})
      await pending
      expect(api.docReload).toHaveBeenCalled()
    })
  })

  describe('opening the website', () => {
    it('opens the stored address', () => {
      const wrapper = mountPage()
      wrapper.vm.organization.doc = { website: 'https://acme.com' }
      wrapper.vm.openWebsite()
      expect(api.openExternal).toHaveBeenCalledWith('https://acme.com')
    })

    it('says so when there is none rather than opening nothing', () => {
      const wrapper = mountPage()
      wrapper.vm.organization.doc = {}
      wrapper.vm.openWebsite()
      expect(api.openExternal).not.toHaveBeenCalled()
      expect(api.toast.error).toHaveBeenCalledWith('No Website Found')
    })
  })

  describe('deleting the organization', () => {
    it('asks for confirmation instead of deleting straight away', () => {
      const wrapper = mountPage()
      wrapper.vm.deleteOrganization()
      expect(api.dialog).toHaveBeenCalledTimes(1)
      expect(api.dialog.mock.calls[0][0].title).toBe('Delete Organization')
      expect(api.call).not.toHaveBeenCalled()
    })

    it('deletes and returns to the list once confirmed', async () => {
      const wrapper = mountPage()
      wrapper.vm.deleteOrganization()
      const close = vi.fn()
      await api.dialog.mock.calls[0][0].actions[0].onClick(close)
      expect(api.call).toHaveBeenCalledWith('frappe.client.delete', {
        doctype: 'CRM Organization',
        name: 'ORG-1',
      })
      expect(close).toHaveBeenCalled()
      expect(nav.push).toHaveBeenCalledWith({ name: 'Organizations' })
    })

    it('hides the delete button without the permission', () => {
      perms.data = { permissions: { delete: false } }
      const wrapper = mountPage()
      expect(wrapper.vm.canDelete).toBe(false)
      expect(wrapper.text()).not.toContain('Delete')
    })

    it('offers the delete button to a user who may delete', () => {
      const wrapper = mountPage()
      expect(wrapper.text()).toContain('Delete')
    })
  })

  describe('the address field in the side panel', () => {
    const sectionWith = (...fieldnames) => [
      {
        name: 'contact_details',
        columns: [{ fields: fieldnames.map((fieldname) => ({ fieldname })) }],
      },
    ]

    // Built in the `parsedSections` computed now, not the resource's
    // `transform` — a cached resource kept the first organization's closures,
    // so creating an address on one org wrote it onto another.
    const parsedWith = (wrapper, ...fieldnames) => {
      api.sections.data = sectionWith(...fieldnames)
      return wrapper.vm.parsedSections
    }

    it('adds create and edit handlers to the address field only', () => {
      const wrapper = mountPage()
      const [address, website] = parsedWith(wrapper, 'address', 'website')[0]
        .columns[0].fields
      expect(typeof address.create).toBe('function')
      expect(typeof address.edit).toBe('function')
      expect(website).toEqual({ fieldname: 'website' })
    })

    it('opens the existing address for editing', () => {
      const wrapper = mountPage()
      parsedWith(wrapper, 'address')[0].columns[0].fields[0].edit('ADDRESS-1')
      expect(api.showModal).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'ADDRESS-1', doctype: 'Address' }),
      )
    })

    it('closes the inline editor when a new address is started', () => {
      const wrapper = mountPage()
      const close = vi.fn()
      parsedWith(wrapper, 'address')[0].columns[0].fields[0].create(
        'typed value',
        close,
      )
      // The typed text now seeds the Address title instead of being written
      // onto the organization's link field and then discarded.
      expect(api.showModal).toHaveBeenCalledWith(
        expect.objectContaining({
          name: null,
          doctype: 'Address',
          defaults: expect.objectContaining({ address_title: 'typed value' }),
        }),
      )
      expect(close).toHaveBeenCalled()
    })

    it('links a newly created address back to the organization', () => {
      const wrapper = mountPage()
      parsedWith(wrapper, 'address')[0].columns[0].fields[0].edit('ADDRESS-1')
      const { callbacks } = api.showModal.mock.calls[0][0]
      callbacks.afterInsert({ name: 'ADDRESS-9' })
      expect(wrapper.vm.organization.doc.address).toBe('ADDRESS-9')
      expect(api.save.submit).toHaveBeenCalled()
      expect(api.capture).toHaveBeenCalledWith('address_created')
    })
  })

  describe('rows for the linked lists', () => {
    it('shapes a deal for the deals list', () => {
      const wrapper = mountPage()
      wrapper.vm.organization.doc = { organization_logo: '/logo.png' }
      const row = wrapper.vm.getDealRowObject({
        name: 'DEAL-1',
        organization: 'Acme Inc',
        annual_revenue: 5000,
        status: 'Open',
        email: 'a@acme.com',
        mobile_no: '9999',
        deal_owner: 'sales@acme.com',
        modified: '2026-03-15 08:00:00',
      })
      expect(row.name).toBe('DEAL-1')
      expect(row.annual_revenue).toBe('₹5000')
      expect(row.organization).toEqual({
        label: 'Acme Inc',
        logo: '/logo.png',
      })
      expect(row.status).toEqual({ label: 'Open', color: 'text-gray-600' })
      expect(row.deal_owner.label).toBe('User sales@acme.com')
      expect(row.deal_owner.user_image).toBe('/u.png')
      expect(row.modified.timeAgo).toBeTruthy()
    })

    it('leaves the owner blank when a deal is unassigned', () => {
      const wrapper = mountPage()
      const row = wrapper.vm.getDealRowObject({ name: 'DEAL-2', status: 'Open' })
      expect(row.deal_owner).toEqual({ label: undefined })
      expect(row.modified).toEqual({ label: '', timeAgo: '' })
    })

    it('shapes a contact for the contacts list', () => {
      const wrapper = mountPage()
      wrapper.vm.organization.doc = { organization_logo: '/logo.png' }
      const row = wrapper.vm.getContactRowObject({
        name: 'CONTACT-1',
        full_name: 'Jane Doe',
        image: '/jane.png',
        email_id: 'jane@acme.com',
        mobile_no: '8888',
        company_name: 'Acme Inc',
        modified: '2026-03-15 08:00:00',
      })
      expect(row.full_name).toEqual({
        label: 'Jane Doe',
        image_label: 'Jane Doe',
        image: '/jane.png',
      })
      // The list column is `email`, but the doctype field is `email_id`.
      expect(row.email).toBe('jane@acme.com')
      expect(row.company_name).toEqual({ label: 'Acme Inc', logo: '/logo.png' })
    })

    it('stays empty while the linked lists are still loading', () => {
      const wrapper = mountPage()
      expect(wrapper.vm.rows).toEqual([])
    })
  })

  describe('the tabs', () => {
    const load = ({ deals = [], contacts = [] } = {}) => {
      api.lists['CRM Deal'].data = deals
      api.lists['Contact'].data = contacts
    }

    it('opens on the details panel for this organization', async () => {
      const wrapper = mountPage()
      // `sections` is the page's own createResource, not the one useDocument
      // hands back, so the inert factory leaves it null and the panel is
      // v-if'd out until it has loaded.
      wrapper.vm.sections.data = [{ name: 'details', columns: [] }]
      wrapper.vm.organization.doc.name = 'ORG-1'
      await nextTick()
      const panel = wrapper.findComponent(SidePanelLayoutStub)
      expect(panel.exists()).toBe(true)
      expect(panel.props('docname')).toBe('ORG-1')
      expect(panel.props('doctype')).toBe('CRM Organization')
    })

    it('counts the linked records for the tab badges', async () => {
      const wrapper = mountPage()
      load({ deals: [{ name: 'D-1' }, { name: 'D-2' }], contacts: [{ name: 'C-1' }] })
      await nextTick()
      expect(wrapper.vm.tabs[1].label).toBe('Deals')
      expect(wrapper.vm.tabs[1].count.value).toBe(2)
      expect(wrapper.vm.tabs[2].label).toBe('Contacts')
      expect(wrapper.vm.tabs[2].count.value).toBe(1)
    })

    it('lists contacts under the Contacts tab', async () => {
      const wrapper = mountPage()
      load({ contacts: [{ name: 'C-1', full_name: 'Jane Doe' }] })
      wrapper.vm.tabIndex = 2
      await nextTick()
      const list = wrapper.findComponent(ContactsListViewStub)
      expect(list.exists()).toBe(true)
      expect(list.props('rows')).toHaveLength(1)
      expect(list.props('columns').map((c) => c.key)).toContain('full_name')
    })

    it('feeds the Deals tab from the contacts list', async () => {
      // BUG: `rows` and `columns` still assume the desktop two-tab layout
      // where index 0 is Deals, but this page inserts a Details tab at 0 —
      // so the Deals tab (index 1) is served contacts. Current behaviour is
      // asserted here; the fix belongs in the page, not the test.
      const wrapper = mountPage()
      load({
        deals: [{ name: 'D-1', status: 'Open' }],
        contacts: [{ name: 'C-1', full_name: 'Jane Doe' }],
      })
      wrapper.vm.tabIndex = 1
      await nextTick()
      const list = wrapper.findComponent(DealsListViewStub)
      expect(list.props('rows')).toEqual([
        expect.objectContaining({ name: 'C-1' }),
      ])
      expect(list.props('columns').map((c) => c.key)).toContain('full_name')
    })

    it('claims no deals exist when only the contacts list is empty', async () => {
      // Same root cause, seen from the user's side: real deals, empty state.
      const wrapper = mountPage()
      load({ deals: [{ name: 'D-1', status: 'Open' }], contacts: [] })
      wrapper.vm.tabIndex = 1
      await nextTick()
      expect(wrapper.findComponent(DealsListViewStub).exists()).toBe(false)
      expect(wrapper.text()).toContain('No Deals Found')
    })
  })
})
