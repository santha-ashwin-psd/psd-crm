const api = vi.hoisted(() => ({
  toast: null,
  send: vi.fn(),
  rename: null,
}))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  api.toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn() }
  return {
    ...actual,
    toast: api.toast,
    createResource: (options = {}) => {
      api.rename = reactive({
        ...options,
        data: null,
        fetch: vi.fn(async () => 'RENAMED'),
        reload: vi.fn(),
      })
      return api.rename
    },
  }
})

vi.mock('@/composables/useBroadcast', () => ({
  useBroadcast: () => ({ send: api.send, on: vi.fn(), off: vi.fn() }),
}))

import EmailTemplates from '@/components/Settings/EmailTemplate/EmailTemplates.vue'
import NewEmailTemplate from '@/components/Settings/EmailTemplate/NewEmailTemplate.vue'
import EditEmailTemplate from '@/components/Settings/EmailTemplate/EditEmailTemplate.vue'
import { mountComponent } from '../helpers/mount'
import { reactive, nextTick } from 'vue'
import { flushPromises } from '@vue/test-utils'

const template = (name, over = {}) => ({
  name,
  subject: `${name} subject`,
  reference_doctype: 'CRM Deal',
  response: '<p>hi</p>',
  response_html: '',
  use_html: 0,
  enabled: 1,
  ...over,
})

// frappe-ui's Switch declares modelValue: Boolean while the server sends 0/1,
// so an auto-stub prints a prop warning on every mount.
const SwitchStub = {
  props: ['modelValue', 'size', 'label'],
  template: '<button class="local-switch" />',
}

const TextEditorStub = {
  props: ['content', 'editable', 'editorClass'],
  emits: ['change'],
  template: '<div class="local-editor" />',
}

let templates

const makeTemplates = (rows = []) =>
  reactive({
    data: rows,
    loading: false,
    reload: vi.fn(),
    setValue: { submit: vi.fn() },
    insert: { submit: vi.fn() },
    delete: { submit: vi.fn() },
  })

describe('EmailTemplates list', () => {
  const mount = (rows = []) => {
    templates = makeTemplates(rows)
    return mountComponent(EmailTemplates, {
      global: {
        stubs: {
          Switch: SwitchStub,
          Dropdown: true,
          EmptyState: true,
          SkeletonLoader: true,
          SettingsLayoutBase: true,
        },
        provide: { templates },
      },
    })
  }

  beforeEach(() => {
    api.toast.success.mockClear()
    api.toast.error.mockClear()
    api.send.mockClear()
  })

  describe('filtering', () => {
    const rows = [
      template('Welcome', { reference_doctype: 'CRM Lead' }),
      template('Follow up', { reference_doctype: 'CRM Deal' }),
    ]

    it('shows everything by default', () => {
      expect(mount(rows).vm.templatesList).toHaveLength(2)
    })

    it('matches on name', async () => {
      const wrapper = mount(rows)
      wrapper.vm.search = 'welcome'
      await nextTick()
      expect(wrapper.vm.templatesList.map((t) => t.name)).toEqual(['Welcome'])
    })

    it('matches on subject', async () => {
      const wrapper = mount(rows)
      wrapper.vm.search = 'follow up subject'
      await nextTick()
      expect(wrapper.vm.templatesList.map((t) => t.name)).toEqual(['Follow up'])
    })

    it('survives a template with no subject', async () => {
      // Email Template does have a subject, but it is not required — and the
      // sibling copy of this filter in LeadSyncSources lost the `?.` and threw.
      const wrapper = mount([template('A', { subject: undefined })])
      wrapper.vm.search = 'zzz'
      await nextTick()
      expect(wrapper.vm.templatesList).toEqual([])
    })

    it('narrows by doctype', async () => {
      const wrapper = mount(rows)
      wrapper.vm.currentDoctype = 'CRM Lead'
      await nextTick()
      expect(wrapper.vm.templatesList.map((t) => t.name)).toEqual(['Welcome'])
    })

    it('combines search and doctype', async () => {
      const wrapper = mount(rows)
      wrapper.vm.currentDoctype = 'CRM Deal'
      wrapper.vm.search = 'welcome'
      await nextTick()
      expect(wrapper.vm.templatesList).toEqual([])
    })

    it('offers all three doctype choices', () => {
      expect(mount().vm.doctypeOptions.map((o) => o.value)).toEqual([
        'All',
        'CRM Lead',
        'CRM Deal',
      ])
    })
  })

  describe('enabling and disabling', () => {
    it('sends the new state', () => {
      const wrapper = mount([template('A')])
      wrapper.vm.toggleEmailTemplate(template('A'), true)
      expect(templates.setValue.submit).toHaveBeenCalledWith(
        { name: 'A', enabled: 1 },
        expect.any(Object),
      )
    })

    it('tells other tabs to refresh', () => {
      // The template picker in the email composer caches this list.
      const wrapper = mount([template('A')])
      wrapper.vm.toggleEmailTemplate(template('A'), true)
      templates.setValue.submit.mock.calls[0][1].onSuccess()
      expect(api.send).toHaveBeenCalledWith('refresh-email-templates')
    })

    it('puts the switch back when the server refuses', () => {
      const wrapper = mount([template('A')])
      const row = template('A')
      wrapper.vm.toggleEmailTemplate(row, true)
      templates.setValue.submit.mock.calls[0][1].onError(new Error('nope'))
      expect(row.enabled).toBe(false)
      expect(api.toast.error).toHaveBeenCalledWith('nope')
    })
  })

  describe('deleting', () => {
    it('deletes by name and confirms', () => {
      const wrapper = mount([template('A')])
      wrapper.vm.deleteTemplate(template('A'))
      expect(templates.delete.submit).toHaveBeenCalledWith('A', expect.any(Object))
      templates.delete.submit.mock.calls[0][1].onSuccess()
      expect(api.toast.success).toHaveBeenCalledWith('Template Deleted Successfully')
    })

    it('reports why it could not', () => {
      const wrapper = mount([template('A')])
      wrapper.vm.deleteTemplate(template('A'))
      templates.delete.submit.mock.calls[0][1].onError({})
      expect(api.toast.error).toHaveBeenCalledWith('Failed to delete template')
    })
  })

  describe('duplicating', () => {
    it('opens the new-template form with a copy', () => {
      const row = template('A')
      const wrapper = mount([row])
      const options = wrapper.vm.getDropdownOptions(row)
      options.find((o) => o.label === 'Duplicate').onClick()
      const [step, payload] = wrapper.emitted('updateStep')[0]
      expect(step).toBe('new-template')
      expect(payload).not.toBe(row)
    })
  })
})

describe('NewEmailTemplate', () => {
  const mount = (templateData = {}) => {
    templates = makeTemplates()
    return mountComponent(NewEmailTemplate, {
      props: { templateData },
      global: {
        stubs: { Switch: SwitchStub, TextEditor: TextEditorStub },
        provide: { templates },
      },
    })
  }

  beforeEach(() => {
    api.toast.success.mockClear()
    api.send.mockClear()
  })

  describe('validation', () => {
    const requires = (wrapper, message) => {
      wrapper.vm.createTemplate()
      expect(wrapper.vm.errorMessage).toBe(message)
      expect(templates.insert.submit).not.toHaveBeenCalled()
    }

    it('needs a name', () => {
      requires(mount(), 'Name is required')
    })

    it('needs a subject', async () => {
      const wrapper = mount()
      wrapper.vm.template.name = 'A'
      await nextTick()
      requires(wrapper, 'Subject is required')
    })

    it('needs rich-text content when that is the mode', async () => {
      const wrapper = mount()
      Object.assign(wrapper.vm.template, { name: 'A', subject: 'S' })
      await nextTick()
      requires(wrapper, 'Content is required')
    })

    it('needs HTML content when that is the mode', async () => {
      // The two modes store into different fields, so the check has to follow
      // whichever one is active.
      const wrapper = mount()
      Object.assign(wrapper.vm.template, {
        name: 'A',
        subject: 'S',
        content_type: 'HTML',
        response: '<p>ignored</p>',
      })
      await nextTick()
      requires(wrapper, 'Content is required')
    })

    it('accepts HTML content in HTML mode', async () => {
      const wrapper = mount()
      Object.assign(wrapper.vm.template, {
        name: 'A',
        subject: 'S',
        content_type: 'HTML',
        response_html: '<b>hi</b>',
      })
      await nextTick()
      wrapper.vm.createTemplate()
      expect(templates.insert.submit).toHaveBeenCalled()
    })

    it('clears a stale error on the next attempt', async () => {
      const wrapper = mount()
      wrapper.vm.createTemplate()
      expect(wrapper.vm.errorMessage).toBeTruthy()
      Object.assign(wrapper.vm.template, {
        name: 'A',
        subject: 'S',
        response: '<p>hi</p>',
      })
      await nextTick()
      wrapper.vm.createTemplate()
      expect(wrapper.vm.errorMessage).toBe('')
    })
  })

  describe('creating', () => {
    const valid = async (wrapper) => {
      Object.assign(wrapper.vm.template, {
        name: 'A',
        subject: 'S',
        response: '<p>hi</p>',
      })
      await nextTick()
    }

    it('returns to the list and confirms', async () => {
      const wrapper = mount()
      await valid(wrapper)
      wrapper.vm.createTemplate()
      templates.insert.submit.mock.calls[0][1].onSuccess()
      expect(wrapper.emitted('updateStep')[0][0]).toBe('template-list')
      expect(api.toast.success).toHaveBeenCalledWith('Template created successfully')
      expect(api.send).toHaveBeenCalledWith('refresh-email-templates')
    })

    it('shows the server reason inline rather than as a toast', async () => {
      // The user is mid-form; a toast would vanish before they could act on it.
      const wrapper = mount()
      await valid(wrapper)
      wrapper.vm.createTemplate()
      templates.insert.submit.mock.calls[0][1].onError({ messages: ['Duplicate name'] })
      expect(wrapper.vm.errorMessage).toBe('Duplicate name')
    })

    it('sends a copy, not the reactive object', async () => {
      const wrapper = mount()
      await valid(wrapper)
      wrapper.vm.createTemplate()
      expect(templates.insert.submit.mock.calls[0][0]).not.toBe(
        wrapper.vm.template,
      )
    })
  })

  describe('starting from a duplicate', () => {
    it('marks the name as a copy', () => {
      expect(mount(template('Welcome')).vm.template.name).toBe('Welcome - Copy')
    })

    it('starts it disabled whatever the original was', () => {
      // Two enabled templates for the same doctype would both be offered.
      expect(mount(template('Welcome', { enabled: 1 })).vm.template.enabled).toBe(
        false,
      )
    })

    it('carries the content across', () => {
      expect(mount(template('Welcome')).vm.template.subject).toBe(
        'Welcome subject',
      )
    })

    it('starts blank when nothing was passed', () => {
      expect(mount().vm.template.name).toBe('')
      expect(mount().vm.template.reference_doctype).toBe('CRM Deal')
    })
  })
})

describe('EditEmailTemplate', () => {
  const mount = (templateData) => {
    templates = makeTemplates()
    return mountComponent(EditEmailTemplate, {
      props: { templateData },
      global: {
        stubs: { Switch: SwitchStub, TextEditor: TextEditorStub },
        provide: { templates },
      },
    })
  }

  beforeEach(() => {
    api.toast.success.mockClear()
    api.toast.error.mockClear()
  })

  it('loads the template into the form', () => {
    const wrapper = mount(template('A'))
    expect(wrapper.vm.template.name).toBe('A')
  })

  it('derives the editing mode from use_html', () => {
    expect(mount(template('A', { use_html: 1 })).vm.template.content_type).toBe(
      'HTML',
    )
    expect(mount(template('A', { use_html: 0 })).vm.template.content_type).toBe(
      'Rich Text',
    )
  })

  describe('the unsaved marker', () => {
    it('is off on arrival', () => {
      expect(mount(template('A')).vm.dirty).toBe(false)
    })

    it('comes on when the subject changes', async () => {
      const wrapper = mount(template('A'))
      wrapper.vm.template.subject = 'Changed'
      await nextTick()
      expect(wrapper.vm.dirty).toBe(true)
    })

    it('ignores the 0/1 versus true/false difference on enabled', async () => {
      // The server sends 1; the Switch writes true. That is not an edit.
      const wrapper = mount(template('A', { enabled: 1 }))
      wrapper.vm.template.enabled = true
      await nextTick()
      expect(wrapper.vm.dirty).toBe(false)
    })
  })

  describe('saving nothing', () => {
    it('does not call the server when nothing changed', async () => {
      const wrapper = mount(template('A'))
      await wrapper.vm.updateTemplate()
      expect(templates.setValue.submit).not.toHaveBeenCalled()
      expect(api.rename.fetch).not.toHaveBeenCalled()
    })
  })

  describe('saving a field change', () => {
    it('updates without renaming', async () => {
      const wrapper = mount(template('A'))
      wrapper.vm.template.subject = 'Changed'
      await nextTick()
      await wrapper.vm.updateTemplate()
      expect(api.rename.fetch).not.toHaveBeenCalled()
      expect(templates.setValue.submit).toHaveBeenCalled()
    })

    it('keeps the original name in the payload', async () => {
      const wrapper = mount(template('A'))
      wrapper.vm.template.subject = 'Changed'
      await nextTick()
      await wrapper.vm.updateTemplate()
      expect(templates.setValue.submit.mock.calls[0][0].name).toBe('A')
    })

    it('drops the editor-only content_type before sending', async () => {
      // It is a UI concept; `use_html` is what the doctype stores.
      const wrapper = mount(template('A'))
      wrapper.vm.template.subject = 'Changed'
      await nextTick()
      await wrapper.vm.updateTemplate()
      const sent = templates.setValue.submit.mock.calls[0][0]
      expect(sent).not.toHaveProperty('content_type')
      expect(sent).toHaveProperty('use_html')
    })

    it('confirms and returns to the list', async () => {
      const wrapper = mount(template('A'))
      wrapper.vm.template.subject = 'Changed'
      await nextTick()
      await wrapper.vm.updateTemplate()
      templates.setValue.submit.mock.calls[0][1].onSuccess()
      expect(api.toast.success).toHaveBeenCalledWith('Template updated successfully')
      expect(wrapper.emitted('updateStep')[0][0]).toBe('template-list')
    })

    it('shows the failure inline', async () => {
      const wrapper = mount(template('A'))
      wrapper.vm.template.subject = 'Changed'
      await nextTick()
      await wrapper.vm.updateTemplate()
      templates.setValue.submit.mock.calls[0][1].onError({})
      expect(wrapper.vm.errorMessage).toBe('Failed to update template')
    })
  })

  describe('renaming', () => {
    it('renames when only the name changed', async () => {
      const wrapper = mount(template('A'))
      wrapper.vm.template.name = 'B'
      await nextTick()
      await wrapper.vm.updateTemplate()
      await flushPromises()
      expect(api.rename.fetch).toHaveBeenCalled()
      expect(templates.setValue.submit).not.toHaveBeenCalled()
      expect(wrapper.emitted('updateStep')[0][0]).toBe('template-list')
    })

    it('renames then saves the rest against the new name', async () => {
      const wrapper = mount(template('A'))
      wrapper.vm.template.name = 'B'
      wrapper.vm.template.subject = 'Changed'
      await nextTick()
      await wrapper.vm.updateTemplate()
      await flushPromises()
      expect(api.rename.fetch).toHaveBeenCalled()
      expect(templates.setValue.submit.mock.calls[0][0].name).toBe('RENAMED')
    })

    it('stops when the rename is refused', async () => {
      // Regression: createResource routes failures to its own onError and
      // resolves undefined, so the field update went ahead with
      // `name: undefined` against a document that was never renamed.
      // Mount first: it builds a fresh resource, which would replace any mock
      // set beforehand.
      const wrapper = mount(template('A'))
      api.rename.fetch.mockResolvedValue(undefined)
      wrapper.vm.template.name = 'B'
      wrapper.vm.template.subject = 'Changed'
      await nextTick()
      await wrapper.vm.updateTemplate()
      await flushPromises()
      expect(templates.setValue.submit).not.toHaveBeenCalled()
    })

    it('does not claim success when the rename is refused', async () => {
      const wrapper = mount(template('A'))
      api.rename.fetch.mockResolvedValue(undefined)
      wrapper.vm.template.name = 'B'
      await nextTick()
      await wrapper.vm.updateTemplate()
      await flushPromises()
      expect(wrapper.emitted('updateStep')).toBeUndefined()
    })

    it('asks the server to rename the right document', async () => {
      const wrapper = mount(template('A'))
      wrapper.vm.template.name = 'B'
      await nextTick()
      expect(api.rename.makeParams()).toEqual({
        doctype: 'Email Template',
        old_name: 'A',
        new_name: 'B',
      })
    })

    it('refreshes the list once renamed', () => {
      mount(template('A'))
      api.rename.onSuccess()
      expect(templates.reload).toHaveBeenCalled()
      expect(api.toast.success).toHaveBeenCalledWith('Template renamed successfully')
    })

    it('reports a rename failure inline', () => {
      const wrapper = mount(template('A'))
      api.rename.onError({ messages: ['Name already taken'] })
      expect(wrapper.vm.errorMessage).toBe('Name already taken')
    })
  })

  describe('validation', () => {
    it('refuses an empty name', async () => {
      const wrapper = mount(template('A'))
      wrapper.vm.template.name = ''
      await nextTick()
      await wrapper.vm.updateTemplate()
      expect(wrapper.vm.errorMessage).toBe('Name is required')
      expect(api.rename.fetch).not.toHaveBeenCalled()
    })

    it('refuses an empty subject', async () => {
      const wrapper = mount(template('A'))
      wrapper.vm.template.subject = ''
      await nextTick()
      await wrapper.vm.updateTemplate()
      expect(wrapper.vm.errorMessage).toBe('Subject is required')
    })
  })
})
