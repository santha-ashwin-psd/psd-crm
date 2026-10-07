import DashboardItem from '@/components/Dashboard/DashboardItem.vue'
import { mountComponent } from '../helpers/mount'

/**
 * The chart components are stubbed so the assertions are about the card
 * chrome the design specifies — hue, caption, panel header, measure pill —
 * rather than about ECharts. What each stub receives is recorded, which is how
 * the config-stripping is checked from the outside.
 */
const CHART_STUBS = {
  // Each stub declares a `name` so findComponent({ name }) can reach it and
  // read the config the component handed over.
  NumberChart: {
    name: 'NumberChart',
    props: ['config'],
    template: '<div class="number-chart">{{ config.title }}</div>',
  },
  AxisChart: {
    name: 'AxisChart',
    props: ['config'],
    template: '<div class="axis-chart" />',
  },
  DonutChart: {
    name: 'DonutChart',
    props: ['config'],
    template: '<div class="donut-chart" />',
  },
  Tooltip: { name: 'Tooltip', template: '<div><slot /></div>' },
}

function mountItem(item, index = 0, editing = false) {
  return mountComponent(DashboardItem, {
    props: { item, index, editing },
    global: { stubs: CHART_STUBS },
  })
}

const numberChart = (name, data = {}) => ({
  name,
  type: 'number_chart',
  data: { title: 'API title', value: 1, delta: 5, deltaSuffix: '%', ...data },
})

const axisChart = (name, data = {}) => ({
  name,
  type: 'axis_chart',
  data: {
    title: 'Sales trend',
    subtitle: 'Daily performance of leads, deals, and wins',
    yAxis: { title: 'Count' },
    series: [{ name: 'leads' }, { name: 'deals' }, { name: 'won_deals' }],
    // A chart with no rows renders the empty state instead of an empty plot,
    // so anything asserting on the chart itself has to supply some.
    data: [{ date: '2026-01-01', leads: 1 }],
    ...data,
  },
})

describe('DashboardItem', () => {
  describe('KPI cards', () => {
    it('tones a metric by meaning, regardless of position', () => {
      // Dragging a card around the dashboard must not recolour it.
      expect(mountItem(numberChart('won_deals'), 0).html()).toContain(
        'crm-tone-success',
      )
      expect(mountItem(numberChart('won_deals'), 3).html()).toContain(
        'crm-tone-success',
      )
    })

    it('never draws a won metric in the danger tone', () => {
      // The bug this replaced: won_deals was mapped to rose, so the most
      // positive number on the dashboard was drawn in the danger colour.
      const html = mountItem(numberChart('won_deals')).html()
      expect(html).not.toContain('crm-tone-danger')
    })

    it('tones live pipeline metrics as informational', () => {
      expect(mountItem(numberChart('ongoing_deals')).html()).toContain(
        'crm-tone-info',
      )
      expect(mountItem(numberChart('total_leads')).html()).toContain(
        'crm-tone-info',
      )
    })

    it('tones descriptive averages as neutral', () => {
      expect(mountItem(numberChart('average_deal_value')).html()).toContain(
        'crm-tone-neutral',
      )
    })

    it('gives a user-added chart a stable tone, not a positional one', () => {
      const atZero = mountItem(numberChart('my_custom'), 0).html()
      const atThree = mountItem(numberChart('my_custom'), 3).html()
      expect(atZero).toContain('crm-tone-neutral')
      expect(atThree).toContain('crm-tone-neutral')
    })

    it('shows the design caption under the value', () => {
      expect(
        mountItem(numberChart('won_deals')).find('.dash-kpi-caption').text(),
      ).toBe('Total wins')
    })

    it('omits the caption for charts that have none', () => {
      expect(
        mountItem(numberChart('my_custom')).find('.dash-kpi-caption').exists(),
      ).toBe(false)
    })

    it('shortens the title for the narrow card', () => {
      expect(
        mountItem(numberChart('average_time_to_close_a_lead'))
          .find('.number-chart')
          .text(),
      ).toBe('Avg. lead close')
    })

    it('drops the delta on a captioned card', () => {
      const wrapper = mountItem(numberChart('won_deals'))
      const config = wrapper
        .findComponent({ name: 'NumberChart' })
        .props('config')
      expect(config.delta).toBeUndefined()
    })

    it('keeps the delta on an uncaptioned card', () => {
      const wrapper = mountItem(numberChart('my_custom'))
      const config = wrapper
        .findComponent({ name: 'NumberChart' })
        .props('config')
      expect(config.delta).toBe(5)
    })

    it('renders an icon chip', () => {
      expect(
        mountItem(numberChart('won_deals')).find('.dash-kpi-icon').exists(),
      ).toBe(true)
    })
  })

  describe('chart panels', () => {
    it('renders the title and subtitle as HTML', () => {
      const wrapper = mountItem(axisChart('sales_trend'))
      expect(wrapper.find('.dash-panel-title').text()).toBe('Sales trend')
      expect(wrapper.find('.dash-panel-subtitle').text()).toBe(
        'Daily performance of leads, deals, and wins',
      )
    })

    it('strips them from the chart config so they do not draw twice', () => {
      const wrapper = mountItem(axisChart('sales_trend'))
      const config = wrapper
        .findComponent({ name: 'AxisChart' })
        .props('config')
      expect(config.title).toBe('')
      expect(config.subtitle).toBe('')
      expect(config.yAxis.title).toBe('')
    })

    it('shows the measure as a pill', () => {
      expect(
        mountItem(axisChart('sales_trend')).find('.dash-panel-measure').text(),
      ).toBe('Count')
    })

    it('omits the pill when the chart has no y-axis name', () => {
      const wrapper = mountItem(axisChart('sales_trend', { yAxis: {} }))
      expect(wrapper.find('.dash-panel-measure').exists()).toBe(false)
    })

    it('omits the subtitle line when there is none', () => {
      const wrapper = mountItem(axisChart('sales_trend', { subtitle: '' }))
      expect(wrapper.find('.dash-panel-subtitle').exists()).toBe(false)
    })

    it('passes the design series colours through', () => {
      const wrapper = mountItem(axisChart('sales_trend'))
      const config = wrapper
        .findComponent({ name: 'AxisChart' })
        .props('config')
      expect(config.colors).toEqual(['#2563eb', '#16a34a', '#f59e0b'])
    })

    it('renders a panel icon chip', () => {
      expect(
        mountItem(axisChart('sales_trend')).find('.dash-panel-icon').exists(),
      ).toBe(true)
    })
  })

  describe('other item types', () => {
    it('renders a donut chart', () => {
      const wrapper = mountItem({
        name: 'deals_by_stage_donut',
        type: 'donut_chart',
        data: { title: 'By stage', data: [{ name: 'Won', value: 3 }] },
      })
      expect(wrapper.find('.donut-chart').exists()).toBe(true)
    })

    it('shows an empty state instead of a blank plot area', () => {
      // A chart whose query returned nothing used to render axes around an
      // empty box, which reads as a failed load rather than as "nothing yet".
      const wrapper = mountItem({
        name: 'forecasted_revenue',
        type: 'axis_chart',
        data: { title: 'Forecasted revenue', data: [] },
      })
      expect(wrapper.find('.axis-chart').exists()).toBe(false)
      expect(wrapper.text()).toContain('No revenue forecast yet')
      expect(wrapper.text()).toContain('expected value and close date')
    })

    it('gives an empty donut the same treatment', () => {
      const wrapper = mountItem({
        name: 'deals_by_stage',
        type: 'donut_chart',
        data: { title: 'By stage', data: [] },
      })
      expect(wrapper.find('.donut-chart').exists()).toBe(false)
      expect(wrapper.text()).toContain('No open deals')
    })

    it('falls back to honest generic copy for a user-added chart', () => {
      const wrapper = mountItem({
        name: 'my_custom_chart',
        type: 'axis_chart',
        data: { title: 'Mine', data: [] },
      })
      expect(wrapper.text()).toContain('Nothing to show yet')
    })

    it('contains its charts so they cannot bleed past the card edge', () => {
      expect(mountItem(axisChart('sales_trend')).html()).toContain(
        'crm-card--contain',
      )
    })

    it('summarises a single-segment donut instead of ringing it', () => {
      // A donut drawn to say "100%" spends a whole panel on one number.
      const wrapper = mountItem({
        name: 'deals_by_stage_donut',
        type: 'donut_chart',
        data: {
          title: 'Deals by stage',
          categoryColumn: 'stage',
          valueColumn: 'count',
          data: [{ stage: 'Qualification', count: 4 }],
        },
      })
      expect(wrapper.find('.donut-chart').exists()).toBe(false)
      expect(wrapper.find('.dash-solo').exists()).toBe(true)
      expect(wrapper.find('.dash-solo-value').text()).toBe('4')
      expect(wrapper.find('.dash-solo-label').text()).toBe('Qualification')
    })

    it('still draws the ring once there is more than one segment', () => {
      const wrapper = mountItem({
        name: 'deals_by_stage_donut',
        type: 'donut_chart',
        data: {
          title: 'Deals by stage',
          categoryColumn: 'stage',
          valueColumn: 'count',
          data: [
            { stage: 'Qualification', count: 4 },
            { stage: 'Won', count: 2 },
          ],
        },
      })
      expect(wrapper.find('.dash-solo').exists()).toBe(false)
      expect(wrapper.find('.donut-chart').exists()).toBe(true)
    })

    it('renders a spacer as empty outside edit mode', () => {
      const wrapper = mountItem({ name: 'spacer', type: 'spacer' })
      expect(wrapper.text()).toBe('')
      expect(wrapper.html()).toContain('bg-transparent')
    })

    it('outlines the spacer while editing so it can be grabbed', () => {
      const wrapper = mountItem({ name: 'spacer', type: 'spacer' }, 0, true)
      expect(wrapper.text()).toBe('Spacer')
      expect(wrapper.html()).toContain('border-dashed')
    })
  })
})
