const api = vi.hoisted(() => ({ call: vi.fn(), capture: vi.fn(), userDoc: null }))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, call: api.call }
})

vi.mock('frappe-ui/frappe', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useTelemetry: () => ({ capture: api.capture }) }
})

vi.mock('@/data/document', async () => {
  const { reactive } = await import('vue')
  api.userDoc = reactive({ doc: null })
  return { useDocument: () => ({ document: api.userDoc }) }
})

import EmailEditor from '@/components/EmailEditor.vue'
import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'

const SESSION_USER = 'ada@example.com'

const makeEditor = () => ({
  getHTML: vi.fn(() => '<p>body</p>'),
  commands: { setContent: vi.fn(), insertContent: vi.fn(), focus: vi.fn() },
})

const MultiSelectStub = {
  name: 'EmailMultiSelect',
  props: ['modelValue', 'validate', 'errorMessage'],
  setup: () => ({ setFocus: vi.fn() }),
  template: '<div />',
}

const mountEditor = (doc = { name: 'LEAD-1' }, editor = makeEditor()) =>
  mountComponent(EmailEditor, {
    props: { modelValue: doc, doctype: 'CRM Lead' },
    global: {
      provide: { session: { user: SESSION_USER } },
      stubs: {
        TextEditor: {
          name: 'TextEditor',
          props: ['content', 'placeholder', 'editable', 'editorClass', 'extensions'],
          setup: () => ({ editor }),
          template: '<div><slot name="top" /><slot name="bottom" /></div>',
        },
        EmailMultiSelect: MultiSelectStub,
        TextEditorBubbleMenu: true,
        FileUploader: true,
        IconPicker: true,
        AttachmentItem: true,
        EmailTemplateSelectorModal: true,
        EditorContent: true,
      },
    },
  })

describe('EmailEditor', () => {
  beforeEach(() => {
    api.call.mockReset().mockResolvedValue({ subject: 'S', message: '<p>M</p>' })
    api.capture.mockClear()
    api.userDoc.doc = null
  })

  describe('the recipient list', () => {
    it('pre-fills To from the document’s email', () => {
      const wrapper = mountEditor({ name: 'LEAD-1', email: 'bob@example.com' })
      expect(wrapper.vm.toEmails).toEqual(['bob@example.com'])
    })

    it('starts empty when the document has no email', () => {
      expect(mountEditor({ name: 'LEAD-1' }).vm.toEmails).toEqual([])
    })
  })

  describe('the From account list', () => {
    it('is empty until the user document loads', () => {
      expect(mountEditor().vm.from).toEqual([])
    })

    it('is empty when the user has no sending accounts', () => {
      api.userDoc.doc = { user_emails: [] }
      expect(mountEditor().vm.from).toEqual([])
    })

    it('labels each account with its name and address', () => {
      api.userDoc.doc = {
        user_emails: [
          { email_account: 'Support', email_id: 'support@example.com' },
          { email_account: 'Sales', email_id: 'sales@example.com' },
        ],
      }
      expect(mountEditor().vm.from).toEqual([
        { label: 'Support <support@example.com>', value: 'support@example.com' },
        { label: 'Sales <sales@example.com>', value: 'sales@example.com' },
      ])
    })

    it('hides the picker when the only account is the user’s own', () => {
      // Offering a one-item dropdown of your own address is pure noise.
      api.userDoc.doc = {
        user_emails: [{ email_account: 'Personal', email_id: SESSION_USER }],
      }
      expect(mountEditor().vm.from).toEqual([])
    })

    it('keeps the picker when the single account is a shared mailbox', () => {
      api.userDoc.doc = {
        user_emails: [{ email_account: 'Support', email_id: 'support@example.com' }],
      }
      expect(mountEditor().vm.from).toHaveLength(1)
    })
  })

  describe('choosing the sending account', () => {
    it('selects the first account once they load', async () => {
      const wrapper = mountEditor()
      api.userDoc.doc = {
        user_emails: [
          { email_account: 'Support', email_id: 'support@example.com' },
          { email_account: 'Sales', email_id: 'sales@example.com' },
        ],
      }
      await nextTick()
      expect(wrapper.vm.fromEmail).toBe('support@example.com')
    })

    it('clears a selection that is no longer available', async () => {
      // An account removed under the user must not stay silently selected.
      const wrapper = mountEditor()
      api.userDoc.doc = {
        user_emails: [{ email_account: 'Support', email_id: 'support@example.com' }],
      }
      await nextTick()
      api.userDoc.doc = { user_emails: [] }
      await nextTick()
      expect(wrapper.vm.fromEmail).toBe('')
    })
  })

  describe('email templates', () => {
    it('replaces the subject when the template carries one', async () => {
      const wrapper = mountEditor()
      await wrapper.vm.applyEmailTemplate({ name: 'T1', subject: 'Hi' })
      expect(wrapper.vm.subject).toBe('S')
    })

    it('leaves the subject alone when the template has none', async () => {
      const wrapper = mountEditor()
      wrapper.vm.subject = 'Mine'
      await wrapper.vm.applyEmailTemplate({ name: 'T1', response: '<p>x</p>' })
      expect(wrapper.vm.subject).toBe('Mine')
    })

    it('pushes the body into the editor as well as the model', async () => {
      const editor = makeEditor()
      const wrapper = mountEditor({ name: 'LEAD-1' }, editor)
      await wrapper.vm.applyEmailTemplate({ name: 'T1', response: '<p>x</p>' })
      expect(editor.commands.setContent).toHaveBeenCalledWith('<p>M</p>')
      expect(wrapper.emitted('update:content').at(-1)[0]).toBe('<p>M</p>')
    })

    it('resolves the template against the current document', async () => {
      const wrapper = mountEditor({ name: 'LEAD-7' })
      await wrapper.vm.applyEmailTemplate({ name: 'T1' })
      expect(api.call).toHaveBeenCalledWith(
        'frappe.email.doctype.email_template.email_template.get_email_template',
        expect.objectContaining({ template_name: 'T1' }),
      )
    })

    it('closes the selector afterwards', async () => {
      const wrapper = mountEditor()
      wrapper.vm.showEmailTemplateSelectorModal = true
      await wrapper.vm.applyEmailTemplate({ name: 'T1' })
      expect(wrapper.vm.showEmailTemplateSelectorModal).toBe(false)
    })
  })

  describe('inserting an emoji', () => {
    it('puts it into the editor and returns focus', () => {
      const editor = makeEditor()
      const wrapper = mountEditor({ name: 'LEAD-1' }, editor)
      wrapper.vm.emoji = '🚀'
      wrapper.vm.appendEmoji()
      expect(editor.commands.insertContent).toHaveBeenCalledWith('🚀')
      expect(editor.commands.focus).toHaveBeenCalled()
    })

    it('reports which emoji was inserted', () => {
      // Same defect as CommentBox: the ref was cleared before it was read.
      const wrapper = mountEditor()
      wrapper.vm.emoji = '🚀'
      wrapper.vm.appendEmoji()
      expect(api.capture).toHaveBeenCalledWith('emoji_inserted_in_email', {
        emoji: '🚀',
      })
    })

    it('clears the picker afterwards', () => {
      const wrapper = mountEditor()
      wrapper.vm.emoji = '🚀'
      wrapper.vm.appendEmoji()
      expect(wrapper.vm.emoji).toBe('')
    })
  })

  describe('cc and bcc', () => {
    it('opens and closes cc', async () => {
      const wrapper = mountEditor()
      wrapper.vm.toggleCC()
      expect(wrapper.vm.cc).toBe(true)
      await nextTick()
      wrapper.vm.toggleCC()
      expect(wrapper.vm.cc).toBe(false)
    })

    it('opens and closes bcc', async () => {
      const wrapper = mountEditor()
      wrapper.vm.toggleBCC()
      expect(wrapper.vm.bcc).toBe(true)
      await nextTick()
      wrapper.vm.toggleBCC()
      expect(wrapper.vm.bcc).toBe(false)
    })
  })

  describe('attachments', () => {
    it('drops the one removed', () => {
      const wrapper = mountEditor()
      wrapper.vm.attachments = [{ name: 'F1' }, { name: 'F2' }]
      wrapper.vm.removeAttachment(wrapper.vm.attachments[0])
      expect(wrapper.emitted('update:attachments').at(-1)[0]).toEqual([
        { name: 'F2' },
      ])
    })
  })
})
