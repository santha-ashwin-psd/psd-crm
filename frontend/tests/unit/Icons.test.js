kanimport { mount } from '@vue/test-utils'
import TaskStatusIcon from '@/components/Icons/TaskStatusIcon.vue'
import TaskPriorityIcon from '@/components/Icons/TaskPriorityIcon.vue'
import DotIcon from '@/components/Icons/DotIcon.vue'

/**
 * The 116 icon components, covered as a set.
 *
 * All but three are pure SVG templates with no script, so an individual suite
 * per file would be 116 copies of the same assertion. What is worth checking is
 * that every one of them compiles, mounts, and actually produces an svg — which
 * catches a malformed template or a bad merge in any of them.
 *
 * The three that carry logic are tested properly below.
 */
const modules = import.meta.glob('../../src/components/Icons/*.vue', {
  eager: true,
})

const icons = Object.entries(modules).map(([path, mod]) => [
  path.split('/').pop(),
  mod.default,
])

describe('Icon components', () => {
  it('finds every icon in the directory', () => {
    // Guards against the glob silently matching nothing.
    expect(icons.length).toBeGreaterThan(100)
  })

  // TaskPriorityIcon is a coloured dot rather than a glyph, so it is the one
  // member of the set that renders a div. It has its own tests below.
  const glyphIcons = icons.filter(([name]) => name !== 'TaskPriorityIcon.vue')

  it.each(glyphIcons)('%s mounts and renders an svg', (name, component) => {
    const wrapper = mount(component, {
      props: { status: 'Todo', priority: 'Low' },
      global: { config: { globalProperties: { __: globalThis.__ } } },
    })
    expect(wrapper.find('svg').exists()).toBe(true)
  })

  it.each(icons)('%s accepts a class from its caller', (name, component) => {
    // Every call site sizes icons with a utility class, so attribute
    // inheritance has to reach the root svg.
    const wrapper = mount(component, {
      props: { status: 'Todo', priority: 'Low' },
      attrs: { class: 'size-4' },
      global: { config: { globalProperties: { __: globalThis.__ } } },
    })
    expect(wrapper.html()).toContain('size-4')
  })
})

describe('TaskStatusIcon', () => {
  const mountStatus = (status) => mount(TaskStatusIcon, { props: { status } })

  // 'Canceled' with one L, matching the CRM Task doctype's Select options.
  it.each(['Backlog', 'Todo', 'In Progress', 'Done', 'Canceled'])(
    'draws a distinct glyph for %s',
    (status) => {
      expect(mountStatus(status).find('path').exists()).toBe(true)
    },
  )

  it('gives each status a different shape', () => {
    // Otherwise the icon column would be decorative rather than informative.
    const paths = ['Backlog', 'Todo', 'In Progress', 'Done'].map((s) =>
      mountStatus(s).find('path').attributes('d'),
    )
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('names the status for assistive tech', () => {
    expect(mountStatus('In Progress').attributes('aria-label')).toBe(
      'In Progress',
    )
  })

  it('renders an empty frame for an unknown status rather than failing', () => {
    const wrapper = mountStatus('Nonexistent')
    expect(wrapper.find('svg').exists()).toBe(true)
    expect(wrapper.find('path').exists()).toBe(false)
  })
})

describe('TaskPriorityIcon', () => {
  const mountPriority = (priority) =>
    mount(TaskPriorityIcon, { props: { priority } })

  it.each([
    ['High', 'bg-red-500'],
    ['Medium', 'bg-yellow-500'],
    ['Low', 'bg-surface-gray-4'],
  ])('colours the %s dot', (priority, expected) => {
    // Regression: the class binding was written with a comma operator —
    // `({ ...conditions }, $attrs.class)` — which evaluates the conditional
    // object, throws it away, and yields only $attrs.class. Every priority
    // rendered an identical uncoloured dot.
    expect(mountPriority(priority).html()).toContain(expected)
  })

  it('gives the three priorities three different colours', () => {
    const html = ['Low', 'Medium', 'High'].map((p) => mountPriority(p).html())
    expect(new Set(html).size).toBe(3)
  })

  it('still accepts a class from the caller', () => {
    const wrapper = mount(TaskPriorityIcon, {
      props: { priority: 'High' },
      attrs: { class: 'size-2' },
    })
    expect(wrapper.html()).toContain('size-2')
    expect(wrapper.html()).toContain('bg-red-500')
  })

  it('survives an unknown priority', () => {
    expect(mountPriority('Urgent').find('div').exists()).toBe(true)
  })
})

describe('DotIcon', () => {
  it('defaults to a small dot', () => {
    expect(mount(DotIcon).find('circle').attributes('r')).toBe('3.5')
  })

  it('honours a custom radius', () => {
    expect(
      mount(DotIcon, { props: { radius: 6 } }).find('circle').attributes('r'),
    ).toBe('6')
  })
})
