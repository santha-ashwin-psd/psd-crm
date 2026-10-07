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
      return reactive({ ...options, data: null, fetch: vi.fn(), submit: vi.fn() })
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
  usersStore: () => ({ isManager: () => true }),
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

import OrganizationModal from '@/components/Modals/OrganizationModal.vue'
import { mountComponent } from '../helpers/mount'

/**
 * Reproduces frappe-ui's `call` failure contract: it invokes
 * `options.onError({ response, status, error })` and then throws.
 */
const failCallWith = (messages) => {
  api.call.mockImplementation(async (_method, _args, options) => {
    const e = new Error('request failed')
    e.messages = messages
    options?.onError?.({ response: {}, status: 417, error: e })
    throw e
  })
}

const mountModal = (data = {}, options) => {
  doc.ref.doc = {}
  api.resources = []
  return mountComponent(OrganizationModal, {
    props: { modelValue: true, data, ...(options ? { options } : {}) },
    global: {
      stubs: { Dialog: true, FieldLayout: true, EditIcon: true, FeatherIcon: true },
    },
  })
}

describe('OrganizationModal', () => {
  beforeEach(() => {
    api.call.mockReset().mockResolvedValue({ name: 'ORG-9' })
    api.capture.mockClear()
    modal.showModal.mockClear()
    nav.push.mockClear()
  })

  describe('defaults applied when the form opens', () => {
    it('preselects a company size', () => {
      expect(mountModal().vm.organization.doc.no_of_employees).toBe('1-10')
    })

    it('lets the caller override it', () => {
      const wrapper = mountModal({ no_of_employees: '201-500' })
      expect(wrapper.vm.organization.doc.no_of_employees).toBe('201-500')
    })

    it('seeds any other passed field', () => {
      const wrapper = mountModal({ organization_name: 'Acme' })
      expect(wrapper.vm.organization.doc.organization_name).toBe('Acme')
    })
  })

  describe('creating', () => {
    it('posts the document with its doctype', async () => {
      const wrapper = mountModal({ organization_name: 'Acme' })
      await wrapper.vm.createOrganization()
      expect(api.call).toHaveBeenCalledWith(
        'frappe.client.insert',
        expect.objectContaining({
          doc: expect.objectContaining({
            doctype: 'CRM Organization',
            organization_name: 'Acme',
          }),
        }),
        expect.anything(),
      )
    })

    it('opens the new organization by default', async () => {
      const wrapper = mountModal()
      await wrapper.vm.createOrganization()
      expect(nav.push).toHaveBeenCalledWith({
        name: 'Organization',
        params: { organizationId: 'ORG-9' },
      })
    })

    it('stays put when the caller asks it not to redirect', async () => {
      const wrapper = mountModal({}, { redirect: false })
      await wrapper.vm.createOrganization()
      expect(nav.push).not.toHaveBeenCalled()
      expect(wrapper.emitted('update:modelValue').at(-1)[0]).toBe(false)
    })

    it('calls back with the created document', async () => {
      const afterInsert = vi.fn()
      const wrapper = mountModal({}, { redirect: false, afterInsert })
      await wrapper.vm.createOrganization()
      expect(afterInsert).toHaveBeenCalledWith({ name: 'ORG-9' })
    })

    it('clears the busy flag once done', async () => {
      const wrapper = mountModal()
      await wrapper.vm.createOrganization()
      expect(wrapper.vm.loading).toBe(false)
    })
  })

  describe('when the server refuses', () => {
    it('shows the server message', async () => {
      // `call` reports through options.onError as { error }, unlike
      // createResource which passes the error itself — hence err.error here.
      failCallWith(['Organization already exists'])
      const wrapper = mountModal()
      await expect(wrapper.vm.createOrganization()).rejects.toThrow()
      expect(wrapper.vm.error).toBe('Organization already exists')
    })

    it('clears the busy flag so the button is usable again', async () => {
      failCallWith(['Nope'])
      const wrapper = mountModal()
      await expect(wrapper.vm.createOrganization()).rejects.toThrow()
      expect(wrapper.vm.loading).toBe(false)
    })

    it('does not navigate or report success', async () => {
      failCallWith(['Nope'])
      const wrapper = mountModal()
      await expect(wrapper.vm.createOrganization()).rejects.toThrow()
      expect(nav.push).not.toHaveBeenCalled()
      expect(api.capture).not.toHaveBeenCalledWith('organization_created')
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

    it('stores the address once it is created', () => {
      const wrapper = mountModal()
      wrapper.vm.showAddressModal()
      modal.showModal.mock.calls[0][0].callbacks.afterInsert({ name: 'ADDR-9' })
      expect(wrapper.vm.organization.doc.address).toBe('ADDR-9')
    })
  })
})
