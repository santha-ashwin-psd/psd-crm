const api = vi.hoisted(() => ({
  call: vi.fn(),
  capture: vi.fn(),
  onboarding: vi.fn(),
  resources: [],
  trigger: vi.fn(),
}))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  return {
    ...actual,
    call: api.call,
    createResource: (options) => {
      api.resources.push(options)
      return reactive({ ...options, data: null, fetch: vi.fn() })
    },
  }
})

vi.mock('frappe-ui/frappe', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useTelemetry: () => ({ capture: api.capture }),
    useOnboarding: () => ({ updateOnboardingStep: api.onboarding }),
  }
})

const docs = vi.hoisted(() => ({ deal: null }))
vi.mock('@/data/document', async () => {
  const { reactive } = await import('vue')
  docs.deal = reactive({ doc: {} })
  return {
    useDocument: (doctype) =>
      doctype === 'CRM Deal'
        ? { document: docs.deal }
        : {
            document: reactive({ doc: {} }),
            triggerConvertToDeal: api.trigger,
          },
  }
})

const meta = vi.hoisted(() => ({ fields: null }))
vi.mock('@/stores/meta', async () => {
  const { ref } = await import('vue')
  meta.fields = ref({ fields: [] })
  return { getMeta: () => ({ doctypeMeta: meta.fields }) }
})

vi.mock('@/stores/users', () => ({
  usersStore: () => ({ isManager: () => true }),
}))
vi.mock('@/stores/session', () => ({
  sessionStore: () => ({ user: 'ada@example.com' }),
}))
vi.mock('@/stores/statuses', () => ({
  statusesStore: () => ({
    getDealStatus: () => ({ color: 'blue' }),
    statusOptions: () => [{ label: 'Qualification', value: 'Qualification' }],
  }),
}))

const nav = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useRouter: () => nav }
})

import ConvertToDealModal from '@/components/Modals/ConvertToDealModal.vue'
import { mountComponent } from '../helpers/mount'
import {
  showQuickEntryModal,
  quickEntryProps,
} from '@/composables/modals'

const LEAD = {
  name: 'LEAD-1',
  lead_owner: 'ada@example.com',
  annual_revenue: 500000,
  organization: 'Acme from lead',
  no_of_employees: '11-50',
}

/** One tab containing the given fields. */
const layout = (fields) => [
  { sections: [{ columns: [{ fields }] }] },
]

const mountModal = (lead = LEAD) => {
  api.resources = []
  docs.deal.doc = {}
  return mountComponent(ConvertToDealModal, {
    props: { modelValue: true, lead },
    global: {
      stubs: {
        Dialog: true, FieldLayout: true, Link: true, Switch: true,
        EditIcon: true, ContactsIcon: true, OrganizationsIcon: true,
      },
    },
  })
}

const dealTabs = () =>
  api.resources.find((r) => r.url?.includes('get_fields_layout'))

describe('ConvertToDealModal', () => {
  beforeEach(() => {
    api.call.mockReset().mockResolvedValue('DEAL-9')
    api.capture.mockClear()
    api.onboarding.mockClear()
    api.trigger.mockClear()
    nav.push.mockClear()
    meta.fields.value = { fields: [] }
  })

  describe('choosing an existing contact or organization', () => {
    it('insists on a contact once the box is ticked', async () => {
      const wrapper = mountModal()
      wrapper.vm.existingContactChecked = true
      await wrapper.vm.convertToDeal()
      expect(wrapper.vm.error).toBe('Please select an existing contact')
      expect(api.call).not.toHaveBeenCalled()
    })

    it('insists on an organization once that box is ticked', async () => {
      const wrapper = mountModal()
      wrapper.vm.existingOrganizationChecked = true
      await wrapper.vm.convertToDeal()
      expect(wrapper.vm.error).toBe('Please select an existing organization')
      expect(api.call).not.toHaveBeenCalled()
    })

    it('sends the chosen contact and organization', async () => {
      const wrapper = mountModal()
      wrapper.vm.existingContactChecked = true
      wrapper.vm.existingContact = 'CONTACT-1'
      wrapper.vm.existingOrganizationChecked = true
      wrapper.vm.existingOrganization = 'ORG-1'
      await wrapper.vm.convertToDeal()
      expect(api.call.mock.calls[0][1]).toMatchObject({
        lead: 'LEAD-1',
        existing_contact: 'CONTACT-1',
        existing_organization: 'ORG-1',
      })
    })

    it('discards a selection made and then unticked', async () => {
      // Otherwise unticking the box still silently links the old record.
      const wrapper = mountModal()
      wrapper.vm.existingContact = 'CONTACT-1'
      wrapper.vm.existingContactChecked = false
      await wrapper.vm.convertToDeal()
      expect(api.call.mock.calls[0][1].existing_contact).toBe('')
    })
  })

  describe('a successful conversion', () => {
    it('opens the new deal', async () => {
      const wrapper = mountModal()
      await wrapper.vm.convertToDeal()
      expect(nav.push).toHaveBeenCalledWith({
        name: 'Deal',
        params: { dealId: 'DEAL-9' },
      })
    })

    it('closes and clears the form', async () => {
      const wrapper = mountModal()
      wrapper.vm.existingContactChecked = true
      wrapper.vm.existingContact = 'CONTACT-1'
      await wrapper.vm.convertToDeal()
      expect(wrapper.vm.existingContactChecked).toBe(false)
      expect(wrapper.vm.existingContact).toBe('')
      expect(wrapper.emitted('update:modelValue').at(-1)[0]).toBe(false)
    })

    it('ticks off the onboarding step', async () => {
      const wrapper = mountModal()
      await wrapper.vm.convertToDeal()
      expect(api.onboarding).toHaveBeenCalledWith(
        'convert_lead_to_deal',
        true,
        false,
        expect.any(Function),
      )
    })

    it('runs any registered before-convert hook first', async () => {
      const wrapper = mountModal()
      await wrapper.vm.convertToDeal()
      expect(api.trigger).toHaveBeenCalled()
      expect(api.trigger.mock.invocationCallOrder[0]).toBeLessThan(
        api.call.mock.invocationCallOrder[0],
      )
    })
  })

  describe('when the server refuses', () => {
    it('lists the missing mandatory fields', async () => {
      api.call.mockRejectedValue({
        exc_type: 'MandatoryError',
        messages: ['CRM Deal DEAL-1: Territory', 'CRM Deal DEAL-1: Industry'],
      })
      const wrapper = mountModal()
      await wrapper.vm.convertToDeal()
      expect(wrapper.vm.error).toBe('Territory, Industry is required')
    })

    it('does not append "is required" when the message already says so', async () => {
      api.call.mockRejectedValue({
        exc_type: 'MandatoryError',
        messages: ['CRM Deal: Territory is required'],
      })
      const wrapper = mountModal()
      await wrapper.vm.convertToDeal()
      expect(wrapper.vm.error).toBe('Territory is required')
    })

    it('shows a server message for any other failure', async () => {
      api.call.mockRejectedValue({ messages: ['Permission denied'] })
      const wrapper = mountModal()
      await wrapper.vm.convertToDeal()
      expect(wrapper.vm.error).toContain('Permission denied')
    })

    it('never shows the literal word undefined', async () => {
      // A network failure has no messages array.
      api.call.mockRejectedValue(new Error('offline'))
      const wrapper = mountModal()
      await wrapper.vm.convertToDeal()
      expect(wrapper.vm.error).not.toContain('undefined')
    })

    it('stays open so the user can correct and retry', async () => {
      api.call.mockRejectedValue({ messages: ['Nope'] })
      const wrapper = mountModal()
      await wrapper.vm.convertToDeal()
      expect(nav.push).not.toHaveBeenCalled()
      expect(api.capture).not.toHaveBeenCalled()
    })
  })

  describe('the required-fields layout', () => {
    it('returns the layout when it has fields', () => {
      mountModal()
      const tree = layout([{ fieldname: 'territory', label: 'Territory' }])
      expect(dealTabs().transform(tree)).toBe(tree)
    })

    it('collapses an empty layout to nothing', () => {
      // A layout of empty sections must not render an empty form.
      mountModal()
      expect(dealTabs().transform(layout([]))).toEqual([])
    })

    it('tolerates a missing layout', () => {
      mountModal()
      expect(dealTabs().transform(undefined)).toEqual([])
    })
  })

  describe('prefilling the deal from the lead', () => {
    const prefill = (wrapper, fields) => {
      wrapper.vm.resetDealDoc(layout(fields))
      return wrapper.vm.deal.doc
    }

    it('copies a field the lead shares by name', () => {
      const wrapper = mountModal()
      const doc = prefill(wrapper, [
        { fieldname: 'annual_revenue', label: 'Revenue', fieldtype: 'Currency' },
      ])
      expect(doc.annual_revenue).toBe(500000)
    })

    it('follows the explicit lead-to-deal mapping', () => {
      // deal_owner has no counterpart of that name on a lead.
      const wrapper = mountModal()
      const doc = prefill(wrapper, [
        { fieldname: 'deal_owner', label: 'Deal Owner', fieldtype: 'Link' },
      ])
      expect(doc.deal_owner).toBe('ada@example.com')
    })

    it('leaves the skipped fields alone', () => {
      // organization and status are decided by the conversion, not copied.
      const wrapper = mountModal()
      const doc = prefill(wrapper, [
        { fieldname: 'organization', label: 'Organization', fieldtype: 'Link' },
        { fieldname: 'status', label: 'Status', fieldtype: 'Select' },
      ])
      expect(doc.organization).toBeUndefined()
      expect(doc.status).toBeUndefined()
    })

    it('starts child tables empty', () => {
      const wrapper = mountModal()
      const doc = prefill(wrapper, [
        { fieldname: 'items', label: 'Items', fieldtype: 'Table' },
      ])
      expect(doc.items).toEqual([])
    })

    it('ignores a lead field that is blank', () => {
      const wrapper = mountModal({ name: 'LEAD-1', annual_revenue: '' })
      const doc = prefill(wrapper, [
        { fieldname: 'annual_revenue', label: 'Revenue', fieldtype: 'Currency' },
      ])
      expect(doc.annual_revenue).toBeUndefined()
    })

    it('starts from a fresh document each time', () => {
      const wrapper = mountModal()
      wrapper.vm.deal.doc.stale = 'left over'
      const doc = prefill(wrapper, [])
      expect(doc.stale).toBeUndefined()
      expect(doc.doctype).toBe('CRM Deal')
    })
  })

  describe('matching custom fields between the two doctypes', () => {
    it('copies a custom field with the same label and type', () => {
      meta.fields.value = {
        fields: [
          { fieldname: 'custom_source_ref', label: 'Source Ref', fieldtype: 'Data', custom: 1 },
        ],
      }
      const wrapper = mountModal({ ...LEAD, custom_source_ref: 'REF-1' })
      wrapper.vm.resetDealDoc(
        layout([
          { fieldname: 'custom_deal_ref', label: 'Source Ref', fieldtype: 'Data', custom: 1 },
        ]),
      )
      expect(wrapper.vm.deal.doc.custom_deal_ref).toBe('REF-1')
    })

    it('refuses to guess when two lead fields match', () => {
      // An ambiguous match would silently copy the wrong column.
      meta.fields.value = {
        fields: [
          { fieldname: 'custom_a', label: 'Source Ref', fieldtype: 'Data', custom: 1 },
          { fieldname: 'custom_b', label: 'Source Ref', fieldtype: 'Data', custom: 1 },
        ],
      }
      const wrapper = mountModal({ ...LEAD, custom_a: 'A', custom_b: 'B' })
      wrapper.vm.resetDealDoc(
        layout([
          { fieldname: 'custom_deal_ref', label: 'Source Ref', fieldtype: 'Data', custom: 1 },
        ]),
      )
      expect(wrapper.vm.deal.doc.custom_deal_ref).toBeUndefined()
    })

    it('will not match on label alone when the types differ', () => {
      meta.fields.value = {
        fields: [
          { fieldname: 'custom_a', label: 'Source Ref', fieldtype: 'Int', custom: 1 },
        ],
      }
      const wrapper = mountModal({ ...LEAD, custom_a: 7 })
      wrapper.vm.resetDealDoc(
        layout([
          { fieldname: 'custom_deal_ref', label: 'Source Ref', fieldtype: 'Data', custom: 1 },
        ]),
      )
      expect(wrapper.vm.deal.doc.custom_deal_ref).toBeUndefined()
    })

    it('does not treat a standard field as custom', () => {
      meta.fields.value = {
        fields: [{ fieldname: 'source', label: 'Source', fieldtype: 'Link' }],
      }
      const wrapper = mountModal({ ...LEAD, source: 'Web' })
      wrapper.vm.resetDealDoc(
        layout([{ fieldname: 'deal_source', label: 'Source', fieldtype: 'Link' }]),
      )
      expect(wrapper.vm.deal.doc.deal_source).toBeUndefined()
    })
  })
  // Same handoff as the deal modal, but this one asks the quick form for the
  // required fields only — the lead has already supplied the rest.
  describe('switching to the quick form', () => {
    beforeEach(() => {
      showQuickEntryModal.value = false
      quickEntryProps.value = {}
    })

    it('opens the quick-entry modal for a deal, required fields only', () => {
      const wrapper = mountModal()
      wrapper.vm.openQuickEntryModal()
      expect(showQuickEntryModal.value).toBe(true)
      expect(quickEntryProps.value).toMatchObject({
        doctype: 'CRM Deal',
        onlyRequired: true,
      })
    })

    it('closes this modal', () => {
      const wrapper = mountModal()
      wrapper.vm.openQuickEntryModal()
      expect(wrapper.vm.show).toBe(false)
    })
  })
})
