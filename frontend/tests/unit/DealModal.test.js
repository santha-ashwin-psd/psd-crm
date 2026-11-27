const api = vi.hoisted(() => ({ call: vi.fn(), capture: vi.fn(), toast: null }))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  api.toast = {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
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
        submit: vi.fn(),
      }),
  }
})

vi.mock('frappe-ui/frappe', async (importOriginal) => ({
  ...(await importOriginal()),
  useTelemetry: () => ({ capture: api.capture }),
}))

const doc = vi.hoisted(() => ({ ref: null, beforeCreate: null }))
vi.mock('@/data/document', async () => {
  const { reactive } = await import('vue')
  doc.ref = reactive({ doc: {} })
  return {
    useDocument: () => ({
      document: doc.ref,
      triggerOnBeforeCreate: doc.beforeCreate,
    }),
  }
})

vi.mock('@/stores/users', () => ({
  usersStore: () => ({
    getUser: (name) => ({ name: name || 'ada@example.com', full_name: 'Ada' }),
    isManager: () => true,
  }),
}))

vi.mock('@/stores/settings', async () => {
  const { ref } = await import('vue')
  return { getSettings: () => ({ settings: ref({ currency: 'INR' }) }) }
})

vi.mock('@/stores/statuses', () => ({
  statusesStore: () => ({
    getDealStatus: (name) => ({ type: name === 'Won' ? 'Won' : 'Open' }),
    statusOptions: () => [
      { label: 'Won', value: 'Won' },
      { label: 'Qualification', value: 'Qualification' },
      { label: 'Demo', value: 'Demo' },
    ],
  }),
}))

const nav = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal()),
  useRouter: () => nav,
}))

import DealModal from '@/components/Modals/DealModal.vue'
import { mountComponent } from '../helpers/mount'
import { flushPromises } from '@vue/test-utils'
import { saveDraft, loadDraft } from '@/utils/pipelineEntry'

const CREATE = 'xbr_crm.fcrm.doctype.crm_deal.crm_deal.create_deal'
const DUPES = 'xbr_crm.api.pipeline_entry.find_duplicates'

const mountModal = (defaults = {}) => {
  doc.ref.doc = {}
  return mountComponent(DealModal, {
    props: { modelValue: true, defaults },
    global: {
      stubs: {
        Dialog: true,
        FieldLayout: true,
        EditIcon: true,
        FeatherIcon: true,
        Link: true,
        Autocomplete: true,
        DatePicker: true,
        UserAvatar: true,
        Avatar: true,
        RouterLink: true,
        ErrorMessage: true,
      },
    },
  })
}

const sent = () => api.call.mock.calls.find((c) => c[0] === CREATE)?.[1].doc

describe('DealModal (Create Pipeline)', () => {
  beforeEach(() => {
    localStorage.clear()
    doc.beforeCreate = vi.fn()
    api.call
      .mockReset()
      .mockImplementation(async (method) =>
        method === CREATE ? 'PIPE-2026-00001' : [],
      )
    api.capture.mockClear()
    api.toast.success.mockClear()
    nav.push.mockClear()
  })

  describe('defaults', () => {
    it('owner is the current user, stage the first open one, currency from settings', () => {
      mountModal()
      expect(doc.ref.doc).toMatchObject({
        deal_owner: 'ada@example.com',
        status: 'Qualification',
        currency: 'INR',
        no_of_employees: '1-10',
      })
    })
    it('lets the caller override them', () => {
      mountModal({ status: 'Demo', deal_owner: 'bob@example.com' })
      expect(doc.ref.doc).toMatchObject({
        status: 'Demo',
        deal_owner: 'bob@example.com',
      })
    })
  })

  describe('validation', () => {
    it('shows every error at once and sends nothing', async () => {
      const w = mountModal()
      Object.assign(doc.ref.doc, {
        mobile_no: '123',
        email: 'nope',
        probability: 300,
      })
      await w.vm.create()
      expect(Object.keys(w.vm.errors).sort()).toEqual([
        'email',
        'first_name',
        'mobile_no',
        'probability',
      ])
      expect(sent()).toBeUndefined()
    })
  })

  describe('mobile country code', () => {
    it('starts at +91', () => {
      const w = mountModal()
      expect(w.vm.mobileCode).toBe('+91')
    })

    it('another code is stored with the number and sent cleaned', async () => {
      const w = mountModal()
      w.vm.mobileCode = '+971'
      w.vm.mobileLocal = '050 123 4567'
      expect(doc.ref.doc.mobile_no).toBe('+97150 123 4567')
      doc.ref.doc.first_name = 'Omar'
      await w.vm.create()
      expect(sent()).toMatchObject({ mobile_no: '+971501234567' })
    })

    it('switching code keeps the number typed', () => {
      const w = mountModal()
      w.vm.mobileLocal = '7911 123456'
      w.vm.mobileCode = '+44'
      expect(doc.ref.doc.mobile_no).toBe('+447911 123456')
      w.vm.mobileCode = '+91'
      expect(doc.ref.doc.mobile_no).toBe('7911 123456')
    })

    it('shows the code of an existing international number', () => {
      const w = mountModal({ mobile_no: '+447911123456' })
      expect([w.vm.mobileCode, w.vm.mobileLocal]).toEqual(['+44', '7911123456'])
    })
  })

  describe('what is sent', () => {
    it('a new contact with a normalised mobile, value as a number, and the note', async () => {
      const w = mountModal()
      Object.assign(doc.ref.doc, {
        first_name: 'Riya',
        mobile_no: '98765 43210',
        email: 'riya@acme.in',
        deal_value: '2,50,000',
      })
      w.vm.note = 'Met at the expo'
      await w.vm.create()
      expect(sent()).toMatchObject({
        first_name: 'Riya',
        mobile_no: '+919876543210',
        contact: null,
        deal_value: 250000,
        note: 'Met at the expo',
        create_new_contact: 0,
        currency: 'INR',
      })
    })

    it('an existing contact instead of typed contact fields', async () => {
      const w = mountModal()
      doc.ref.doc.first_name = 'typed'
      w.vm.useContact({
        name: 'CON-1',
        full_name: 'Riya',
        organization: 'Acme',
      })
      await w.vm.create()
      expect(sent()).toMatchObject({
        contact: 'CON-1',
        first_name: null,
        organization: 'Acme',
      })
    })

    it('a new organisation by name, not a link', async () => {
      const w = mountModal()
      w.vm.startNewOrganization('Acme Kochi')
      await w.vm.create()
      expect(sent()).toMatchObject({
        organization: null,
        organization_name: 'Acme Kochi',
      })
    })

    it('runs form scripts before creating', async () => {
      const w = mountModal()
      await w.vm.create()
      expect(doc.beforeCreate).toHaveBeenCalled()
    })
  })

  describe('after creating', () => {
    it('Create opens the new pipeline', async () => {
      const w = mountModal()
      await w.vm.create(false)
      expect(nav.push).toHaveBeenCalledWith({
        name: 'Deal',
        params: { dealId: 'PIPE-2026-00001' },
      })
      expect(w.emitted('update:modelValue')?.at(-1)).toEqual([false])
    })

    it('Create & New stays open, clears the form and keeps owner, stage and source', async () => {
      const w = mountModal()
      Object.assign(doc.ref.doc, {
        first_name: 'Riya',
        status: 'Demo',
        source: 'Expo',
        deal_value: 10,
      })
      w.vm.note = 'x'
      await w.vm.create(true)
      expect(nav.push).not.toHaveBeenCalled()
      expect(api.toast.success).toHaveBeenCalled()
      expect(doc.ref.doc.first_name).toBeUndefined()
      expect(doc.ref.doc.deal_value).toBeUndefined()
      expect(doc.ref.doc).toMatchObject({
        status: 'Demo',
        source: 'Expo',
        deal_owner: 'ada@example.com',
      })
      expect(w.vm.note).toBe('')
    })

    it('shows the server message when creating fails', async () => {
      api.call.mockRejectedValue({ messages: ['Organisation name taken'] })
      const w = mountModal()
      await w.vm.create()
      expect(w.vm.error).toBe('Organisation name taken')
      expect(w.vm.creating).toBe(false)
    })
  })

  describe('keyboard', () => {
    it('Ctrl/Cmd+Enter creates; with Shift it is Create & New', async () => {
      const w = mountModal()
      const spy = vi.spyOn(w.vm, 'create')
      const root = w.find('.flex.flex-col.gap-6')
      await root.trigger('keydown', { key: 'Enter', metaKey: true })
      await flushPromises()
      expect(nav.push).toHaveBeenCalled()
      nav.push.mockClear()
      await root.trigger('keydown', {
        key: 'Enter',
        ctrlKey: true,
        shiftKey: true,
      })
      await flushPromises()
      expect(nav.push).not.toHaveBeenCalled()
      expect(api.toast.success).toHaveBeenCalled()
      spy.mockRestore()
    })
  })

  describe('duplicates', () => {
    it('warns about a contact with the same mobile and can use it', async () => {
      vi.useFakeTimers()
      api.call.mockImplementation(async (method) =>
        method === DUPES
          ? [{ name: 'CON-9', full_name: 'Riya', matched_on: 'mobile' }]
          : 'PIPE-1',
      )
      const w = mountModal()
      doc.ref.doc.mobile_no = '9876543210'
      await vi.advanceTimersByTimeAsync(500)
      vi.useRealTimers()
      await flushPromises()
      expect(api.call).toHaveBeenCalledWith(DUPES, {
        mobile_no: '+919876543210',
        email: '',
      })
      expect(w.text()).toContain('Riya already has this mobile number.')
      w.vm.useContact(w.vm.duplicates[0])
      expect(doc.ref.doc.contact).toBe('CON-9')
    })
  })

  describe('draft', () => {
    it('offers to restore an unfinished entry', async () => {
      saveDraft(
        'ada@example.com',
        { first_name: 'Half', status: 'Demo' },
        'started',
      )
      const w = mountModal()
      await flushPromises()
      expect(w.text()).toContain('You have an unsaved pipeline')
      await w.vm.restoreDraft()
      expect(doc.ref.doc.first_name).toBe('Half')
      expect(w.vm.note).toBe('started')
    })

    it('is cleared once the pipeline is created', async () => {
      saveDraft('ada@example.com', { first_name: 'Half' }, '')
      const w = mountModal()
      w.vm.discardDraft()
      await w.vm.create()
      expect(loadDraft('ada@example.com')).toBeNull()
    })
  })
})
