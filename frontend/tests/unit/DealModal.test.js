const api = vi.hoisted(() => ({
  call: vi.fn(),
  capture: vi.fn(),
  resources: [],
  toast: null,
}))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  api.toast = {
    success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(),
  }
  return {
    ...actual,
    call: api.call,
    toast: api.toast,
    createResource: (options) => {
      api.resources.push(options)
      return reactive({
        ...options,
        data: [],
        fetch: vi.fn(),
        reload: vi.fn(),
        submit: vi.fn(),
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
  usersStore: () => ({
    getUser: () => ({ name: 'ada@example.com' }),
    isManager: () => true,
  }),
}))

vi.mock('@/stores/statuses', () => ({
  statusesStore: () => ({
    getDealStatus: () => ({ color: 'blue' }),
    statusOptions: () => [
      { label: 'Qualification', value: 'Qualification' },
      { label: 'Demo', value: 'Demo' },
    ],
  }),
}))

const nav = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useRouter: () => nav }
})

import DealModal from '@/components/Modals/DealModal.vue'
import { mountComponent } from '../helpers/mount'
import { flushPromises } from '@vue/test-utils'
import {
  showQuickEntryModal,
  quickEntryProps,
} from '@/composables/modals'
import { nextTick } from 'vue'

const mountModal = (defaults = {}) => {
  doc.ref.doc = {}
  api.resources = []
  return mountComponent(DealModal, {
    props: { modelValue: true, defaults },
    global: {
      stubs: { Dialog: true, FieldLayout: true, EditIcon: true, FeatherIcon: true, Switch: true },
    },
  })
}

/** The inline resource DealModal builds inside createDeal(). */
const createOptions = async (wrapper) => {
  api.resources = []
  await wrapper.vm.createDeal()
  await flushPromises()
  return api.resources.find((r) => r.url?.includes('create_deal'))
}

const validationError = async (wrapper) => (await createOptions(wrapper)).validate()

/** The layout transform, driven with a synthetic tab tree. */
const layoutWith = (sectionNames) => [
  {
    sections: sectionNames.map((name) => ({
      name,
      columns: [{ fields: [] }],
    })),
  },
]

const runTransform = (wrapper, sections) => {
  const tabs = api.resources.find((r) => r.url?.includes('get_fields_layout'))
  tabs.transform(layoutWith(sections))
}

describe('DealModal', () => {
  beforeEach(() => {
    api.call.mockReset().mockResolvedValue({ fields: {}, notes: [] })
    api.capture.mockClear()
    nav.push.mockClear()
  })

  describe('defaults applied when the form opens', () => {
    it('preselects a company size', () => {
      expect(mountModal().vm.deal.doc.no_of_employees).toBe('1-10')
    })

    it('assigns the deal to the current user', () => {
      expect(mountModal().vm.deal.doc.deal_owner).toBe('ada@example.com')
    })

    it('picks the first status', () => {
      expect(mountModal().vm.deal.doc.status).toBe('Qualification')
    })

    it('lets the caller override them', () => {
      const wrapper = mountModal({ status: 'Demo', deal_owner: 'bob@example.com' })
      expect(wrapper.vm.deal.doc.status).toBe('Demo')
      expect(wrapper.vm.deal.doc.deal_owner).toBe('bob@example.com')
    })
  })

  describe('validation', () => {
    it('requires a status', async () => {
      const wrapper = mountModal()
      wrapper.vm.deal.doc.status = ''
      expect(await validationError(wrapper)).toBe('Status is required')
    })

    it('rejects an address with no @', async () => {
      const wrapper = mountModal({ email: 'nope' })
      expect(await validationError(wrapper)).toBe('Invalid email address')
    })

    it('rejects a mobile number containing letters', async () => {
      const wrapper = mountModal({ mobile_no: '12ab34' })
      expect(await validationError(wrapper)).toBe('Mobile No. should be a number')
    })

    it('accepts a formatted mobile number', async () => {
      const wrapper = mountModal({ mobile_no: '+44 (0)20 7946-0958' })
      expect(await validationError(wrapper)).toBeUndefined()
    })

    it('strips thousands separators from revenue', async () => {
      const wrapper = mountModal({ annual_revenue: '2,500,000' })
      await validationError(wrapper)
      expect(wrapper.vm.deal.doc.annual_revenue).toBe('2500000')
    })

    it('rejects revenue that is not a number', async () => {
      const wrapper = mountModal({ annual_revenue: 'loads' })
      expect(await validationError(wrapper)).toBe(
        'Annual Revenue should be a number',
      )
    })

    it('passes a clean deal', async () => {
      const wrapper = mountModal()
      expect(await validationError(wrapper)).toBeUndefined()
      expect(wrapper.vm.isDealCreating).toBe(true)
    })
  })

  describe('existing versus new contact', () => {
    it('clears the typed contact fields when an existing one is chosen', async () => {
      // Sending both a contact link and loose name fields would create a duplicate.
      const wrapper = mountModal({
        first_name: 'Ada',
        email: 'ada@example.com',
        mobile_no: '123',
        contact: 'CONTACT-1',
      })
      wrapper.vm.chooseExistingContact = true
      await createOptions(wrapper)
      expect(wrapper.vm.deal.doc.first_name).toBeNull()
      expect(wrapper.vm.deal.doc.email).toBeNull()
      expect(wrapper.vm.deal.doc.contact).toBe('CONTACT-1')
    })

    it('clears the contact link when a new contact is typed', async () => {
      const wrapper = mountModal({ first_name: 'Ada', contact: 'CONTACT-1' })
      wrapper.vm.chooseExistingContact = false
      await createOptions(wrapper)
      expect(wrapper.vm.deal.doc.contact).toBeNull()
      expect(wrapper.vm.deal.doc.first_name).toBe('Ada')
    })
  })

  describe('the website field', () => {
    it('adds a scheme when the user omits it', async () => {
      const wrapper = mountModal({ website: 'acme.com' })
      await createOptions(wrapper)
      expect(wrapper.vm.deal.doc.website).toBe('https://acme.com')
    })

    it('leaves an explicit scheme alone', async () => {
      const wrapper = mountModal({ website: 'https://acme.com' })
      await createOptions(wrapper)
      expect(wrapper.vm.deal.doc.website).toBe('https://acme.com')
    })
  })

  describe('which sections the layout contains', () => {
    it('sees organization sections when the layout has them', () => {
      const wrapper = mountModal()
      runTransform(wrapper, ['organization_section'])
      expect(wrapper.vm.hasOrganizationSections).toBe(true)
    })

    it('sees no organization sections when the layout has none', () => {
      const wrapper = mountModal()
      runTransform(wrapper, ['contact_section'])
      expect(wrapper.vm.hasOrganizationSections).toBe(false)
    })

    it('sees contact sections when the layout has them', () => {
      const wrapper = mountModal()
      runTransform(wrapper, ['contact_section'])
      expect(wrapper.vm.hasContactSections).toBe(true)
    })

    it('sees no contact sections when the layout has none', () => {
      // Mirrors the organization case — the flag has to be recomputed on each
      // layout, not left at its initial value.
      const wrapper = mountModal()
      runTransform(wrapper, ['organization_section'])
      expect(wrapper.vm.hasContactSections).toBe(false)
    })
  })

  // Four sections, two pairs: picking an existing organization shows the
  // picker and hides the "new organization" fields, and vice versa. Nothing
  // asserted which section each toggle acted on, so the pairs could be crossed
  // and the form would offer a picker and a blank form at the same time.
  describe('choosing an existing record versus typing a new one', () => {
    const withSections = async () => {
      const wrapper = mountModal()
      wrapper.vm.tabs.data = [
        {
          sections: [
            'organization_section',
            'organization_details_section',
            'contact_section',
            'contact_details_section',
          ].map((name) => ({ name, hidden: undefined, columns: [{ fields: [] }] })),
        },
      ]
      await nextTick()
      return wrapper
    }

    const hiddenMap = (wrapper) =>
      Object.fromEntries(
        wrapper.vm.tabs.data[0].sections.map((s) => [s.name, s.hidden]),
      )

    it('shows the organization picker and hides the new-organization fields', async () => {
      const wrapper = await withSections()
      wrapper.vm.chooseExistingOrganization = true
      await nextTick()
      const h = hiddenMap(wrapper)
      expect(h.organization_section).toBe(false)
      expect(h.organization_details_section).toBe(true)
    })

    it('swaps them back when a new organization is typed', async () => {
      const wrapper = await withSections()
      wrapper.vm.chooseExistingOrganization = true
      await nextTick()
      wrapper.vm.chooseExistingOrganization = false
      await nextTick()
      const h = hiddenMap(wrapper)
      expect(h.organization_section).toBe(true)
      expect(h.organization_details_section).toBe(false)
    })

    it('does the same for the contact pair', async () => {
      const wrapper = await withSections()
      wrapper.vm.chooseExistingContact = true
      await nextTick()
      const h = hiddenMap(wrapper)
      expect(h.contact_section).toBe(false)
      expect(h.contact_details_section).toBe(true)
    })

    it('leaves the contact pair alone when only the organization toggle moves', async () => {
      const wrapper = await withSections()
      wrapper.vm.chooseExistingContact = true
      await nextTick()
      wrapper.vm.chooseExistingOrganization = true
      await nextTick()
      const h = hiddenMap(wrapper)
      expect(h.contact_section).toBe(false)
      expect(h.contact_details_section).toBe(true)
    })
  })

  describe('after the server accepts', () => {
    it('closes and opens the new deal', async () => {
      const wrapper = mountModal()
      const options = await createOptions(wrapper)
      options.onSuccess('DEAL-9')
      expect(nav.push).toHaveBeenCalledWith({
        name: 'Deal',
        params: { dealId: 'DEAL-9' },
      })
      expect(wrapper.vm.isDealCreating).toBe(false)
    })
  })

  describe('when the server refuses', () => {
    it('shows the joined server messages', async () => {
      const wrapper = mountModal()
      const options = await createOptions(wrapper)
      options.onError({ messages: ['Bad', 'Worse'] })
      expect(wrapper.vm.error).toBe('Bad\nWorse')
    })

    it('falls back to a plain error', async () => {
      const wrapper = mountModal()
      const options = await createOptions(wrapper)
      options.onError(new Error('offline'))
      expect(wrapper.vm.error).toBe('offline')
    })
  })

  // The "switch to the short form" link at the top of the modal. It hands off
  // to the shared quick-entry modal and closes this one — get the handoff
  // wrong and the user is left with two dialogs, or none.
  describe('switching to the quick form', () => {
    beforeEach(() => {
      showQuickEntryModal.value = false
      quickEntryProps.value = {}
    })

    it('opens the quick-entry modal for a deal', async () => {
      const wrapper = mountModal()
      wrapper.vm.openQuickEntryModal()
      expect(showQuickEntryModal.value).toBe(true)
      expect(quickEntryProps.value).toMatchObject({ doctype: 'CRM Deal' })
    })

    it('closes this modal once the other is up', async () => {
      const wrapper = mountModal()
      wrapper.vm.openQuickEntryModal()
      await nextTick()
      await nextTick()
      expect(wrapper.vm.show).toBe(false)
    })
  })
})
