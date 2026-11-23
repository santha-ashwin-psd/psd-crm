const api = vi.hoisted(() => ({
  doc: null,
  original: null,
  submit: vi.fn(),
  call: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  return {
    ...actual,
    call: api.call,
    toast: api.toast,
    createDocumentResource: () =>
      reactive({
        get doc() {
          return api.doc
        },
        get originalDoc() {
          return api.original
        },
        save: { submit: api.submit, loading: false },
      }),
  }
})

vi.mock('@/stores/settings', () => ({
  getSettings: () => ({ _settings: { reload: vi.fn() } }),
}))

import { reactive } from 'vue'
import { flushPromises } from '@vue/test-utils'
import AiSettings from '@/components/Settings/AiSettings.vue'
import { mountComponent } from '../helpers/mount'

const STUBS = {
  SettingsLayoutBase: {
    template: '<div><slot name="header-actions" /><slot name="content" /></div>',
  },
  Link: { props: ['modelValue'], template: '<div class="stub-link" />' },
  Switch: { props: ['modelValue', 'disabled'], template: '<div class="stub-switch" />' },
}

function mountPage(doc = {}) {
  api.doc = reactive({ ai_enabled: 0, ai_include_existing: 0, ai_rules: [], ...doc })
  api.original = JSON.parse(JSON.stringify(api.doc))
  return mountComponent(AiSettings, { global: { stubs: STUBS } })
}

describe('AiSettings', () => {
  beforeEach(() => {
    api.submit.mockReset()
    api.call.mockReset()
    Object.values(api.toast).forEach((fn) => fn.mockReset())
  })

  it('switches AI on and off through the settings field', () => {
    const w = mountPage()
    w.vm.enabled = true
    expect(api.doc.ai_enabled).toBe(1)
    w.vm.enabled = false
    expect(api.doc.ai_enabled).toBe(0)
  })

  it('keeps older pipelines out by default', () => {
    expect(mountPage().vm.includeExisting).toBe(false)
  })

  it('lists keyword rules and adds an empty one', async () => {
    const w = mountPage({
      ai_rules: [{ name: 'R1', enabled: 1, keywords: 'quotation', stage: 'Counselling' }],
    })
    expect(w.findAll('[data-testid="ai-rule"]')).toHaveLength(1)
    const add = w.findAll('button.stub-button').find((b) => b.text() === 'Add rule')
    await add.trigger('click')
    expect(api.doc.ai_rules).toHaveLength(2)
  })

  it('will not save a rule without keywords or a stage', () => {
    const w = mountPage({ ai_rules: [{ enabled: 1, keywords: '', stage: '' }] })
    expect(w.vm.ruleError).toBeTruthy()
    w.vm.update()
    expect(api.submit).not.toHaveBeenCalled()
  })

  it('reports a working connection', async () => {
    api.call.mockResolvedValue({ ok: true, model: 'openai/gpt-oss-120b' })
    const w = mountPage()
    const test = w.findAll('button.stub-button').find((b) => b.text() === 'Test connection')
    await test.trigger('click')
    await flushPromises()
    expect(api.call).toHaveBeenCalledWith('xbr_crm.ai.pipeline.test_connection')
    expect(api.toast.success).toHaveBeenCalled()
  })

  it('reports a failed connection with the service’s message', async () => {
    api.call.mockResolvedValue({ ok: false, message: 'AI service answered 401' })
    const w = mountPage()
    const test = w.findAll('button.stub-button').find((b) => b.text() === 'Test connection')
    await test.trigger('click')
    await flushPromises()
    expect(api.toast.error).toHaveBeenCalledWith('AI service answered 401')
  })
})
