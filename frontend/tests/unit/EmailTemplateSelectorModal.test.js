const res = vi.hoisted(() => ({ data: null, reload: vi.fn(), fetch: vi.fn() }))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  return {
    ...actual,
    createListResource: (options) =>
      reactive({ ...options, ...res }),
  }
})

const bus = vi.hoisted(() => ({ on: vi.fn(), send: vi.fn() }))
vi.mock('@/composables/useBroadcast', () => ({
  useBroadcast: () => ({ on: bus.on, send: bus.send, off: vi.fn() }),
}))

import EmailTemplateSelectorModal from '@/components/Modals/EmailTemplateSelectorModal.vue'
import { showSettings, activeSettingsPage } from '@/composables/settings'
import { mountComponent } from '../helpers/mount'

const template = (overrides = {}) => ({
  name: 'Welcome',
  subject: 'Welcome aboard',
  response: '<p>hi</p>',
  enabled: 1,
  reference_doctype: 'CRM Lead',
  ...overrides,
})

const mountModal = (templates = []) => {
  res.data = templates
  return mountComponent(EmailTemplateSelectorModal, {
    props: { modelValue: true, doctype: 'CRM Lead' },
    global: { stubs: { Dialog: true, TextEditor: true, FormControl: true } },
  })
}

describe('EmailTemplateSelectorModal', () => {
  beforeEach(() => {
    res.data = null
    res.reload.mockClear()
    bus.on.mockClear()
    bus.send.mockClear()
    showSettings.value = false
    activeSettingsPage.value = ''
  })

  describe('searching', () => {
    it('lists everything when the box is empty', () => {
      const wrapper = mountModal([template(), template({ name: 'Follow up' })])
      expect(wrapper.vm.filteredTemplates).toHaveLength(2)
    })

    it('matches on the template name', () => {
      const wrapper = mountModal([
        template({ name: 'Welcome' }),
        template({ name: 'Follow up', subject: 'Checking in' }),
      ])
      wrapper.vm.search = 'follow'
      expect(wrapper.vm.filteredTemplates.map((t) => t.name)).toEqual([
        'Follow up',
      ])
    })

    it('matches on the subject too', () => {
      // The name is often a slug; the subject is what the user recognises.
      const wrapper = mountModal([
        template({ name: 'T1', subject: 'Welcome aboard' }),
        template({ name: 'T2', subject: 'Checking in' }),
      ])
      wrapper.vm.search = 'checking'
      expect(wrapper.vm.filteredTemplates.map((t) => t.name)).toEqual(['T2'])
    })

    it('ignores case on both sides', () => {
      const wrapper = mountModal([template({ name: 'WELCOME' })])
      wrapper.vm.search = 'welcome'
      expect(wrapper.vm.filteredTemplates).toHaveLength(1)
    })

    it('returns nothing when nothing matches', () => {
      const wrapper = mountModal([template()])
      wrapper.vm.search = 'zzzz'
      expect(wrapper.vm.filteredTemplates).toEqual([])
    })

    it('is empty before the templates load', () => {
      expect(mountModal(null).vm.filteredTemplates).toEqual([])
    })
  })

  describe('creating a new template', () => {
    it('closes the picker', () => {
      const wrapper = mountModal([])
      wrapper.vm.create()
      expect(wrapper.emitted('update:modelValue').at(-1)[0]).toBe(false)
    })

    it('opens settings on the Templates page', () => {
      const wrapper = mountModal([])
      wrapper.vm.create()
      expect(showSettings.value).toBe(true)
      expect(activeSettingsPage.value).toBe('Templates')
    })

    it('tells the settings page which doctype to prefill', () => {
      // Settings lives in a separate tree, hence the broadcast rather than a prop.
      const wrapper = mountModal([])
      wrapper.vm.create()
      expect(bus.send).toHaveBeenCalledWith('email_template_page', {
        page: 'new-template',
        reference_doctype: 'CRM Lead',
      })
    })
  })

  describe('staying in sync', () => {
    it('subscribes to template changes made elsewhere', () => {
      mountModal([])
      expect(bus.on).toHaveBeenCalledWith(
        'refresh-email-templates',
        expect.any(Function),
      )
    })

    it('reloads when that broadcast arrives', () => {
      mountModal([])
      const handler = bus.on.mock.calls.find(
        ([event]) => event === 'refresh-email-templates',
      )[1]
      handler()
      expect(res.reload).toHaveBeenCalled()
    })
  })
})
