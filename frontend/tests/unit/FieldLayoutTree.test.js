const api = vi.hoisted(() => ({ overrides: {} }))

vi.mock('@/data/document', async () => {
  const { reactive } = await import('vue')
  return {
    useDocument: () => ({
      document: reactive({
        doc: {},
        get fieldPropertyOverrides() {
          return api.overrides
        },
      }),
    }),
  }
})

import FieldLayout from '@/components/FieldLayout/FieldLayout.vue'
import Column from '@/components/FieldLayout/Column.vue'
import Section from '@/components/FieldLayout/Section.vue'
import DashboardGrid from '@/components/Dashboard/DashboardGrid.vue'
import { mountComponent } from '../helpers/mount'
import { computed } from 'vue'

const quiet = { inheritAttrs: false, template: '<div />' }
const STUBS = {
  Tabs: { ...quiet, name: 'TabsStub' },
  Section: { ...quiet, name: 'SectionStub' },
  Column: { ...quiet, name: 'ColumnStub' },
  Field: { ...quiet, name: 'FieldStub' },
  // Forwards its default slot — the columns live inside it, and an auto-stub
  // would render none of them.
  CollapsibleSection: {
    name: 'CollapsibleSectionStub',
    inheritAttrs: false,
    template: '<div><slot /></div>',
  },
  GridLayout: { ...quiet, name: 'GridLayoutStub' },
}

const tab = (name, over = {}) => ({
  name,
  label: name,
  sections: [{ name: `${name}_section`, columns: [{ fields: [] }] }],
  ...over,
})

const mount = (props = {}) =>
  mountComponent(FieldLayout, {
    props: { tabs: [tab('details')], doctype: 'CRM Deal', ...props },
    global: { stubs: STUBS },
  })

describe('FieldLayout', () => {
  beforeEach(() => {
    api.overrides = {}
  })

  describe('which document the fields bind to', () => {
    it('prefers the name the parent passed in', () => {
      // The modal knows it synchronously; `data.name` is still empty while the
      // document loads, and binding to '' would write to the wrong cache.
      const wrapper = mount({ docname: 'DEAL-1', data: { name: 'DEAL-2' } })
      expect(wrapper.vm.resolvedDocname).toBe('DEAL-1')
    })

    it('falls back to the loaded document', () => {
      expect(mount({ data: { name: 'DEAL-2' } }).vm.resolvedDocname).toBe(
        'DEAL-2',
      )
    })

    it('is empty when neither is known yet', () => {
      expect(mount().vm.resolvedDocname).toBe('')
    })
  })

  describe('showing the tab strip', () => {
    it('shows it for more than one tab', () => {
      expect(mount({ tabs: [tab('a'), tab('b')] }).vm.hasTabs).toBe(true)
    })

    it('shows it for a single named tab', () => {
      // Truthy rather than strictly true: for one tab this returns the label
      // itself, and every consumer uses it in a class binding or a ternary.
      expect(mount({ tabs: [tab('a')] }).vm.hasTabs).toBeTruthy()
    })

    it('hides it for a single unnamed tab', () => {
      // A lone unlabelled tab is just a container; a strip with one blank
      // entry would be noise.
      expect(mount({ tabs: [tab('a', { label: '' })] }).vm.hasTabs).toBeFalsy()
    })

    it('hides it when there are no tabs at all', () => {
      expect(mount({ tabs: [] }).vm.hasTabs).toBe(false)
    })
  })

  describe('script overrides', () => {
    it('leaves the layout alone when there are none', () => {
      expect(mount().vm.processedTabs[0]).toEqual(tab('details'))
    })

    it('applies a tab override', () => {
      api.overrides = { details: { label: 'Renamed' } }
      expect(mount().vm.processedTabs[0].label).toBe('Renamed')
    })

    it('hides a tab a script marked hidden', () => {
      api.overrides = { details: { hidden: true } }
      expect(mount().vm.processedTabs).toEqual([])
    })

    it('applies a section override', () => {
      api.overrides = { details_section: { label: 'Renamed section' } }
      expect(mount().vm.processedTabs[0].sections[0].label).toBe(
        'Renamed section',
      )
    })

    it('does not mutate the tabs it was given', () => {
      // The parent owns that array; rewriting it in a computed would make the
      // override permanent once applied.
      const tabs = [tab('details')]
      api.overrides = { details: { label: 'Renamed' } }
      mount({ tabs })
      expect(tabs[0].label).toBe('details')
    })

    it('keeps other tabs when one is hidden', () => {
      api.overrides = { a: { hidden: true } }
      const wrapper = mount({ tabs: [tab('a'), tab('b')] })
      expect(wrapper.vm.processedTabs.map((t) => t.name)).toEqual(['b'])
    })
  })

  describe('standalone mode', () => {
    it('takes overrides from the context rather than the document', () => {
      // Used where there is no loaded document to read them from.
      api.overrides = { details: { label: 'From document' } }
      const wrapper = mount({
        context: { fieldPropertyOverrides: { details: { label: 'From context' } } },
      })
      expect(wrapper.vm.processedTabs[0].label).toBe('From context')
    })
  })

  describe('a grid row', () => {
    it('applies no overrides', () => {
      // Grid rows share one layout across every row, so a per-document
      // override would leak between them.
      api.overrides = { details: { label: 'Renamed' } }
      expect(mount({ isGridRow: true }).vm.processedTabs[0].label).toBe(
        'details',
      )
    })
  })
})

describe('Column', () => {
  it('renders a field for each entry', () => {
    const wrapper = mountComponent(Column, {
      props: { column: { fields: [{ fieldname: 'a' }, { fieldname: 'b' }] } },
      global: { stubs: STUBS },
    })
    expect(wrapper.findAllComponents({ name: 'FieldStub' })).toHaveLength(2)
  })

  it('renders nothing for an empty column', () => {
    const wrapper = mountComponent(Column, {
      props: { column: { fields: [] } },
      global: { stubs: STUBS },
    })
    expect(wrapper.findAllComponents({ name: 'FieldStub' })).toHaveLength(0)
  })
})

describe('Section', () => {
  const mount = (section, hasTabs = false) =>
    mountComponent(Section, {
      props: { section },
      global: { stubs: STUBS, provide: { hasTabs } },
    })

  it('renders a column for each entry', () => {
    const wrapper = mount({
      name: 's',
      columns: [{ fields: [] }, { fields: [] }],
    })
    expect(wrapper.findAllComponents({ name: 'ColumnStub' })).toHaveLength(2)
  })

  it('renders without columns rather than throwing', () => {
    // A half-built layout from the editor can reach here.
    expect(() => mount({ name: 's', columns: [] })).not.toThrow()
  })
})

describe('DashboardGrid', () => {
  const mount = (items = []) =>
    mountComponent(DashboardGrid, {
      props: { modelValue: items },
      global: { stubs: STUBS },
    })

  it('passes the items through to the grid', () => {
    const wrapper = mount([{ i: '1' }, { i: '2' }])
    expect(wrapper.findComponent({ name: 'GridLayoutStub' }).exists()).toBe(true)
  })

  it('renders with no items', () => {
    expect(() => mount([])).not.toThrow()
  })
})
