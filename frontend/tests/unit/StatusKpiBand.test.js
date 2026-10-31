// Counts and trends come from one get_count per card, so the API is faked and
// answers from a fixture keyed by the filters it receives.
const api = vi.hoisted(() => ({
  total: 0,
  counts: {},
  thisMonth: {},
  lastMonth: {},
}))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    call: vi.fn((_method, { filters }) => {
      // No filters => the total count, of every record.
      if (!filters) return Promise.resolve(api.total)
      // Plain object filters => the total-per-status count.
      if (!Array.isArray(filters)) {
        return Promise.resolve(api.counts[filters.status] ?? 0)
      }
      // Array filters => a month-bounded trend count.
      const status = filters.find((f) => f[0] === 'status')?.[2] ?? '__total__'
      const hasUpperBound = filters.some(
        (f) => f[0] === 'creation' && f[1] === '<',
      )
      const bucket = hasUpperBound ? api.lastMonth : api.thisMonth
      return Promise.resolve(bucket[status] ?? 0)
    }),
  }
})

import { flushPromises } from '@vue/test-utils'
import StatusKpiBand from '@/components/StatusKpiBand.vue'
import { mountComponent } from '../helpers/mount'

const STATUSES = [
  { name: 'Qualification', color: '!text-blue-600' },
  { name: 'Negotiation', color: '!text-orange-600' },
  { name: 'Ready to Close', color: '!text-green-700' },
  { name: 'Won', color: '!text-green-700' },
  { name: 'Lost', color: '!text-red-600' },
]

const wrapper_classes = (w) =>
  w.findAll('button.crm-stat-seg').map((c) => c.classes())

async function mountBand(props = {}) {
  const wrapper = mountComponent(StatusKpiBand, {
    props: {
      doctype: 'CRM Deal',
      statuses: STATUSES,
      totalLabel: 'Total Deals',
      ...props,
    },
  })
  await flushPromises()
  await flushPromises()
  return wrapper
}

const cardText = (wrapper) =>
  wrapper.findAll('button.crm-stat-seg').map((c) => c.text())

describe('StatusKpiBand', () => {
  beforeEach(() => {
    api.total = 10
    api.counts = {
      Qualification: 3,
      Negotiation: 2,
      'Ready to Close': 1,
      Won: 4,
      Lost: 0,
    }
    api.thisMonth = {}
    api.lastMonth = {}
  })

  describe('rendering', () => {
    it('shows skeletons until the counts arrive', () => {
      const wrapper = mountComponent(StatusKpiBand, {
        props: { doctype: 'CRM Deal', statuses: STATUSES },
      })
      expect(wrapper.findAll('.skeleton-shimmer').length).toBeGreaterThan(0)
      expect(wrapper.find('button.crm-stat-seg').exists()).toBe(false)
    })

    it('renders a total card plus one per status', async () => {
      const wrapper = await mountBand()
      expect(wrapper.findAll('button.crm-stat-seg')).toHaveLength(
        STATUSES.length + 1,
      )
    })

    it('caps the status cards, keeping the total', async () => {
      // Deals passes maxStatuses: 4 to get exactly five cards in one row.
      const wrapper = await mountBand({ maxStatuses: 4 })
      expect(wrapper.findAll('button.crm-stat-seg')).toHaveLength(5)
      expect(cardText(wrapper)[0]).toContain('Total Deals')
    })

    it('shows the total count', async () => {
      const wrapper = await mountBand()
      expect(cardText(wrapper)[0]).toContain('10')
    })

    it('counts records with no status in the total', async () => {
      // Counted separately, not summed: a record outside every card still counts.
      api.total = 12
      const wrapper = await mountBand()
      expect(cardText(wrapper)[0]).toContain('12')
    })

    it('shows the total even with no statuses to break it down', async () => {
      const wrapper = await mountBand({ statuses: [] })
      expect(cardText(wrapper)).toHaveLength(1)
      expect(cardText(wrapper)[0]).toContain('10')
    })

    it('shows each status count', async () => {
      const wrapper = await mountBand()
      const cards = cardText(wrapper)
      expect(cards[1]).toContain('Qualification')
      expect(cards[1]).toContain('3')
    })

    it('renders nothing when told not to show', async () => {
      const wrapper = await mountBand({ show: false })
      expect(wrapper.find('.crm-stat-band').exists()).toBe(false)
    })

    it('tones each card by what its status means, not by the stored hue', async () => {
      // STATUSES deliberately gives "Won" and "Ready to Close" the same green
      // and "Qualification" a blue; the band must ignore all of that and read
      // the meaning instead, so a renamed or mis-coloured status still lands
      // on the right tone.
      const cards = wrapper_classes(await mountBand())
      expect(cards[1]).toContain('crm-tone-info') // Qualification
      expect(cards[2]).toContain('crm-tone-warning') // Negotiation
      expect(cards[3]).toContain('crm-tone-success') // Ready to Close
      expect(cards[4]).toContain('crm-tone-success') // Won
      expect(cards[5]).toContain('crm-tone-danger') // Lost
    })

    it('never gives a won status the danger tone', async () => {
      const cards = wrapper_classes(await mountBand())
      expect(cards[4]).not.toContain('crm-tone-danger')
    })
  })

  describe('month-over-month trend', () => {
    it('reads as a rise when this month beats last', async () => {
      api.thisMonth = { __total__: 10 }
      api.lastMonth = { __total__: 5 }
      const wrapper = await mountBand()
      expect(cardText(wrapper)[0]).toContain('↑ 100% vs last month')
    })

    it('reads as a fall when this month trails last', async () => {
      api.thisMonth = { __total__: 5 }
      api.lastMonth = { __total__: 10 }
      const wrapper = await mountBand()
      expect(cardText(wrapper)[0]).toContain('↓ 50% vs last month')
    })

    it('calls any first activity a 100% rise', async () => {
      // No prior month to divide by — the alternative is a division by zero.
      api.thisMonth = { __total__: 7 }
      api.lastMonth = { __total__: 0 }
      const wrapper = await mountBand()
      expect(cardText(wrapper)[0]).toContain('↑ 100% vs last month')
    })

    it('reads as flat when both months are empty', async () => {
      api.thisMonth = { __total__: 0 }
      api.lastMonth = { __total__: 0 }
      const wrapper = await mountBand()
      expect(cardText(wrapper)[0]).toContain('No change vs last month')
      const trends = wrapper.findAll('.crm-stat-trend')
      expect(trends[0].classes()).toContain('crm-stat-trend--muted')
    })

    it('colours a rise green and a fall red', async () => {
      api.thisMonth = { __total__: 10, Qualification: 1 }
      api.lastMonth = { __total__: 5, Qualification: 10 }
      const wrapper = await mountBand()
      const trends = wrapper.findAll('.crm-stat-trend')
      expect(trends[0].classes()).toContain('crm-stat-trend--good')
      expect(trends[1].classes()).toContain('crm-stat-trend--bad')
    })

    it('colours a rise in a bad status red and a fall green', async () => {
      // More Lost is bad news even though the number went up.
      api.thisMonth = { Lost: 4, Won: 1 }
      api.lastMonth = { Lost: 2, Won: 2 }
      const wrapper = await mountBand()
      const trends = wrapper.findAll('.crm-stat-trend')
      expect(cardText(wrapper)[5]).toContain('↑ 100%')
      expect(trends[5].classes()).toContain('crm-stat-trend--bad') // Lost
      expect(trends[4].classes()).toContain('crm-stat-trend--bad') // Won fell
    })
  })

  describe('filtering', () => {
    it('emits null from the total card, meaning "no filter"', async () => {
      const wrapper = await mountBand()
      await wrapper.findAll('button.crm-stat-seg')[0].trigger('click')
      expect(wrapper.emitted('filter')[0]).toEqual([null])
    })

    it('emits the status name from a status card', async () => {
      const wrapper = await mountBand()
      await wrapper.findAll('button.crm-stat-seg')[1].trigger('click')
      expect(wrapper.emitted('filter')[0]).toEqual(['Qualification'])
    })

    it('marks the total card active when no filter is applied', async () => {
      const wrapper = await mountBand({ activeStatus: null })
      expect(wrapper.findAll('button.crm-stat-seg')[0].classes()).toContain(
        'is-selected',
      )
    })

    it('moves the highlight to the filtered status', async () => {
      const wrapper = await mountBand({ activeStatus: 'Qualification' })
      const cards = wrapper.findAll('button.crm-stat-seg')
      expect(cards[0].classes()).not.toContain('is-selected')
      expect(cards[1].classes()).toContain('is-selected')
    })

    it('highlights exactly one card', async () => {
      const wrapper = await mountBand({ activeStatus: 'Won' })
      expect(wrapper.findAll('.is-selected')).toHaveLength(1)
    })
  })

  describe('icons', () => {
    it('picks a glyph from the status wording', async () => {
      const wrapper = await mountBand()
      const icons = wrapper
        .findAll('.crm-stat-icon svg')
        .map((i) => i.classes().join(' '))
      // Won -> award, Lost -> x-circle, Qualification -> check-circle.
      expect(icons.some((c) => c.includes('feather-award'))).toBe(true)
      expect(icons.some((c) => c.includes('feather-x-circle'))).toBe(true)
      expect(icons.some((c) => c.includes('feather-check-circle'))).toBe(true)
    })

    it('uses the layers glyph for the total card', async () => {
      const wrapper = await mountBand()
      expect(
        wrapper.findAll('.crm-stat-icon svg')[0].classes().join(' '),
      ).toContain('feather-layers')
    })
  })
})
