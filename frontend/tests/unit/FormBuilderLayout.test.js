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
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
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
  globalStore: () => ({
    $dialog: api.dialog,
    $socket: { on: vi.fn(), off: vi.fn() },
  }),
}))

vi.mock('@/utils', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, copyToClipboard: api.copy }
})

vi.mock('vuedraggable', () => ({
  default: {
    name: 'Draggable',
    props: ['modelValue'],
    template:
      '<div><slot name="item" v-for="(el,i) in modelValue" :element="el" :index="i" /></div>',
  },
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
  df('lead_owner', { fieldtype: 'Link', options: 'User', reqd: 1 }),
]

const mount = () =>
  mountComponent(FormBuilderPanel, {
    props: { name: 'FORM-1' },
    global: {
      stubs: {
        Autocomplete: true,
        FieldCard: true,
        Draggable: true,
        Tabs: true,
        Dropdown: true,
        ErrorMessage: true,
        DragVerticalIcon: true,
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

describe('FormBuilderPanel — layout and the field editor', () => {
  beforeEach(() => {
    for (const t of Object.values(api.toast)) t.mockClear()
    api.call.mockReset().mockResolvedValue([])
    api.capture.mockClear()
    api.dialog.mockClear()
  })

  describe('turning a title into a route', () => {
    const slug = (wrapper, v) => wrapper.vm.slugify(v)

    it('lowercases and hyphenates', () => {
      expect(slug(load(), 'Contact Us')).toBe('contact-us')
    })

    it('collapses runs of punctuation into one hyphen', () => {
      expect(slug(load(), 'Get  in --- touch!!')).toBe('get-in-touch')
    })

    it('trims hyphens off the ends', () => {
      expect(slug(load(), '  !Hello!  ')).toBe('hello')
    })

    it('drops characters a URL cannot carry', () => {
      expect(slug(load(), 'Café & Co.')).toBe('caf-co')
    })

    it('copes with nothing at all', () => {
      const wrapper = load()
      expect(slug(wrapper, '')).toBe('')
      expect(slug(wrapper, null)).toBe('')
      expect(slug(wrapper, undefined)).toBe('')
    })

    it('follows the title while the route is still the placeholder', () => {
      // Loading a form whose route is anything but `untitled-form` marks it as
      // deliberately chosen, so only a brand-new form tracks its title.
      const wrapper = load({ route: 'untitled-form' })
      wrapper.vm.form.title = 'Get in touch'
      wrapper.vm.onTitleInput()
      expect(wrapper.vm.form.route).toBe('get-in-touch')
    })

    it('treats a route that is not the placeholder as hand-chosen', () => {
      expect(load({ route: 'contact-us' }).vm.routeEdited).toBe(true)
      expect(load({ route: 'untitled-form' }).vm.routeEdited).toBe(false)
      expect(load({ route: 'untitled-form-2' }).vm.routeEdited).toBe(false)
    })

    it('stops following once the route has been edited by hand', () => {
      const wrapper = load()
      wrapper.vm.routeEdited = true
      wrapper.vm.form.title = 'Something else'
      wrapper.vm.onTitleInput()
      expect(wrapper.vm.form.route).toBe('contact-us')
    })

    it('never moves the route of a published form', () => {
      // The URL is out in the world; renaming the title must not break it.
      const wrapper = load({ published: 1 })
      wrapper.vm.form.title = 'Renamed'
      wrapper.vm.onTitleInput()
      expect(wrapper.vm.form.route).toBe('contact-us')
    })

    it('marks the form dirty either way', () => {
      const wrapper = load({ published: 1 })
      wrapper.vm.onTitleInput()
      expect(wrapper.vm.dirty).toBe(true)
    })
  })

  describe('sections and columns', () => {
    it('counts the fields across a section', () => {
      const wrapper = load()
      const sec = wrapper.vm.sections[0]
      expect(wrapper.vm.sectionFieldCount(sec)).toBe(2)
    })

    it('counts nothing for an empty section', () => {
      const wrapper = load({ fields: [] })
      expect(
        wrapper.vm.sectionFieldCount({ columns: [{ items: [] }] }),
      ).toBe(0)
    })

    it('gives each break a name of its own', () => {
      const wrapper = load()
      const a = wrapper.vm.uid('Section Break')
      const b = wrapper.vm.uid('Section Break')
      expect(a).not.toBe(b)
      expect(a.startsWith('section_break_')).toBe(true)
      expect(wrapper.vm.uid('Column Break').startsWith('column_break_')).toBe(
        true,
      )
    })

    it('builds a break with no label or options', () => {
      const marker = load().vm.makeMarker('Section Break')
      expect(marker).toMatchObject({
        fieldtype: 'Section Break',
        label: '',
        options: '',
        reqd: false,
      })
    })

    it('adds a section break at the end', () => {
      const wrapper = load()
      wrapper.vm.addBreak('Section Break')
      expect(wrapper.vm.form.fields.at(-1).fieldtype).toBe('Section Break')
      expect(wrapper.vm.dirty).toBe(true)
    })

    it('adds a column break at the end', () => {
      const wrapper = load()
      wrapper.vm.addBreak('Column Break')
      expect(wrapper.vm.form.fields.at(-1).fieldtype).toBe('Column Break')
    })

    it('refuses a fifth column, and says why', () => {
      // Past four the columns are too narrow to build in or fill out.
      const wrapper = load({
        fields: [
          df('a'),
          df('cb1', { fieldtype: 'Column Break' }),
          df('b'),
          df('cb2', { fieldtype: 'Column Break' }),
          df('c'),
          df('cb3', { fieldtype: 'Column Break' }),
          df('d'),
        ],
      })
      const before = wrapper.vm.form.fields.length
      wrapper.vm.addBreak('Column Break')
      expect(wrapper.vm.form.fields.length).toBe(before)
      expect(api.toast.info).toHaveBeenCalledWith(
        expect.stringContaining('up to 4'),
      )
    })

    it('still allows a new section at that point', () => {
      const wrapper = load({
        fields: [
          df('a'),
          df('cb1', { fieldtype: 'Column Break' }),
          df('b'),
          df('cb2', { fieldtype: 'Column Break' }),
          df('c'),
          df('cb3', { fieldtype: 'Column Break' }),
          df('d'),
        ],
      })
      wrapper.vm.addBreak('Section Break')
      expect(wrapper.vm.form.fields.at(-1).fieldtype).toBe('Section Break')
    })
  })

  describe('editing one field', () => {
    it('applies the change and marks the form dirty', () => {
      const wrapper = load()
      const f = wrapper.vm.form.fields[0]
      wrapper.vm.updateField(f, { label: 'Given name', reqd: 1 })
      expect(f.label).toBe('Given name')
      expect(f.reqd).toBe(1)
      expect(wrapper.vm.dirty).toBe(true)
    })

    it('leaves the properties it was not given', () => {
      const wrapper = load()
      const f = wrapper.vm.form.fields[0]
      wrapper.vm.updateField(f, { label: 'Given name' })
      expect(f.fieldname).toBe('first_name')
    })
  })

  describe('the options on a Select field', () => {
    it('splits them one per line', () => {
      expect(load().vm.optionList({ options: 'Open\nClosed' })).toEqual([
        'Open',
        'Closed',
      ])
    })

    it('drops the blank lines people leave behind', () => {
      expect(load().vm.optionList({ options: 'Open\n\nClosed\n' })).toEqual([
        'Open',
        'Closed',
      ])
    })

    it('copes with a field that has none', () => {
      const wrapper = load()
      expect(wrapper.vm.optionList({})).toEqual([])
      expect(wrapper.vm.optionList({ options: null })).toEqual([])
    })

    it('puts a prompt in front of the choices', () => {
      // Without it the first real option looks pre-selected.
      const opts = load().vm.selectOptions({ options: 'Open\nClosed' })
      expect(opts[0]).toEqual({ label: 'Select an option', value: '' })
      expect(opts).toHaveLength(3)
    })
  })

  describe('required fields that are taken off the form', () => {
    it('moves a doctype-mandatory field to the hidden list rather than dropping it', () => {
      // The record cannot be created without it, so it needs a default.
      const wrapper = load({ fields: [df('first_name'), df('last_name')] })
      wrapper.vm.removeField(wrapper.vm.form.fields[0])
      expect(wrapper.vm.hiddenFields.map((h) => h.fieldname)).toEqual([
        'first_name',
      ])
      expect(api.toast.info).toHaveBeenCalledWith(
        expect.stringContaining('hidden required fields'),
      )
    })

    it('just deletes an optional one', () => {
      const wrapper = load()
      wrapper.vm.removeField(wrapper.vm.form.fields[1])
      expect(wrapper.vm.hiddenFields).toEqual([])
      expect(wrapper.vm.form.fields.map((f) => f.fieldname)).toEqual([
        'first_name',
      ])
    })

    it('does not hide a layout break', () => {
      const wrapper = load({
        fields: [df('sb', { fieldtype: 'Section Break', reqd: 1 })],
      })
      wrapper.vm.removeField(wrapper.vm.form.fields[0])
      expect(wrapper.vm.hiddenFields).toEqual([])
    })

    it('does not hide the same field twice', () => {
      const wrapper = load({ fields: [df('first_name')] })
      wrapper.vm.removeField(wrapper.vm.form.fields[0])
      wrapper.vm.hiddenFields.push
      expect(wrapper.vm.hiddenFields).toHaveLength(1)
    })

    it('carries the catalog default across', () => {
      const wrapper = load({ fields: [df('status')] }, [
        df('status', {
          fieldtype: 'Select',
          options: 'Open\nClosed',
          reqd: 1,
          default: 'Open',
        }),
      ])
      wrapper.vm.removeField(wrapper.vm.form.fields[0])
      expect(wrapper.vm.hiddenFields[0].default).toBe('Open')
    })

    it('reads a default off the catalog, or nothing', () => {
      const wrapper = load({}, [df('status', { default: 'Open' })])
      expect(wrapper.vm.catalogDefault('status')).toBe('Open')
      expect(wrapper.vm.catalogDefault('first_name')).toBe('')
      expect(wrapper.vm.catalogDefault('nonexistent')).toBe('')
    })

    it('knows which fields the doctype insists on', () => {
      const wrapper = load()
      expect(wrapper.vm.isMandatory('first_name')).toBe(true)
      expect(wrapper.vm.isMandatory('last_name')).toBe(false)
      expect(wrapper.vm.isMandatory('nonexistent')).toBe(false)
    })
  })

  describe('blocking publish on a missing default', () => {
    it('blocks while a hidden field has no default', () => {
      const wrapper = load({
        hidden_fields: [{ fieldname: 'first_name', label: 'First', default: '' }],
      })
      expect(wrapper.vm.hiddenMissingDefault).toBe(true)
    })

    it('allows it once every one has a value', () => {
      const wrapper = load({
        hidden_fields: [
          { fieldname: 'first_name', label: 'First', default: 'Unknown' },
        ],
      })
      expect(wrapper.vm.hiddenMissingDefault).toBe(false)
    })

    it('treats whitespace as no value', () => {
      const wrapper = load({
        hidden_fields: [{ fieldname: 'first_name', label: 'First', default: '   ' }],
      })
      expect(wrapper.vm.hiddenMissingDefault).toBe(true)
    })

    it('allows it when nothing is hidden', () => {
      expect(load().vm.hiddenMissingDefault).toBe(false)
    })
  })

  describe('choosing a value for a hidden field', () => {
    it('offers a dropdown for a Select or a Link', () => {
      const wrapper = load()
      expect(wrapper.vm.hiddenIsSelect({ fieldtype: 'Select' })).toBe(true)
      expect(wrapper.vm.hiddenIsSelect({ fieldtype: 'Link' })).toBe(true)
      expect(wrapper.vm.hiddenIsSelect({ fieldtype: 'Data' })).toBe(false)
    })

    it("lists a Select field's own options", () => {
      const wrapper = load()
      expect(
        wrapper.vm
          .hiddenSelectOptions({ fieldtype: 'Select', options: 'Open\nClosed' })
          .map((o) => o.value),
      ).toEqual(['Open', 'Closed'])
    })

    it('copes with a Select that has none', () => {
      const wrapper = load()
      expect(
        wrapper.vm.hiddenSelectOptions({ fieldtype: 'Select', options: null }),
      ).toEqual([])
    })

    it('keeps a stored value that is no longer among the options', () => {
      // A status can be renamed after the form was built; dropping it here
      // would silently change what the form submits.
      const wrapper = load()
      expect(
        wrapper.vm
          .hiddenSelectOptions({
            fieldtype: 'Select',
            options: 'Open\nClosed',
            default: 'Archived',
          })
          .map((o) => o.value),
      ).toEqual(['Archived', 'Open', 'Closed'])
    })

    it('does not list a stored value twice', () => {
      const wrapper = load()
      expect(
        wrapper.vm
          .hiddenSelectOptions({
            fieldtype: 'Select',
            options: 'Open\nClosed',
            default: 'Open',
          })
          .map((o) => o.value),
      ).toEqual(['Open', 'Closed'])
    })

    it('fetches the records behind a Link field once', async () => {
      api.call.mockResolvedValue([{ name: 'Ada' }, { name: 'Grace' }])
      const wrapper = load()
      await wrapper.vm.ensureLinkOptions('User')
      await wrapper.vm.ensureLinkOptions('User')
      expect(api.call).toHaveBeenCalledTimes(1)
      expect(wrapper.vm.linkOptions.User).toEqual(['Ada', 'Grace'])
    })

    it('asks for nothing without a doctype', async () => {
      const wrapper = load()
      await wrapper.vm.ensureLinkOptions('')
      expect(api.call).not.toHaveBeenCalled()
    })

    it('leaves the list empty when the fetch fails', async () => {
      api.call.mockRejectedValue(new Error('no permission'))
      const wrapper = load()
      await wrapper.vm.ensureLinkOptions('User')
      expect(wrapper.vm.linkOptions.User).toEqual([])
    })

    it('lists the fetched records for a Link field', async () => {
      api.call.mockResolvedValue([{ name: 'Ada' }])
      const wrapper = load()
      await wrapper.vm.ensureLinkOptions('User')
      expect(
        wrapper.vm
          .hiddenSelectOptions({ fieldtype: 'Link', options: 'User' })
          .map((o) => o.value),
      ).toEqual(['Ada'])
    })
  })

  describe('the preview', () => {
    it('starts blank', () => {
      const wrapper = load()
      expect(wrapper.vm.previewSubmitted).toBe(false)
      expect(wrapper.vm.previewModel).toEqual({})
    })

    it('throws away the values typed into it', () => {
      // They are not the form's data — only a way to try the layout out.
      const wrapper = load()
      wrapper.vm.previewModel.first_name = 'Ada'
      wrapper.vm.previewSubmitted = true
      wrapper.vm.resetPreview()
      expect(wrapper.vm.previewModel).toEqual({})
      expect(wrapper.vm.previewSubmitted).toBe(false)
    })
  })

  describe('dragging a field to a new place', () => {
    it('re-flattens the layout when the drag ends', () => {
      // Flattening always emits the section marker first, so the stored list
      // gains one even for a form that had no explicit section break.
      const wrapper = load()
      wrapper.vm.dragging = true
      wrapper.vm.onSortEnd()
      expect(wrapper.vm.dragging).toBe(false)
      expect(wrapper.vm.form.fields.map((f) => f.fieldtype)).toEqual([
        'Section Break',
        'Data',
        'Data',
      ])
    })

    it('carries a reordered column back into the field list', () => {
      const wrapper = load()
      const col = wrapper.vm.sections[0].columns[0]
      col.items.reverse()
      wrapper.vm.onSortEnd()
      expect(
        wrapper.vm.form.fields
          .filter((f) => f.fieldtype === 'Data')
          .map((f) => f.fieldname),
      ).toEqual(['last_name', 'first_name'])
    })

    it('marks the form dirty so the move can be saved', () => {
      const wrapper = load()
      wrapper.vm.dirty = false
      wrapper.vm.onSortEnd()
      expect(wrapper.vm.dirty).toBe(true)
    })
  })

  describe('sizing the description box', () => {
    it('grows an element to fit its content', () => {
      const el = { style: {}, scrollHeight: 96 }
      load().vm.autoGrow(el)
      expect(el.style.height).toBe('96px')
    })

    it('does nothing without an element', () => {
      expect(() => load().vm.autoGrow(null)).not.toThrow()
    })
  })

  describe('clicking the route prefix', () => {
    it('puts the caret at the end of the slug', () => {
      // Clicking the "/crm-form/" label should let you keep typing, not
      // drop the caret at position zero.
      const input = {
        tagName: 'INPUT',
        value: 'contact-us',
        focus: vi.fn(),
        setSelectionRange: vi.fn(),
      }
      const e = {
        target: { tagName: 'DIV' },
        currentTarget: { querySelector: () => input },
      }
      load().vm.focusRouteEnd(e)
      expect(input.focus).toHaveBeenCalled()
      expect(input.setSelectionRange).toHaveBeenCalledWith(10, 10)
    })

    it('leaves a click on the input itself alone', () => {
      const e = {
        target: { tagName: 'INPUT' },
        currentTarget: { querySelector: vi.fn() },
      }
      load().vm.focusRouteEnd(e)
      expect(e.currentTarget.querySelector).not.toHaveBeenCalled()
    })

    it('copes with there being no input to focus', () => {
      const e = {
        target: { tagName: 'DIV' },
        currentTarget: { querySelector: () => null },
      }
      expect(() => load().vm.focusRouteEnd(e)).not.toThrow()
    })
  })
})
