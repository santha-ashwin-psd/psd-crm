import ViewBreadcrumbs from '@/components/ViewBreadcrumbs.vue'
import { mountComponent } from '../helpers/mount'

const STUBS = {
  'router-link': {
    name: 'RouterLink',
    props: ['to'],
    template: '<a class="crumb" :data-to="to?.name"><slot /></a>',
  },
  Dropdown: {
    name: 'Dropdown',
    props: ['options'],
    template: '<div class="views-menu"><slot :open="false" /></div>',
  },
  Icon: { name: 'Icon', props: ['icon'], template: '<span class="icon" />' },
}

const mountCrumbs = (viewControls) =>
  mountComponent(ViewBreadcrumbs, {
    props: { routeName: 'Deals', modelValue: viewControls },
    global: { stubs: STUBS },
  })

const WITH_VIEWS = {
  viewsDropdownOptions: [{ group: 'Views', items: [{ label: 'All Deals' }] }],
  currentView: { label: 'All Deals', icon: 'list' },
}

describe('ViewBreadcrumbs', () => {
  describe('the page name', () => {
    it('always shows the route name', () => {
      expect(mountCrumbs({}).find('.crumb').text()).toBe('Deals')
    })

    it('links back to the route', () => {
      expect(mountCrumbs({}).find('.crumb').attributes('data-to')).toBe('Deals')
    })

    it('hints it is clickable only when a view menu follows it', () => {
      // On a page with no views (the Dashboard) the title is not a hover
      // target, because there is nothing to navigate back from.
      expect(mountCrumbs(WITH_VIEWS).find('.crumb').classes()).toContain(
        'hover:text-blue-600',
      )
      expect(mountCrumbs({}).find('.crumb').classes()).not.toContain(
        'hover:text-blue-600',
      )
    })
  })

  describe('the views menu', () => {
    it('is omitted on a page with no views', () => {
      const wrapper = mountCrumbs({})
      expect(wrapper.find('.views-menu').exists()).toBe(false)
      expect(wrapper.text()).not.toContain('/')
    })

    it('appears with a separator once views exist', () => {
      const wrapper = mountCrumbs(WITH_VIEWS)
      expect(wrapper.find('.views-menu').exists()).toBe(true)
      expect(wrapper.text()).toContain('/')
    })

    it('hides the separator from assistive tech as decoration', () => {
      const separator = mountCrumbs(WITH_VIEWS).find('span[aria-hidden="true"]')
      expect(separator.text()).toBe('/')
    })

    it('labels the trigger with the current view', () => {
      expect(mountCrumbs(WITH_VIEWS).find('.stub-button').text()).toContain(
        'All Deals',
      )
    })

    it('passes the view options through to the menu', () => {
      const options = mountCrumbs(WITH_VIEWS)
        .findComponent({ name: 'Dropdown' })
        .props('options')
      expect(options).toEqual(WITH_VIEWS.viewsDropdownOptions)
    })

    it('survives a missing current view', () => {
      // The menu can render before the current view resolves.
      const wrapper = mountCrumbs({
        viewsDropdownOptions: [],
        currentView: null,
      })
      expect(wrapper.find('.views-menu').exists()).toBe(true)
    })
  })

  describe('when view controls have not loaded', () => {
    it('renders the title alone rather than failing', () => {
      const wrapper = mountCrumbs(undefined)
      expect(wrapper.find('.crumb').text()).toBe('Deals')
      expect(wrapper.find('.views-menu').exists()).toBe(false)
    })
  })
})
