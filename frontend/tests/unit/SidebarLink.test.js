// Only the two composables are swapped. The rest of vue-router has to stay
// real: SidebarLink pulls in Icon → @/utils → stores/users → session →
// @/router, which calls createRouter at import time.
const nav = vi.hoisted(() => ({ route: null, push: vi.fn() }))
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useRouter: () => ({ push: nav.push }),
    useRoute: () => nav.route,
  }
})

import SidebarLink from '@/components/SidebarLink.vue'
import { mountComponent } from '../helpers/mount'
import { reactive } from 'vue'
import { isMobileView, mobileSidebarOpened } from '@/composables/settings'

function mountLink(props = {}, route = {}) {
  nav.route = reactive({ name: 'Dashboard', query: {}, ...route })
  return mountComponent(SidebarLink, {
    props: { label: 'Deals', to: 'Deals', ...props },
    global: { stubs: { Tooltip: { template: '<div><slot /></div>' } } },
  })
}

const isActive = (wrapper) =>
  wrapper.classes().includes('crm-sidebar-item-active')

function setWindowWidth(width) {
  window.innerWidth = width
  window.dispatchEvent(new Event('resize'))
}

describe('SidebarLink', () => {
  beforeEach(() => {
    nav.push.mockClear()
    mobileSidebarOpened.value = false
    setWindowWidth(1440)
  })

  describe('active state', () => {
    it('is active on its own route', () => {
      expect(isActive(mountLink({ to: 'Deals' }, { name: 'Deals' }))).toBe(true)
    })

    it('is inactive on another route', () => {
      expect(isActive(mountLink({ to: 'Deals' }, { name: 'Leads' }))).toBe(false)
    })

    it('stays highlighted while inside one of its records', () => {
      // Detail routes are singular ("Deal") but the sidebar link points at the
      // list ("Deals") — the module should stay lit while you are in a record.
      expect(isActive(mountLink({ to: 'Deals' }, { name: 'Deal' }))).toBe(true)
      expect(isActive(mountLink({ to: 'Leads' }, { name: 'Lead' }))).toBe(true)
      expect(isActive(mountLink({ to: 'Notes' }, { name: 'Note' }))).toBe(true)
    })

    it('does not light a different module from a record page', () => {
      expect(isActive(mountLink({ to: 'Leads' }, { name: 'Deal' }))).toBe(false)
    })

    it('ignores a ?view= query while inside a record', () => {
      const wrapper = mountLink(
        { to: 'Deals' },
        { name: 'Deal', query: { view: 'other' } },
      )
      expect(isActive(wrapper)).toBe(true)
    })

    it('matches on the view query for saved views', () => {
      const wrapper = mountLink(
        { to: { name: 'Deals', query: { view: 'my-pipeline' } } },
        { name: 'Deals', query: { view: 'my-pipeline' } },
      )
      expect(isActive(wrapper)).toBe(true)
    })

    it('does not light the plain list link when a saved view is open', () => {
      // Otherwise both "Deals" and the saved view read as selected at once.
      const wrapper = mountLink(
        { to: 'Deals' },
        { name: 'Deals', query: { view: 'my-pipeline' } },
      )
      expect(isActive(wrapper)).toBe(false)
    })

    it('marks the active item for assistive tech', () => {
      const wrapper = mountLink({ to: 'Deals' }, { name: 'Deals' })
      expect(wrapper.attributes('aria-current')).toBe('page')
    })

    it('leaves aria-current off inactive items', () => {
      const wrapper = mountLink({ to: 'Deals' }, { name: 'Leads' })
      expect(wrapper.attributes('aria-current')).toBeUndefined()
    })
  })

  describe('navigation', () => {
    it('routes by name for a string target', () => {
      mountLink({ to: 'Deals' }).trigger('click')
      expect(nav.push).toHaveBeenCalledWith({ name: 'Deals' })
    })

    it('passes an object target straight through', () => {
      const to = { name: 'Deals', query: { view: 'x' } }
      mountLink({ to }).trigger('click')
      expect(nav.push).toHaveBeenCalledWith(to)
    })

    it('does nothing without a target', () => {
      mountLink({ to: null }).trigger('click')
      expect(nav.push).not.toHaveBeenCalled()
    })

    it('closes the mobile sidebar after navigating', async () => {
      // isMobileView is computed from the window size, so it is driven by the
      // actual width rather than assigned to.
      setWindowWidth(500)
      expect(isMobileView.value).toBe(true)
      mobileSidebarOpened.value = true

      await mountLink({ to: 'Deals' }).trigger('click')
      expect(mobileSidebarOpened.value).toBe(false)
    })

    it('leaves the sidebar alone on desktop', () => {
      setWindowWidth(1440)
      mobileSidebarOpened.value = true
      mountLink({ to: 'Deals' }).trigger('click')
      expect(mobileSidebarOpened.value).toBe(true)
    })
  })

  describe('collapsed rail', () => {
    it('shows the label when expanded', () => {
      expect(mountLink().find('.crm-sidebar-label').exists()).toBe(true)
    })

    it('hides the label when collapsed, keeping the icon', () => {
      const wrapper = mountLink({ isCollapsed: true })
      expect(wrapper.find('.crm-sidebar-label').exists()).toBe(false)
      expect(wrapper.find('.crm-sidebar-icon').exists()).toBe(true)
    })

    it('carries the collapsed modifier class', () => {
      expect(
        mountLink({ isCollapsed: true }).classes(),
      ).toContain('crm-sidebar-item-collapsed')
    })

    it('keeps an accessible name when the label is hidden', () => {
      expect(mountLink({ isCollapsed: true }).attributes('aria-label')).toBe(
        'Deals',
      )
    })
  })
})
