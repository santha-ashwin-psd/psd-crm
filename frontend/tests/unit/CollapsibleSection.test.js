import CollapsibleSection from '@/components/CollapsibleSection.vue'
import { mountComponent } from '../helpers/mount'

const DEFAULT_SLOT = { default: '<p class="body">contents</p>' }

function mountSection(props = {}, slots = DEFAULT_SLOT) {
  return mountComponent(CollapsibleSection, {
    props: { label: 'Details', ...props },
    slots,
  })
}

describe('CollapsibleSection', () => {
  describe('header', () => {
    it('shows the label', () => {
      expect(mountSection().find('.section-header').text()).toContain('Details')
    })

    it('falls back to Untitled when the label is empty', () => {
      expect(mountSection({ label: '' }).text()).toContain('Untitled')
    })

    it('hides the whole header when asked', () => {
      expect(mountSection({ hideLabel: true }).find('.section-header').exists()).toBe(
        false,
      )
    })

    it('still renders the contents with the header hidden', () => {
      // Sections without a heading are a layout device, not a way to hide data.
      expect(mountSection({ hideLabel: true }).find('.body').exists()).toBe(true)
    })

    it('renders a count badge when given one', () => {
      expect(mountSection({ count: 4 }).find('.stub-badge').text()).toBe('4')
    })

    it('omits the badge when there is no count', () => {
      expect(mountSection().find('.stub-badge').exists()).toBe(false)
    })
  })

  describe('chevron', () => {
    // Both positions sit inside the same max-w-fit label group, so "right"
    // means immediately after the label text, not at the far edge of the row.
    const labelGroupChildren = (wrapper) =>
      wrapper.findAll('.section-header > div > span').map((s) => s.classes())

    it('sits before the label by default', () => {
      // The component's own default is 'left'; the field layout's Section.vue
      // is what passes 'right'.
      const [first] = labelGroupChildren(mountSection())
      expect(first).toContain('lucide-chevron-right')
    })

    it('sits after the label when positioned right', () => {
      const classes = labelGroupChildren(
        mountSection({ collapseIconPosition: 'right' }),
      )
      expect(classes[0]).not.toContain('lucide-chevron-right')
      expect(classes[classes.length - 1]).toContain('lucide-chevron-right')
    })

    it('is rotated while the section is open', () => {
      expect(
        mountSection().find('.lucide-chevron-right').classes(),
      ).toContain('rotate-90')
    })

    it('is absent when the section cannot collapse', () => {
      expect(
        mountSection({ collapsible: false }).find('.lucide-chevron-right').exists(),
      ).toBe(false)
    })
  })

  describe('toggling', () => {
    // v-show renders `display: none` rather than removing the node. Asserted
    // on the style directly: isVisible() does not see through the transition
    // stub that @vue/test-utils substitutes for <transition>.
    const isHidden = (wrapper) =>
      wrapper.find('.columns').attributes('style') === 'display: none;'

    it('starts open', () => {
      expect(isHidden(mountSection())).toBe(false)
    })

    it('can start closed', () => {
      expect(isHidden(mountSection({ opened: false }))).toBe(true)
    })

    it('closes and reopens on click', async () => {
      const wrapper = mountSection()
      const header = wrapper.find('.section-header > div')

      await header.trigger('click')
      expect(isHidden(wrapper)).toBe(true)

      await header.trigger('click')
      expect(isHidden(wrapper)).toBe(false)
    })

    it('ignores clicks when not collapsible', async () => {
      const wrapper = mountSection({ collapsible: false })
      await wrapper.find('.section-header > div').trigger('click')
      expect(isHidden(wrapper)).toBe(false)
    })

    it('keeps the contents mounted while collapsed', () => {
      // v-show, not v-if — collapsing must not destroy form state.
      expect(mountSection({ opened: false }).find('.body').exists()).toBe(true)
    })
  })

  describe('actions slot', () => {
    it('renders actions beside the label', () => {
      const wrapper = mountSection(
        {},
        { ...DEFAULT_SLOT, actions: '<button class="act">Edit</button>' },
      )
      expect(wrapper.find('.act').exists()).toBe(true)
    })

    it('does not toggle the section when an action is clicked', async () => {
      // The action sits outside the clickable label group.
      const wrapper = mountSection(
        {},
        { ...DEFAULT_SLOT, actions: '<button class="act">Edit</button>' },
      )
      await wrapper.find('.act').trigger('click')
      expect(wrapper.find('.columns').isVisible()).toBe(true)
    })
  })
})
