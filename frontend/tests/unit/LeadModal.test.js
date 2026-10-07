const api = vi.hoisted(() => ({
  call: vi.fn(),
  capture: vi.fn(),
  onboarding: vi.fn(),
  submit: null,
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
    createResource: (options) =>
      reactive({
        ...options,
        data: [],
        fetch: vi.fn(),
        reload: vi.fn(),
        // Record the call rather than emulating frappe-ui's submit pipeline —
        // the tests drive validate/onSuccess/onError themselves.
        submit: vi.fn((params, handlers) => {
          api.submit = { params, handlers }
        }),
      }),
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

const doc = vi.hoisted(() => ({ ref: null }))
vi.mock('@/data/document', async () => {
  const { reactive } = await import('vue')
  doc.ref = reactive({ doc: {} })
  return {
    useDocument: () => ({ document: doc.ref, triggerOnBeforeCreate: vi.fn() }),
  }
})

vi.mock('@/stores/session', () => ({
  sessionStore: () => ({ user: 'ada@example.com' }),
}))

vi.mock('@/stores/users', () => ({
  usersStore: () => ({
    getUser: () => ({ name: 'ada@example.com', full_name: 'Ada' }),
    isManager: () => true,
  }),
}))

vi.mock('@/stores/statuses', () => ({
  statusesStore: () => ({
    getLeadStatus: () => ({ color: 'blue' }),
    statusOptions: () => [
      { label: 'New', value: 'New' },
      { label: 'Contacted', value: 'Contacted' },
    ],
  }),
}))

const nav = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useRouter: () => nav }
})

import LeadModal from '@/components/Modals/LeadModal.vue'
import { showQuickEntryModal, quickEntryProps } from '@/composables/modals'
import { mountComponent } from '../helpers/mount'
import { flushPromises } from '@vue/test-utils'

const mountModal = (defaults = {}) => {
  doc.ref.doc = {}
  return mountComponent(LeadModal, {
    props: { modelValue: true, defaults },
    global: { stubs: { Dialog: true, FieldLayout: true, EditIcon: true, FeatherIcon: true } },
  })
}

/** Runs createNewLead and returns the validate/onSuccess/onError handlers. */
const submitAndGetHandlers = async (wrapper) => {
  api.submit = null
  await wrapper.vm.createNewLead()
  await flushPromises()
  return api.submit.handlers
}

const validationError = async (wrapper) => {
  const handlers = await submitAndGetHandlers(wrapper)
  return handlers.validate()
}

describe('LeadModal', () => {
  beforeEach(() => {
    api.call.mockReset().mockResolvedValue({ fields: {}, notes: [] })
    api.capture.mockClear()
    api.onboarding.mockClear()
    nav.push.mockClear()
    api.submit = null
  })

  describe('defaults applied when the form opens', () => {
    it('preselects a company size', () => {
      expect(mountModal().vm.lead.doc.no_of_employees).toBe('1-10')
    })

    it('assigns the lead to the current user', () => {
      expect(mountModal().vm.lead.doc.lead_owner).toBe('ada@example.com')
    })

    it('picks the first status', () => {
      expect(mountModal().vm.lead.doc.status).toBe('New')
    })

    it('lets the caller override any of them', () => {
      const wrapper = mountModal({ status: 'Contacted', first_name: 'Ada' })
      expect(wrapper.vm.lead.doc.status).toBe('Contacted')
      expect(wrapper.vm.lead.doc.first_name).toBe('Ada')
    })
  })

  describe('validation', () => {
    it('requires a first name', async () => {
      const wrapper = mountModal()
      expect(await validationError(wrapper)).toBe('First Name is mandatory')
    })

    it('requires a status', async () => {
      const wrapper = mountModal({ first_name: 'Ada' })
      wrapper.vm.lead.doc.status = ''
      expect(await validationError(wrapper)).toBe('Status is required')
    })

    it('rejects an address with no @', async () => {
      const wrapper = mountModal({ first_name: 'Ada', email: 'not-an-email' })
      expect(await validationError(wrapper)).toBe('Invalid email address')
    })

    it('accepts a valid address', async () => {
      const wrapper = mountModal({ first_name: 'Ada', email: 'ada@example.com' })
      expect(await validationError(wrapper)).toBeUndefined()
    })

    it('rejects a mobile number containing letters', async () => {
      const wrapper = mountModal({ first_name: 'Ada', mobile_no: '12ab34' })
      expect(await validationError(wrapper)).toBe(
        'Mobile No. should be a number',
      )
    })

    it('accepts a formatted mobile number', async () => {
      // Dashes, spaces, brackets and a leading + are all normal input.
      const wrapper = mountModal({
        first_name: 'Ada',
        mobile_no: '+44 (0)20 7946-0958',
      })
      expect(await validationError(wrapper)).toBeUndefined()
    })

    it('strips thousands separators from revenue', async () => {
      const wrapper = mountModal({ first_name: 'Ada', annual_revenue: '1,000,000' })
      await validationError(wrapper)
      expect(wrapper.vm.lead.doc.annual_revenue).toBe('1000000')
    })

    it('rejects revenue that is not a number', async () => {
      const wrapper = mountModal({ first_name: 'Ada', annual_revenue: 'a lot' })
      expect(await validationError(wrapper)).toBe(
        'Annual Revenue should be a number',
      )
    })

    it('passes a clean lead', async () => {
      const wrapper = mountModal({ first_name: 'Ada' })
      expect(await validationError(wrapper)).toBeUndefined()
      expect(wrapper.vm.isLeadCreating).toBe(true)
    })
  })

  describe('the website field', () => {
    it('adds a scheme when the user omits it', async () => {
      const wrapper = mountModal({ first_name: 'Ada', website: 'acme.com' })
      await submitAndGetHandlers(wrapper)
      expect(wrapper.vm.lead.doc.website).toBe('https://acme.com')
    })

    it('leaves an explicit scheme alone', async () => {
      const wrapper = mountModal({ first_name: 'Ada', website: 'http://acme.com' })
      await submitAndGetHandlers(wrapper)
      expect(wrapper.vm.lead.doc.website).toBe('http://acme.com')
    })
  })

  describe('after the server accepts', () => {
    it('closes, clears and opens the new lead', async () => {
      const wrapper = mountModal({ first_name: 'Ada' })
      const handlers = await submitAndGetHandlers(wrapper)
      handlers.onSuccess({ name: 'LEAD-9' })
      expect(nav.push).toHaveBeenCalledWith({
        name: 'Lead',
        params: { leadId: 'LEAD-9' },
      })
      expect(wrapper.vm.isLeadCreating).toBe(false)
    })

    it('ticks off the onboarding step', async () => {
      const wrapper = mountModal({ first_name: 'Ada' })
      const handlers = await submitAndGetHandlers(wrapper)
      handlers.onSuccess({ name: 'LEAD-9' })
      expect(api.onboarding).toHaveBeenCalledWith(
        'create_first_lead',
        true,
        false,
        expect.any(Function),
      )
    })
  })

  describe('when the server refuses', () => {
    it('shows the joined server messages', async () => {
      const wrapper = mountModal({ first_name: 'Ada' })
      const handlers = await submitAndGetHandlers(wrapper)
      handlers.onError({ messages: ['Too long', 'Bad value'] })
      expect(wrapper.vm.error).toBe('Too long\nBad value')
      expect(wrapper.vm.isLeadCreating).toBe(false)
    })

    it('falls back to a plain error with no messages array', async () => {
      // A network failure is an Error, not an API response.
      const wrapper = mountModal({ first_name: 'Ada' })
      const handlers = await submitAndGetHandlers(wrapper)
      handlers.onError(new Error('offline'))
      expect(wrapper.vm.error).toBe('offline')
    })
  })

  describe('switching to the full form', () => {
    it('hands over to quick entry and closes', async () => {
      const wrapper = mountModal()
      wrapper.vm.openQuickEntryModal()
      expect(showQuickEntryModal.value).toBe(true)
      expect(quickEntryProps.value).toEqual({ doctype: 'CRM Lead' })
      await flushPromises()
      expect(wrapper.emitted('update:modelValue').at(-1)[0]).toBe(false)
    })
  })
})
