const created = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('@/composables/document', () => ({ createDocument: created.create }))

import LostReasonModal from '@/components/Modals/LostReasonModal.vue'
import { mountComponent } from '../helpers/mount'

const makeDocument = (doc = {}, original = {}) => ({
  doc: { status: 'Lost', ...doc },
  originalDoc: { status: 'Negotiation', ...original },
  save: { submit: vi.fn() },
})

const mountModal = (document = makeDocument()) => {
  const wrapper = mountComponent(LostReasonModal, {
    props: { modelValue: true, doctype: 'CRM Deal', document },
    global: {
      stubs: {
        // Link carries a `reload()` that onCreate calls after the new reason
        // is saved, so the stub has to have one too. It used to get away
        // without it: the dialog stub rendered no slots, so this never mounted.
        Link: {
          template: '<div class="stub-link" />',
          methods: { reload: () => {} },
        },
        FormControl: true,
        ErrorMessage: true,
      },
    },
  })
  return { wrapper, document }
}

describe('LostReasonModal', () => {
  beforeEach(() => created.create.mockClear())

  describe('opening', () => {
    it('starts empty for a deal with no reason yet', () => {
      const { wrapper } = mountModal()
      expect(wrapper.vm.lostReason).toBe('')
      expect(wrapper.vm.lostNotes).toBe('')
    })

    it('prefills from a deal that already has one', () => {
      const { wrapper } = mountModal(
        makeDocument({ lost_reason: 'Price', lost_notes: 'Too expensive' }),
      )
      expect(wrapper.vm.lostReason).toBe('Price')
      expect(wrapper.vm.lostNotes).toBe('Too expensive')
    })
  })

  describe('validation', () => {
    it('requires a reason', () => {
      const { wrapper, document } = mountModal()
      wrapper.vm.save()
      expect(wrapper.vm.error).toBe('Lost Reason is required')
      expect(document.save.submit).not.toHaveBeenCalled()
    })

    it('requires notes when the reason is Other', () => {
      // "Other" carries no information on its own.
      const { wrapper, document } = mountModal()
      wrapper.vm.lostReason = 'Other'
      wrapper.vm.save()
      expect(wrapper.vm.error).toBe(
        'Lost Notes are required when Lost Reason is "Other"',
      )
      expect(document.save.submit).not.toHaveBeenCalled()
    })

    it('accepts Other once notes are given', () => {
      const { wrapper, document } = mountModal()
      wrapper.vm.lostReason = 'Other'
      wrapper.vm.lostNotes = 'Went with a competitor'
      wrapper.vm.save()
      expect(wrapper.vm.error).toBe('')
      expect(document.save.submit).toHaveBeenCalled()
    })

    it('does not require notes for any other reason', () => {
      const { wrapper, document } = mountModal()
      wrapper.vm.lostReason = 'Price'
      wrapper.vm.save()
      expect(document.save.submit).toHaveBeenCalled()
    })
  })

  describe('saving', () => {
    it('writes both fields onto the document', () => {
      const { wrapper, document } = mountModal()
      wrapper.vm.lostReason = 'Price'
      wrapper.vm.lostNotes = 'Budget cut'
      wrapper.vm.save()
      expect(document.doc.lost_reason).toBe('Price')
      expect(document.doc.lost_notes).toBe('Budget cut')
    })

    it('closes the dialog', () => {
      const { wrapper } = mountModal()
      wrapper.vm.lostReason = 'Price'
      wrapper.vm.save()
      expect(wrapper.emitted('update:modelValue').at(-1)[0]).toBe(false)
    })

    it('clears a previous error', () => {
      const { wrapper } = mountModal()
      wrapper.vm.save()
      expect(wrapper.vm.error).toBeTruthy()
      wrapper.vm.lostReason = 'Price'
      wrapper.vm.save()
      expect(wrapper.vm.error).toBe('')
    })
  })

  describe('cancelling', () => {
    it('puts the status back to what it was', () => {
      // The status was optimistically set to Lost to open this dialog;
      // backing out must undo that or the deal is stranded.
      const { wrapper, document } = mountModal()
      wrapper.vm.cancel()
      expect(document.doc.status).toBe('Negotiation')
    })

    it('clears everything that was typed', () => {
      const { wrapper } = mountModal()
      wrapper.vm.lostReason = 'Price'
      wrapper.vm.lostNotes = 'Budget'
      wrapper.vm.error = 'something'
      wrapper.vm.cancel()
      expect(wrapper.vm.lostReason).toBe('')
      expect(wrapper.vm.lostNotes).toBe('')
      expect(wrapper.vm.error).toBe('')
    })

    it('does not save', () => {
      const { wrapper, document } = mountModal()
      wrapper.vm.lostReason = 'Price'
      wrapper.vm.cancel()
      expect(document.save.submit).not.toHaveBeenCalled()
    })
  })

  describe('creating a new reason inline', () => {
    it('creates against the Lost Reason doctype', () => {
      const { wrapper } = mountModal()
      const close = vi.fn()
      wrapper.vm.onCreate('Budget freeze', close)
      expect(created.create).toHaveBeenCalledWith(
        'CRM Lost Reason',
        { lost_reason: 'Budget freeze' },
        close,
        expect.any(Function),
      )
    })

    it('selects the new reason once it exists', () => {
      const { wrapper } = mountModal()
      wrapper.vm.onCreate('Budget freeze', vi.fn())
      created.create.mock.calls[0][3]({ name: 'Budget freeze' })
      expect(wrapper.vm.lostReason).toBe('Budget freeze')
    })
  })
})
