// The page's two resources (thread list, open thread) are fakes keyed by URL,
// so a test seeds what the server would answer and reads the params sent.
const api = vi.hoisted(() => ({
  resources: {},
  call: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  route: { query: {} },
  router: { push: vi.fn(), replace: vi.fn() },
}))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { fakeResource } = await import('../helpers/pinia.js')
  return {
    ...actual,
    call: api.call,
    toast: api.toast,
    usePageMeta: () => {},
    createResource: (options) => {
      const r = fakeResource(options)
      api.resources[options.url] = r
      return r
    },
  }
})

vi.mock('vue-router', () => ({
  useRoute: () => api.route,
  useRouter: () => api.router,
}))

vi.mock('@/stores/settings', () => ({
  getSettings: () => ({ _settings: { doc: { ai_enabled: 1 } } }),
}))
vi.mock('@/stores/statuses', () => ({
  statusesStore: () => ({ getDealStatus: (s) => ({ type: s === 'Lost' ? 'Lost' : 'Ongoing' }) }),
}))
vi.mock('@/stores/users', () => ({
  usersStore: () => ({ getUser: () => ({ email: 'me@x.com', full_name: 'Me' }) }),
}))
vi.mock('@/composables/inbox', () => ({ needsReplyCount: { reload: vi.fn() } }))

const wa = vi.hoisted(() => ({ enabled: null }))
vi.mock('@/composables/whatsapp', async () => {
  const { ref } = await import('vue')
  wa.enabled = ref(true)
  return { whatsappEnabled: wa.enabled }
})

import { flushPromises } from '@vue/test-utils'
import Inbox from '@/pages/Inbox.vue'
import { mountComponent } from '../helpers/mount'

const THREADS = {
  threads: [
    {
      deal: 'PIPE-1',
      title: 'Zenith Steel',
      contact: 'Anita Rao',
      status: 'Qualification',
      channels: ['email'],
      unread: 1,
      needs_reply: true,
      last_at: '2026-10-29 09:00:00',
      last_channel: 'email',
      last_inbound: true,
      subject: 'Quote please',
      snippet: 'Can you send pricing?',
    },
  ],
  total: 1,
}

const THREAD = (over = {}) => ({
  deal: {
    name: 'PIPE-1',
    title: 'Zenith Steel',
    lead_name: 'Anita Rao',
    email: 'anita@zenith.example',
    mobile_no: '',
    status: 'Qualification',
    ...over,
  },
  messages: [
    {
      name: 'C1',
      channel: 'email',
      inbound: true,
      from_name: 'Anita Rao',
      subject: 'Quote please',
      content: '<p>Can you send pricing?</p>',
      at: '2026-10-29 09:00:00',
    },
  ],
})

const STUBS = {
  LayoutHeader: { template: '<div><slot name="left-header" /></div>' },
  Breadcrumbs: true,
  StatusBadge: { props: ['label'], template: '<span class="stub-status">{{ label }}</span>' },
  SkeletonLoader: true,
  AiStageSuggestion: true,
  Textarea: {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template:
      '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  // A test "uploads" by emitting success from this stub.
  FileUploader: {
    name: 'FileUploader',
    props: ['uploadArgs'],
    emits: ['success'],
    template: '<div class="stub-uploader"><slot :openFileSelector="() => {}" :uploading="false" /></div>',
  },
  AttachmentItem: {
    props: ['label', 'url'],
    template: '<span class="stub-attachment">{{ label }}<slot name="suffix" /></span>',
  },
}

const PDF = { name: 'F1', file_name: 'cv.pdf', file_url: '/private/files/cv.pdf', is_private: 1 }
const PHOTO = { name: 'F2', file_name: 'site.jpg', file_url: '/files/site.jpg', is_private: 0 }

function mountInbox() {
  const wrapper = mountComponent(Inbox, { global: { stubs: STUBS } })
  api.resources['xbr_crm.api.inbox.get_threads']._seed(THREADS)
  return wrapper
}

const threads = () => api.resources['xbr_crm.api.inbox.get_threads']
const thread = () => api.resources['xbr_crm.api.inbox.get_thread']

describe('Inbox', () => {
  beforeEach(() => {
    api.route.query = {}
    api.call.mockReset().mockResolvedValue({})
    api.router.replace.mockClear()
    wa.enabled.value = true
  })

  it('lists conversations with what was said last', async () => {
    const w = mountInbox()
    await flushPromises()
    const row = w.find('.crm-inbox-thread')
    expect(row.text()).toContain('Zenith Steel')
    expect(row.text()).toContain('Quote please')
    expect(row.find('.crm-inbox-dot').exists()).toBe(true)
  })

  it('asks the server for conversations waiting on a reply', async () => {
    const w = mountInbox()
    await w.findAll('.crm-inbox-chip').find((c) => c.text() === 'Needs reply').trigger('click')
    expect(threads().reload).toHaveBeenCalled()
    expect(threads().options.makeParams().needs_reply).toBe(1)
  })

  it('opens a conversation and keeps it in the URL', async () => {
    const w = mountInbox()
    await flushPromises()
    await w.find('.crm-inbox-thread').trigger('click')
    expect(thread().options.makeParams()).toEqual({ deal: 'PIPE-1' })
    expect(thread().reload).toHaveBeenCalled()
    expect(api.router.replace).toHaveBeenCalledWith({ query: { pipeline: 'PIPE-1' } })
  })

  it('opens the conversation named in the URL', () => {
    api.route.query = { pipeline: 'PIPE-1' }
    mountInbox()
    expect(thread().reload).toHaveBeenCalled()
  })

  describe('replying', () => {
    async function openThread(over) {
      api.route.query = { pipeline: 'PIPE-1' }
      const w = mountInbox()
      thread()._seed(THREAD(over))
      await flushPromises()
      return w
    }

    it('shows the thread', async () => {
      const w = await openThread()
      expect(w.find('.crm-inbox-msg').text()).toContain('Can you send pricing?')
    })

    it('emails the reply on the same subject', async () => {
      const w = await openThread()
      await w.find('.crm-inbox-composer textarea').setValue('Sure, attached.')
      const send = w.findAll('button.stub-button').find((b) => b.text() === 'Send')
      await send.trigger('click')
      await flushPromises()
      expect(api.call).toHaveBeenCalledWith(
        'frappe.core.doctype.communication.email.make',
        expect.objectContaining({
          recipients: 'anita@zenith.example',
          subject: 'Re: Quote please',
          content: 'Sure, attached.',
          doctype: 'CRM Deal',
          name: 'PIPE-1',
        }),
      )
    })

    it('replies on WhatsApp when that is where the customer wrote', async () => {
      api.route.query = { pipeline: 'PIPE-1' }
      const w = mountInbox()
      const data = THREAD({ mobile_no: '+911234567890' })
      data.messages[0] = { ...data.messages[0], channel: 'whatsapp', subject: '', content: 'Hi' }
      thread()._seed(data)
      await flushPromises()
      await w.find('.crm-inbox-composer textarea').setValue('Hello!')
      await w.findAll('button.stub-button').find((b) => b.text() === 'Send').trigger('click')
      await flushPromises()
      expect(api.call).toHaveBeenCalledWith(
        'xbr_crm.api.whatsapp.create_whatsapp_message',
        expect.objectContaining({ to: '+911234567890', message: 'Hello!' }),
      )
    })

    describe('attachments', () => {
      const sendButton = (w) => w.findAll('button.stub-button').find((b) => b.text() === 'Send')
      const attach = async (w, file) => {
        w.findComponent({ name: 'FileUploader' }).vm.$emit('success', file)
        await flushPromises()
      }

      it('shows files on messages in the thread', async () => {
        api.route.query = { pipeline: 'PIPE-1' }
        const w = mountInbox()
        const data = THREAD()
        data.messages[0] = { ...data.messages[0], content: '', attachments: [{ file_name: 'quote.pdf', file_url: '/files/quote.pdf' }] }
        thread()._seed(data)
        await flushPromises()
        expect(w.find('.crm-inbox-msg .stub-attachment').text()).toBe('quote.pdf')
        expect(w.find('.crm-inbox-msg .crm-inbox-msg-body').exists()).toBe(false)
      })

      it('emails the attached files, kept private', async () => {
        const w = await openThread()
        expect(w.findComponent({ name: 'FileUploader' }).props('uploadArgs')).toEqual({
          doctype: 'CRM Deal',
          docname: 'PIPE-1',
          private: true,
        })
        await attach(w, PDF)
        expect(w.find('.crm-inbox-composer .stub-attachment').text()).toContain('cv.pdf')
        // A file alone is enough to send.
        expect(sendButton(w).attributes('disabled')).toBeUndefined()
        await sendButton(w).trigger('click')
        await flushPromises()
        expect(api.call).toHaveBeenCalledWith(
          'frappe.core.doctype.communication.email.make',
          expect.objectContaining({ attachments: ['F1'] }),
        )
        expect(w.find('.crm-inbox-composer .stub-attachment').exists()).toBe(false)
      })

      it('sends one WhatsApp message per file, the text as the first caption, files public', async () => {
        api.route.query = { pipeline: 'PIPE-1' }
        const w = mountInbox()
        const data = THREAD({ mobile_no: '+911234567890' })
        data.messages[0] = { ...data.messages[0], channel: 'whatsapp', subject: '', content: 'Hi' }
        thread()._seed(data)
        await flushPromises()
        expect(w.findComponent({ name: 'FileUploader' }).props('uploadArgs').private).toBe(false)
        api.call.mockImplementation(async (method) =>
          method === 'frappe.client.set_value' ? { file_url: '/files/cv.pdf' } : {},
        )
        await attach(w, PDF)
        await attach(w, PHOTO)
        await w.find('.crm-inbox-composer textarea').setValue('Our profiles')
        await sendButton(w).trigger('click')
        await flushPromises()

        expect(api.call).toHaveBeenCalledWith('frappe.client.set_value', {
          doctype: 'File',
          name: 'F1',
          fieldname: 'is_private',
          value: 0,
        })
        const sends = api.call.mock.calls.filter((c) => c[0] === 'xbr_crm.api.whatsapp.create_whatsapp_message')
        expect(sends.map((c) => c[1])).toEqual([
          expect.objectContaining({ message: 'Our profiles', attach: '/files/cv.pdf', content_type: 'document' }),
          expect.objectContaining({ message: '', attach: '/files/site.jpg', content_type: 'image' }),
        ])
      })

      it('deletes a file removed before sending', async () => {
        const w = await openThread()
        await attach(w, PDF)
        await w.find('.crm-inbox-composer .stub-attachment .lucide-x').trigger('click')
        expect(api.call).toHaveBeenCalledWith('frappe.client.delete', { doctype: 'File', name: 'F1' })
        expect(w.find('.crm-inbox-composer .stub-attachment').exists()).toBe(false)
      })
    })

    it('cannot reply on WhatsApp without a mobile number', async () => {
      const w = await openThread({ mobile_no: '' })
      const chip = w.findAll('.crm-inbox-composer .crm-inbox-chip').find((c) => c.text() === 'WhatsApp')
      expect(chip.attributes('disabled')).toBeDefined()
    })

    it('fills the reply with an AI draft', async () => {
      const w = await openThread()
      api.call.mockResolvedValue({ text: 'Hi Anita, here is the quote.' })
      await w.findAll('button.stub-button').find((b) => b.text() === 'Draft with AI').trigger('click')
      await flushPromises()
      expect(api.call).toHaveBeenCalledWith(
        'xbr_crm.ai.drafts.draft_reply',
        expect.objectContaining({ deal: 'PIPE-1', channel: 'email' }),
      )
      expect(w.find('.crm-inbox-composer textarea').element.value).toBe(
        'Hi Anita, here is the quote.',
      )
    })
  })
})
