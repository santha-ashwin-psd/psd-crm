const api = vi.hoisted(() => ({ call: vi.fn(), signature: { data: null } }))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  return {
    ...actual,
    call: api.call,
    createResource: () => reactive(api.signature),
    toast: {
      // The component awaits this; pass the promise straight through so a
      // rejection still surfaces rather than being swallowed by the toast.
      promise: (p) => p,
      success: vi.fn(),
      error: vi.fn(),
    },
  }
})

const onboarding = vi.hoisted(() => ({ update: vi.fn(), capture: vi.fn() }))
vi.mock('frappe-ui/frappe', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useOnboarding: () => ({ updateOnboardingStep: onboarding.update }),
    useTelemetry: () => ({ capture: onboarding.capture }),
  }
})

vi.mock('@/stores/users', () => ({
  usersStore: () => ({
    getUser: () => ({ email: 'ada@example.com', full_name: 'Ada Lovelace' }),
  }),
}))

// Real useStorage would persist drafts across tests through localStorage.
vi.mock('@vueuse/core', async (importOriginal) => {
  const actual = await importOriginal()
  const { ref } = await import('vue')
  return { ...actual, useStorage: (_key, initial) => ref(initial) }
})

import CommunicationArea from '@/components/CommunicationArea.vue'
import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'

const makeEditor = () => ({
  getHTML: vi.fn(() => '<p>body</p>'),
  commands: { setContent: vi.fn(), focus: vi.fn() },
})

const EditorStub = (name, extra = {}) => ({
  name,
  props: ['content', 'doctype', 'editable', 'placeholder', 'attachments', 'modelValue'],
  setup: () => ({ editor: makeEditor(), ...extra }),
  template: '<div />',
})

const mountArea = (doc = { name: 'DEAL-1' }, editorExtras = {}) =>
  mountComponent(CommunicationArea, {
    props: { modelValue: doc, doctype: 'CRM Deal' },
    global: {
      stubs: {
        EmailEditor: EditorStub('EmailEditor', {
          toEmails: ['bob@example.com'],
          ccEmails: [],
          bccEmails: [],
          subject: 'Re: things',
          fromEmail: null,
          ...editorExtras,
        }),
        CommentBox: EditorStub('CommentBox'),
        EmailIcon: true,
        CommentIcon: true,
        Email2Icon: true,
      },
    },
  })

describe('CommunicationArea', () => {
  beforeEach(() => {
    api.call.mockReset().mockResolvedValue({ name: 'COMMENT-1' })
    api.signature.data = null
    onboarding.update.mockClear()
    onboarding.capture.mockClear()
  })

  describe('the email subject line', () => {
    it('leads with the lead name', () => {
      const wrapper = mountArea({ name: 'LEAD-1', lead_name: 'Acme Corp' })
      expect(wrapper.vm.subject).toBe('Acme Corp (#LEAD-1)')
    })

    it('falls back to the organization', () => {
      const wrapper = mountArea({ name: 'DEAL-1', organization: 'Acme Ltd' })
      expect(wrapper.vm.subject).toBe('Acme Ltd (#DEAL-1)')
    })

    it('prefers the lead name when both are present', () => {
      const wrapper = mountArea({
        name: 'LEAD-1',
        lead_name: 'Acme Corp',
        organization: 'Acme Ltd',
      })
      expect(wrapper.vm.subject).toBe('Acme Corp (#LEAD-1)')
    })

    it('still identifies the document with neither', () => {
      // Leading space is cosmetic, but the id has to be there.
      expect(mountArea({ name: 'DEAL-9' }).vm.subject).toContain('(#DEAL-9)')
    })
  })

  describe('deciding whether there is anything to send', () => {
    it('treats an empty comment as empty', () => {
      const wrapper = mountArea()
      wrapper.vm.newComment = ''
      expect(wrapper.vm.commentEmpty).toBe(true)
    })

    it('treats the editor’s empty paragraph as empty', () => {
      // TipTap never reports "" — it reports an empty <p>.
      const wrapper = mountArea()
      wrapper.vm.newComment = '<p></p>'
      expect(wrapper.vm.commentEmpty).toBe(true)
    })

    it('accepts real comment content', () => {
      const wrapper = mountArea()
      wrapper.vm.newComment = '<p>looks good</p>'
      expect(wrapper.vm.commentEmpty).toBe(false)
    })

    it('treats an email with no recipient as empty', () => {
      // Content alone is not sendable — there has to be a To.
      const wrapper = mountArea({ name: 'DEAL-1' }, { toEmails: [] })
      wrapper.vm.newEmail = '<p>hello</p>'
      expect(wrapper.vm.emailEmpty).toBe(true)
    })

    it('accepts an email with content and a recipient', () => {
      const wrapper = mountArea()
      wrapper.vm.newEmail = '<p>hello</p>'
      expect(wrapper.vm.emailEmpty).toBe(false)
    })
  })

  describe('the signature', () => {
    it('does nothing when the user has none', () => {
      const wrapper = mountArea()
      const editor = makeEditor()
      wrapper.vm.setSignature(editor)
      expect(editor.commands.setContent).not.toHaveBeenCalled()
    })

    it('turns newlines into line breaks', () => {
      api.signature.data = 'Ada\nCEO'
      const wrapper = mountArea()
      const editor = makeEditor()
      wrapper.vm.setSignature(editor)
      expect(editor.commands.setContent).toHaveBeenCalledWith(
        'Ada<br>CEO<p>body</p>',
      )
    })

    it('drops the editor’s leading empty paragraph', () => {
      // Otherwise every new mail opens with a blank line above the signature.
      api.signature.data = 'Ada'
      const wrapper = mountArea()
      const editor = makeEditor()
      editor.getHTML.mockReturnValue('<p></p><p>body</p>')
      wrapper.vm.setSignature(editor)
      expect(editor.commands.setContent).toHaveBeenCalledWith('Ada<p>body</p>')
    })

    it('puts the cursor above the signature', () => {
      api.signature.data = 'Ada'
      const wrapper = mountArea()
      const editor = makeEditor()
      wrapper.vm.setSignature(editor)
      expect(editor.commands.focus).toHaveBeenCalledWith('start')
    })
  })

  describe('sending an email', () => {
    it('posts the recipients, subject and body', async () => {
      const wrapper = mountArea()
      wrapper.vm.newEmail = '<p>hello</p>'
      await wrapper.vm.sendMail()
      expect(api.call).toHaveBeenCalledWith(
        'frappe.core.doctype.communication.email.make',
        expect.objectContaining({
          recipients: 'bob@example.com',
          subject: 'Re: things',
          content: '<p>hello</p>',
          doctype: 'CRM Deal',
          name: 'DEAL-1',
          send_email: 1,
        }),
      )
    })

    it('falls back to the signed-in address as sender', async () => {
      const wrapper = mountArea()
      await wrapper.vm.sendMail()
      expect(api.call.mock.calls[0][1]).toMatchObject({
        sender: 'ada@example.com',
        sender_full_name: 'Ada Lovelace',
      })
    })

    it('sends attachments by name, not as objects', async () => {
      const wrapper = mountArea()
      wrapper.vm.attachments = [{ name: 'FILE-1' }, { name: 'FILE-2' }]
      await wrapper.vm.sendMail()
      expect(api.call.mock.calls[0][1].attachments).toEqual(['FILE-1', 'FILE-2'])
    })

    it('joins cc and bcc into comma lists', async () => {
      const wrapper = mountArea({ name: 'DEAL-1' }, {
        ccEmails: ['c@x.com'],
        bccEmails: ['b1@x.com', 'b2@x.com'],
      })
      await wrapper.vm.sendMail()
      expect(api.call.mock.calls[0][1]).toMatchObject({
        cc: 'c@x.com',
        bcc: 'b1@x.com, b2@x.com',
      })
    })
  })

  describe('sending a comment', () => {
    it('posts against the reference document', async () => {
      const wrapper = mountArea()
      wrapper.vm.newComment = '<p>noted</p>'
      await wrapper.vm.sendComment()
      expect(api.call).toHaveBeenCalledWith('crm.api.comment.add_comment', {
        reference_doctype: 'CRM Deal',
        reference_name: 'DEAL-1',
        content: '<p>noted</p>',
        attachments: [],
      })
    })

    it('passes attachment names through', async () => {
      const wrapper = mountArea()
      wrapper.vm.attachments = [{ name: 'FILE-1' }]
      await wrapper.vm.sendComment()
      expect(api.call.mock.calls[0][1].attachments).toEqual(['FILE-1'])
    })
  })

  describe('discarding attachments', () => {
    it('does nothing when there are none', async () => {
      const wrapper = mountArea()
      await wrapper.vm.deleteAttachedFiles()
      expect(api.call).not.toHaveBeenCalled()
    })

    it('deletes every attached file', async () => {
      const wrapper = mountArea()
      wrapper.vm.attachments = [{ name: 'FILE-1' }, { name: 'FILE-2' }]
      await wrapper.vm.deleteAttachedFiles()
      expect(api.call).toHaveBeenCalledTimes(2)
      expect(wrapper.vm.attachments).toEqual([])
    })

    it('still clears the list when a delete fails', async () => {
      // A file the server already lost must not strand the draft forever.
      const wrapper = mountArea()
      api.call.mockRejectedValue(new Error('gone'))
      wrapper.vm.attachments = [{ name: 'FILE-1' }]
      await wrapper.vm.deleteAttachedFiles()
      expect(wrapper.vm.attachments).toEqual([])
    })
  })

  describe('submitting', () => {
    it('refuses to send an empty email', async () => {
      const wrapper = mountArea({ name: 'DEAL-1' }, { toEmails: [] })
      await wrapper.vm.submitEmail()
      expect(api.call).not.toHaveBeenCalled()
    })

    it('clears the draft and closes the box after sending', async () => {
      const wrapper = mountArea()
      wrapper.vm.newEmail = '<p>hello</p>'
      await wrapper.vm.submitEmail()
      expect(wrapper.vm.newEmail).toBe('')
      expect(wrapper.vm.attachments).toEqual([])
      expect(wrapper.vm.showEmailBox).toBe(false)
    })

    it('asks the timeline to reload and scroll', async () => {
      const wrapper = mountArea()
      wrapper.vm.newEmail = '<p>hello</p>'
      await wrapper.vm.submitEmail()
      expect(wrapper.emitted('scroll')).toBeTruthy()
      expect(wrapper.emitted('update:reload').at(-1)[0]).toBe(true)
    })

    it('ticks off the onboarding step for a first email', async () => {
      const wrapper = mountArea()
      wrapper.vm.newEmail = '<p>hello</p>'
      await wrapper.vm.submitEmail()
      expect(onboarding.update).toHaveBeenCalledWith('send_first_email')
    })

    it('refuses to send an empty comment', async () => {
      const wrapper = mountArea()
      wrapper.vm.newComment = '<p></p>'
      await wrapper.vm.submitComment()
      expect(api.call).not.toHaveBeenCalled()
    })

    it('ticks off the onboarding step for a first comment', async () => {
      const wrapper = mountArea()
      wrapper.vm.newComment = '<p>noted</p>'
      await wrapper.vm.submitComment()
      expect(onboarding.update).toHaveBeenCalledWith('add_first_comment')
    })
  })

  describe('switching between the two boxes', () => {
    it('opens and closes the email box', async () => {
      const wrapper = mountArea()
      wrapper.vm.toggleEmailBox()
      await nextTick()
      expect(wrapper.vm.showEmailBox).toBe(true)
      wrapper.vm.toggleEmailBox()
      expect(wrapper.vm.showEmailBox).toBe(false)
    })

    it('closes the comment box when the email box opens', async () => {
      // They occupy the same space; both open at once would overlap.
      const wrapper = mountArea()
      wrapper.vm.toggleCommentBox()
      await nextTick()
      wrapper.vm.toggleEmailBox()
      await nextTick()
      expect(wrapper.vm.showCommentBox).toBe(false)
      expect(wrapper.vm.showEmailBox).toBe(true)
    })

    it('closes the email box when the comment box opens', async () => {
      const wrapper = mountArea()
      wrapper.vm.toggleEmailBox()
      await nextTick()
      wrapper.vm.toggleCommentBox()
      await nextTick()
      expect(wrapper.vm.showEmailBox).toBe(false)
      expect(wrapper.vm.showCommentBox).toBe(true)
    })
  })
})
