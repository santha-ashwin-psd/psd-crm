import {
  iconFor,
  hueFor,
  donutSegments,
  isSingleSegment,
  segmentTotal,
  captionFor,
  compactConfig,
  measureFor,
  headlessConfig,
  SERIES_COLORS,
} from '@/utils/dashboardCards'

describe('iconFor', () => {
  it('matches forecast before the revenue rule', () => {
    // "forecasted_revenue" matches both /forecast/ and /revenue/; order decides.
    expect(iconFor('forecasted_revenue')).toBe('bar-chart-2')
  })

  it('gives trend charts a trending glyph', () => {
    expect(iconFor('sales_trend')).toBe('trending-up')
  })

  it('does not put a clock on every average_* chart', () => {
    // Regression: /age/ matches the "age" inside "average".
    expect(iconFor('average_deal_value')).not.toBe('clock')
    expect(iconFor('average_deal_value')).toBe('dollar-sign')
  })

  it('matches time-to-close charts to a clock', () => {
    expect(iconFor('average_time_to_close_a_lead')).toBe('clock')
    expect(iconFor('average_time_to_close_a_deal')).toBe('clock')
  })

  it('resolves the remaining wording rules', () => {
    expect(iconFor('won_deals')).toBe('award')
    expect(iconFor('lost_deal_reasons')).toBe('x-circle')
    expect(iconFor('ongoing_deals')).toBe('trending-up')
    expect(iconFor('total_leads')).toBe('user-plus')
    expect(iconFor('deals_by_stage')).toBe('briefcase')
    expect(iconFor('deals_by_salesperson')).toBe('briefcase')
    expect(iconFor('team_activity')).toBe('users')
  })

  it('is case insensitive', () => {
    expect(iconFor('WON_DEALS')).toBe('award')
  })

  it('falls back to a bar chart for unknown and empty names', () => {
    expect(iconFor('something_custom')).toBe('bar-chart-2')
    expect(iconFor('')).toBe('bar-chart-2')
    expect(iconFor(null)).toBe('bar-chart-2')
    expect(iconFor(undefined)).toBe('bar-chart-2')
  })
})

describe('hueFor', () => {
  it('assigns a stable tone per metric, ignoring position', () => {
    // The point: the same chart keeps its colour wherever it is dragged.
    expect(hueFor('total_leads', 0)).toBe('crm-tone-info')
    expect(hueFor('total_leads', 3)).toBe('crm-tone-info')
    expect(hueFor('total_leads', 11)).toBe('crm-tone-info')
  })

  it('tones each known metric by what it means', () => {
    expect(hueFor('won_deals', 0)).toBe('crm-tone-success')
    expect(hueFor('average_won_deal_value', 0)).toBe('crm-tone-success')
    expect(hueFor('lost_deals', 0)).toBe('crm-tone-danger')
    expect(hueFor('ongoing_deals', 0)).toBe('crm-tone-info')
    expect(hueFor('average_deal_value', 0)).toBe('crm-tone-neutral')
    expect(hueFor('average_time_to_close_a_lead', 0)).toBe('crm-tone-neutral')
    expect(hueFor('average_time_to_close_a_deal', 0)).toBe('crm-tone-neutral')
  })

  it('never gives a won metric the danger tone', () => {
    // The defect this replaced: won_deals mapped to rose (the danger colour).
    for (const m of ['won_deals', 'average_won_deal_value']) {
      expect(hueFor(m, 0)).not.toBe('crm-tone-danger')
    }
  })

  it('infers a tone for a user-added chart from its wording', () => {
    expect(hueFor('deals_won_this_quarter', 0)).toBe('crm-tone-success')
    expect(hueFor('churned_accounts', 0)).toBe('crm-tone-danger')
    expect(hueFor('open_pipeline', 0)).toBe('crm-tone-info')
  })

  it('falls back to neutral, never to a positional cycle', () => {
    // Position must not influence colour at all.
    expect(hueFor('my_custom_chart', 0)).toBe('crm-tone-neutral')
    expect(hueFor('my_custom_chart', 1)).toBe('crm-tone-neutral')
    expect(hueFor('my_custom_chart', 9)).toBe('crm-tone-neutral')
  })
})

describe('captionFor', () => {
  it('returns the design caption for mapped metrics', () => {
    expect(captionFor('total_leads')).toBe('All time')
    expect(captionFor('ongoing_deals')).toBe('Currently open')
    expect(captionFor('won_deals')).toBe('Total wins')
    expect(captionFor('average_won_deal_value')).toBe('Per won deal')
    expect(captionFor('average_deal_value')).toBe('Per open deal')
    expect(captionFor('average_time_to_close_a_deal')).toBe('For open deals')
    expect(captionFor('average_time_to_close_a_lead')).toBe('All time')
  })

  it('returns an empty string for unmapped charts', () => {
    // The template keys `v-if` off this, so it must be falsy, not undefined.
    expect(captionFor('average_ongoing_deal_value')).toBe('')
    expect(captionFor('unknown')).toBe('')
    expect(captionFor(undefined)).toBe('')
  })
})

describe('compactConfig', () => {
  const base = {
    title: 'Average time to close a lead',
    value: 12,
    delta: 8.5,
    deltaSuffix: '%',
    tooltip: 'full wording',
  }

  it('shortens the title for narrow cards', () => {
    const config = compactConfig({
      name: 'average_time_to_close_a_lead',
      data: base,
    })
    expect(config.title).toBe('Avg. lead close')
  })

  it('drops the delta on captioned cards', () => {
    // The caption replaces the delta; NumberChart v-ifs on `config.delta`, so
    // removing the key is what actually hides the row.
    const config = compactConfig({ name: 'won_deals', data: { ...base } })
    expect(config).not.toHaveProperty('delta')
    expect(config).not.toHaveProperty('deltaPrefix')
    expect(config).not.toHaveProperty('deltaSuffix')
  })

  it('keeps the delta on cards without a caption', () => {
    const config = compactConfig({
      name: 'average_ongoing_deal_value',
      data: { ...base },
    })
    expect(config.delta).toBe(8.5)
  })

  it('preserves every other key', () => {
    const config = compactConfig({ name: 'won_deals', data: { ...base } })
    expect(config.value).toBe(12)
    expect(config.tooltip).toBe('full wording')
  })

  it('returns the API config untouched for unknown charts', () => {
    const data = { ...base }
    const config = compactConfig({ name: 'user_added', data })
    expect(config).toBe(data)
  })

  it('does not mutate the source data', () => {
    const data = { ...base }
    compactConfig({ name: 'won_deals', data })
    expect(data.delta).toBe(8.5)
    expect(data.title).toBe('Average time to close a lead')
  })
})

describe('measureFor', () => {
  it('reads the y-axis title', () => {
    expect(measureFor({ data: { yAxis: { title: 'Count' } } })).toBe('Count')
    expect(measureFor({ data: { yAxis: { title: 'Revenue (₹)' } } })).toBe(
      'Revenue (₹)',
    )
  })

  it('returns an empty string when there is no axis or title', () => {
    expect(measureFor({ data: { yAxis: {} } })).toBe('')
    expect(measureFor({ data: {} })).toBe('')
    expect(measureFor({})).toBe('')
    expect(measureFor(undefined)).toBe('')
  })
})

describe('headlessConfig', () => {
  const salesTrend = {
    title: 'Sales trend',
    subtitle: 'Daily performance of leads, deals, and wins',
    yAxis: { title: 'Count' },
    xAxis: { title: 'Date', key: 'date' },
    series: [{ name: 'leads' }, { name: 'deals' }, { name: 'won_deals' }],
  }

  it('strips the title and subtitle so they do not draw twice', () => {
    // The panel renders these as HTML; left in the config ECharts paints them
    // inside the SVG as well.
    const config = headlessConfig({ data: salesTrend })
    expect(config.title).toBe('')
    expect(config.subtitle).toBe('')
  })

  it('strips the y-axis name but keeps the rest of the axis', () => {
    const config = headlessConfig({ data: salesTrend })
    expect(config.yAxis.title).toBe('')
    expect(config.xAxis).toEqual({ title: 'Date', key: 'date' })
  })

  it('applies the design series colours in series order', () => {
    const config = headlessConfig({ data: salesTrend })
    expect(config.colors).toEqual([
      SERIES_COLORS.leads,
      SERIES_COLORS.deals,
      SERIES_COLORS.won_deals,
    ])
  })

  it('colours the forecast chart from the same map', () => {
    const config = headlessConfig({
      data: {
        ...salesTrend,
        series: [{ name: 'forecasted' }, { name: 'actual' }],
      },
    })
    expect(config.colors).toEqual([
      SERIES_COLORS.forecasted,
      SERIES_COLORS.actual,
    ])
  })

  it('leaves colours unset when any series is unknown', () => {
    // Half a palette is worse than none — ECharts would mix our hues with its
    // own defaults.
    const config = headlessConfig({
      data: { ...salesTrend, series: [{ name: 'leads' }, { name: 'mystery' }] },
    })
    expect(config.colors).toBeUndefined()
  })

  it('leaves colours unset when there are no series', () => {
    const config = headlessConfig({ data: { ...salesTrend, series: [] } })
    expect(config.colors).toBeUndefined()
  })

  it('handles a config with no series key at all', () => {
    const config = headlessConfig({ data: { title: 'x' } })
    expect(config.colors).toBeUndefined()
    expect(config.title).toBe('')
  })

  it('does not mutate the source data', () => {
    const data = JSON.parse(JSON.stringify(salesTrend))
    headlessConfig({ data })
    expect(data.title).toBe('Sales trend')
    expect(data.yAxis.title).toBe('Count')
  })

  describe('single-series charts get one colour', () => {
    // The funnel arrives from the API asking ECharts to colour by data point,
    // which painted six pipeline stages in six unrelated hues.
    const funnel = {
      title: 'Funnel conversion',
      series: [
        { name: 'count', type: 'bar', echartOptions: { colorBy: 'data' } },
      ],
    }

    it('overrides colorBy:data so the bars share one hue', () => {
      const config = headlessConfig({ data: funnel })
      expect(config.series[0].echartOptions.colorBy).toBe('series')
      expect(config.colors).toEqual([SERIES_COLORS.leads])
    })

    it('keeps the rest of the series definition intact', () => {
      const config = headlessConfig({ data: funnel })
      expect(config.series[0].name).toBe('count')
      expect(config.series[0].type).toBe('bar')
    })

    it('colours a single series that carries no echartOptions', () => {
      // lost_deal_reasons — already one colour visually, but it should come
      // from our palette rather than whatever ECharts picks first.
      const config = headlessConfig({
        data: { title: 'Lost reasons', series: [{ name: 'count' }] },
      })
      expect(config.colors).toEqual([SERIES_COLORS.leads])
      expect(config.series[0].echartOptions.colorBy).toBe('series')
    })

    it('leaves a two-series chart alone', () => {
      // deals_by_territory is a bar plus a line; collapsing it to one colour
      // would make the two measures indistinguishable.
      const config = headlessConfig({
        data: {
          title: 'By territory',
          series: [{ name: 'deals' }, { name: 'value', type: 'line' }],
        },
      })
      expect(config.colors).toBeUndefined()
      expect(config.series[1].echartOptions).toBeUndefined()
    })

    it('still prefers an exact SERIES_COLORS match for one known series', () => {
      const config = headlessConfig({
        data: { title: 'Leads', series: [{ name: 'leads' }] },
      })
      expect(config.colors).toEqual([SERIES_COLORS.leads])
      // The mapped branch wins, so the series is passed through untouched.
      expect(config.series[0].echartOptions).toBeUndefined()
    })

    it('does not mutate the source series', () => {
      const data = JSON.parse(JSON.stringify(funnel))
      headlessConfig({ data })
      expect(data.series[0].echartOptions.colorBy).toBe('data')
    })
  })
})

describe('donut segments', () => {
  const donut = (rows) => ({
    name: 'deals_by_stage_donut',
    type: 'donut_chart',
    data: { categoryColumn: 'stage', valueColumn: 'count', data: rows },
  })

  it('reads label and value from the config, not a fixed shape', () => {
    expect(donutSegments(donut([{ stage: 'Won', count: 3 }]))).toEqual([
      { label: 'Won', value: 3 },
    ])
  })

  it('drops zero-valued rows — they draw no arc', () => {
    const item = donut([
      { stage: 'Won', count: 3 },
      { stage: 'Lost', count: 0 },
    ])
    expect(donutSegments(item)).toHaveLength(1)
    expect(isSingleSegment(item)).toBe(true)
  })

  it('detects the single-segment case a 100% ring would represent badly', () => {
    expect(isSingleSegment(donut([{ stage: 'Qualification', count: 4 }]))).toBe(
      true,
    )
    expect(
      isSingleSegment(
        donut([
          { stage: 'Won', count: 1 },
          { stage: 'Lost', count: 2 },
        ]),
      ),
    ).toBe(false)
  })

  it('is not confused by a missing or malformed payload', () => {
    expect(donutSegments(undefined)).toEqual([])
    expect(donutSegments({ data: null })).toEqual([])
    expect(donutSegments({ data: { data: [{ a: 1 }] } })).toEqual([])
    expect(isSingleSegment(undefined)).toBe(false)
  })

  it('totals the segments', () => {
    expect(
      segmentTotal(
        donut([
          { stage: 'Won', count: 3 },
          { stage: 'Lost', count: 2 },
        ]),
      ),
    ).toBe(5)
    expect(segmentTotal(donut([]))).toBe(0)
  })
})
