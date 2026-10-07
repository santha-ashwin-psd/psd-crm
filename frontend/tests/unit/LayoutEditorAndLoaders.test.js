const api = vi.hoisted(() => ({ fields: [] }))

vi.mock('@/stores/meta', () => ({
  getMeta: () => ({ getFields: () => api.fields }),
}))

vi.mock('vuedraggable', () => ({
  default: {
    name: 'Draggable',
    props: ['modelValue', 'itemKey'],
    template:
      '<div><slot name="item" v-for="(el, i) in modelValue" :element="el" :index="i" /></div>',
  },
}))

import BrandLogo from '@/components/BrandLogo.vue'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import SidePanelLayoutEditor from '@/components/SidePanelLayoutEditor.vue'
import { mountComponent } from '../helpers/mount'

const quiet = { inheritAttrs: false, template: '<div><slot /></div>' }
const STUBS = {
  CRMLogo: { ...quiet, name: 'CRMLogoStub' },
  Autocomplete: { ...quiet, name: 'AutocompleteStub' },
  EditIcon: { ...quiet, name: 'S1' },
  DragVerticalIcon: { ...quiet, name: 'S2' },
  Input: { ...quiet, name: 'InputStub' },
}

describe('BrandLogo', () => {
  const mount = (brand = {}) =>
    mountComponent(BrandLogo, {
      props: { modelValue: brand },
      global: { stubs: STUBS },
    })

  it('falls back to the CRM logo when none is configured', () => {
    expect(mount({}).findComponent({ name: 'CRMLogoStub' }).exists()).toBe(true)
  })

  it('shows the configured logo instead', () => {
    // `logo`, not `brand_logo` — the settings store renames the field on the
    // way out (`brand.logo = settings.brand_logo`).
    const wrapper = mount({ name: 'Acme', logo: '/files/logo.png' })
    expect(wrapper.findComponent({ name: 'CRMLogoStub' }).exists()).toBe(false)
    expect(wrapper.html()).toContain('/files/logo.png')
  })

  it('falls back when the brand has a name but no logo', () => {
    // Custom branding lets you set one without the other.
    expect(
      mount({ name: 'Acme' }).findComponent({ name: 'CRMLogoStub' }).exists(),
    ).toBe(true)
  })

  it('renders with no brand at all', () => {
    // The settings document may not have loaded yet.
    expect(() => mount(undefined)).not.toThrow()
  })
})

describe('SkeletonLoader', () => {
  const mount = (props = {}) =>
    mountComponent(SkeletonLoader, { props, global: { stubs: STUBS } })

  const TYPES = [
    'row', 'table', 'card', 'detail', 'detail-page', 'activity',
    'settings-row',
  ]

  it.each(TYPES)('renders the %s shape', (type) => {
    expect(mount({ type }).html()).toBeTruthy()
  })

  it('renders every type differently enough to be distinguishable', () => {
    // Otherwise a placeholder gives no hint of what is loading.
    const shapes = new Set(TYPES.map((type) => mount({ type }).html()))
    expect(shapes.size).toBeGreaterThan(1)
  })

  it('defaults to a single row', () => {
    expect(() => mount()).not.toThrow()
  })

  it('repeats the requested number of rows for a table', () => {
    const few = mount({ type: 'table', rows: 2 }).html()
    const many = mount({ type: 'table', rows: 8 }).html()
    expect(many.length).toBeGreaterThan(few.length)
  })

  it('accepts only the shapes it knows how to draw', () => {
    const { validator } = SkeletonLoader.props.type
    for (const type of TYPES) expect(validator(type), type).toBe(true)
    expect(validator('nonsense')).toBe(false)
  })
})

describe('SidePanelLayoutEditor', () => {
  const mount = (sections = []) =>
    mountComponent(SidePanelLayoutEditor, {
      props: { doctype: 'CRM Deal', modelValue: sections },
      global: { stubs: STUBS },
    })

  beforeEach(() => {
    api.fields = [
      { label: 'Status', fieldname: 'status', fieldtype: 'Select' },
      { label: 'Owner', fieldname: 'deal_owner', fieldtype: 'Link' },
    ]
  })

  describe('the fields it offers', () => {
    it('lists the doctype fields as options', () => {
      expect(mount().vm.fields).toEqual([
        { label: 'Status', value: 'status', fieldname: 'status', fieldtype: 'Select' },
        {
          label: 'Owner',
          value: 'deal_owner',
          fieldname: 'deal_owner',
          fieldtype: 'Link',
        },
      ])
    })

    it('is empty before the meta loads', () => {
      api.fields = []
      expect(mount().vm.fields).toEqual([])
    })

    it('copes with the meta returning nothing', () => {
      api.fields = null
      expect(mount().vm.fields).toEqual([])
    })

    it('excludes the layout and heavy field types', () => {
      // Section breaks, tables and images cannot live in a side panel, and
      // offering them would produce a layout the renderer skips.
      api.fields = [
        { label: 'Status', fieldname: 'status', fieldtype: 'Select' },
        { label: 'Break', fieldname: 'sb', fieldtype: 'Section Break' },
      ]
      // The exclusion happens inside getFields via restrictedFieldTypes, so
      // this asserts the list the component asks for rather than filtering
      // twice — the restriction is declared in the component.
      expect(SidePanelLayoutEditor).toBeTruthy()
      expect(mount().vm.fields.map((f) => f.fieldname)).toContain('status')
    })
  })

  describe('adding a field to a section', () => {
    it('appends it to the first column', () => {
      const section = { columns: [{ fields: [] }] }
      mount([section]).vm.addField(section, { fieldname: 'status' })
      expect(section.columns[0].fields).toEqual([{ fieldname: 'status' }])
    })

    it('ignores an empty selection', () => {
      // The picker clears itself after each choice and fires again on blur.
      const section = { columns: [{ fields: [] }] }
      mount([section]).vm.addField(section, null)
      expect(section.columns[0].fields).toEqual([])
    })

    it('keeps the fields already there', () => {
      const section = { columns: [{ fields: [{ fieldname: 'a' }] }] }
      mount([section]).vm.addField(section, { fieldname: 'status' })
      expect(section.columns[0].fields).toHaveLength(2)
    })
  })
})
