const api = vi.hoisted(() => ({ toast: null, capture: vi.fn(), sent: [] }))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  api.toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
  return {
    ...actual,
    toast: api.toast,
    createResource: (options = {}) => {
      const r = reactive({ ...options, data: null, fetch: vi.fn(), submit: vi.fn() })
      api.sent.push(r)
      return r
    },
  }
})

vi.mock('frappe-ui/frappe', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useTelemetry: () => ({ capture: api.capture }) }
})

import WhatsAppArea from '@/components/Activities/WhatsAppArea.vue'
import { mountComponent } from '../helpers/mount'
import { reactive } from 'vue'

const STUBS = {
  IconPicker: true, CheckIcon: true, DoubleCheckIcon: true,
  DocumentIcon: true, ReactIcon: true, Tooltip: true, Dropdown: true,
}

let list
let reply

const mount = (messages = []) => {
  list = reactive({ reload: vi.fn() })
  reply = reactive({})
  api.sent = []
  return mountComponent(WhatsAppArea, {
    props: { messages, modelValue: list, reply },
    global: { stubs: STUBS },
  })
}

const format = (message) => mount().vm.formatWhatsAppMessage(message)

describe('WhatsAppArea', () => {
  beforeEach(() => {
    api.toast.error.mockClear()
    api.capture.mockClear()
  })

  describe('rendering WhatsApp markup', () => {
    it('makes _text_ italic', () => {
      expect(format('_hello_')).toContain('<i>hello</i>')
    })

    it('makes *text* bold', () => {
      expect(format('*hello*')).toContain('<b>hello</b>')
    })

    it('makes ~text~ struck through', () => {
      expect(format('~hello~')).toContain('<s>hello</s>')
    })

    it('makes `text` monospace', () => {
      expect(format('`code()`')).toContain('<code>code()</code>')
    })

    it('makes ```text``` monospace too', () => {
      expect(format('```code()```')).toContain('<code>')
    })

    it('turns a leading > into a quote', () => {
      expect(format('> quoted')).toContain('<blockquote>quoted</blockquote>')
    })

    it('turns newlines into breaks', () => {
      expect(format('one\ntwo')).toContain('<br>')
    })

    it('combines several styles in one message', () => {
      const out = format('*bold* and _italic_')
      expect(out).toContain('<b>bold</b>')
      expect(out).toContain('<i>italic</i>')
    })

    it('leaves plain text alone', () => {
      expect(format('just words')).toContain('just words')
    })

    it('strips a script tag', () => {
      // The formatter builds HTML from user text, so the sanitiser at the end
      // is the only thing between a message and script execution.
      const out = format('<script>alert(1)</script>')
      expect(out).not.toContain('<script')
    })

    it('strips an inline event handler', () => {
      expect(format('<img src=x onerror="alert(1)">')).not.toContain('onerror')
    })

    it('still sanitises text that was styled first', () => {
      // The bold pass wraps it before the sanitiser runs; the tag inside must
      // not survive that ordering.
      expect(format('*<script>alert(1)</script>*')).not.toContain('<script')
    })
  })

  describe('reacting to a message', () => {
    it('sends the emoji against that message', () => {
      mount().vm.reactOnMessage('MSG-1', '👍')
      expect(api.sent.at(-1).params).toEqual({
        emoji: '👍',
        reply_to_name: 'MSG-1',
      })
    })

    it('refreshes the thread once it lands', () => {
      mount().vm.reactOnMessage('MSG-1', '👍')
      api.sent.at(-1).onSuccess()
      expect(list.reload).toHaveBeenCalled()
      expect(api.capture).toHaveBeenCalledWith('whatsapp_react_on_message')
    })

    it('reports the server reason when it refuses', () => {
      mount().vm.reactOnMessage('MSG-1', '👍')
      api.sent.at(-1).onError({ messages: ['Message too old'] })
      expect(api.toast.error).toHaveBeenCalledWith('Message too old')
    })

    it('shows a plain Error message rather than burying it', () => {
      mount().vm.reactOnMessage('MSG-1', '👍')
      api.sent.at(-1).onError(new Error('offline'))
      expect(api.toast.error).toHaveBeenCalledWith('offline')
    })

    it('does not refresh after a failure', () => {
      mount().vm.reactOnMessage('MSG-1', '👍')
      api.sent.at(-1).onError({})
      expect(list.reload).not.toHaveBeenCalled()
    })
  })

  describe('replying to a message', () => {
    it('offers Reply', () => {
      expect(
        mount().vm.messageOptions({ name: 'MSG-1', message: 'hi' }).map((o) => o.label),
      ).toEqual(['Reply'])
    })

    it('stores the message being replied to', () => {
      const wrapper = mount()
      wrapper.vm.messageOptions({ name: 'MSG-1', message: 'hi' })[0].onClick()
      expect(wrapper.vm.reply.name).toBe('MSG-1')
      expect(wrapper.vm.replyMode).toBe(true)
    })

    it('formats the quoted text, so the preview reads like the original', () => {
      const wrapper = mount()
      wrapper.vm.messageOptions({ name: 'MSG-1', message: '*bold*' })[0].onClick()
      expect(wrapper.vm.reply.message).toContain('<b>bold</b>')
    })
  })

  describe('jumping to a quoted message', () => {
    it('scrolls to it and highlights it briefly', () => {
      vi.useFakeTimers()
      const el = document.createElement('div')
      el.id = 'MSG-1'
      el.scrollIntoView = vi.fn()
      document.body.appendChild(el)

      mount().vm.scrollToMessage('MSG-1')
      expect(el.scrollIntoView).toHaveBeenCalled()
      expect(el.classList.contains('bg-yellow-100')).toBe(true)

      vi.advanceTimersByTime(1000)
      expect(el.classList.contains('bg-yellow-100')).toBe(false)

      el.remove()
      vi.useRealTimers()
    })

    it('does nothing when that message is not on screen', () => {
      // Regression: the element was dereferenced without a check, so clicking
      // a quote whose original is older than the loaded page — or since
      // deleted — took the whole thread down.
      expect(() => mount().vm.scrollToMessage('MSG-GONE')).not.toThrow()
    })
  })

  describe('opening an attachment', () => {
    it('opens it in a new tab', () => {
      const open = vi.spyOn(window, 'open').mockImplementation(() => {})
      mount().vm.openFileInAnotherTab('/files/a.pdf')
      expect(open).toHaveBeenCalledWith('/files/a.pdf', '_blank')
      open.mockRestore()
    })
  })
})
