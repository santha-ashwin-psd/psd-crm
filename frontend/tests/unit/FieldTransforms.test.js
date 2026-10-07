const api = vi.hoisted(() => ({
  users: null,
  createDocument: null,
  triggerOnChange: null,
  triggerButton: null,
}))

vi.mock('@/stores/users', () => ({
  usersStore: () => ({ users: api.users, getUser: (e) => ({ name: e, full_name: e }) }),
}))

vi.mock('@/data/document', () => ({
  // The document-bound branch of Field; `context: null` selects it.
  useDocument: () => ({
    triggerOnChange: (...a) => api.triggerOnChange(...a),
    triggerButton: (...a) => api.triggerButton(...a),
    triggerOnRowAdd: vi.fn(),
    triggerOnRowRemove: vi.fn(),
    document: { fieldPropertyOverrides: {}, fieldHtmlMap: {} },
  }),
}))

vi.mock('@/composables/document', () => ({
  createDocument: (...a) => api.createDocument(...a),
  showCreateDocumentModal: { value: false },
  createDocumentDoctype: { value: '' },
  createDocumentData: { value: {} },
  createDocumentCallback: { value: null },
}))

import Field from '@/components/FieldLayout/Field.vue'
import { mountComponent } from '../helpers/mount'
import { ref, computed } from 'vue'

/**
 * Field is injection-driven. `fieldLayoutContext` puts it in standalone mode
 * (no `useDocument`, no scripting triggers) and an empty `doctype` skips
 * `getMeta` — leaving the field-shaping logic as what is under test.
 */
function mountField(field, opts = {}) {
  const {
    data = {},
    preview = false,
    isGridRow = false,
    overrides = {},
    parentFieldname = '',
    context = { fieldPropertyOverrides: {} },
  } = opts
  return mountComponent(Field, {
    props: {
      field: { fieldname: 'f', label: 'Field', fieldtype: 'Data', ...field },
    },
    global: {
      provide: {
        data: ref(data),
        doctype: '',
        docname: ref(null),
        preview: ref(preview),
        isGridRow,
        fieldLayoutContext: context,
        fieldPropertyOverrides: computed(() => overrides),
        parentFieldname,
        triggerOnChange: opts.triggerOnChange || (async () => {}),
        triggerButton: opts.triggerButton || (async () => {}),
        parentDoc: ref({}),
      },
      stubs: {
        Grid: true,
        Link: true,
        Password: true,
        TextEditor: true,
        TextEditorControl: true,
        GeolocationControl: true,
        AttachControl: true,
        HtmlControl: true,
        ButtonControl: true,
        DurationInput: true,
        RatingInput: true,
        FormattedInput: true,
        TableMultiselectInput: true,
        UserAvatar: true,
        Combobox: true,
        Tooltip: true,
        DatePicker: true,
        DateTimePicker: true,
        TimePicker: true,
      },
    },
  })
}

const fieldOf = (wrapper) => wrapper.vm.field

describe('Field — shaping the field before it renders', () => {
  beforeEach(() => {
    api.users = { data: { crmUsers: [{ name: 'ada@x.com' }, { name: 'grace@x.com' }] } }
    api.createDocument = vi.fn()
    api.triggerOnChange = vi.fn(async () => {})
    api.triggerButton = vi.fn(async () => {})
    window.sysdefaults = { hide_empty_read_only_fields: 1 }
    window.state_options = undefined
  })

  describe('select options', () => {
    it('splits a newline-separated string into a list', () => {
      const f = fieldOf(mountField({ fieldtype: 'Select', options: 'Open\nWon', reqd: 1 }))
      expect(f.options).toEqual([
        { label: 'Open', value: 'Open' },
        { label: 'Won', value: 'Won' },
      ])
    })

    it('offers a blank option for an optional select', () => {
      // Otherwise the field can never be cleared once a value is chosen.
      const f = fieldOf(mountField({ fieldtype: 'Select', options: 'Open\nWon' }))
      expect(f.options[0]).toEqual({ label: '', value: '' })
    })

    it('does not add a second blank when one is already first', () => {
      const f = fieldOf(mountField({ fieldtype: 'Select', options: '\nOpen' }))
      expect(f.options.filter((o) => o.value === '')).toHaveLength(1)
    })

    it('leaves an already-parsed list alone', () => {
      const opts = [{ label: 'Open', value: 'Open' }]
      const f = fieldOf(mountField({ fieldtype: 'Select', options: opts }))
      expect(f.options).toEqual(opts)
    })
  })

  describe('a link to a user', () => {
    it('becomes a user picker', () => {
      const f = fieldOf(mountField({ fieldtype: 'Link', options: 'User' }))
      expect(f.fieldtype).toBe('User')
    })

    it('is restricted to CRM users', () => {
      // Otherwise the picker offers every System User on the site.
      const f = fieldOf(mountField({ fieldtype: 'Link', options: 'User' }))
      expect(JSON.parse(f.link_filters)).toMatchObject({
        name: ['in', ['ada@x.com', 'grace@x.com']],
        ignore_user_type: 1,
      })
    })

    it('keeps filters the field already carried', () => {
      const f = fieldOf(
        mountField({
          fieldtype: 'Link',
          options: 'User',
          link_filters: '{"enabled":1}',
        }),
      )
      expect(JSON.parse(f.link_filters).enabled).toBe(1)
    })

    it('renders before the user list has loaded', () => {
      // The store starts as `initialData: []`, so `data.crmUsers` is undefined
      // and the `?.` after it carries the case. An earlier revision of this
      // test forced `data` to null — a state the store cannot produce — and
      // "proved" a guard that was never needed.
      api.users = { data: [] }
      const f = fieldOf(mountField({ fieldtype: 'Link', options: 'User' }))
      // JSON has no undefined; the filter goes out as an explicit null.
      expect(JSON.parse(f.link_filters).name).toEqual(['in', null])
    })

    it('copes with the list being empty', () => {
      api.users = { data: { crmUsers: [] } }
      const f = fieldOf(mountField({ fieldtype: 'Link', options: 'User' }))
      expect(JSON.parse(f.link_filters).name).toEqual(['in', []])
    })
  })

  describe('a link to anything else', () => {
    it('stays a link', () => {
      expect(fieldOf(mountField({ fieldtype: 'Link', options: 'Contact' })).fieldtype).toBe(
        'Link',
      )
    })

    it('gains a way to create the missing record', () => {
      // Typing a name that does not exist yet should offer to create it
      // rather than dead-ending.
      const f = fieldOf(mountField({ fieldtype: 'Link', options: 'Contact' }))
      expect(typeof f.create).toBe('function')
    })

    it('creates against the linked doctype', () => {
      const f = fieldOf(mountField({ fieldtype: 'Link', options: 'Contact' }))
      const close = vi.fn()
      f.create('Ada', close)
      expect(api.createDocument).toHaveBeenCalledWith(
        'Contact',
        'Ada',
        close,
        expect.any(Function),
      )
    })

    it('leaves a create handler the field already had', () => {
      const create = vi.fn()
      const f = fieldOf(
        mountField({ fieldtype: 'Link', options: 'Contact', create }),
      )
      expect(f.create).toBe(create)
    })
  })

  describe('script property overrides', () => {
    it('applies them over the field', () => {
      const f = fieldOf(
        mountField(
          {},
          { context: { fieldPropertyOverrides: { f: { label: 'Renamed' } } } },
        ),
      )
      expect(f.label).toBe('Renamed')
    })

    it('lets a script make a field read-only', () => {
      const f = fieldOf(
        mountField(
          {},
          { context: { fieldPropertyOverrides: { f: { read_only: true } } } },
        ),
      )
      expect(f.read_only).toBe(true)
    })

    it('lets a script override a depends-on read-only rule', () => {
      const f = fieldOf(
        mountField(
          { read_only_depends_on: 'eval:doc.status == "Won"' },
          {
            data: { status: 'Won' },
            context: { fieldPropertyOverrides: { f: { read_only: false } } },
          },
        ),
      )
      expect(f.read_only).toBe(false)
    })

    it('applies a depends-on rule when no script says otherwise', () => {
      const f = fieldOf(
        mountField(
          { read_only_depends_on: 'eval:doc.status == "Won"' },
          { data: { status: 'Won' } },
        ),
      )
      expect(f.read_only).toBe(true)
    })

    it('leaves the field editable when the rule does not hold', () => {
      const f = fieldOf(
        mountField(
          { read_only_depends_on: 'eval:doc.status == "Won"' },
          { data: { status: 'Open' } },
        ),
      )
      expect(f.read_only).toBeFalsy()
    })

    it('lets a script hide a field outright', () => {
      const f = fieldOf(
        mountField(
          {},
          { context: { fieldPropertyOverrides: { f: { hidden: true } } } },
        ),
      )
      expect(f.visible).toBe(false)
    })

    it('lets a script show a field the rules would hide', () => {
      const f = fieldOf(
        mountField(
          { hidden: 1 },
          { context: { fieldPropertyOverrides: { f: { hidden: false } } } },
        ),
      )
      expect(f.visible).toBe(true)
    })
  })

  describe('overrides inside a grid row', () => {
    // Grid rows address overrides by `parentfield.childfield`, with an
    // optional `:rowName` suffix for a single row.
    const inRow = (overrides, rowName) =>
      fieldOf(
        mountField(
          { fieldname: 'qty' },
          {
            isGridRow: true,
            parentFieldname: 'items',
            overrides,
            data: rowName ? { name: rowName } : {},
            context: null,
          },
        ),
      )

    it('applies an override to the whole column', () => {
      expect(inRow({ 'items.qty': { label: 'Quantity' } }).label).toBe('Quantity')
    })

    it('applies an override to one row', () => {
      expect(
        inRow({ 'items.qty:ROW-1': { read_only: true } }, 'ROW-1').read_only,
      ).toBe(true)
    })

    it('lets the row override beat the column', () => {
      const f = inRow(
        {
          'items.qty': { read_only: true },
          'items.qty:ROW-1': { read_only: false },
        },
        'ROW-1',
      )
      expect(f.read_only).toBe(false)
    })

    it('ignores an override meant for another row', () => {
      const f = inRow({ 'items.qty:ROW-2': { read_only: true } }, 'ROW-1')
      expect(f.read_only).toBeFalsy()
    })

    it('applies nothing when the grid has no parent field', () => {
      const f = fieldOf(
        mountField(
          { fieldname: 'qty' },
          {
            isGridRow: true,
            parentFieldname: '',
            overrides: { '.qty': { label: 'Nope' } },
            context: null,
          },
        ),
      )
      expect(f.label).toBe('Field')
    })
  })

  describe('the placeholder', () => {
    const placeholder = (field) =>
      mountField(field).vm.getPlaceholder({ label: 'Status', ...field })

    it('prefers one the field carries', () => {
      expect(placeholder({ placeholder: 'Pick a status' })).toBe('Pick a status')
    })

    it('says "select" for a field you choose from', () => {
      expect(placeholder({ fieldtype: 'Select' })).toBe('Select Status')
      expect(placeholder({ fieldtype: 'Link' })).toBe('Select Status')
    })

    it('says "enter" for a field you type into', () => {
      expect(placeholder({ fieldtype: 'Data' })).toBe('Enter Status')
    })

    // Separate from getPlaceholder above: the shaped field carries its own
    // fallback, and an empty placeholder on a shaped field would render as a
    // blank input with no hint at all.
    it('falls back to the label on the shaped field', () => {
      const f = mountField({ label: 'Annual Revenue', placeholder: '' }).vm.field
      expect(f.placeholder).toBe('Annual Revenue')
    })

    it('keeps a placeholder the field already has', () => {
      const f = mountField({
        label: 'Annual Revenue',
        placeholder: 'In rupees',
      }).vm.field
      expect(f.placeholder).toBe('In rupees')
    })
  })

  describe('changing a value', () => {
    it('passes a plain value through', async () => {
      const wrapper = mountField({}, { context: null })
      await wrapper.vm.fieldChange('Open', { fieldname: 'status' })
      expect(api.triggerOnChange).toHaveBeenCalledWith('status', 'Open')
    })

    it('unwraps the object a picker hands back', () => {
      // Autocomplete emits `{ label, value }`; the document wants the value.
      const wrapper = mountField({}, { context: null })
      wrapper.vm.fieldChange({ label: 'Open', value: 'open' }, { fieldname: 'status' })
      expect(api.triggerOnChange).toHaveBeenCalledWith('status', 'open')
    })

    it('leaves an array alone', () => {
      // A multi-select field's value is the list itself.
      const wrapper = mountField({}, { context: null })
      wrapper.vm.fieldChange(['a', 'b'], { fieldname: 'tags' })
      expect(api.triggerOnChange).toHaveBeenCalledWith('tags', ['a', 'b'])
    })

    it('passes null through rather than unwrapping it', () => {
      const wrapper = mountField({}, { context: null })
      wrapper.vm.fieldChange(null, { fieldname: 'status' })
      expect(api.triggerOnChange).toHaveBeenCalledWith('status', null)
    })

    it('carries the row along inside a grid', () => {
      // The document needs to know which row changed, not just which field.
      const triggerOnChange = vi.fn(async () => {})
      const row = { name: 'ROW-1' }
      const wrapper = mountField(
        {},
        { isGridRow: true, data: row, context: null, triggerOnChange },
      )
      wrapper.vm.fieldChange('2', { fieldname: 'qty' })
      expect(triggerOnChange).toHaveBeenCalledWith('qty', '2', row)
    })

    it('writes straight to the data in standalone mode', async () => {
      const data = {}
      const wrapper = mountField({}, { data })
      await wrapper.vm.fieldChange('Open', { fieldname: 'status' })
      expect(data.status).toBe('Open')
    })
  })

  describe('buttons', () => {
    it('runs the handler the field carries', async () => {
      const click = vi.fn()
      const data = { name: 'DEAL-1' }
      const wrapper = mountField({ fieldtype: 'Button', click }, { data })
      await wrapper.vm.handleButtonClick({ fieldname: 'b', click })
      expect(click).toHaveBeenCalledWith(data)
    })

    it('falls back to the doctype script', async () => {
      const wrapper = mountField({ fieldtype: 'Button' }, { context: null })
      await wrapper.vm.handleButtonClick({ fieldname: 'send' })
      expect(api.triggerButton).toHaveBeenCalledWith('send')
    })

    it('does nothing harmful in standalone mode', async () => {
      const wrapper = mountField({ fieldtype: 'Button' })
      await expect(
        wrapper.vm.handleButtonClick({ fieldname: 'send' }),
      ).resolves.toBeUndefined()
    })
  })

  describe('external links', () => {
    it('recognises an http address', () => {
      const wrapper = mountField({})
      expect(wrapper.vm.isExternalUrl('https://example.com')).toBe(true)
      expect(wrapper.vm.isExternalUrl('  http://example.com ')).toBe(true)
    })

    it('does not treat ordinary text as one', () => {
      const wrapper = mountField({})
      expect(wrapper.vm.isExternalUrl('example.com')).toBe(false)
      expect(wrapper.vm.isExternalUrl(null)).toBe(false)
      expect(wrapper.vm.isExternalUrl(42)).toBe(false)
    })

    it('opens one without handing over the opener', () => {
      const open = vi.spyOn(window, 'open').mockImplementation(() => {})
      mountField({}).vm.openExternalUrl('  https://example.com ')
      expect(open).toHaveBeenCalledWith(
        'https://example.com',
        '_blank',
        'noopener,noreferrer',
      )
      open.mockRestore()
    })
  })

  describe('HTML fields', () => {
    it('renders nothing for any other fieldtype', () => {
      expect(mountField({ fieldtype: 'Data' }).vm.resolvedHtml).toBe('')
    })

    it('fills the template from the record', () => {
      const wrapper = mountField(
        { fieldtype: 'HTML', options: 'Hello {{ first_name }}' },
        { data: { first_name: 'Ada' } },
      )
      expect(wrapper.vm.resolvedHtml).toContain('Ada')
    })

    it('prefers HTML a script injected', () => {
      const wrapper = mountField(
        { fieldtype: 'HTML', options: 'from the field' },
        { context: { fieldHtmlMap: { f: 'from the script' }, fieldPropertyOverrides: {} } },
      )
      expect(wrapper.vm.resolvedHtml).toBe('from the script')
    })

    it('lets a script blank it deliberately', () => {
      // An empty string is a choice; only `undefined` means "not set".
      const wrapper = mountField(
        { fieldtype: 'HTML', options: 'from the field' },
        { context: { fieldHtmlMap: { f: '' }, fieldPropertyOverrides: {} } },
      )
      expect(wrapper.vm.resolvedHtml).toBe('')
    })

    it('copes with a field carrying no template', () => {
      expect(mountField({ fieldtype: 'HTML' }).vm.resolvedHtml).toBe('')
    })
  })

  describe('the options helper', () => {
    it('passes a list through', () => {
      const opts = [{ label: 'a', value: 'a' }]
      expect(mountField({}).vm.getOptions(opts)).toBe(opts)
    })

    it('splits a string', () => {
      expect(mountField({}).vm.getOptions('a\nb')).toEqual([
        { label: 'a', value: 'a' },
        { label: 'b', value: 'b' },
      ])
    })

    it('gives an empty list for anything else', () => {
      const wrapper = mountField({})
      expect(wrapper.vm.getOptions(null)).toEqual([])
      expect(wrapper.vm.getOptions(undefined)).toEqual([])
      expect(wrapper.vm.getOptions(42)).toEqual([])
    })
  })
})
