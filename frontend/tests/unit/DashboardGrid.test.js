import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'

/**
 * The dashboard's responsive layout.
 *
 * These exist because the failure mode here is invisible to the obvious
 * checks. When the derived layout used two columns at a width where
 * grid-layout-plus renders one, the grid collapsed every `x: 1` item onto
 * `x: 0` — so three of the seven KPI cards were hidden underneath their
 * neighbours. Nothing was clipped, nothing overflowed, and a geometry audit
 * reported the page clean; only looking at it revealed the missing cards.
 *
 * So what is asserted is the invariant that was violated: at any width, no
 * two items may be placed in the same cell, and every item must be placed.
 */
const windowWidth = ref(1440)
vi.mock('@vueuse/core', async (importOriginal) => ({
  ...(await importOriginal()),
  useWindowSize: () => ({ width: windowWidth, height: ref(900) }),
}))

// The grid itself is frappe-ui's; what matters is the layout handed to it.
let receivedLayout = null
let receivedCols = null
vi.mock('frappe-ui', () => ({
  GridLayout: {
    name: 'GridLayout',
    props: ['cols', 'rowHeight', 'disabled', 'modelValue'],
    setup(props) {
      receivedLayout = props.modelValue
      receivedCols = props.cols
      return () => null
    },
  },
}))

const { default: DashboardGrid } =
  await import('@/components/Dashboard/DashboardGrid.vue')

const kpi = (name, x, y) => ({
  name,
  type: 'number_chart',
  data: {},
  layout: { x, y, w: 5, h: 3, i: name },
})
const panel = (name, x) => ({
  name,
  type: 'axis_chart',
  data: {},
  layout: { x, y: 6, w: 10, h: 9, i: name },
})

const ITEMS = [
  kpi('total_leads', 0, 0),
  kpi('ongoing_deals', 7, 0),
  kpi('won_deals', 14, 0),
  kpi('average_won_deal_value', 0, 3),
  kpi('average_deal_value', 5, 3),
  kpi('average_time_to_close_a_lead', 10, 3),
  kpi('average_time_to_close_a_deal', 15, 3),
  panel('sales_trend', 0),
  panel('forecasted_revenue', 10),
]

function mountAt(width) {
  windowWidth.value = width
  receivedLayout = null
  receivedCols = null
  return mount(DashboardGrid, {
    props: { modelValue: ITEMS, editing: false },
  })
}

/** Cells occupied by a placed item, as "x,y" keys. */
function cellsOf(item) {
  const out = []
  for (let dx = 0; dx < item.w; dx++) {
    for (let dy = 0; dy < item.h; dy++)
      out.push(`${item.x + dx},${item.y + dy}`)
  }
  return out
}

describe('DashboardGrid responsive layout', () => {
  beforeEach(() => {
    receivedLayout = null
    receivedCols = null
  })

  it('hands the saved layout through untouched on desktop', () => {
    mountAt(1440)
    expect(receivedCols).toBe(20)
    // Identity, not a copy: the desktop grid IS the editing surface.
    expect(receivedLayout).toEqual(ITEMS.map((i) => i.layout))
  })

  it.each([1440, 1280, 1024])('uses all 20 columns at %ipx', (w) => {
    mountAt(w)
    expect(receivedCols).toBe(20)
  })

  it.each([1023, 900, 820, 769])('pairs KPIs into two columns at %ipx', (w) => {
    mountAt(w)
    expect(receivedCols).toBe(2)
    const kpis = receivedLayout.slice(0, 7)
    expect(kpis.every((l) => l.w === 1)).toBe(true)
    // Charts span the full width.
    expect(receivedLayout.slice(7).every((l) => l.w === 2)).toBe(true)
  })

  it.each([768, 640, 480, 390])('stacks into one column at %ipx', (w) => {
    mountAt(w)
    // grid-layout-plus forces a single column at and below 768 regardless of
    // what we pass, so the derived layout has to agree with it.
    expect(receivedCols).toBe(1)
    expect(receivedLayout.every((l) => l.w === 1)).toBe(true)
    expect(receivedLayout.every((l) => l.x === 0)).toBe(true)
  })

  it.each([1440, 1023, 900, 820, 769, 768, 640, 390])(
    'places every item exactly once, with no two sharing a cell, at %ipx',
    (w) => {
      mountAt(w)
      expect(receivedLayout).toHaveLength(ITEMS.length)
      const seen = new Set()
      for (const item of receivedLayout) {
        for (const cell of cellsOf(item)) {
          expect(seen.has(cell), `two items occupy cell ${cell}`).toBe(false)
          seen.add(cell)
        }
      }
    },
  )

  it('never places an item beyond the last column', () => {
    for (const w of [1440, 900, 820, 768, 390]) {
      mountAt(w)
      for (const item of receivedLayout) {
        expect(item.x + item.w).toBeLessThanOrEqual(receivedCols)
      }
    }
  })

  it('keeps items in their original order', () => {
    mountAt(820)
    expect(receivedLayout.map((l) => l.i)).toEqual(ITEMS.map((i) => i.layout.i))
  })
})
