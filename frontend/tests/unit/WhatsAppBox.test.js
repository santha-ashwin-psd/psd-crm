const api = vi.hoisted(() => ({
  toast: null,
  capture: vi.fn(),
  sent: [],
}))

// Loaded through the AI draft composable (composables/aiDraft.js); the real
// store fetches FCRM Settings as soon as it is imported. AI stays off here.
vi.mock('@/stores/settings', async () => {
  const { ref } = await import('vue')
  return {
    getSettings: () => ({ brand: ref({}), _settings: { doc: {} } }),
    isTranslatable: () => false,
  }
})

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  api.toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
  return {
    ...actual,
    toast: api.toast,
    createResource: (options = {}) => {
      const r = reactive({ ...options, data: null, fetch: vi.fn(), submit: vi.fn(), reload: vi.fn() })
      api.sent.push(r)
      return r
    },
  }
})

vi.mock('frappe-ui/frappe', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useTelemetry: () => ({ capture: api.capture }) }
})

import WhatsAppBox from '@/components/Activities/WhatsAppBox.vue'
import { mountComponent } from '../helpers/mount'
import { reactive, nextTick } from 'vue'

const STUBS = {
  IconPicker: true, SmileIcon: true, Textarea: true, FileUploader: true,
  Dropdown: true,
}

let whatsapp
let reply

const mount = (docOver = {}) => {
  whatsapp = reactive({ attach: '', content_type: 'text', reload: vi.fn() })
  reply = reactive({})
  api.sent = []
  return mountComponent(WhatsAppBox, {
    props: {
      doctype: 'CRM Lead',
      modelValue: { name: 'LEAD-1', mobile_no: '+15550000', ...docOver },
      whatsapp,
      reply,
    },
    global: { stubs: STUBS },
  })
}

// The message resource is the one this component builds on send.
const lastRequest = () => api.sent.at(-1)

describe('WhatsAppBox', () => {
  beforeEach(() => {
    api.toast.error.mockClear()
    api.capture.mockClear()
  })

  describe('sending a message', () => {
    it('addresses it to the record and its number', () => {
      const wrapper = mount()
      wrapper.vm.content = 'Hello'
      wrapper.vm.sendWhatsAppMessage()
      expect(lastRequest().params).toMatchObject({
        reference_doctype: 'CRM Lead',
        reference_name: 'LEAD-1',
        message: 'Hello',
        to: '+15550000',
      })
    })

    it('clears the composer', () => {
      const wrapper = mount()
      wrapper.vm.content = 'Hello'
      wrapper.vm.sendWhatsAppMessage()
      expect(wrapper.vm.content).toBe('')
    })

    it('refreshes the thread once it lands', () => {
      const wrapper = mount()
      wrapper.vm.content = 'Hello'
      wrapper.vm.sendWhatsAppMessage()
      lastRequest().onSuccess()
      expect(whatsapp.reload).toHaveBeenCalled()
    })

    it('carries the message being replied to', () => {
      const wrapper = mount()
      reply.name = 'MSG-7'
      reply.message = 'Earlier'
      wrapper.vm.content = 'Hello'
      wrapper.vm.sendWhatsAppMessage()
      expect(lastRequest().params.reply_to).toBe('MSG-7')
    })

    it('clears the reply once sent', () => {
      // Otherwise the next message threads under the same one.
      const wrapper = mount()
      reply.name = 'MSG-7'
      wrapper.vm.content = 'Hello'
      wrapper.vm.sendWhatsAppMessage()
      expect(wrapper.vm.reply).toEqual({})
    })

    it('sends no reply reference when there is none', () => {
      const wrapper = mount()
      wrapper.vm.content = 'Hello'
      wrapper.vm.sendWhatsAppMessage()
      expect(lastRequest().params.reply_to).toBe('')
    })
  })

  describe('when the send fails', () => {
    const failWith = (error) => {
      const wrapper = mount()
      wrapper.vm.content = 'Hello there'
      wrapper.vm.sendWhatsAppMessage()
      lastRequest().onError(error)
      return wrapper
    }

    it('puts the message back in the composer', () => {
      // Regression: the box was cleared before the request went out, so a
      // failed send destroyed what the user had typed.
      expect(failWith({ messages: ['Number not on WhatsApp'] }).vm.content).toBe(
        'Hello there',
      )
    })

    it('says why', () => {
      expect(api.toast.error).not.toHaveBeenCalled()
      failWith({ messages: ['Number not on WhatsApp'] })
      expect(api.toast.error).toHaveBeenCalledWith('Number not on WhatsApp')
    })

    it('shows a plain Error message rather than burying it', () => {
      failWith(new Error('offline'))
      expect(api.toast.error).toHaveBeenCalledWith('offline')
    })

    it('falls back when the failure carries nothing', () => {
      failWith({})
      expect(api.toast.error).toHaveBeenCalledWith(
        'Failed to send WhatsApp message',
      )
    })

    it('puts an attachment back too', () => {
      const wrapper = mount()
      whatsapp.attach = '/files/a.pdf'
      whatsapp.content_type = 'document'
      wrapper.vm.sendWhatsAppMessage()
      lastRequest().onError({})
      expect(whatsapp.attach).toBe('/files/a.pdf')
      expect(whatsapp.content_type).toBe('document')
    })
  })

  describe('sending with the keyboard', () => {
    it('sends on plain Enter', () => {
      const wrapper = mount()
      wrapper.vm.content = 'Hello'
      wrapper.vm.sendTextMessage({ shiftKey: false })
      expect(api.sent.length).toBeGreaterThan(0)
      expect(api.capture).toHaveBeenCalledWith('whatsapp_send_message')
    })

    it('inserts a newline on shift+Enter instead', () => {
      // Multi-line messages are normal; Enter alone must not eat them.
      const wrapper = mount()
      wrapper.vm.content = 'Hello'
      const before = api.sent.length
      wrapper.vm.sendTextMessage({ shiftKey: true })
      expect(api.sent.length).toBe(before)
      expect(wrapper.vm.content).toBe('Hello')
    })
  })

  describe('attachments', () => {
    it('sends the uploaded file with its type', () => {
      const wrapper = mount()
      wrapper.vm.fileType = 'image'
      wrapper.vm.uploadFile({ file_url: '/files/photo.png' })
      expect(lastRequest().params).toMatchObject({
        attach: '/files/photo.png',
        content_type: 'image',
      })
      expect(api.capture).toHaveBeenCalledWith('whatsapp_upload_file')
    })

    it('offers document, image and video', () => {
      const wrapper = mount()
      expect(wrapper.vm.uploadOptions(vi.fn()).map((o) => o.label)).toEqual([
        'Upload Document',
        'Upload Image',
        'Upload Video',
      ])
    })

    it('restricts the picker to the chosen kind', () => {
      // A "video" upload offering PDFs would produce an unsendable message.
      const wrapper = mount()
      const open = vi.fn()
      const options = wrapper.vm.uploadOptions(open)
      options.find((o) => o.label === 'Upload Image').onClick()
      expect(open).toHaveBeenCalledWith('image/*')
      expect(wrapper.vm.fileType).toBe('image')
    })

    it('leaves a document upload unrestricted', () => {
      const wrapper = mount()
      const open = vi.fn()
      wrapper.vm.uploadOptions(open).find((o) => o.label === 'Upload Document').onClick()
      expect(open).toHaveBeenCalledWith()
      expect(wrapper.vm.fileType).toBe('document')
    })
  })

  describe('resetting between messages', () => {
    it('drops the attachment after sending', () => {
      const wrapper = mount()
      whatsapp.attach = '/files/a.pdf'
      wrapper.vm.sendWhatsAppMessage()
      expect(whatsapp.attach).toBe('')
      expect(whatsapp.content_type).toBe('text')
    })

    it('drops the pending file type', () => {
      const wrapper = mount()
      wrapper.vm.fileType = 'video'
      wrapper.vm.sendWhatsAppMessage()
      expect(wrapper.vm.fileType).toBe('')
    })
  })
})
