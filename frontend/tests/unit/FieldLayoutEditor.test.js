const api = vi.hoisted(() => ({ fields: [], dialog: null }))

vi.mock('@/stores/meta', () => ({
  getMeta: () => ({ getFields: () => api.fields }),
}))

vi.mock('@/stores/global', () => ({
  globalStore: () => ({ $dialog: (...a) => api.dialog(...a) }),
}))

vi.mock('vuedraggable', () => ({
  default: {
    name: 'Draggable',
    props: ['list', 'modelValue', 'itemKey', 'group', 'handle'],
    template:
      '<div><slot name="item" v-for="(el, i) in (list || modelValue || [])" :element="el" :index="i" /><slot name="footer" /></div>',
  },
}))

import FieldLayoutEditor from '@/components/FieldLayoutEditor.vue'
import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'

const quiet = { inheritAttrs: false, template: '<div><slot /></div>' }
const STUBS = {
  // Renders #default so the trigger button is present, and exposes the
  // options so the menu can be inspected without opening it.
  Dropdown: {
    name: 'DropdownStub',
    inheritAttrs: false,
    props: ['options'],
    template: '<div><slot /></div>',
  },
  Autocomplete: {
    name: 'AutocompleteStub',
    inheritAttrs: false,
    props: ['options'],
    template: '<div><slot name="target" :togglePopover="() => {}" /></div>',
  },
  DragVerticalIcon: { ...quiet, name: 'S1' },
  Input: { ...quiet, name: 'InputStub' },
}

const column = (fields = []) => ({ name: 'col', label: '', fields })
const section = (label, columns = [column()], over = {}) => ({
  label,
  name: 'sec_' + label,
  opened: true,
  columns,
  ...over,
})
const tab = (label, sections = []) => ({ label, name: 'tab_' + label, sections })

describe('FieldLayoutEditor', () => {
  const mount = (tabs = [], props = {}) =>
    mountComponent(FieldLayoutEditor, {
      props: { doctype: 'CRM Deal', modelValue: tabs, ...props },
      global: { stubs: STUBS },
    })

  // Section menus are the grouped ones; the tab menu is a flat list. Every
  // tab renders (they are v-show'd), so these come out in layout order.
  const sectionMenu = (wrapper, sectionIdx = 0) =>
    wrapper
      .findAllComponents({ name: 'DropdownStub' })
      .filter((d) => Array.isArray(d.props('options')?.[0]?.items))
      .at(sectionIdx)

  const itemsOf = (menu, group) =>
    menu.props('options').find((g) => g.group === group).items

  const enabled = (menu, group) =>
    itemsOf(menu, group)
      .filter((o) => (o.condition ? o.condition() : true))
      .map((o) => o.label)

  const pick = (menu, group, startsWith) =>
    itemsOf(menu, group).find((o) => o.label.startsWith(startsWith))

  beforeEach(() => {
    api.fields = [
      { label: 'Status', fieldname: 'status', fieldtype: 'Select', reqd: 0 },
      { label: 'Owner', fieldname: 'deal_owner', fieldtype: 'Link', reqd: 1 },
    ]
    api.dialog = vi.fn()
  })

  describe('the fields it offers', () => {
    it('lists every field of the doctype', () => {
      expect(mount().vm.fields.map((f) => f.fieldname)).toEqual([
        'status',
        'deal_owner',
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

    it('hides a field already placed in the layout', () => {
      // Offering it twice would let the same field appear in two columns.
      const wrapper = mount([
        tab('Details', [section('Main', [column([{ fieldname: 'status' }])])]),
      ])
      expect(wrapper.vm.fields.map((f) => f.fieldname)).toEqual(['deal_owner'])
    })

    it('looks across every tab, not just the open one', () => {
      const wrapper = mount([
        tab('One', [section('A', [column([{ fieldname: 'status' }])])]),
        tab('Two', [section('B', [column([{ fieldname: 'deal_owner' }])])]),
      ])
      expect(wrapper.vm.fields).toEqual([])
    })

    it('offers only mandatory fields when asked to', () => {
      expect(
        mount([], { onlyRequired: true }).vm.fields.map((f) => f.fieldname),
      ).toEqual(['deal_owner'])
    })

    it('survives a column with no fields array', () => {
      // Regression: this used to concat `undefined` into the list of placed
      // fields and then dereference it — a throw in a computed blanks the
      // whole editor rather than skipping one column.
      const wrapper = mount([tab('Details', [section('Main', [{ name: 'c' }])])])
      expect(wrapper.vm.fields).toHaveLength(2)
    })

    it('survives a section with no columns', () => {
      const wrapper = mount([tab('Details', [{ label: 'Main', name: 's' }])])
      expect(wrapper.vm.fields).toHaveLength(2)
    })
  })

  describe('adding a field to a column', () => {
    it('appends it', () => {
      const col = column()
      mount().vm.addField(col, { fieldname: 'status' })
      expect(col.fields).toEqual([{ fieldname: 'status' }])
    })

    it('ignores an empty selection', () => {
      const col = column()
      mount().vm.addField(col, null)
      expect(col.fields).toEqual([])
    })
  })

  describe('tabs', () => {
    it('names the first tab rather than adding a second', () => {
      // A layout starts as one unnamed tab, which reads as no tabs at all.
      // The first "Add Tab" turns that into a real, named tab.
      const tabs = [tab('', [])]
      const wrapper = mount(tabs)
      wrapper.vm.addTab()
      expect(tabs).toHaveLength(1)
      expect(tabs[0].label).toBe('New Tab')
    })

    it('appends a tab once the first one is named', () => {
      const tabs = [tab('Details', [])]
      const wrapper = mount(tabs)
      wrapper.vm.addTab()
      expect(tabs).toHaveLength(2)
      expect(tabs[1].sections).toEqual([])
    })

    it('gives each new tab its own name', () => {
      const tabs = [tab('Details', [])]
      const wrapper = mount(tabs)
      wrapper.vm.addTab()
      wrapper.vm.addTab()
      expect(tabs[1].name).not.toBe(tabs[2].name)
    })

    it('switches to the tab it just added', () => {
      const tabs = [tab('Details', [])]
      const wrapper = mount(tabs)
      wrapper.vm.addTab()
      expect(wrapper.vm.tabIndex).toBe(1)
    })

    it('puts the plus inside the button while there are no tabs', () => {
      // With a single unnamed tab there is no tab strip, so the button reads
      // as "+ Add Tab" rather than a bare icon.
      expect(mount([tab('', [])]).vm.slotName).toBe('prefix')
      expect(mount([tab('Details', [])]).vm.slotName).toBe('default')
    })

    describe('removing one', () => {
      const tabMenu = (wrapper) =>
        wrapper
          .findAllComponents({ name: 'DropdownStub' })
          .find((d) => d.props('options')?.[0]?.label === 'Edit')

      it('just clears the label when it is the only tab', () => {
        // Removing the last tab would leave nothing to put fields in.
        const tabs = [tab('Details', [section('A')])]
        const wrapper = mount(tabs)
        tabMenu(wrapper).props('options')[1].onClick()
        expect(tabs).toHaveLength(1)
        expect(tabs[0].label).toBe('')
        expect(api.dialog).not.toHaveBeenCalled()
      })

      it('asks first when there is content to lose', () => {
        const tabs = [tab('One', [section('A')]), tab('Two', [])]
        const wrapper = mount(tabs)
        tabMenu(wrapper).props('options')[1].onClick()
        expect(api.dialog).toHaveBeenCalledWith(
          expect.objectContaining({ variant: 'danger' }),
        )
      })

      it('removes it once confirmed', () => {
        const tabs = [tab('One', []), tab('Two', [])]
        const wrapper = mount(tabs)
        wrapper.vm.tabIndex = 1
        tabMenu(wrapper).props('options')[1].onClick()
        const close = vi.fn()
        api.dialog.mock.calls[0][0].actions[0].onClick(close)
        expect(tabs.map((t) => t.label)).toEqual(['One'])
        expect(wrapper.vm.tabIndex).toBe(0)
        expect(close).toHaveBeenCalled()
      })

      it('does not select a negative tab', () => {
        const tabs = [tab('One', []), tab('Two', [])]
        const wrapper = mount(tabs)
        tabMenu(wrapper).props('options')[1].onClick()
        api.dialog.mock.calls[0][0].actions[0].onClick(vi.fn())
        expect(wrapper.vm.tabIndex).toBe(0)
      })

      it('opens the label for editing', () => {
        const tabs = [tab('Details', [])]
        const wrapper = mount(tabs)
        tabMenu(wrapper).props('options')[0].onClick()
        expect(tabs[0].editingLabel).toBe(true)
      })
    })
  })

  describe('a field dropped onto an empty tab', () => {
    it('wraps a bare field in a section and a column', () => {
      const t = tab('Details', [{ fieldname: 'status', label: 'Status' }])
      mount([t]).vm.onFieldDroppedToEmptyTab(t)
      expect(t.sections).toHaveLength(1)
      expect(t.sections[0].columns[0].fields).toEqual([
        { fieldname: 'status', label: 'Status' },
      ])
    })

    it('wraps a bare column in a section', () => {
      const t = tab('Details', [column([{ fieldname: 'status' }])])
      mount([t]).vm.onFieldDroppedToEmptyTab(t)
      expect(t.sections[0].columns[0].fields).toEqual([{ fieldname: 'status' }])
    })

    it('leaves a real section alone', () => {
      const s = section('Main')
      const t = tab('Details', [s])
      mount([t]).vm.onFieldDroppedToEmptyTab(t)
      expect(t.sections).toEqual([s])
    })

    it('does nothing when the drop left nothing behind', () => {
      const t = tab('Details', [])
      mount([t]).vm.onFieldDroppedToEmptyTab(t)
      expect(t.sections).toEqual([])
    })
  })

  describe('the section menu', () => {
    it('toggles each of the section flags', () => {
      const s = section('Main')
      const wrapper = mount([tab('Details', [s])])
      const menu = sectionMenu(wrapper)
      for (const [start, key] of [
        ['Collapsible', 'collapsible'],
        ['Hide Label', 'hideLabel'],
        ['Hide Border', 'hideBorder'],
      ]) {
        pick(menu, 'Section', start).onClick()
        expect(s[key], key).toBe(true)
      }
    })

    it('offers the opposite label once toggled', () => {
      const s = section('Main', [column()], { collapsible: true })
      const menu = sectionMenu(mount([tab('Details', [s])]))
      expect(enabled(menu, 'Section')).toContain('Uncollapsible')
    })

    it('opens the label for editing', () => {
      const s = section('Main')
      pick(sectionMenu(mount([tab('Details', [s])])), 'Section', 'Edit').onClick()
      expect(s.editingLabel).toBe(true)
    })

    describe('removing a section', () => {
      it('removes an empty one without asking', () => {
        const t = tab('Details', [section('A'), section('B')])
        const menu = sectionMenu(mount([t]))
        pick(menu, 'Section', 'Remove Section').onClick()
        expect(t.sections.map((s) => s.label)).toEqual(['B'])
        expect(api.dialog).not.toHaveBeenCalled()
      })

      it('asks before discarding fields', () => {
        const t = tab('Details', [
          section('A', [column([{ fieldname: 'status' }])]),
          section('B'),
        ])
        const menu = sectionMenu(mount([t]))
        pick(menu, 'Section', 'Remove Section').onClick()
        expect(api.dialog).toHaveBeenCalled()
        expect(t.sections).toHaveLength(2)

        const close = vi.fn()
        api.dialog.mock.calls[0][0].actions[0].onClick(close)
        expect(t.sections.map((s) => s.label)).toEqual(['B'])
      })

      it('is hidden for a section marked uneditable', () => {
        const t = tab('Details', [section('A', [column()], { editable: false })])
        expect(enabled(sectionMenu(mount([t])), 'Section')).not.toContain(
          'Remove Section',
        )
      })
    })

    describe('removing a section and keeping its columns', () => {
      it('hands them to the next section when it is the first', () => {
        const a = section('A', [column([{ fieldname: 'status' }])])
        const b = section('B', [column([{ fieldname: 'deal_owner' }])])
        const t = tab('Details', [a, b])
        pick(sectionMenu(mount([t]), 0), 'Section', 'Remove and move').onClick()
        expect(t.sections.map((s) => s.label)).toEqual(['B'])
        expect(b.columns).toHaveLength(2)
        expect(b.columns[0].fields).toEqual([{ fieldname: 'status' }])
      })

      it('hands them to the previous section otherwise', () => {
        const a = section('A', [column([{ fieldname: 'status' }])])
        const b = section('B', [column([{ fieldname: 'deal_owner' }])])
        const t = tab('Details', [a, b])
        pick(sectionMenu(mount([t]), 1), 'Section', 'Remove and move').onClick()
        expect(t.sections.map((s) => s.label)).toEqual(['A'])
        expect(a.columns[1].fields).toEqual([{ fieldname: 'deal_owner' }])
      })

      it('targets the right neighbour for a section past the second', () => {
        // Regression: the handler was given the *tab* index rather than the
        // section's own, so every section in the first tab moved its columns
        // into section 1 no matter which menu was opened.
        const a = section('A')
        const b = section('B')
        const c = section('C')
        const d = section('D', [column([{ fieldname: 'status' }])])
        const t = tab('Details', [a, b, c, d])
        pick(sectionMenu(mount([t]), 3), 'Section', 'Remove and move').onClick()
        expect(t.sections.map((s) => s.label)).toEqual(['A', 'B', 'C'])
        expect(c.columns).toHaveLength(2)
        expect(b.columns).toHaveLength(1)
      })

      it('is hidden when there is no neighbour to move into', () => {
        // Regression: with a single section this dereferenced `sections[1]`.
        const t = tab('Details', [section('A', [column([{ fieldname: 'x' }])])])
        expect(
          enabled(sectionMenu(mount([t])), 'Section').some((l) =>
            l.startsWith('Remove and move'),
          ),
        ).toBe(false)
      })

      it('is hidden for a section with no columns', () => {
        const t = tab('Details', [section('A', []), section('B')])
        expect(
          enabled(sectionMenu(mount([t])), 'Section').some((l) =>
            l.startsWith('Remove and move'),
          ),
        ).toBe(false)
      })
    })

    describe('moving a section between tabs', () => {
      it('moves it forward', async () => {
        const s = section('A')
        const tabs = [tab('One', [s]), tab('Two', [])]
        const wrapper = mount(tabs)
        pick(sectionMenu(wrapper), 'Section', 'Move to Next Tab').onClick()
        expect(tabs[0].sections).toEqual([])
        expect(tabs[1].sections).toEqual([s])
        expect(wrapper.vm.tabIndex).toBe(1)
      })

      it('moves it back', async () => {
        const s = section('B')
        const tabs = [tab('One', []), tab('Two', [s])]
        const wrapper = mount(tabs)
        wrapper.vm.tabIndex = 1
        await nextTick()
        pick(
          sectionMenu(wrapper, 0),
          'Section',
          'Move to Previous Tab',
        ).onClick()
        expect(tabs[0].sections).toEqual([s])
        expect(wrapper.vm.tabIndex).toBe(0)
      })

      it('offers neither when there is only one tab', () => {
        const labels = enabled(
          sectionMenu(mount([tab('One', [section('A')])])),
          'Section',
        )
        expect(labels).not.toContain('Move to Next Tab')
        expect(labels).not.toContain('Move to Previous Tab')
      })
    })
  })

  describe('the column menu', () => {
    it('adds a column', () => {
      const s = section('A')
      pick(sectionMenu(mount([tab('One', [s])])), 'Column', 'Add Column').onClick()
      expect(s.columns).toHaveLength(2)
      expect(s.columns[1].fields).toEqual([])
    })

    it('stops at four columns', () => {
      // Any more and each is too narrow to read.
      const s = section('A', [column(), column(), column(), column()])
      expect(enabled(sectionMenu(mount([tab('One', [s])])), 'Column')).not.toContain(
        'Add Column',
      )
    })

    it('removes an empty last column without asking', () => {
      const s = section('A', [column(), column()])
      pick(
        sectionMenu(mount([tab('One', [s])])),
        'Column',
        'Remove Last Column',
      ).onClick()
      expect(s.columns).toHaveLength(1)
      expect(api.dialog).not.toHaveBeenCalled()
    })

    it('asks before discarding a column with fields', () => {
      const s = section('A', [column(), column([{ fieldname: 'status' }])])
      pick(
        sectionMenu(mount([tab('One', [s])])),
        'Column',
        'Remove Last Column',
      ).onClick()
      expect(api.dialog).toHaveBeenCalled()
      expect(s.columns).toHaveLength(2)

      api.dialog.mock.calls[0][0].actions[0].onClick(vi.fn())
      expect(s.columns).toHaveLength(1)
    })

    it('never removes the only column', () => {
      expect(
        enabled(sectionMenu(mount([tab('One', [section('A')])])), 'Column'),
      ).not.toContain('Remove Last Column')
    })

    it('can keep the fields when removing the last column', () => {
      const s = section('A', [
        column([{ fieldname: 'status' }]),
        column([{ fieldname: 'deal_owner' }]),
      ])
      pick(
        sectionMenu(mount([tab('One', [s])])),
        'Column',
        'Remove Last Column (move',
      ).onClick()
      expect(s.columns).toHaveLength(1)
      expect(s.columns[0].fields).toEqual([
        { fieldname: 'status' },
        { fieldname: 'deal_owner' },
      ])
    })

    it('offers that only when there is something to keep', () => {
      const s = section('A', [column(), column()])
      expect(
        enabled(sectionMenu(mount([tab('One', [s])])), 'Column').some((l) =>
          l.startsWith('Remove Last Column (move'),
        ),
      ).toBe(false)
    })

    describe('moving the last column elsewhere', () => {
      it('moves it to the next section', () => {
        const a = section('A', [column([{ fieldname: 'status' }])])
        const b = section('B')
        const t = tab('One', [a, b])
        pick(
          sectionMenu(mount([t]), 0),
          'Column',
          'Move Last Column to Next Section',
        ).onClick()
        expect(a.columns).toHaveLength(0)
        expect(b.columns).toHaveLength(2)
      })

      it('moves it to the previous section', () => {
        const a = section('A')
        const b = section('B', [column([{ fieldname: 'status' }])])
        const t = tab('One', [a, b])
        pick(
          sectionMenu(mount([t]), 1),
          'Column',
          'Move Last Column to Previous Section',
        ).onClick()
        expect(b.columns).toHaveLength(0)
        expect(a.columns[1].fields).toEqual([{ fieldname: 'status' }])
      })

      it('targets the right neighbour past the second section', () => {
        // Same tab-index-for-section-index confusion as above.
        const a = section('A')
        const b = section('B')
        const c = section('C', [column([{ fieldname: 'status' }])])
        const t = tab('One', [a, b, c])
        pick(
          sectionMenu(mount([t]), 2),
          'Column',
          'Move Last Column to Previous Section',
        ).onClick()
        expect(b.columns).toHaveLength(2)
        expect(a.columns).toHaveLength(1)
      })

      it('moves it to the next tab, making a section if needed', () => {
        const a = section('A', [column([{ fieldname: 'status' }])])
        const tabs = [tab('One', [a]), tab('Two', [])]
        pick(
          sectionMenu(mount(tabs), 0),
          'Column',
          'Move Last Column to Next Tab',
        ).onClick()
        expect(tabs[1].sections).toHaveLength(1)
        expect(tabs[1].sections[0].columns[0].fields).toEqual([
          { fieldname: 'status' },
        ])
        expect(a.columns).toHaveLength(0)
      })

      it('reuses the last section of the target tab', () => {
        const a = section('A', [column([{ fieldname: 'status' }])])
        const target = section('Existing')
        const tabs = [tab('One', [a]), tab('Two', [target])]
        pick(
          sectionMenu(mount(tabs), 0),
          'Column',
          'Move Last Column to Next Tab',
        ).onClick()
        expect(tabs[1].sections).toHaveLength(1)
        expect(target.columns).toHaveLength(2)
      })

      it('moves it to the previous tab', async () => {
        const b = section('B', [column([{ fieldname: 'status' }])])
        const tabs = [tab('One', []), tab('Two', [b])]
        const wrapper = mount(tabs)
        wrapper.vm.tabIndex = 1
        await nextTick()
        pick(
          sectionMenu(wrapper, 0),
          'Column',
          'Move Last Column to Previous Tab',
        ).onClick()
        expect(tabs[0].sections[0].columns[0].fields).toEqual([
          { fieldname: 'status' },
        ])
      })

      // The two tab moves are offered only when there is a tab to move to.
      // `pick` above finds a menu entry regardless of its condition, so the
      // move tests would keep passing if these conditions were inverted — and
      // an offered move to a tab that does not exist pushes into `undefined`.
      it('does not offer a move forward from the last tab', () => {
        const a = section('A', [column([{ fieldname: 'status' }])])
        const labels = enabled(sectionMenu(mount([tab('One', [a])]), 0), 'Column')
        expect(labels).not.toContain('Move Last Column to Next Tab')
      })

      it('offers a move forward when a later tab exists', () => {
        const a = section('A', [column([{ fieldname: 'status' }])])
        const tabs = [tab('One', [a]), tab('Two', [])]
        const labels = enabled(sectionMenu(mount(tabs), 0), 'Column')
        expect(labels).toContain('Move Last Column to Next Tab')
      })

      it('does not offer a move back from the first tab', () => {
        const a = section('A', [column([{ fieldname: 'status' }])])
        const tabs = [tab('One', [a]), tab('Two', [])]
        const labels = enabled(sectionMenu(mount(tabs), 0), 'Column')
        expect(labels).not.toContain('Move Last Column to Previous Tab')
      })

      it('offers a move back once past the first tab', async () => {
        const b = section('B', [column([{ fieldname: 'status' }])])
        const tabs = [tab('One', []), tab('Two', [b])]
        const wrapper = mount(tabs)
        wrapper.vm.tabIndex = 1
        await nextTick()
        expect(enabled(sectionMenu(wrapper, 0), 'Column')).toContain(
          'Move Last Column to Previous Tab',
        )
      })

      it('offers none of them once the section is empty', () => {
        // Regression: an emptied section still offered these, and each one
        // pushed `undefined` into the target — which crashed the render, so
        // the editor went blank and the layout could not be saved.
        const empty = section('A', [])
        const t = tab('One', [empty, section('B')])
        const labels = enabled(sectionMenu(mount([t]), 0), 'Column')
        expect(labels.filter((l) => l.startsWith('Move Last Column'))).toEqual([])
      })
    })
  })

  describe('rendering', () => {
    it('draws a field per column entry', () => {
      const wrapper = mount([
        tab('One', [
          section('A', [
            column([
              { fieldname: 'status', label: 'Status' },
              { fieldname: 'deal_owner', label: 'Owner' },
            ]),
          ]),
        ]),
      ])
      expect(wrapper.text()).toContain('Status')
      expect(wrapper.text()).toContain('Owner')
    })

    it('counts the fields in a section', () => {
      const wrapper = mount([
        tab('One', [section('A', [column([{ fieldname: 'status' }])])]),
      ])
      expect(wrapper.text()).toContain('1 field')
    })

    it('pluralises the count', () => {
      const wrapper = mount([
        tab('One', [
          section('A', [
            column([{ fieldname: 'status' }, { fieldname: 'deal_owner' }]),
          ]),
        ]),
      ])
      expect(wrapper.text()).toContain('2 fields')
    })

    it('prompts when a tab has nothing in it', () => {
      expect(mount([tab('One', [])]).text()).toContain('Drag a section or a field')
    })

    it('labels an unnamed section', () => {
      expect(mount([tab('One', [section('')])]).text()).toContain('No Label')
    })

    it('skips a section that is not a real section yet', () => {
      // Mid-drop a bare field can sit in the sections list.
      const wrapper = mount([tab('One', [{ fieldname: 'status' }])])
      expect(wrapper.findAllComponents({ name: 'DropdownStub' })).toHaveLength(1)
    })

    it('renders with no tabs at all', () => {
      expect(() => mount([])).not.toThrow()
    })
  })
})
