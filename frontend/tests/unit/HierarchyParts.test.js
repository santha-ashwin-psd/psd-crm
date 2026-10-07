import HierarchyTree from '@/components/Settings/Hierarchy/HierarchyTree.vue'
import HierarchyRow from '@/components/Settings/Hierarchy/HierarchyRow.vue'
import UserMultiSelect from '@/components/Settings/Hierarchy/UserMultiSelect.vue'
import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'

const user = (email, full_name) => ({ email, full_name, value: email })

const STUBS = {
  Avatar: true, Badge: true, Dropdown: true, Popover: true, Tooltip: true,
  LoadingIndicator: true, UserMultiSelect: true, HierarchyRow: true,
  CheckIcon: true,
}

describe('UserMultiSelect', () => {
  const CANDIDATES = [
    user('ada@x.com', 'Ada Lovelace'),
    user('grace@x.com', 'Grace Hopper'),
  ]

  const mount = (props = {}) =>
    mountComponent(UserMultiSelect, {
      props: { candidates: CANDIDATES, modelValue: [], ...props },
      global: { stubs: STUBS },
    })

  describe('filtering', () => {
    it('shows everyone when the box is empty', () => {
      expect(mount().vm.filtered).toHaveLength(2)
    })

    it('matches a full name', () => {
      const wrapper = mount()
      wrapper.vm.query = 'ada'
      expect(wrapper.vm.filtered.map((u) => u.email)).toEqual(['ada@x.com'])
    })

    it('matches an email', () => {
      const wrapper = mount()
      wrapper.vm.query = 'grace@'
      expect(wrapper.vm.filtered.map((u) => u.email)).toEqual(['grace@x.com'])
    })

    it('ignores case', () => {
      const wrapper = mount()
      wrapper.vm.query = 'LOVELACE'
      expect(wrapper.vm.filtered.map((u) => u.email)).toEqual(['ada@x.com'])
    })

    it('ignores surrounding whitespace', () => {
      // Pasted names carry it, and a trailing space matching nothing looks
      // like the search is broken.
      const wrapper = mount()
      wrapper.vm.query = '  ada  '
      expect(wrapper.vm.filtered).toHaveLength(1)
    })

    it('treats whitespace alone as an empty query', () => {
      const wrapper = mount()
      wrapper.vm.query = '   '
      expect(wrapper.vm.filtered).toHaveLength(2)
    })

    it('copes with a candidate missing a name', () => {
      const wrapper = mount({ candidates: [{ email: 'x@x.com', value: 'x@x.com' }] })
      wrapper.vm.query = 'ada'
      expect(wrapper.vm.filtered).toEqual([])
    })

    it('returns nothing when nothing matches', () => {
      const wrapper = mount()
      wrapper.vm.query = 'zzz'
      expect(wrapper.vm.filtered).toEqual([])
    })
  })

  describe('selecting', () => {
    it('reports who is already selected', () => {
      const wrapper = mount({ modelValue: ['ada@x.com'] })
      expect(wrapper.vm.isSelected(CANDIDATES[0])).toBe(true)
      expect(wrapper.vm.isSelected(CANDIDATES[1])).toBe(false)
    })

    it('adds someone on first press', () => {
      const wrapper = mount()
      wrapper.vm.toggle(CANDIDATES[0])
      expect(wrapper.emitted('update:modelValue').at(-1)).toEqual([
        ['ada@x.com'],
      ])
    })

    it('removes them on second press', () => {
      const wrapper = mount({ modelValue: ['ada@x.com', 'grace@x.com'] })
      wrapper.vm.toggle(CANDIDATES[0])
      expect(wrapper.emitted('update:modelValue').at(-1)).toEqual([
        ['grace@x.com'],
      ])
    })

    it('replaces the array rather than mutating it', () => {
      // The parent holds this list; mutating in place would skip the update.
      const original = ['grace@x.com']
      const wrapper = mount({ modelValue: original })
      wrapper.vm.toggle(CANDIDATES[0])
      expect(original).toEqual(['grace@x.com'])
    })
  })
})

describe('HierarchyTree', () => {
  const node = (over = {}) => ({ name: 'ada@x.com', children: [], ...over })

  const mount = (props = {}) =>
    mountComponent(HierarchyTree, {
      props: { node: node(), nodeKey: 'name', ...props },
      global: { stubs: STUBS },
    })

  it('knows when a node has reports', () => {
    expect(mount().vm.hasChildren).toBe(false)
    expect(
      mount({ node: node({ children: [node({ name: 'b@x.com' })] }) }).vm
        .hasChildren,
    ).toBe(true)
  })

  it('starts collapsed by default', () => {
    expect(mount().vm.isCollapsed).toBe(true)
  })

  it('honours a request to start expanded', () => {
    expect(
      mount({ options: { defaultCollapsed: false } }).vm.isCollapsed,
    ).toBe(false)
  })

  it('expands and collapses a node with reports', () => {
    const wrapper = mount({ node: node({ children: [node({ name: 'b@x.com' })] }) })
    wrapper.vm.toggleCollapsed()
    expect(wrapper.vm.isCollapsed).toBe(false)
    wrapper.vm.toggleCollapsed()
    expect(wrapper.vm.isCollapsed).toBe(true)
  })

  it('ignores a toggle on a leaf', () => {
    // A leaf has nothing to reveal, so the chevron must not appear to do
    // something.
    const wrapper = mount()
    wrapper.vm.toggleCollapsed()
    expect(wrapper.vm.isCollapsed).toBe(true)
  })

  it('does not let the toggle reach the row underneath', () => {
    const stop = vi.fn()
    mount({ node: node({ children: [node({ name: 'b@x.com' })] }) }).vm.toggleCollapsed(
      { stopPropagation: stop },
    )
    expect(stop).toHaveBeenCalled()
  })

  it('tolerates being toggled with no event', () => {
    expect(() => mount().vm.toggleCollapsed()).not.toThrow()
  })
})

describe('HierarchyRow', () => {
  const node = (over = {}) => ({
    name: 'ada@x.com',
    full_name: 'Ada Lovelace',
    reports_to: '',
    ...over,
  })

  const mount = (props = {}) =>
    mountComponent(HierarchyRow, {
      props: {
        node: node(),
        handlers: {},
        getCandidates: vi.fn(),
        canEdit: true,
        ...props,
      },
      global: { stubs: STUBS },
    })

  describe('the row menu', () => {
    it('always offers Delete', () => {
      expect(mount().vm.moreOptions.map((o) => o.label)).toContain('Delete')
    })

    it('offers Move to top level only for someone who reports to another', () => {
      // A top-level person is already at the top; the option would do nothing.
      expect(mount().vm.moreOptions.map((o) => o.label)).not.toContain(
        'Move to top level',
      )
      expect(
        mount({ node: node({ reports_to: 'boss@x.com' }) }).vm.moreOptions.map(
          (o) => o.label,
        ),
      ).toContain('Move to top level')
    })

    it('asks the parent to remove the node', () => {
      const wrapper = mount()
      wrapper.vm.moreOptions.find((o) => o.label === 'Delete').onClick()
      expect(wrapper.emitted('remove')[0][0]).toMatchObject({
        name: 'ada@x.com',
      })
    })

    it('asks the parent to move the node to the top', () => {
      const wrapper = mount({ node: node({ reports_to: 'boss@x.com' }) })
      wrapper.vm.moreOptions
        .find((o) => o.label === 'Move to top level')
        .onClick()
      expect(wrapper.emitted('move-to-root')).toHaveLength(1)
    })
  })

  describe('adding reports', () => {
    it('does nothing when nobody is picked', () => {
      const wrapper = mount()
      const close = vi.fn()
      wrapper.vm.commit(close)
      expect(wrapper.emitted('bulk-add')).toBeUndefined()
      expect(close).not.toHaveBeenCalled()
    })

    it('sends the picked users against this node', () => {
      const wrapper = mount()
      wrapper.vm.selected = ['grace@x.com', 'alan@x.com']
      const close = vi.fn()
      wrapper.vm.commit(close)
      expect(wrapper.emitted('bulk-add')[0][0]).toMatchObject({
        userIds: ['grace@x.com', 'alan@x.com'],
      })
      expect(close).toHaveBeenCalled()
    })

    it('clears the picker afterwards', () => {
      const wrapper = mount()
      wrapper.vm.selected = ['grace@x.com']
      wrapper.vm.commit(vi.fn())
      expect(wrapper.vm.selected).toEqual([])
    })

    it('clears the picker when it is dismissed without committing', async () => {
      // Otherwise reopening it on a different manager shows the previous
      // selection already ticked.
      const wrapper = mount()
      wrapper.vm.popoverOpen = true
      wrapper.vm.selected = ['grace@x.com']
      await nextTick()
      wrapper.vm.popoverOpen = false
      await nextTick()
      expect(wrapper.vm.selected).toEqual([])
    })
  })

  describe('highlighting', () => {
    it('is on while either menu is open', async () => {
      const wrapper = mount()
      expect(wrapper.vm.isHighlighted).toBe(false)
      wrapper.vm.popoverOpen = true
      await nextTick()
      expect(wrapper.vm.isHighlighted).toBe(true)
      wrapper.vm.popoverOpen = false
      wrapper.vm.dropdownOpen = true
      await nextTick()
      expect(wrapper.vm.isHighlighted).toBe(true)
    })

    it('tracks the dropdown without looping', () => {
      // syncDropdown is called from the template on every render, so it must
      // not write when the value already matches.
      const wrapper = mount()
      expect(wrapper.vm.syncDropdown(true)).toBe('')
      expect(wrapper.vm.dropdownOpen).toBe(true)
      expect(wrapper.vm.syncDropdown(true)).toBe('')
      expect(wrapper.vm.dropdownOpen).toBe(true)
    })
  })
})
