import MultipleAvatar from '@/components/MultipleAvatar.vue'
import Icon from '@/components/Icon.vue'
import { mountComponent } from '../helpers/mount'
import { h } from 'vue'

const STUBS = {
  Avatar: {
    name: 'Avatar',
    props: ['image', 'label', 'size', 'shape'],
    template: '<span class="avatar" :data-label="label" :data-size="size" />',
  },
  Tooltip: {
    name: 'Tooltip',
    props: ['text'],
    template: '<div class="tip" :data-text="text"><slot /></div>',
  },
}

const AVATARS = [
  { name: 'ada@example.com', label: 'Ada Lovelace', image: '/ada.png' },
  { name: 'alan@example.com', label: 'Alan Turing', image: '/alan.png' },
  { name: 'grace@example.com', label: 'Grace Hopper', image: '/grace.png' },
]

const mountAvatars = (avatars, props = {}) =>
  mountComponent(MultipleAvatar, {
    props: { avatars, ...props },
    global: { stubs: STUBS },
  })

describe('MultipleAvatar', () => {
  it('renders nothing when there is nobody to show', () => {
    expect(mountAvatars([]).find('.avatar').exists()).toBe(false)
    expect(mountAvatars(undefined).html()).toBe('<!--v-if-->')
  })

  describe('a single assignee', () => {
    it('shows the avatar with the name beside it', () => {
      // With one person there is room for the name, which is more useful than
      // a bare circle.
      const wrapper = mountAvatars([AVATARS[0]])
      expect(wrapper.find('.avatar').exists()).toBe(true)
      expect(wrapper.text()).toContain('Ada Lovelace')
    })

    it('uses the identifier as the tooltip', () => {
      expect(mountAvatars([AVATARS[0]]).find('.tip').attributes('data-text')).toBe(
        'ada@example.com',
      )
    })

    it('truncates rather than wrapping', () => {
      expect(mountAvatars([AVATARS[0]]).classes()).toContain('truncate')
    })
  })

  describe('several assignees', () => {
    it('drops the names and stacks the avatars', () => {
      const wrapper = mountAvatars(AVATARS)
      expect(wrapper.findAll('.avatar')).toHaveLength(3)
      expect(wrapper.text()).not.toContain('Ada Lovelace')
    })

    it('reverses the order so the first person sits on top', () => {
      // The row is laid out flex-row-reverse, so reversing the list puts the
      // first assignee at the visual front of the stack.
      const labels = mountAvatars(AVATARS)
        .findAll('.avatar')
        .map((a) => a.attributes('data-label'))
      expect(labels).toEqual(['Grace Hopper', 'Alan Turing', 'Ada Lovelace'])
    })

    it('does not mutate the prop while reversing', () => {
      const input = [...AVATARS]
      mountAvatars(input)
      expect(input[0].label).toBe('Ada Lovelace')
    })

    it('lays the stack out in reverse', () => {
      expect(mountAvatars(AVATARS).classes()).toContain('flex-row-reverse')
    })

    it('gives every avatar its own tooltip', () => {
      expect(mountAvatars(AVATARS).findAll('.tip')).toHaveLength(3)
    })
  })

  it('passes the size through', () => {
    expect(
      mountAvatars([AVATARS[0]], { size: 'sm' }).find('.avatar').attributes('data-size'),
    ).toBe('sm')
  })
})

describe('Icon', () => {
  const mountIcon = (icon) =>
    mountComponent(Icon, { props: { icon }, attrs: { class: 'size-4' } })

  it('renders an emoji as text', () => {
    expect(mountIcon('😀').text()).toBe('😀')
  })

  it('renders a named icon as a feather glyph', () => {
    // Icon.vue relies on FeatherIcon being globally registered, so the mount
    // helper's stub is what renders here. Components that *import* FeatherIcon
    // (QuickFilterField, for one) get the real svg instead — worth knowing when
    // writing assertions against icons.
    expect(mountIcon('search').find('.stub-feather').attributes('data-name')).toBe(
      'search',
    )
  })

  it('renders a component icon directly', () => {
    const Custom = { name: 'Custom', template: '<svg class="custom" />' }
    expect(mountIcon(Custom).find('.custom').exists()).toBe(true)
  })

  it('renders a render-function icon', () => {
    // Activities passes icons built with h(), not SFCs.
    const built = { render: () => h('svg', { class: 'built' }) }
    expect(mountIcon(built).find('.built').exists()).toBe(true)
  })

  it('passes attributes through to whichever branch renders', () => {
    expect(mountIcon('😀').classes()).toContain('size-4')
    expect(mountIcon('search').classes()).toContain('size-4')
  })
})
