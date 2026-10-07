const res = vi.hoisted(() => ({ options: null, data: null, fetch: vi.fn() }))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  return {
    ...actual,
    createListResource: (options) => {
      res.options = options
      return reactive({
        ...options,
        get data() {
          return res.data
        },
        fetch: res.fetch,
        reload: vi.fn(),
      })
    },
  }
})

import WhatsappTemplateSelectorModal from '@/components/Modals/WhatsappTemplateSelectorModal.vue'
import { mountComponent } from '../helpers/mount'

const template = (name, extra = {}) => ({
  name,
  template: `<p>${name}</p>`,
  footer: '',
  ...extra,
})

const mountModal = (templates = [], props = {}) => {
  res.data = templates
  return mountComponent(WhatsappTemplateSelectorModal, {
    props: { modelValue: true, doctype: 'CRM Lead', ...props },
    global: { stubs: { Dialog: true, TextEditor: true, FormControl: true } },
  })
}

describe('WhatsappTemplateSelectorModal', () => {
  beforeEach(() => {
    res.fetch.mockClear()
    res.data = null
  })

  describe('which templates it asks for', () => {
    it('requests only approved ones', () => {
      // An unapproved template cannot be sent by WhatsApp.
      mountModal([])
      expect(res.options.filters.status).toBe('APPROVED')
    })

    it('accepts templates for this doctype or for none', () => {
      mountModal([], { doctype: 'CRM Deal' })
      expect(res.options.filters.for_doctype).toEqual(['in', ['CRM Deal', '']])
    })

    it('fetches on mount when nothing is cached', () => {
      res.data = null
      mountModal(null)
      expect(res.fetch).toHaveBeenCalled()
    })

    it('does not refetch when the cache already holds templates', () => {
      mountModal([template('welcome')])
      expect(res.fetch).not.toHaveBeenCalled()
    })
  })

  describe('searching', () => {
    it('lists everything when the box is empty', () => {
      const wrapper = mountModal([template('welcome'), template('followup')])
      expect(wrapper.vm.filteredTemplates).toHaveLength(2)
    })

    it('matches on the template name', () => {
      const wrapper = mountModal([template('welcome'), template('followup')])
      wrapper.vm.search = 'follow'
      expect(wrapper.vm.filteredTemplates.map((t) => t.name)).toEqual([
        'followup',
      ])
    })

    it('ignores case', () => {
      const wrapper = mountModal([template('Welcome')])
      wrapper.vm.search = 'WELCOME'
      expect(wrapper.vm.filteredTemplates).toHaveLength(1)
    })

    it('returns nothing when nothing matches', () => {
      const wrapper = mountModal([template('welcome')])
      wrapper.vm.search = 'zzz'
      expect(wrapper.vm.filteredTemplates).toEqual([])
    })

    it('is empty before the templates load', () => {
      expect(mountModal(null).vm.filteredTemplates).toEqual([])
    })
  })

  describe('creating a new template', () => {
    it('closes and opens the desk form', () => {
      const open = vi.spyOn(window, 'open').mockImplementation(() => {})
      const wrapper = mountModal([])
      wrapper.vm.newWhatsappTemplate()
      expect(wrapper.emitted('update:modelValue').at(-1)[0]).toBe(false)
      expect(open).toHaveBeenCalledWith('/app/whatsapp-templates/new')
      open.mockRestore()
    })
  })
})
