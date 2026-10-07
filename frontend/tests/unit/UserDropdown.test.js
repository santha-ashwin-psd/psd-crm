// UserDropdown's import graph reaches stores/settings.js and
// stores/notifications.js, both of which build auto-fetching resources at
// module scope. Neutered here or the suite leaves unhandled fetch rejections.
vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const inert = (options) => ({
    options,
    data: options?.initialData ?? null,
    fetch: vi.fn(),
    reload: vi.fn(),
    submit: vi.fn(),
  })
  return {
    ...actual,
    createResource: inert,
    createListResource: inert,
    createDocumentResource: inert,
  }
})

// The menu past "Personal" is built from FCRM Settings, so the tests drive it.
vi.mock('@/stores/settings', async () => {
  const { ref, reactive } = await import('vue')
  const settings = ref({})
  return {
    __settings: settings,
    getSettings: () => ({ settings, brand: reactive({}), _settings: {} }),
  }
})

vi.mock('@/stores/session', () => ({
  sessionStore: () => ({ logout: { submit: vi.fn() } }),
}))

vi.mock('@/stores/users', () => ({
  usersStore: () => ({
    getUser: () => ({
      full_name: 'Ada Lovelace',
      user_image: '/ada.png',
      name: 'ada@example.com',
    }),
  }),
}))

import UserDropdown from '@/components/UserDropdown.vue'
import { mountComponent } from '../helpers/mount'
import { withPinia } from '../helpers/pinia'
import { __settings as settings } from '@/stores/settings'

const STUBS = {
  Dropdown: {
    name: 'Dropdown',
    props: ['options'],
    template: '<div class="menu"><slot :open="open" /></div>',
    data: () => ({ open: false }),
  },
  Avatar: {
    name: 'Avatar',
    props: ['label', 'image', 'size'],
    template: '<span class="avatar" :data-label="label" :data-image="image" />',
  },
  BrandLogo: { name: 'BrandLogo', template: '<span class="brand-logo" />' },
}

const mountDropdown = (props = {}) =>
  mountComponent(UserDropdown, { props, global: { stubs: STUBS } })

describe('UserDropdown', () => {
  // The component reaches notificationsStore, a pinia store.
  beforeEach(() => {
    withPinia()
    settings.value = {}
  })

  describe('avatar variant', () => {
    it('shows the user avatar', () => {
      const wrapper = mountDropdown({ variant: 'avatar' })
      const avatar = wrapper.find('.avatar')
      expect(avatar.attributes('data-label')).toBe('Ada Lovelace')
      expect(avatar.attributes('data-image')).toBe('/ada.png')
    })

    it('shows a chevron so it reads as a menu, not a portrait', () => {
      // Without it the avatar gives no hint that anything happens on click.
      expect(
        mountDropdown({ variant: 'avatar' }).find('.lucide-chevron-down').exists(),
      ).toBe(true)
    })

    it('hides the chevron from assistive tech as decoration', () => {
      const chevron = mountDropdown({ variant: 'avatar' }).find(
        '.lucide-chevron-down',
      )
      expect(chevron.attributes('aria-hidden')).toBe('true')
    })

    it('names the control for assistive tech', () => {
      expect(mountDropdown({ variant: 'avatar' }).find('button').attributes('aria-label')).toBe(
        'User Menu',
      )
    })

    it('does not render the brand block', () => {
      expect(mountDropdown({ variant: 'avatar' }).find('.brand-logo').exists()).toBe(
        false,
      )
    })
  })

  describe('full variant', () => {
    it('shows the brand and the user together', () => {
      const wrapper = mountDropdown({})
      expect(wrapper.find('.brand-logo').exists()).toBe(true)
      expect(wrapper.text()).toContain('Ada Lovelace')
    })

    it('collapses to the logo alone in a narrow sidebar', () => {
      const wrapper = mountDropdown({ isCollapsed: true })
      // The text block is hidden by width/opacity rather than removed.
      expect(wrapper.html()).toContain('w-0')
      expect(wrapper.html()).toContain('opacity-0')
    })
  })

  // The app switcher lists the other Frappe apps on the site. Two things it
  // must get right: Desk is always there even though the API never returns it,
  // and CRM is never listed — offering to switch to the app you are already in
  // is the kind of thing nobody reports and everybody notices.
  describe('the app switcher', () => {
    const shaped = (wrapper, data) =>
      wrapper.vm.apps.options.transform(data)

    it('always offers Desk first', () => {
      const list = shaped(mountDropdown({ variant: 'avatar' }), [])
      expect(list.map((a) => a.name)).toEqual(['frappe'])
      expect(list[0].route).toBe('/desk')
    })

    it('does not list CRM itself', () => {
      const list = shaped(mountDropdown({ variant: 'avatar' }), [
        { name: 'crm', title: 'CRM', route: '/crm', logo: '/crm.png' },
        { name: 'helpdesk', title: 'Helpdesk', route: '/helpdesk', logo: '/hd.png' },
      ])
      expect(list.map((a) => a.name)).toEqual(['frappe', 'helpdesk'])
    })

    it('keeps each sibling app’s route and logo', () => {
      const list = shaped(mountDropdown({ variant: 'avatar' }), [
        { name: 'helpdesk', title: 'Helpdesk', route: '/helpdesk', logo: '/hd.png' },
      ])
      expect(list[1]).toMatchObject({
        title: 'Helpdesk',
        route: '/helpdesk',
        logo: '/hd.png',
      })
    })

    it('renders nothing extra while the app list is still loading', () => {
      expect(mountDropdown({ variant: 'avatar' }).vm.appMenuItems()).toEqual([])
    })
  })

  describe('the menu', () => {
    const groups = (wrapper) =>
      wrapper.findComponent({ name: 'Dropdown' }).props('options')

    const labels = (wrapper) =>
      groups(wrapper).flatMap((g) => (g.items || []).map((i) => i.label))

    it('leads with the personal items even before settings load', () => {
      // Theme and Notifications are local, so the menu is never empty while
      // FCRM Settings is still in flight.
      expect(labels(mountDropdown({ variant: 'avatar' }))).toEqual([
        'Dark mode',
        'Notifications',
      ])
    })

    it('appends the server-configured entries', () => {
      // Everything past Personal — including Log out — comes from
      // FCRM Settings.dropdown_items, not from this component.
      settings.value = {
        dropdown_items: [
          { label: 'Log out', type: 'Route', route: '/login' },
          { label: 'Docs', type: 'Route', route: '/docs' },
        ],
      }
      expect(labels(mountDropdown({ variant: 'avatar' }))).toContain('Log out')
      expect(labels(mountDropdown({ variant: 'avatar' }))).toContain('Docs')
    })

    it('skips entries marked hidden', () => {
      settings.value = {
        dropdown_items: [
          { label: 'Visible', type: 'Route' },
          { label: 'Hidden', type: 'Route', hidden: 1 },
        ],
      }
      const shown = labels(mountDropdown({ variant: 'avatar' }))
      expect(shown).toContain('Visible')
      expect(shown).not.toContain('Hidden')
    })

    it('starts a new group at a separator', () => {
      settings.value = {
        dropdown_items: [
          { label: 'First', type: 'Route' },
          { type: 'Separator' },
          { label: 'Second', type: 'Route' },
        ],
      }
      const wrapper = mountDropdown({ variant: 'avatar' })
      // Personal + the pre-separator group + the post-separator group.
      expect(groups(wrapper)).toHaveLength(3)
    })
  })
})
