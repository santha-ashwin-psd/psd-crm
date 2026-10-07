const api = vi.hoisted(() => ({ resources: [], openPicker: vi.fn() }))
const perms = vi.hoisted(() => ({ admin: true, manager: true }))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  // Every resource the page builds is recorded, which is the only way to see
  // the throwaway one `resetToDefault` creates inside the handler.
  const inert = (options = {}) => {
    const resource = reactive({
      ...options,
      data: null,
      loading: false,
      fetch: vi.fn(),
      reload: vi.fn(),
      submit: vi.fn(),
    })
    api.resources.push(resource)
    return resource
  }
  return {
    ...actual,
    createResource: inert,
    usePageMeta: vi.fn(),
    Dropdown: {
      name: 'Dropdown',
      props: ['options', 'button', 'placeholder', 'modelValue'],
      template: '<div class="dropdown-stub" />',
    },
    // Real component, not a VTU stub, so the page's template ref lands on
    // something with an `open()` the "Custom Range" timer can call.
    DateRangePicker: {
      name: 'DateRangePicker',
      props: ['value', 'variant', 'placeholder', 'formatter'],
      emits: ['change'],
      methods: {
        open() {
          api.openPicker()
        },
      },
      template: '<div class="date-picker-stub" />',
    },
  }
})

vi.mock('frappe-ui/frappe', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, usePageMeta: vi.fn() }
})

vi.mock('@/stores/users', () => ({
  usersStore: () => ({
    users: { data: { crmUsers: [{ name: 'ada@example.com' }] } },
    getUser: (email) => ({ full_name: `Full ${email}`, user_image: '' }),
    isAdmin: () => perms.admin,
    isManager: () => perms.manager,
  }),
}))

import DashboardPage from '@/pages/Dashboard.vue'
import { mountComponent } from '../helpers/mount'
import { inject, nextTick } from 'vue'

const STUBS = {
  LayoutHeader: true,
  ViewBreadcrumbs: true,
  UserAvatar: true,
  AddChartModal: true,
  LucideCalendar: true,
  Link: {
    name: 'Link',
    props: ['value', 'doctype', 'filters', 'placeholder', 'hideMe', 'variant'],
    emits: ['change'],
    template: '<div class="link-stub" />',
  },
  DashboardGrid: {
    name: 'DashboardGrid',
    props: ['modelValue', 'editing'],
    emits: ['update:modelValue'],
    setup() {
      // The charts read the window off provide/inject rather than props.
      return {
        fromDate: inject('fromDate', null),
        toDate: inject('toDate', null),
        injectedFilters: inject('filters', null),
      }
    },
    template: '<div class="grid-stub" />',
  },
}

const items = () => [
  {
    name: 'total_leads',
    type: 'number_chart',
    layout: { x: 0, y: 0, w: 4, h: 3, i: 'total_leads' },
    data: { title: 'Total Leads', value: 42 },
  },
  {
    name: 'sales_trend',
    type: 'axis_chart',
    layout: { x: 4, y: 0, w: 12, h: 8, i: 'sales_trend' },
    data: { title: 'Sales trend', series: [{ name: 'leads' }] },
  },
]

const mountPage = async (data) => {
  const wrapper = mountComponent(DashboardPage, { global: { stubs: STUBS } })
  if (data !== undefined) {
    wrapper.vm.dashboardItems.data = data
    await nextTick()
  }
  return wrapper
}

const buttonLabels = (wrapper) =>
  wrapper.findAll('button.stub-button').map((b) => b.text())

const grid = (wrapper) => wrapper.findComponent({ name: 'DashboardGrid' })
const dropdown = (wrapper) => wrapper.findComponent({ name: 'Dropdown' })
const picker = (wrapper) => wrapper.findComponent({ name: 'DateRangePicker' })

describe('Dashboard page', () => {
  beforeEach(() => {
    // Everything on this page derives from "today", so the clock is pinned.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T10:00:00'))
    api.resources.length = 0
    api.openPicker.mockClear()
    perms.admin = true
    perms.manager = true
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('the date range presets', () => {
    it('opens on the last thirty days', async () => {
      const wrapper = await mountPage()
      expect(wrapper.vm.filters.period).toBe('2026-02-13,2026-03-15')
      expect(dropdown(wrapper).props('button').label).toBe('Last 30 Days')
    })

    it('rewrites the window and refetches for every preset', async () => {
      const wrapper = await mountPage()
      const expected = [
        ['Last 7 Days', '2026-03-08,2026-03-15'],
        ['Last 30 Days', '2026-02-13,2026-03-15'],
        ['Last 60 Days', '2026-01-14,2026-03-15'],
        ['Last 90 Days', '2025-12-15,2026-03-15'],
      ]
      const presets = wrapper.vm.options[0].items
      expected.forEach(([label, period], i) => {
        presets[i].onClick()
        expect(wrapper.vm.preset).toBe(label)
        expect(wrapper.vm.filters.period).toBe(period)
      })
      expect(wrapper.vm.dashboardItems.reload).toHaveBeenCalledTimes(4)
    })

    it('labels the dropdown with the preset that is in force', async () => {
      const wrapper = await mountPage()
      wrapper.vm.options[0].items[0].onClick()
      await nextTick()
      expect(dropdown(wrapper).props('button').label).toBe('Last 7 Days')
    })

    it('swaps the dropdown for the picker on a custom range', async () => {
      const wrapper = await mountPage()
      wrapper.vm.options[1].onClick()
      await nextTick()
      expect(dropdown(wrapper).exists()).toBe(false)
      expect(picker(wrapper).exists()).toBe(true)
      // The window is cleared so the picker starts blank, not on the preset.
      expect(wrapper.vm.filters.period).toBeNull()
    })

    it('pops the calendar open once the picker has rendered', async () => {
      const wrapper = await mountPage()
      wrapper.vm.options[1].onClick()
      await nextTick()
      vi.runAllTimers()
      expect(api.openPicker).toHaveBeenCalledTimes(1)
    })

    it('labels the dropdown with the chosen range and comes back', async () => {
      const wrapper = await mountPage()
      wrapper.vm.options[1].onClick()
      await nextTick()
      picker(wrapper).vm.$emit('change', '2026-01-05,2026-01-20')
      await nextTick()
      expect(wrapper.vm.filters.period).toBe('2026-01-05,2026-01-20')
      expect(dropdown(wrapper).props('button').label).toBe(
        'Jan 5 to Jan 20',
      )
    })

    it('falls back to the last thirty days when the range is cleared', async () => {
      const wrapper = await mountPage()
      wrapper.vm.options[1].onClick()
      await nextTick()
      picker(wrapper).vm.$emit('change', null)
      await nextTick()
      expect(wrapper.vm.preset).toBe('Last 30 Days')
      expect(wrapper.vm.filters.period).toBe('2026-02-13,2026-03-15')
      expect(dropdown(wrapper).exists()).toBe(true)
    })
  })

  describe('what it asks the server for', () => {
    it('sends the current window and no user', async () => {
      const wrapper = await mountPage()
      expect(wrapper.vm.dashboardItems.makeParams()).toEqual({
        from_date: '2026-02-13',
        to_date: '2026-03-15',
        user: null,
      })
    })

    it('narrows to a sales user and refetches', async () => {
      const wrapper = await mountPage()
      wrapper.findComponent({ name: 'Link' }).vm.$emit(
        'change',
        'ada@example.com',
      )
      await nextTick()
      expect(wrapper.vm.dashboardItems.makeParams().user).toBe(
        'ada@example.com',
      )
      expect(wrapper.vm.dashboardItems.reload).toHaveBeenCalledTimes(1)
    })

    it('sends no dates while a custom range is half-picked', async () => {
      const wrapper = await mountPage()
      wrapper.vm.options[1].onClick()
      expect(wrapper.vm.dashboardItems.makeParams()).toMatchObject({
        from_date: null,
        to_date: null,
      })
    })

    it('hides the sales user filter from ordinary users', async () => {
      perms.admin = false
      perms.manager = false
      const wrapper = await mountPage()
      expect(wrapper.findComponent({ name: 'Link' }).exists()).toBe(false)
    })

    it('refetches on demand', async () => {
      const wrapper = await mountPage()
      await wrapper
        .findAll('button.stub-button')
        .find((b) => b.text() === 'Refresh')
        .trigger('click')
      expect(wrapper.vm.dashboardItems.reload).toHaveBeenCalledTimes(1)
    })
  })

  describe('the grid', () => {
    it('stays hidden while the first fetch is in flight', async () => {
      const wrapper = await mountPage()
      wrapper.vm.dashboardItems.loading = true
      await nextTick()
      expect(grid(wrapper).exists()).toBe(false)
    })

    it('stays hidden when the server returns nothing', async () => {
      const wrapper = await mountPage()
      expect(wrapper.vm.dashboardItems.data).toBeNull()
      expect(grid(wrapper).exists()).toBe(false)
    })

    it('renders the items once they arrive', async () => {
      const wrapper = await mountPage(items())
      expect(grid(wrapper).props('modelValue')).toHaveLength(2)
      expect(grid(wrapper).props('editing')).toBe(false)
    })

    it('hands the active window and filters down to the charts', async () => {
      const wrapper = await mountPage(items())
      expect(grid(wrapper).vm.fromDate).toBe('2026-02-13')
      expect(grid(wrapper).vm.toDate).toBe('2026-03-15')
      expect(grid(wrapper).vm.injectedFilters).toBe(wrapper.vm.filters)
    })

    it('takes a rearranged layout back from the grid', async () => {
      const wrapper = await mountPage(items())
      const moved = items()
      moved[0].layout.x = 8
      grid(wrapper).vm.$emit('update:modelValue', moved)
      await nextTick()
      expect(wrapper.vm.dashboardItems.data[0].layout.x).toBe(8)
    })
  })

  describe('edit mode', () => {
    it('is offered to admins only', async () => {
      expect(buttonLabels(await mountPage())).toContain('Edit')
      perms.admin = false
      expect(buttonLabels(await mountPage())).not.toContain('Edit')
    })

    it('swaps the toolbar once editing starts', async () => {
      const wrapper = await mountPage(items())
      wrapper.vm.enableEditing()
      await nextTick()
      const labels = buttonLabels(wrapper)
      expect(labels).toEqual(
        expect.arrayContaining([
          'Chart',
          'Reset to Default',
          'Cancel',
          'Save',
        ]),
      )
      expect(labels).not.toContain('Refresh')
      expect(labels).not.toContain('Edit')
      expect(grid(wrapper).props('editing')).toBe(true)
    })

    it('keeps Save inert until the layout actually changes', async () => {
      const wrapper = await mountPage(items())
      wrapper.vm.enableEditing()
      expect(wrapper.vm.dirty).toBe(false)
      wrapper.vm.dashboardItems.data[0].layout.x = 8
      expect(wrapper.vm.dirty).toBe(true)
    })

    it('never reports itself dirty outside edit mode', async () => {
      const wrapper = await mountPage(items())
      wrapper.vm.enableEditing()
      wrapper.vm.dashboardItems.data[0].layout.x = 8
      wrapper.vm.editing = false
      expect(wrapper.vm.dirty).toBe(false)
    })

    it('restores the snapshot on cancel', async () => {
      // enableEditing has to deep-copy: a shared reference would make the
      // snapshot move with the edits and cancel a no-op.
      const wrapper = await mountPage(items())
      wrapper.vm.enableEditing()
      wrapper.vm.dashboardItems.data[0].layout.x = 8
      wrapper.vm.dashboardItems.data.pop()
      wrapper.vm.cancel()
      expect(wrapper.vm.editing).toBe(false)
      expect(wrapper.vm.dashboardItems.data).toHaveLength(2)
      expect(wrapper.vm.dashboardItems.data[0].layout.x).toBe(0)
    })
  })

  describe('saving the layout', () => {
    it('persists the layout without the chart payloads', async () => {
      const wrapper = await mountPage(items())
      wrapper.vm.enableEditing()
      wrapper.vm.dashboardItems.data[0].layout.x = 8
      wrapper.vm.save()
      const [payload] = wrapper.vm.saveDashboard.submit.mock.calls[0]
      expect(payload.doctype).toBe('CRM Dashboard')
      expect(payload.name).toBe('Manager Dashboard')
      expect(payload.fieldname).toBe('layout')
      const saved = JSON.parse(payload.value)
      expect(saved.map((i) => i.name)).toEqual(['total_leads', 'sales_trend'])
      expect(saved[0].layout.x).toBe(8)
      expect(saved.some((i) => 'data' in i)).toBe(false)
    })

    it('leaves the rendered charts alone while stripping the payload', async () => {
      const wrapper = await mountPage(items())
      wrapper.vm.enableEditing()
      wrapper.vm.save()
      expect(wrapper.vm.dashboardItems.data[0].data.value).toBe(42)
    })

    it('leaves edit mode and refetches once the server accepts it', async () => {
      const wrapper = await mountPage(items())
      wrapper.vm.enableEditing()
      wrapper.vm.saveDashboard.onSuccess()
      expect(wrapper.vm.editing).toBe(false)
      expect(wrapper.vm.dashboardItems.reload).toHaveBeenCalledTimes(1)
    })
  })

  describe('resetting to default', () => {
    it('asks the server for the stock layout', async () => {
      const wrapper = await mountPage(items())
      wrapper.vm.enableEditing()
      wrapper.vm.resetToDefault()
      const reset = api.resources.at(-1)
      expect(reset.url).toBe('xbr_crm.api.dashboard.reset_to_default')
      expect(reset.auto).toBe(true)
    })

    it('drops out of edit mode and refetches when it lands', async () => {
      const wrapper = await mountPage(items())
      wrapper.vm.enableEditing()
      wrapper.vm.resetToDefault()
      api.resources.at(-1).onSuccess()
      expect(wrapper.vm.editing).toBe(false)
      expect(wrapper.vm.dashboardItems.reload).toHaveBeenCalledTimes(1)
    })
  })
})
