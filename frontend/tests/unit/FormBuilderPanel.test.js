const api = vi.hoisted(() => ({
  toast: null,
  call: vi.fn(async () => []),
  capture: vi.fn(),
  dialog: vi.fn(),
  copy: vi.fn(),
  config: null,
  fields: null,
}))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  api.toast = {
    success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(),
  }
  return {
    ...actual,
    toast: api.toast,
    call: (...args) => api.call(...args),
    createResource: (options = {}) => {
      const r = reactive({
        ...options,
        data: null,
        loading: false,
        reload: vi.fn(async () => ({})),
        submit: vi.fn(),
        fetch: vi.fn(),
      })
      if (options.url?.includes('get_form_config')) api.config = r
      if (options.url?.includes('get_form_fields')) api.fields = r
      return r
    },
  }
})

vi.mock('frappe-ui/frappe', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useTelemetry: () => ({ capture: api.capture }) }
})

vi.mock('@/stores/global', () => ({
  globalStore: () => ({ $dialog: api.dialog, $socket: { on: vi.fn(), off: vi.fn() } }),
}))

vi.mock('@/utils', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, copyToClipboard: api.copy }
})

vi.mock('vuedraggable', () => ({
  default: { name: 'Draggable', props: ['modelValue'], template: '<div><slot name="item" v-for="(el,i) in modelValue" :element="el" :index="i" /></div>' },
}))

import FormBuilderPanel from '@/components/Settings/Forms/FormBuilderPanel.vue'
import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'
import { flushPromises } from '@vue/test-utils'

const df = (fieldname, over = {}) => ({
  fieldname,
  label: fieldname,
  fieldtype: 'Data',
  options: '',
  reqd: 0,
  placeholder: '',
  field_description: '',
  ...over,
})

const CATALOG = [
  df('first_name', { reqd: 1 }),
  df('last_name'),
  df('email', { options: 'Email' }),
  df('status', { fieldtype: 'Select', options: 'Open\nClosed', reqd: 1 }),
]

const mount = () =>
  mountComponent(FormBuilderPanel, {
    props: { name: 'FORM-1' },
    global: {
      stubs: {
        Autocomplete: true, FieldCard: true, Draggable: true, Tabs: true,
        Dropdown: true, ErrorMessage: true, DragVerticalIcon: true,
        Switch: { props: ['modelValue'], template: '<button />' },
      },
    },
  })

const load = (docOver = {}, catalog = CATALOG) => {
  const wrapper = mount()
  api.config.onSuccess({
    title: 'Contact us',
    route: 'contact-us',
    document_type: 'CRM Lead',
    published: 0,
    fields: [df('first_name'), df('last_name')],
    hidden_fields: [],
    ...docOver,
  })
  api.fields.data = catalog
  return wrapper
}

describe('FormBuilderPanel', () => {
  beforeEach(() => {
    api.toast.error.mockClear()
    api.toast.info.mockClear()
    api.toast.success.mockClear()
    api.capture.mockClear()
    api.dialog.mockClear()
    api.copy.mockClear()
    api.call.mockReset().mockResolvedValue([])
  })

  describe('deriving sections from a flat field list', () => {
    it('wraps loose fields in one section', () => {
      const wrapper = load()
      expect(wrapper.vm.sections).toHaveLength(1)
      expect(wrapper.vm.sections[0].columns[0].items.map((f) => f.fieldname)).toEqual([
        'first_name',
        'last_name',
      ])
    })

    it('starts a section at each Section Break', () => {
      const wrapper = load({
        fields: [
          df('first_name'),
          df('sec2', { fieldtype: 'Section Break', label: 'More' }),
          df('email'),
        ],
      })
      expect(wrapper.vm.sections).toHaveLength(2)
      expect(wrapper.vm.sections[1].secField.label).toBe('More')
    })

    it('starts a column at each Column Break', () => {
      const wrapper = load({
        fields: [df('first_name'), df('col2', { fieldtype: 'Column Break' }), df('email')],
      })
      expect(wrapper.vm.sections[0].columns).toHaveLength(2)
      expect(wrapper.vm.sections[0].columns[1].items.map((f) => f.fieldname)).toEqual([
        'email',
      ])
    })

    it('gives an empty form one empty section to build in', () => {
      // With no section at all there would be nowhere to drop a field.
      const wrapper = load({ fields: [] })
      expect(wrapper.vm.sections).toHaveLength(1)
      expect(wrapper.vm.sections[0].columns[0].items).toEqual([])
    })

    it('synthesises a section for fields that precede the first break', () => {
      const wrapper = load({
        fields: [df('first_name'), df('sec2', { fieldtype: 'Section Break' })],
      })
      expect(wrapper.vm.sections[0].secField.fieldtype).toBe('Section Break')
    })
  })

  describe('flattening back to a field list', () => {
    it('round-trips a simple form', () => {
      const wrapper = load()
      const flat = wrapper.vm.flattenModel()
      expect(flat.map((f) => f.fieldtype)).toEqual([
        'Section Break',
        'Data',
        'Data',
      ])
    })

    it('never emits a column break before the first column', () => {
      // The first column is implicit; a leading break would create an empty one.
      const wrapper = load({
        fields: [df('first_name'), df('col2', { fieldtype: 'Column Break' }), df('email')],
      })
      const flat = wrapper.vm.flattenModel()
      expect(flat[1].fieldtype).not.toBe('Column Break')
      expect(flat.filter((f) => f.fieldtype === 'Column Break')).toHaveLength(1)
    })

    it('survives a full rebuild-flatten round trip', () => {
      const wrapper = load({
        fields: [
          df('first_name'),
          df('col2', { fieldtype: 'Column Break' }),
          df('email'),
          df('sec2', { fieldtype: 'Section Break' }),
          df('last_name'),
        ],
      })
      const once = wrapper.vm.flattenModel().map((f) => f.fieldtype)
      wrapper.vm.rebuildModel()
      expect(wrapper.vm.flattenModel().map((f) => f.fieldtype)).toEqual(once)
    })
  })

  describe('adding a field', () => {
    it('appends it to the chosen column', () => {
      const wrapper = load()
      const col = wrapper.vm.sections[0].columns[0]
      wrapper.vm.addFieldToColumn(col, { af: df('email') })
      expect(col.items.map((f) => f.fieldname)).toContain('email')
    })

    it('ignores an option with no field behind it', () => {
      const wrapper = load()
      const col = wrapper.vm.sections[0].columns[0]
      const before = col.items.length
      wrapper.vm.addFieldToColumn(col, null)
      expect(col.items).toHaveLength(before)
    })

    it('brings a hidden field back onto the form', () => {
      // The picker deliberately still lists hidden fields so they can return.
      const wrapper = load({
        hidden_fields: [{ fieldname: 'status', label: 'Status', fieldtype: 'Select', default: 'Open' }],
      })
      const col = wrapper.vm.sections[0].columns[0]
      wrapper.vm.addFieldToColumn(col, { af: df('status') })
      expect(wrapper.vm.hiddenFields.map((h) => h.fieldname)).not.toContain(
        'status',
      )
    })

    it('marks the form unsaved', () => {
      const wrapper = load()
      wrapper.vm.dirty = false
      wrapper.vm.addFieldToColumn(wrapper.vm.sections[0].columns[0], {
        af: df('email'),
      })
      expect(wrapper.vm.dirty).toBe(true)
    })
  })

  describe('removing a field', () => {
    it('drops an optional field outright', () => {
      const wrapper = load()
      const f = wrapper.vm.form.fields.find((x) => x.fieldname === 'last_name')
      wrapper.vm.removeField(f)
      expect(wrapper.vm.form.fields.map((x) => x.fieldname)).not.toContain(
        'last_name',
      )
      expect(wrapper.vm.hiddenFields).toEqual([])
    })

    it('moves a doctype-mandatory field to the hidden list instead', async () => {
      // Deleting it outright would make record creation fail on submission.
      const wrapper = load()
      await nextTick()
      const f = wrapper.vm.form.fields.find((x) => x.fieldname === 'first_name')
      wrapper.vm.removeField(f)
      expect(wrapper.vm.hiddenFields.map((h) => h.fieldname)).toEqual([
        'first_name',
      ])
      expect(api.toast.info).toHaveBeenCalled()
    })

    it('does not hide a field twice', async () => {
      const wrapper = load()
      await nextTick()
      const f = wrapper.vm.form.fields.find((x) => x.fieldname === 'first_name')
      wrapper.vm.removeField(f)
      wrapper.vm.removeField(f)
      expect(wrapper.vm.hiddenFields).toHaveLength(1)
    })

    it('never hides a layout break', async () => {
      const wrapper = load({
        fields: [df('sec2', { fieldtype: 'Section Break' }), df('last_name')],
      })
      await nextTick()
      const marker = wrapper.vm.form.fields[0]
      wrapper.vm.removeBreak(marker)
      expect(wrapper.vm.hiddenFields).toEqual([])
    })

    it('collapses the editor if the removed field was open', () => {
      const wrapper = load()
      const f = wrapper.vm.form.fields.find((x) => x.fieldname === 'last_name')
      wrapper.vm.expanded = 'last_name'
      wrapper.vm.removeField(f)
      expect(wrapper.vm.expanded).toBeNull()
    })
  })

  describe('columns', () => {
    it('adds one', () => {
      const wrapper = load()
      const cols = wrapper.vm.sections[0].columns
      wrapper.vm.addColumn(cols)
      expect(cols).toHaveLength(2)
    })

    it('refuses beyond the maximum', () => {
      const wrapper = load()
      const cols = wrapper.vm.sections[0].columns
      for (let i = 0; i < 6; i++) wrapper.vm.addColumn(cols)
      expect(cols).toHaveLength(4)
      expect(api.toast.info).toHaveBeenCalled()
    })

    it('never removes the last column', () => {
      const wrapper = load()
      const cols = wrapper.vm.sections[0].columns
      wrapper.vm.removeLastColumn(cols)
      expect(cols).toHaveLength(1)
    })

    it('keeps the fields when a column is removed', () => {
      // Losing a column must not lose the work inside it.
      const wrapper = load()
      const cols = wrapper.vm.sections[0].columns
      wrapper.vm.addColumn(cols)
      cols[1].items.push(df('email'))
      wrapper.vm.removeLastColumn(cols)
      expect(cols).toHaveLength(1)
      expect(cols[0].items.map((f) => f.fieldname)).toContain('email')
    })

    it('offers Add only below the maximum and Remove only above one', () => {
      const wrapper = load()
      const cols = wrapper.vm.sections[0].columns
      let ops = wrapper.vm.columnOps(cols)
      expect(ops.find((o) => o.label === 'Add Column').condition()).toBe(true)
      expect(ops.find((o) => o.label === 'Remove Last Column').condition()).toBe(
        false,
      )
      wrapper.vm.addColumn(cols)
      ops = wrapper.vm.columnOps(cols)
      expect(ops.find((o) => o.label === 'Remove Last Column').condition()).toBe(
        true,
      )
    })
  })

  describe('the route slug', () => {
    it('follows the title while the route is still a default', () => {
      const wrapper = load({ route: 'untitled-form' })
      wrapper.vm.form.title = 'Contact Us'
      wrapper.vm.onTitleInput()
      expect(wrapper.vm.form.route).toBe('contact-us')
    })

    it('stops following once the route has been set by hand', () => {
      const wrapper = load({ route: 'my-form' })
      wrapper.vm.form.title = 'Contact Us'
      wrapper.vm.onTitleInput()
      expect(wrapper.vm.form.route).toBe('my-form')
    })

    it('stops following once the form is published', () => {
      // The URL is public by then; silently changing it would break links.
      const wrapper = load({ route: 'untitled-form', published: 1 })
      wrapper.vm.form.title = 'Contact Us'
      wrapper.vm.onTitleInput()
      expect(wrapper.vm.form.route).toBe('untitled-form')
    })

    it('recognises a numbered default route', () => {
      const wrapper = load({ route: 'untitled-form-2' })
      wrapper.vm.form.title = 'Contact Us'
      wrapper.vm.onTitleInput()
      expect(wrapper.vm.form.route).toBe('contact-us')
    })
  })

  describe('embedding domains', () => {
    const invalid = (value) => {
      const wrapper = load({ allowed_embedding_domains: value })
      return wrapper.vm.invalidEmbeddingDomains
    }

    it('accepts a bare host', () => {
      expect(invalid('example.com')).toEqual([])
    })

    it('accepts a scheme and port', () => {
      expect(invalid('https://example.com:8080')).toEqual([])
    })

    it('accepts a wildcard subdomain', () => {
      expect(invalid('*.example.com')).toEqual([])
    })

    it('accepts several separated by whitespace', () => {
      expect(invalid('example.com  *.test.io')).toEqual([])
    })

    it('flags a path, which the server would drop', () => {
      // The server regex has no path support, so it strips these silently —
      // flagging here is the only way the author finds out.
      expect(invalid('example.com/embed')).toEqual(['example.com/embed'])
    })

    it('flags a mid-domain wildcard', () => {
      expect(invalid('foo.*.com')).toEqual(['foo.*.com'])
    })

    it('reports only the bad ones', () => {
      expect(invalid('good.com bad_/x')).toEqual(['bad_/x'])
    })
  })

  describe('the preview layout', () => {
    it('drops a section with no label and no fields', () => {
      // An unnamed empty section is a build artefact, not something to render.
      const wrapper = load({
        fields: [df('sec_empty', { fieldtype: 'Section Break', label: '' })],
      })
      expect(wrapper.vm.layout).toEqual([])
    })

    it('keeps a labelled section even when empty', () => {
      const wrapper = load({
        fields: [df('sec2', { fieldtype: 'Section Break', label: 'Extra' })],
      })
      expect(wrapper.vm.layout.map((s) => s.label)).toEqual(['Extra'])
    })

    it('counts only real inputs, not the breaks', () => {
      const wrapper = load({
        fields: [
          df('first_name'),
          df('sec2', { fieldtype: 'Section Break' }),
          df('col2', { fieldtype: 'Column Break' }),
          df('email'),
        ],
      })
      expect(wrapper.vm.inputFieldCount).toBe(2)
    })
  })

  describe('input types', () => {
    const typeOf = (f) => load().vm.inputType(f)

    it('uses an email input for an email field', () => {
      expect(typeOf({ fieldtype: 'Data', options: 'Email' })).toBe('email')
    })

    it.each([
      ['Int', 'number'], ['Float', 'number'], ['Currency', 'number'],
      ['Percent', 'number'], ['Date', 'date'], ['Datetime', 'datetime-local'],
      ['Time', 'time'], ['Color', 'color'],
    ])('maps %s to %s', (fieldtype, expected) => {
      expect(typeOf({ fieldtype })).toBe(expected)
    })

    it('falls back to text', () => {
      expect(typeOf({ fieldtype: 'Small Text' })).toBe('text')
    })
  })

  describe('select options', () => {
    it('splits the stored newline list', () => {
      const wrapper = load()
      expect(
        wrapper.vm.selectOptions({ options: 'Open\nClosed' }).map((o) => o.value),
      ).toEqual(['', 'Open', 'Closed'])
    })

    it('leads with a placeholder choice', () => {
      // Without it the first real option would look pre-selected.
      const wrapper = load()
      expect(wrapper.vm.selectOptions({ options: 'Open' })[0].label).toBe(
        'Select an option',
      )
    })

    it('drops blank lines', () => {
      const wrapper = load()
      expect(
        wrapper.vm.selectOptions({ options: 'Open\n\nClosed' }),
      ).toHaveLength(3)
    })
  })

  describe('the publish guard', () => {
    it('blocks a published form whose hidden field has no default', async () => {
      // The record could not be created without it.
      const wrapper = load({
        published: 1,
        hidden_fields: [{ fieldname: 'status', label: 'Status', fieldtype: 'Select', default: '' }],
      })
      expect(wrapper.vm.hiddenMissingDefault).toBe(true)
      expect(await wrapper.vm.save()).toBe(false)
      expect(api.toast.error).toHaveBeenCalled()
      expect(api.call).not.toHaveBeenCalled()
    })

    it('allows it once a default is set', async () => {
      const wrapper = load({
        published: 1,
        hidden_fields: [{ fieldname: 'status', label: 'Status', fieldtype: 'Select', default: 'Open' }],
      })
      api.call.mockResolvedValue({ route: 'contact-us', fields: [] })
      expect(wrapper.vm.hiddenMissingDefault).toBe(false)
      expect(await wrapper.vm.save()).toBe(true)
    })

    it('lets a draft save with the default missing', async () => {
      // Drafts are not reachable by anyone, so the constraint does not apply.
      const wrapper = load({
        published: 0,
        hidden_fields: [{ fieldname: 'status', label: 'Status', fieldtype: 'Select', default: '' }],
      })
      api.call.mockResolvedValue({ route: 'contact-us', fields: [] })
      expect(await wrapper.vm.save()).toBe(true)
    })

    it('treats whitespace as no default', () => {
      const wrapper = load({
        published: 1,
        hidden_fields: [{ fieldname: 'status', label: 'S', fieldtype: 'Select', default: '   ' }],
      })
      expect(wrapper.vm.hiddenMissingDefault).toBe(true)
    })
  })

  describe('saving', () => {
    it('clears the unsaved marker', async () => {
      const wrapper = load()
      api.call.mockResolvedValue({ route: 'contact-us', fields: [] })
      wrapper.vm.dirty = true
      await wrapper.vm.save()
      expect(wrapper.vm.dirty).toBe(false)
    })

    it('takes the route the server settled on', async () => {
      // The server may deduplicate it.
      const wrapper = load()
      api.call.mockResolvedValue({ route: 'contact-us-2', fields: [] })
      await wrapper.vm.save()
      expect(wrapper.vm.form.route).toBe('contact-us-2')
    })

    it('reports a refusal and stays dirty', async () => {
      const wrapper = load()
      wrapper.vm.dirty = true
      api.call.mockRejectedValue({ messages: ['Route in use'] })
      expect(await wrapper.vm.save()).toBe(false)
      expect(api.toast.error).toHaveBeenCalledWith('Route in use')
      expect(wrapper.vm.dirty).toBe(true)
    })

    it('reads a plain Error message too', async () => {
      const wrapper = load()
      api.call.mockRejectedValue(new Error('offline'))
      await wrapper.vm.save()
      expect(api.toast.error).toHaveBeenCalledWith('offline')
    })

    it('stays silent when asked to', async () => {
      const wrapper = load()
      api.call.mockRejectedValue(new Error('offline'))
      await wrapper.vm.save({ silent: true })
      expect(api.toast.error).not.toHaveBeenCalled()
    })

    it('does nothing when there is nothing to save', async () => {
      const wrapper = load()
      wrapper.vm.dirty = false
      await wrapper.vm.saveNow()
      expect(api.call).not.toHaveBeenCalled()
    })
  })

  describe('changing the form type', () => {
    it('switches straight away when no field would be lost', async () => {
      const wrapper = load()
      api.call.mockResolvedValue(CATALOG)
      await wrapper.vm.requestDoctypeChange('CRM Deal')
      await flushPromises()
      expect(api.dialog).not.toHaveBeenCalled()
      expect(wrapper.vm.form.document_type).toBe('CRM Deal')
    })

    it('asks first when fields would be dropped', async () => {
      const wrapper = load()
      api.call.mockResolvedValue([df('email')])
      await wrapper.vm.requestDoctypeChange('CRM Deal')
      await flushPromises()
      expect(api.dialog).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Change form type?' }),
      )
      expect(wrapper.vm.form.document_type).toBe('CRM Lead')
    })

    it('ignores a change to the type it already is', async () => {
      const wrapper = load()
      await wrapper.vm.requestDoctypeChange('CRM Lead')
      expect(api.call).not.toHaveBeenCalled()
    })

    it('says so when the field list cannot be loaded', async () => {
      // Regression: nothing awaited this, so the failure rejected into the void
      // and the dropdown snapped back with no explanation.
      const wrapper = load()
      api.call.mockRejectedValue(new Error('offline'))
      await wrapper.vm.requestDoctypeChange('CRM Deal')
      await flushPromises()
      expect(api.toast.error).toHaveBeenCalledWith('offline')
      expect(wrapper.vm.form.document_type).toBe('CRM Lead')
    })
  })

  describe('the share tab', () => {
    it('builds the public url from the route', () => {
      const wrapper = load()
      expect(wrapper.vm.publicUrl).toBe(
        `${window.location.origin}/crm-form/contact-us`,
      )
    })

    it('embeds that url in the iframe snippet', () => {
      const wrapper = load()
      expect(wrapper.vm.iframeSnippet).toContain('/crm-form/contact-us?embed=1')
      expect(wrapper.vm.iframeSnippet).toContain('title="Contact us"')
    })
  })

  describe('publishing', () => {
    it('flips the flag and marks the form unsaved', () => {
      // It persists on Save, where the hidden-default guard runs.
      const wrapper = load()
      wrapper.vm.dirty = false
      wrapper.vm.togglePublish()
      expect(wrapper.vm.form.published).toBe(1)
      expect(wrapper.vm.dirty).toBe(true)
      wrapper.vm.togglePublish()
      expect(wrapper.vm.form.published).toBe(0)
    })

    it('records the first publish only', async () => {
      const wrapper = load({ published: 0 })
      api.call.mockResolvedValue({ route: 'contact-us', fields: [] })
      wrapper.vm.togglePublish()
      await wrapper.vm.save()
      expect(api.capture).toHaveBeenCalledWith('form_published', {
        source: 'builder',
      })
      api.capture.mockClear()
      await wrapper.vm.save()
      expect(api.capture).not.toHaveBeenCalled()
    })
  })

  describe('leaving with unsaved changes', () => {
    it('asks first', () => {
      const wrapper = load()
      wrapper.vm.dirty = true
      wrapper.vm.goBack()
      expect(api.dialog).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Unsaved Changes' }),
      )
      expect(wrapper.emitted('back')).toBeUndefined()
    })

    it('leaves straight away when nothing changed', () => {
      const wrapper = load()
      wrapper.vm.dirty = false
      wrapper.vm.goBack()
      expect(api.dialog).not.toHaveBeenCalled()
      expect(wrapper.emitted('back')).toHaveLength(1)
    })
  })
})
