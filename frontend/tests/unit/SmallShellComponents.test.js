const api = vi.hoisted(() => ({
  resource: null,
  pinned: [],
  public: [],
  logout: null,
}))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  return {
    ...actual,
    createResource: (opts = {}) => {
      // Deliberately does not fire onSuccess: the tests drive it, so "what
      // happens before the server answers" is observable.
      api.resource = reactive({
        ...opts,
        data: null,
        fetch: vi.fn(),
        reload: vi.fn(),
      })
      return api.resource
    },
  }
})

vi.mock('@/stores/views', () => ({
  viewsStore: () => ({
    getPinnedViews: () => api.pinned,
    getPublicViews: () => api.public,
  }),
}))

vi.mock('@/stores/session', () => ({
  sessionStore: () => ({ logout: api.logout }),
}))

vi.mock('@/stores/settings', () => ({
  getSettings: () => ({ brand: { name: 'Acme', logo: '' } }),
}))

import AddChartModal from '@/components/Dashboard/AddChartModal.vue'
import MobileSidebar from '@/components/Mobile/MobileSidebar.vue'
import EmailAccountCard from '@/components/Settings/EmailAccountCard.vue'
import EmailConfig from '@/components/Settings/EmailConfig.vue'
import EmailProviderIcon from '@/components/Settings/EmailProviderIcon.vue'
import { mountComponent } from '../helpers/mount'
import { nextTick, ref, reactive } from 'vue'

const quiet = { inheritAttrs: false, template: '<div><slot /></div>' }
const STUBS = {
  FormControl: {
    name: 'FormControlStub',
    inheritAttrs: false,
    props: ['options', 'label', 'modelValue'],
    template: '<div />',
  },
  Dialog: {
    name: 'DialogStub',
    inheritAttrs: false,
    props: ['open', 'modelValue'],
    template:
      '<div v-if="open || modelValue"><slot /><slot name="actions" /></div>',
  },
  BrandLogo: { ...quiet, name: 'BrandLogoStub' },
  UserAvatar: { ...quiet, name: 'UserAvatarStub' },
  Dropdown: { ...quiet, name: 'DropdownStub' },
  CallUI: { ...quiet, name: 'CallUIStub' },
  MenuIcon: { ...quiet, name: 'S1' },
  EmailProviderIcon: { ...quiet, name: 'EmailProviderIconStub' },
  EmailAdd: { ...quiet, name: 'EmailAddStub' },
  EmailAccountList: { ...quiet, name: 'EmailAccountListStub' },
  EmailEdit: { ...quiet, name: 'EmailEditStub' },
  SettingsPage: { ...quiet, name: 'SettingsPageStub' },
  RouterLink: { ...quiet, name: 'RouterLinkStub' },
}

describe('AddChartModal', () => {
  const mount = (items = []) =>
    mountComponent(AddChartModal, {
      props: { modelValue: true, items },
      global: {
        stubs: STUBS,
        provide: {
          fromDate: ref('2026-01-01'),
          toDate: ref('2026-01-31'),
          filters: reactive({ period: 'month', user: 'ada@x.com' }),
        },
      },
    })

  beforeEach(() => {
    api.resource = null
  })

  describe('what it offers', () => {
    it('offers a spacer and the three chart families', () => {
      expect(mount().vm.chartTypes.map((t) => t.value)).toEqual([
        'spacer',
        'number_chart',
        'axis_chart',
        'donut_chart',
      ])
    })

    it('starts on the spacer, which needs no second choice', () => {
      expect(mount().vm.chartType).toBe('spacer')
    })

    it('preselects a chart in every family', () => {
      // Regression: the number-chart picker started empty, so choosing
      // "Number Chart" and pressing Add asked the server for a chart with no
      // name. Its two siblings both preselect their first option.
      const wrapper = mount()
      expect(wrapper.vm.numberChart).toBe('total_leads')
      expect(wrapper.vm.axisChart).toBe('sales_trend')
      expect(wrapper.vm.donutChart).toBe('deals_by_stage_donut')
    })

    it('preselects something the picker actually offers', () => {
      const wrapper = mount()
      for (const [chosen, options] of [
        [wrapper.vm.numberChart, wrapper.vm.numberCharts],
        [wrapper.vm.axisChart, wrapper.vm.axisCharts],
        [wrapper.vm.donutChart, wrapper.vm.donutCharts],
      ]) {
        expect(options.map((o) => o.value)).toContain(chosen)
      }
    })
  })

  describe('adding a spacer', () => {
    it('adds it without asking the server for anything', async () => {
      const items = []
      const wrapper = mount(items)
      await wrapper.vm.addChart()
      expect(items).toHaveLength(1)
      expect(items[0].type).toBe('spacer')
      expect(api.resource).toBeNull()
    })

    it('gives it a layout of its own', async () => {
      const items = []
      await mount(items).vm.addChart()
      expect(items[0].layout).toMatchObject({ x: 0, y: 0, w: 4, h: 2 })
      expect(items[0].layout.i).toMatch(/^spacer_/)
    })

    it('gives each spacer a distinct key', async () => {
      const items = []
      const wrapper = mount(items)
      await wrapper.vm.addChart()
      await wrapper.vm.addChart()
      expect(items[0].layout.i).not.toBe(items[1].layout.i)
    })

    it('closes the dialog', async () => {
      const wrapper = mount([])
      await wrapper.vm.addChart()
      expect(wrapper.emitted('update:modelValue').at(-1)).toEqual([false])
    })
  })

  describe('adding a chart', () => {
    const add = async (type, items = []) => {
      const wrapper = mount(items)
      wrapper.vm.chartType = type
      await wrapper.vm.addChart()
      return { wrapper, items }
    }

    it('asks for the chart in the current date range and for the current user', async () => {
      await add('number_chart')
      expect(api.resource.params).toEqual({
        name: 'total_leads',
        type: 'number_chart',
        from_date: '2026-01-01',
        to_date: '2026-01-31',
        user: 'ada@x.com',
      })
    })

    it('asks for whichever chart is chosen', async () => {
      const wrapper = mount([])
      wrapper.vm.chartType = 'axis_chart'
      wrapper.vm.axisChart = 'lost_deal_reasons'
      await wrapper.vm.addChart()
      expect(api.resource.params.name).toBe('lost_deal_reasons')
    })

    it('gives a number chart a small tile', async () => {
      const { items } = await add('number_chart')
      api.resource.onSuccess({ value: 10 })
      expect(items[0].layout).toMatchObject({ w: 4, h: 2 })
    })

    it('gives an axis or donut chart a large tile', async () => {
      // A trend line in a 4x2 tile is unreadable.
      for (const type of ['axis_chart', 'donut_chart']) {
        const { items } = await add(type)
        api.resource.onSuccess({})
        expect(items[0].layout, type).toMatchObject({ w: 10, h: 7 })
      }
    })

    it('keeps the data the server sent', async () => {
      const { items } = await add('number_chart')
      api.resource.onSuccess({ value: 42 })
      expect(items[0].data).toEqual({ value: 42 })
    })

    it('copes with the server sending nothing back', async () => {
      const { items } = await add('number_chart')
      api.resource.onSuccess()
      expect(items[0].data).toEqual({})
    })

    it('keys the tile by the chart it holds', async () => {
      const { items } = await add('number_chart')
      api.resource.onSuccess({})
      expect(items[0].layout.i).toMatch(/^total_leads_/)
    })

    it('adds nothing until the server answers', async () => {
      const { items } = await add('number_chart')
      expect(items).toEqual([])
    })
  })
})

describe('MobileSidebar', () => {
  const mount = () =>
    mountComponent(MobileSidebar, {
      props: { modelValue: true },
      global: { stubs: STUBS },
    })

  beforeEach(() => {
    api.pinned = []
    api.public = []
    api.logout = vi.fn()
  })

  const view = (over = {}) => ({
    name: 7,
    label: 'Hot deals',
    route_name: 'Deals',
    type: 'list',
    ...over,
  })

  describe('the groups it shows', () => {
    it('always shows the built-in links', () => {
      const groups = mount().vm.allViews
      expect(groups[0].name).toBe('All Views')
      expect(groups[0].views.map((v) => v.to)).toEqual([
        'Leads',
        'Deals',
        'Contacts',
        'Organizations',
        'Notes',
        'Tasks',
        'Call Logs',
      ])
    })

    it('shows only the built-in links when there are no saved views', () => {
      expect(mount().vm.allViews.map((g) => g.name)).toEqual(['All Views'])
    })

    it('adds a group for public views', () => {
      api.public = [view()]
      expect(mount().vm.allViews.map((g) => g.name)).toEqual([
        'All Views',
        'Public Views',
      ])
    })

    it('adds a group for pinned views', () => {
      api.pinned = [view()]
      expect(mount().vm.allViews.map((g) => g.name)).toEqual([
        'All Views',
        'Pinned Views',
      ])
    })

    it('puts public views before pinned ones', () => {
      api.public = [view()]
      api.pinned = [view({ name: 8 })]
      expect(mount().vm.allViews.map((g) => g.name)).toEqual([
        'All Views',
        'Public Views',
        'Pinned Views',
      ])
    })
  })

  describe('a saved view', () => {
    it('links to the view by name', () => {
      api.pinned = [view()]
      expect(mount().vm.allViews[1].views[0].to).toEqual({
        name: 'Deals',
        params: { viewType: 'list' },
        query: { view: 7 },
      })
    })

    it('defaults to the list view when the type is missing', () => {
      api.pinned = [view({ type: null })]
      expect(mount().vm.allViews[1].views[0].to.params.viewType).toBe('list')
    })

    it('carries the label through', () => {
      api.pinned = [view({ label: 'My deals' })]
      expect(mount().vm.allViews[1].views[0].label).toBe('My deals')
    })
  })

  describe('the icon on a saved view', () => {
    it('uses the emoji the view was given', () => {
      const icon = mount().vm.getIcon('Deals', '🔥')
      expect(icon.children).toBe('🔥')
    })

    it('falls back to the icon of the list it belongs to', () => {
      const wrapper = mount()
      const icons = new Set(
        [
          'Leads',
          'Deals',
          'Contacts',
          'Organizations',
          'Notes',
          'Call Logs',
        ].map((r) => wrapper.vm.getIcon(r, null)),
      )
      expect(icons.size).toBe(6)
    })

    it('falls back to a pin for anything else', () => {
      const wrapper = mount()
      expect(wrapper.vm.getIcon('Something', null)).toBe(
        wrapper.vm.getIcon('Else', null),
      )
    })
  })
})

describe('EmailAccountCard', () => {
  const mount = (emailAccount) =>
    mountComponent(EmailAccountCard, {
      props: { emailAccount },
      global: { stubs: STUBS },
    })

  const account = (over = {}) => ({
    name: 'Work',
    email_id: 'ada@x.com',
    service: 'GMail',
    ...over,
  })

  it('marks an account that is a default for anything', () => {
    expect(mount(account()).vm.isDefault).toBeFalsy()
    expect(mount(account({ default_incoming: 1 })).vm.isDefault).toBeTruthy()
    expect(mount(account({ default_outgoing: 1 })).vm.isDefault).toBeTruthy()
  })

  it('says which defaults it holds', () => {
    expect(mount(account()).vm.badgeTitle).toBe('Inbox')
    expect(mount(account({ default_incoming: 1 })).vm.badgeTitle).toBe(
      'Default Inbox',
    )
    expect(mount(account({ default_outgoing: 1 })).vm.badgeTitle).toBe(
      'Default Sending',
    )
    expect(
      mount(account({ default_incoming: 1, default_outgoing: 1 })).vm
        .badgeTitle,
    ).toBe('Default Sending & Inbox')
  })

  it('shows the address', () => {
    expect(mount(account()).text()).toContain('ada@x.com')
  })
})

describe('EmailConfig', () => {
  const mount = () => mountComponent(EmailConfig, { global: { stubs: STUBS } })

  it('starts on the list of accounts', () => {
    expect(mount().vm.step).toBe('email-list')
  })

  it('moves to another step, carrying the account with it', () => {
    const wrapper = mount()
    wrapper.vm.updateStep('email-edit', { name: 'Work' })
    expect(wrapper.vm.step).toBe('email-edit')
    expect(wrapper.vm.accountData).toEqual({ name: 'Work' })
  })

  it('clears the account when moving to a step that has none', () => {
    // Otherwise "add account" would open pre-filled with the last one edited.
    const wrapper = mount()
    wrapper.vm.updateStep('email-edit', { name: 'Work' })
    wrapper.vm.updateStep('email-add')
    expect(wrapper.vm.accountData).toBeUndefined()
  })

  it('shows the step it is on', async () => {
    const wrapper = mount()
    expect(
      wrapper.findComponent({ name: 'EmailAccountListStub' }).exists(),
    ).toBe(true)
    wrapper.vm.updateStep('email-add')
    await nextTick()
    expect(wrapper.findComponent({ name: 'EmailAddStub' }).exists()).toBe(true)
  })
})

describe('EmailProviderIcon', () => {
  const mount = (props) =>
    mountComponent(EmailProviderIcon, { props, global: { stubs: STUBS } })

  it('shows the logo it is given', () => {
    expect(mount({ logo: '/assets/gmail.png' }).html()).toContain(
      '/assets/gmail.png',
    )
  })

  it('shows the label beside it', () => {
    expect(mount({ logo: '/x.png', label: 'GMail' }).text()).toContain('GMail')
  })

  it('renders differently once selected', () => {
    const plain = mount({ logo: '/x.png' }).html()
    const chosen = mount({ logo: '/x.png', selected: true }).html()
    expect(plain).not.toBe(chosen)
  })
})
