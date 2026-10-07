import ShortcutTooltip from '@/components/ShortcutTooltip.vue'
import { mountComponent } from '../helpers/mount'

const STUBS = {
  // Renders #body and the default slot, as the real Tooltip does when shown.
  Tooltip: {
    name: 'TooltipStub',
    inheritAttrs: false,
    template: '<div class="tip"><slot name="body" /><slot /></div>',
  },
  KeyboardShortcut: {
    name: 'KeyboardShortcutStub',
    inheritAttrs: false,
    props: ['combo', 'bg'],
    template: '<kbd>{{ combo }}</kbd>',
  },
}

// `isMac` reads userAgentData.platform, then platform, then userAgent.
const asPlatform = (platform, userAgent = 'Mozilla/5.0') => {
  Object.defineProperty(window.navigator, 'userAgentData', {
    configurable: true,
    value: { platform },
  })
  Object.defineProperty(window.navigator, 'platform', {
    configurable: true,
    value: platform,
  })
  Object.defineProperty(window.navigator, 'userAgent', {
    configurable: true,
    value: userAgent,
  })
}

describe('ShortcutTooltip', () => {
  const mount = (props = {}, slots = {}) =>
    mountComponent(ShortcutTooltip, {
      props: { label: 'Save', ...props },
      slots: { default: '<button class="target">Save</button>', ...slots },
      global: { stubs: STUBS },
    })

  const keys = (wrapper) =>
    wrapper.findAllComponents({ name: 'KeyboardShortcutStub' }).map((k) =>
      k.props('combo'),
    )

  beforeEach(() => asPlatform('Win32'))

  describe('what it wraps', () => {
    it('shows the thing it is attached to', () => {
      expect(mount().find('.target').exists()).toBe(true)
    })

    it('shows the label', () => {
      expect(mount({ label: 'Delete event' }).text()).toContain('Delete event')
    })

    it('renders the target without a tooltip when disabled', () => {
      // A control that has no shortcut on this screen still has to render.
      const wrapper = mount({ disabled: true, combo: 'mod+s' })
      expect(wrapper.find('.target').exists()).toBe(true)
      expect(wrapper.find('.tip').exists()).toBe(false)
    })

    it('shows no keys when none were given', () => {
      expect(keys(mount())).toEqual([])
    })
  })

  describe('the modifier key', () => {
    it('is Ctrl on Windows and Linux', () => {
      expect(keys(mount({ combo: 'mod+s' }))).toEqual(['Ctrl+s'])
    })

    it('is Cmd on a Mac', () => {
      asPlatform('macOS')
      expect(keys(mount({ combo: 'mod+s' }))).toEqual(['Cmd+s'])
    })

    it('recognises a Mac from the user agent when the platform is unhelpful', () => {
      asPlatform('', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')
      expect(keys(mount({ combo: 'mod+s' }))).toEqual(['Cmd+s'])
    })

    it('recognises an iPad', () => {
      asPlatform('iPad')
      expect(keys(mount({ combo: 'mod+k' }))).toEqual(['Cmd+k'])
    })

    it('keeps the rest of a longer combination', () => {
      expect(keys(mount({ combo: 'mod+shift+p' }))).toEqual(['Ctrl+shift+p'])
    })

    it('matches "mod" whatever its case', () => {
      expect(keys(mount({ combo: 'MOD+s' }))).toEqual(['Ctrl+s'])
    })

    it('leaves a combination without a modifier alone', () => {
      expect(keys(mount({ combo: 'Escape' }))).toEqual(['Escape'])
    })

    it('does not treat a key that merely starts with "mod" as one', () => {
      // `mod+` is the marker, not the word.
      expect(keys(mount({ combo: 'mode' }))).toEqual(['mode'])
    })
  })

  describe('several combinations', () => {
    it('shows each one', () => {
      expect(keys(mount({ combo: ['mod+s', 'Enter'] }))).toEqual([
        'Ctrl+s',
        'Enter',
      ])
    })

    it('shows the alternatives after the main one', () => {
      expect(
        keys(mount({ combo: 'mod+s', altCombos: ['Enter'] })),
      ).toEqual(['Ctrl+s', 'Enter'])
    })

    it('shows alternatives on their own', () => {
      expect(keys(mount({ altCombos: ['Enter', 'Space'] }))).toEqual([
        'Enter',
        'Space',
      ])
    })

    it('applies the modifier to the alternatives too', () => {
      asPlatform('macOS')
      expect(keys(mount({ altCombos: ['mod+k'] }))).toEqual(['Cmd+k'])
    })

    it('ignores an empty combination', () => {
      expect(keys(mount({ combo: '' }))).toEqual([])
    })
  })

  describe('Backspace and Delete on a Mac', () => {
    it('shows only Backspace, which is the key Macs have', () => {
      asPlatform('macOS')
      expect(keys(mount({ combo: ['Backspace', 'Delete'] }))).toEqual([
        'Backspace',
      ])
    })

    it('drops Delete from the alternatives as well', () => {
      asPlatform('macOS')
      expect(
        keys(mount({ combo: 'Backspace', altCombos: ['Delete'] })),
      ).toEqual(['Backspace'])
    })

    it('drops it across the two lists', () => {
      asPlatform('macOS')
      expect(
        keys(mount({ combo: 'Delete', altCombos: ['Backspace'] })),
      ).toEqual(['Backspace'])
    })

    it('keeps Delete when Backspace is not also offered', () => {
      asPlatform('macOS')
      expect(keys(mount({ combo: 'Delete' }))).toEqual(['Delete'])
    })

    it('shows both on Windows, where they are different keys', () => {
      expect(keys(mount({ combo: ['Backspace', 'Delete'] }))).toEqual([
        'Backspace',
        'Delete',
      ])
    })
  })
})
