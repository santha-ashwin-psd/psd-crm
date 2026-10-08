// The dashboard draws through a slim ECharts (src/utils/echarts.js, aliased for
// frappe-ui's `import { init } from 'echarts'`). A chart type or component that
// is used but not registered is silently not drawn: ECharts only logs it. This
// renders every kind of chart the dashboard builds and fails on such a log.
import { init } from 'echarts'
import useAxisChartOptions from '../../node_modules/frappe-ui/src/components/Charts/axisChartOptions'
import useDonutChartOptions from '../../node_modules/frappe-ui/src/components/Charts/donutChartOptions'
import getFunnelChartOptions from '../../node_modules/frappe-ui/src/components/Charts/funnelChartOptions'

const rows = [
  { stage: 'Qualification', date: '2026-09-01', count: 5, value: 1000, won: 2 },
  { stage: 'Demo', date: '2026-09-08', count: 3, value: 800, won: 1 },
  { stage: 'Won', date: '2026-09-15', count: 1, value: 500, won: 1 },
]

const CHARTS = {
  'bar, with title and subtitle': useAxisChartOptions({
    data: rows,
    title: 'Pipelines by stage',
    subtitle: 'This month',
    xAxis: { key: 'stage', type: 'category', title: 'Stage' },
    yAxis: { title: 'Count' },
    series: [{ name: 'count', type: 'bar' }],
  }),
  'stacked bars, swapped axes': useAxisChartOptions({
    data: rows,
    title: 'By owner',
    xAxis: { key: 'stage', type: 'category' },
    yAxis: {},
    swapXY: true,
    stacked: true,
    series: [
      { name: 'count', type: 'bar' },
      { name: 'won', type: 'bar' },
    ],
  }),
  'line and area on a time axis, second y-axis, legend': useAxisChartOptions({
    data: rows,
    title: 'Sales trend',
    xAxis: { key: 'date', type: 'time', timeGrain: 'week' },
    yAxis: { title: 'Value' },
    y2Axis: { title: 'Count' },
    series: [
      { name: 'value', type: 'line', showDataPoints: true },
      { name: 'won', type: 'area' },
      { name: 'count', type: 'line', axis: 'y2' },
    ],
  }),
  'donut with a scrolling legend': useDonutChartOptions({
    data: Array.from({ length: 15 }, (_, i) => ({
      source: `Source ${i}`,
      count: i + 1,
    })),
    title: 'Pipelines by source',
    categoryColumn: 'source',
    valueColumn: 'count',
  }),
  funnel: getFunnelChartOptions({
    data: rows,
    title: 'Stage funnel',
    categoryColumn: 'stage',
    valueColumn: 'count',
  }),
}

describe('slim ECharts', () => {
  let logs
  beforeEach(() => {
    logs = []
    for (const level of ['warn', 'error']) {
      vi.spyOn(console, level).mockImplementation((...args) =>
        logs.push(args.join(' ')),
      )
    }
  })
  afterEach(() => vi.restoreAllMocks())

  for (const [name, option] of Object.entries(CHARTS)) {
    it(`draws: ${name}`, () => {
      const el = document.createElement('div')
      const chart = init(el, 'light', {
        renderer: 'svg',
        width: 600,
        height: 400,
      })
      chart.setOption(option)
      const missing = logs.filter((l) =>
        /not imported|not exists|Unknown series/i.test(l),
      )
      expect(missing).toEqual([])
      // Every series type in the option was registered and drawn.
      const wanted = option.series.map((s) => s.type)
      const drawn = chart
        .getModel()
        .getSeries()
        .map((s) => s.subType)
      expect(drawn).toEqual(wanted)
      chart.dispose()
    })
  }
})
