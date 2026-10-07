vi.mock('@/stores/users', () => ({
  usersStore: () => ({ users: { data: [] }, getUser: () => ({}) }),
}))

import Field from '@/components/FieldLayout/Field.vue'
import { mountComponent } from '../helpers/mount'
import { ref } from 'vue'

/**
 * Field is injection-driven. Providing `fieldLayoutContext` puts it in
 * standalone mode, which skips `useDocument` and its scripting triggers, and an
 * empty `doctype` skips `getMeta` — leaving the visibility rules and the small
 * helpers as what is under test.
 */
function mountField(field, { data = {}, preview = false } = {}) {
  return mountComponent(Field, {
    props: { field: { fieldname: 'f', label: 'Field', fieldtype: 'Data', ...field } },
    global: {
      provide: {
        data: ref(data),
        doctype: '',
        docname: ref(null),
        preview: ref(preview),
        isGridRow: false,
        fieldLayoutContext: { fieldPropertyOverrides: {} },
      },
      stubs: {
        Grid: true,
        Link: true,
        Password: true,
        TextEditor: true,
        DatePicker: true,
        DateTimePicker: true,
        TimePicker: true,
      },
    },
  })
}

const isVisible = (wrapper) => wrapper.vm.field.visible

describe('Field visibility', () => {
  beforeEach(() => {
    globalThis.window.sysdefaults = { hide_empty_read_only_fields: 1 }
  })

  it('shows an ordinary editable field', () => {
    expect(isVisible(mountField({}))).toBe(true)
  })

  it('hides a field marked hidden', () => {
    expect(isVisible(mountField({ hidden: 1 }))).toBe(false)
  })

  it('shows everything in preview mode', () => {
    // The layout designer must show fields the live form would hide.
    expect(isVisible(mountField({ hidden: 1 }, { preview: true }))).toBe(true)
  })

  describe('depends_on', () => {
    // The component evaluates the condition itself against `data`, so these
    // drive it through the document rather than the prop.
    it('hides a dependent field until its condition passes', () => {
      expect(
        isVisible(mountField({ depends_on: 'eval:doc.x' }, { data: {} })),
      ).toBe(false)
    })

    it('shows it once the condition passes', () => {
      expect(
        isVisible(mountField({ depends_on: 'eval:doc.x' }, { data: { x: 1 } })),
      ).toBe(true)
    })

    it('always returns a real boolean', () => {
      // Regression: `display_via_depends_on` holds the raw result of the
      // expression, so this used to come back as `undefined` for an unmet
      // condition and as a string like 'Open' for a met one. Truthiness was
      // right, but the value is also counted when deciding whether a whole
      // side-panel section renders.
      const unmet = mountField({ depends_on: 'eval:doc.x' }, { data: {} })
      const met = mountField(
        { depends_on: 'eval:doc.status' },
        { data: { status: 'Open' } },
      )
      expect(typeof isVisible(unmet)).toBe('boolean')
      expect(typeof isVisible(met)).toBe('boolean')
      expect(isVisible(met)).toBe(true)
    })
  })

  describe('read-only fields', () => {
    it('hides an empty one by default', () => {
      // An empty read-only field is noise on a form.
      expect(
        isVisible(mountField({ read_only: 1 }, { data: { f: '' } })),
      ).toBe(false)
    })

    it('shows one that has a value', () => {
      expect(
        isVisible(mountField({ read_only: 1 }, { data: { f: 'ACME' } })),
      ).toBe(true)
    })

    it('treats the Read Only fieldtype the same way', () => {
      expect(
        isVisible(mountField({ fieldtype: 'Read Only' }, { data: { f: '' } })),
      ).toBe(false)
      expect(
        isVisible(mountField({ fieldtype: 'Read Only' }, { data: { f: 'x' } })),
      ).toBe(true)
    })

    it('keeps empty ones when the site opts out of hiding them', () => {
      globalThis.window.sysdefaults = { hide_empty_read_only_fields: 0 }
      expect(
        isVisible(mountField({ read_only: 1 }, { data: { f: '' } })),
      ).toBe(true)
    })

    it('defaults to hiding when the setting is absent', () => {
      globalThis.window.sysdefaults = {}
      expect(
        isVisible(mountField({ read_only: 1 }, { data: { f: '' } })),
      ).toBe(false)
    })
  })

  describe('checkboxes', () => {
    it('stays visible even when read-only and unticked', () => {
      // An unticked box is meaningful information, unlike an empty text field.
      expect(
        isVisible(
          mountField({ fieldtype: 'Check', read_only: 1 }, { data: { f: 0 } }),
        ),
      ).toBe(true)
    })
  })
})

describe('Field helpers', () => {
  describe('getPlaceholder', () => {
    it('prefers an explicit placeholder', () => {
      const vm = mountField({}).vm
      expect(vm.getPlaceholder({ placeholder: 'john@doe.com' })).toBe(
        'john@doe.com',
      )
    })

    it('says Select for a chooser', () => {
      const vm = mountField({}).vm
      expect(vm.getPlaceholder({ fieldtype: 'Select', label: 'Status' })).toBe(
        'Select Status',
      )
      expect(vm.getPlaceholder({ fieldtype: 'Link', label: 'Territory' })).toBe(
        'Select Territory',
      )
    })

    it('says Enter for anything typed', () => {
      const vm = mountField({}).vm
      expect(vm.getPlaceholder({ fieldtype: 'Data', label: 'Website' })).toBe(
        'Enter Website',
      )
    })
  })

  describe('getOptions', () => {
    it('passes an array through', () => {
      const options = [{ label: 'A', value: 'a' }]
      expect(mountField({}).vm.getOptions(options)).toBe(options)
    })

    it('splits a newline-separated string into label/value pairs', () => {
      expect(mountField({}).vm.getOptions('Open\nWon')).toEqual([
        { label: 'Open', value: 'Open' },
        { label: 'Won', value: 'Won' },
      ])
    })

    it('returns an empty list for anything else', () => {
      const vm = mountField({}).vm
      expect(vm.getOptions(null)).toEqual([])
      expect(vm.getOptions(undefined)).toEqual([])
      expect(vm.getOptions({})).toEqual([])
    })
  })

  describe('isExternalUrl', () => {
    it('recognises http and https', () => {
      const vm = mountField({}).vm
      expect(vm.isExternalUrl('https://example.com')).toBe(true)
      expect(vm.isExternalUrl('HTTP://example.com')).toBe(true)
    })

    it('tolerates surrounding whitespace', () => {
      expect(mountField({}).vm.isExternalUrl('  https://example.com  ')).toBe(
        true,
      )
    })

    it('refuses anything that is not a web address', () => {
      // This gates window.open, so a javascript: value must never qualify.
      const vm = mountField({}).vm
      expect(vm.isExternalUrl('javascript:alert(1)')).toBe(false)
      expect(vm.isExternalUrl('ftp://example.com')).toBe(false)
      expect(vm.isExternalUrl('example.com')).toBe(false)
      expect(vm.isExternalUrl('')).toBe(false)
      expect(vm.isExternalUrl(null)).toBe(false)
      expect(vm.isExternalUrl(42)).toBe(false)
    })
  })

  describe('resolvedHtml', () => {
    it('is blank for a field that is not HTML', () => {
      expect(mountField({ fieldtype: 'Data' }).vm.resolvedHtml).toBe('')
    })

    it('interpolates the document into an HTML field', () => {
      const wrapper = mountField(
        { fieldtype: 'HTML', options: 'Hello {{ first_name }}' },
        { data: { first_name: 'Ada' } },
      )
      expect(wrapper.vm.resolvedHtml).toBe('Hello Ada')
    })

    it('renders a missing placeholder as blank rather than leaving braces', () => {
      const wrapper = mountField(
        { fieldtype: 'HTML', options: 'Hello {{ missing }}' },
        { data: {} },
      )
      expect(wrapper.vm.resolvedHtml).toBe('Hello ')
    })
  })
})
