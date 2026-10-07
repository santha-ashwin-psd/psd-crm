import { isLeadsEnabled } from '@/utils/leads'

/**
 * Presentation logic for the dashboard's KPI cards and chart panels.
 *
 * Extracted from `components/Dashboard/DashboardItem.vue` so it can be unit
 * tested: everything here is pure and keyed on the chart's `name` (the stable
 * API identifier, e.g. `total_leads`), never on its title, so translation and
 * reordering cannot change what a card looks like.
 */

/**
 * Feather icon name for a chart, matched on wording so user-added charts still
 * get a sensible glyph instead of falling out of a fixed lookup.
 *
 * @param {string} name - Chart identifier, e.g. `average_won_deal_value`.
 * @returns {string} A feather icon name.
 */
export function iconFor(name) {
  const n = (name || '').toLowerCase()
  // `forecast` before the value/revenue rule — "forecasted_revenue" matches
  // both, and the panel wants the chart glyph, not a currency sign.
  if (/forecast/.test(n)) return 'bar-chart-2'
  if (/trend/.test(n)) return 'trending-up'
  // Match `time_to_close`/`duration` only — a bare `age` also matches the
  // "age" inside "average", which put a clock on every average_* chart.
  if (/time_to_close|duration/.test(n)) return 'clock'
  if (/value|revenue|amount/.test(n)) return 'dollar-sign'
  if (/won/.test(n)) return 'award'
  if (/lost|reject/.test(n)) return 'x-circle'
  if (/ongoing|progress|open/.test(n)) return 'trending-up'
  if (/lead/.test(n)) return 'user-plus'
  if (/deal/.test(n)) return 'briefcase'
  if (/user|salesperson|team/.test(n)) return 'users'
  return 'bar-chart-2'
}

/**
 * Short display titles. KPI cards are narrow and the API titles are written
 * for a wider context ("Avg. time to close a lead" ellipsized to "Avg. time to
 * c…", making the lead and deal cards indistinguishable). The API title is
 * untouched; the tooltip still carries the full wording.
 *
 * @type {Object<string, () => string>}
 */
export const SHORT_TITLES = {
  total_leads: () => __('Total leads'),
  ongoing_deals: () => __('Ongoing deals'),
  won_deals: () => __('Won deals'),
  average_deal_value: () => __('Avg. deal value'),
  average_won_deal_value: () => __('Avg. won value'),
  average_ongoing_deal_value: () => __('Avg. open value'),
  average_time_to_close_a_lead: () => __('Avg. lead close'),
  average_time_to_close_a_deal: () => __('Avg. deal close'),
}

/**
 * Static caption shown under a card's value. Where a card has one it replaces
 * the month-over-month delta — "Won deals / 0 / Total wins" says what the
 * number counts, which a percentage cannot.
 *
 * @type {Object<string, () => string>}
 */
export const CAPTIONS = {
  total_leads: () => __('All time'),
  average_time_to_close_a_lead: () => __('All time'),
  ongoing_deals: () => __('Currently open'),
  won_deals: () => __('Total wins'),
  average_won_deal_value: () => __('Per won deal'),
  average_deal_value: () => __('Per open deal'),
  average_time_to_close_a_deal: () => __('For open deals'),
}

/**
 * Semantic tone per metric.
 *
 * Previously this was a hue table (`card-kpi-blue|emerald|rose|teal`) keyed on
 * the metric name, backed by a four-colour cycle keyed on the card's POSITION.
 * Two things were wrong with it. Position-keyed colour meant a metric changed
 * colour whenever the dashboard was rearranged, and the hue table itself
 * carried no meaning: `won_deals` was mapped to rose, so the single most
 * positive number on the dashboard was drawn in the danger colour.
 *
 * Tone is now derived from what the metric MEANS:
 *
 *   success   an outcome worth celebrating (won deals, won value)
 *   danger    an outcome to worry about (lost deals)
 *   info      live pipeline activity (open leads, ongoing deals)
 *   neutral   descriptive statistics — averages, durations, counts that are
 *             neither good nor bad on their own
 *
 * A metric with no clear valence gets `neutral`, never a rotating colour.
 *
 * @type {Object<string, string>}
 */
export const METRIC_TONES = {
  won_deals: 'success',
  average_won_deal_value: 'success',
  lost_deals: 'danger',
  average_lost_deal_value: 'danger',
  total_leads: 'info',
  ongoing_deals: 'info',
  average_ongoing_deal_value: 'info',
  average_deal_value: 'neutral',
  average_time_to_close_a_lead: 'neutral',
  average_time_to_close_a_deal: 'neutral',
}

/**
 * Fallback for a metric that is not in {@link METRIC_TONES} — a chart a user
 * added themselves. Matched on wording, mirroring utils/statusTheme: whole
 * words only, negative senses tested before the positive ones they contain.
 *
 * @param {string} name
 * @returns {string} a tone name
 */
function inferTone(name) {
  const words = String(name || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
  const has = (...w) => w.some((x) => words.includes(x))
  if (has('lost', 'churn', 'churned', 'failed', 'overdue')) return 'danger'
  if (has('won', 'converted', 'completed', 'closed')) return 'success'
  if (has('open', 'ongoing', 'active', 'pipeline', 'new')) return 'info'
  return 'neutral'
}

/**
 * CSS class carrying a card's tone.
 *
 * Callers still pass a positional `index` (extra arguments are simply
 * ignored in JS), but it is deliberately not a parameter any more: a metric's
 * colour must not depend on where it sits on the dashboard.
 *
 * @param {string} name - Chart identifier, e.g. `won_deals`.
 * @returns {string} One of the `crm-tone-*` class names.
 */
export function hueFor(name) {
  return `crm-tone-${METRIC_TONES[name] || inferTone(name)}`
}

/**
 * Caption text for a card, or `''` when it has none.
 *
 * @param {string} name - Chart identifier.
 * @returns {string}
 */
export function captionFor(name) {
  const caption = CAPTIONS[name]
  return caption ? caption() : ''
}

/**
 * NumberChart config for a KPI card: short title, and no delta on cards that
 * show a caption instead. The delta row is `v-if`-gated inside NumberChart, so
 * deleting the key is enough — no CSS needed to hide it.
 *
 * @param {{name: string, data: Object}} item - Dashboard item from the API.
 * @returns {Object} A config safe to hand to NumberChart.
 */
export function compactConfig(item) {
  const short = SHORT_TITLES[item.name]
  const captioned = Boolean(CAPTIONS[item.name])
  // Unknown / user-added charts keep whatever the API gave them.
  if (!short && !captioned) return item.data
  const config = { ...item.data }
  if (short) config.title = short()
  if (captioned) {
    delete config.delta
    delete config.deltaPrefix
    delete config.deltaSuffix
  }
  return config
}

/**
 * The measure shown top-right of a chart panel ("Count", "Revenue (₹)"). It is
 * the y-axis name, which ECharts otherwise prints as a cramped `↑ Count` label
 * in the plot's top-left corner.
 *
 * @param {{data?: Object}} item - Dashboard item from the API.
 * @returns {string} The measure label, or `''` when the chart has no y-axis.
 */
export function measureFor(item) {
  return item?.data?.yAxis?.title || ''
}

/**
 * Series colours, since the API never sets any and ECharts falls back to its
 * stock palette. Keyed by series name so a reordered config keeps its hues.
 *
 * @type {Object<string, string>}
 */
export const SERIES_COLORS = {
  leads: '#2563eb',
  deals: '#16a34a',
  won_deals: '#f59e0b',
  forecasted: '#2563eb',
  actual: '#f59e0b',
}

/**
 * Chart config with the title, subtitle and y-axis name stripped, because the
 * panel renders those as HTML — left in place they draw a second time inside
 * the SVG. Series colours are applied only when every series is known, so a
 * partially-mapped chart keeps one consistent palette rather than a mix.
 *
 * SINGLE-SERIES CHARTS
 *
 * The funnel arrives from the API carrying `echartOptions: { colorBy: 'data' }`
 * on its one series, which tells ECharts to give every data point a different
 * hue from its default palette. Six pipeline stages therefore rendered in six
 * unrelated colours — encoding a bar's POSITION, when the only thing a funnel
 * bar means is its LENGTH. One series gets one colour, which says that plainly
 * and keeps the brief's rule that colour must carry meaning.
 *
 * The `length === 1` guard matters: a two-series chart (deals_by_territory and
 * deals_by_salesperson are bar + line) genuinely needs two colours, and must
 * not be collapsed to one.
 *
 * @param {{data: Object}} item - Dashboard item from the API.
 * @returns {Object} A config safe to hand to AxisChart.
 */
export function headlessConfig(item) {
  const config = { ...item.data, title: '', subtitle: '' }
  if (config.yAxis) config.yAxis = { ...config.yAxis, title: '' }
  const series = config.series || []
  const colors = series.map((s) => SERIES_COLORS[s.name]).filter(Boolean)
  if (colors.length === series.length && colors.length) {
    config.colors = colors
  } else if (series.length === 1) {
    config.series = series.map((s) => ({
      ...s,
      echartOptions: { ...(s.echartOptions || {}), colorBy: 'series' },
    }))
    config.colors = [SERIES_COLORS.leads]
  }
  return withTranslatedSeries(config)
}

/**
 * Chart legends and tooltips are drawn from the series *key* ("won_deals" →
 * "Won Deals"), which never passes through the translation layer. Where a key's
 * label has a translation (in the "Chart series" context, so a legend can read
 * "Pipelines" while the module is "Pipeline"), rename the key in the series and
 * in every data row so the chart shows the translated label.
 *
 * @param {object} config - An axis chart config.
 * @returns {object} The config, with translated series keys where they apply.
 */
function withTranslatedSeries(config) {
  const renames = {}
  for (const s of config.series || []) {
    const label = s.name
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
    const translated = __(label, null, 'Chart series')
    if (translated !== label) renames[s.name] = translated
  }
  if (!Object.keys(renames).length) return config

  return {
    ...config,
    series: config.series.map((s) => ({
      ...s,
      name: renames[s.name] || s.name,
    })),
    data: (config.data || []).map((row) => {
      const out = {}
      for (const [key, value] of Object.entries(row))
        out[renames[key] || key] = value
      return out
    }),
  }
}

/**
 * Does a chart actually have rows to draw?
 *
 * The dashboard API returns `{ ..., data: result or [] }` for every chart, so
 * an empty result is a well-formed config with nothing in it — which renders
 * as an axis and a blank plot area. That reads as a failed load rather than as
 * "there is nothing here yet", which is what the empty state is for.
 *
 * @param {object} item - A dashboard layout item.
 * @returns {boolean} true when there is at least one row to plot.
 */
export function hasChartData(item) {
  const rows = item?.data?.data
  return Array.isArray(rows) && rows.length > 0
}

/**
 * Copy for an empty chart: what is missing, and what would fill it.
 *
 * Deliberately specific per chart — "No data" tells a user nothing, whereas
 * "Add deals with an expected close date" tells them exactly which record and
 * which field. No fake data is ever substituted; the panel stays empty and
 * simply explains itself.
 *
 * @type {Object<string, () => {title: string, description: string}>}
 */
export const EMPTY_CHART_COPY = {
  forecasted_revenue: () => ({
    title: __('No revenue forecast yet'),
    description: __(
      'Add deals with an expected value and close date to see your forecast.',
    ),
  }),
  sales_trend: () => ({
    title: __('No activity in this period'),
    description: isLeadsEnabled()
      ? __('Leads and deals created in this range will appear here.')
      : __('Deals created in this range will appear here.'),
  }),
  funnel_conversion: () => ({
    title: __('No conversions yet'),
    description: isLeadsEnabled()
      ? __('Convert a lead to a deal to see the funnel.')
      : __('Move deals through their stages to see the funnel.'),
  }),
  deals_by_stage: () => ({
    title: __('No open deals'),
    description: __('Deals will be grouped by their stage here.'),
  }),
  leads_by_source: () => ({
    title: __('No lead sources recorded'),
    description: __('Set a source on your leads to see this breakdown.'),
  }),
  deals_by_source: () => ({
    title: __('No deal sources recorded'),
    description: __('Set a source on your deals to see this breakdown.'),
  }),
}

/**
 * Empty-state copy for a chart, falling back to something honest and generic
 * for a chart a user added themselves.
 *
 * @param {object} item - A dashboard layout item.
 * @returns {{title: string, description: string}}
 */
export function emptyChartCopy(item) {
  const build = EMPTY_CHART_COPY[item?.name]
  if (build) return build()
  return {
    title: __('Nothing to show yet'),
    description: __('This chart will fill in as matching records are added.'),
  }
}

/**
 * The plottable segments of a donut chart, as `{label, value}`.
 *
 * The dashboard API describes each donut with `categoryColumn` / `valueColumn`
 * naming which keys of a row carry the label and the number (e.g. `stage` and
 * `count` for "Deals by stage"), so this reads the config rather than assuming
 * a shape. Zero-valued rows are dropped: they contribute no arc and would
 * otherwise count towards "how many segments are there".
 *
 * @param {object} item - A dashboard layout item of type `donut_chart`.
 * @returns {Array<{label: string, value: number}>}
 */
export function donutSegments(item) {
  const rows = item?.data?.data
  const categoryKey = item?.data?.categoryColumn
  const valueKey = item?.data?.valueColumn
  if (!Array.isArray(rows) || !categoryKey || !valueKey) return []
  return rows
    .map((row) => ({
      label: row[categoryKey],
      value: Number(row[valueKey]) || 0,
    }))
    .filter((segment) => segment.value > 0)
}

/**
 * Is this donut a single segment at 100%?
 *
 * A one-segment donut is a ring that says "100%" — it draws a large circle to
 * communicate a single number, which is the least informative use of the
 * space on the page. Callers render a compact summary instead. This is not an
 * empty state: the data is real and worth showing, just not as a ring.
 *
 * @param {object} item
 * @returns {boolean}
 */
export function isSingleSegment(item) {
  return donutSegments(item).length === 1
}

/**
 * Sum of a donut's segment values — the denominator behind each percentage.
 *
 * @param {object} item
 * @returns {number}
 */
export function segmentTotal(item) {
  return donutSegments(item).reduce((total, s) => total + s.value, 0)
}
