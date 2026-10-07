import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'

vi.mock('@/stores/meta', () => ({
  getMeta: () => ({
    getFormattedCurrency: (field, doc) => `₹ ${Number(doc[field]).toFixed(2)}`,
  }),
}))
vi.mock('@/stores/users', () => ({
  usersStore: () => ({
    getUser: (u) =>
      u === 'ada@crm.test' ? { full_name: 'Ada Lovelace' } : null,
  }),
}))
vi.mock('@/stores/statuses', () => ({
  statusesStore: () => ({
    dealStatuses: {
      data: [
        { name: 'Qualification', position: 1, type: 'Open' },
        { name: 'Won', position: 6, type: 'Won' },
      ],
    },
  }),
}))
vi.mock('@/utils', () => ({ formatDate: (d) => `fmt:${d}` }))

const { useDealFacts } = await import('@/composables/dealFacts')

const facts = (doc, org) => useDealFacts(ref(doc), ref(org))

describe('useDealFacts', () => {
  describe('dealName — the deal is identified by its customer', () => {
    it("prefers the deal's own organization", () => {
      expect(
        facts({ organization: 'Acme' }, { name: 'Other' }).dealName.value,
      ).toBe('Acme')
    })

    it('falls back to the linked organization record', () => {
      expect(facts({}, { name: 'Acme Ltd' }).dealName.value).toBe('Acme Ltd')
    })

    it('is empty rather than echoing the record id', () => {
      // The bug this guards: the doctype title field falls back to the record
      // name, which made the page show the deal ID as both heading and
      // subtitle. An empty name lets the caller say "Untitled deal" instead.
      expect(facts({ name: 'CRM-DEAL-0001' }, null).dealName.value).toBe('')
    })
  })

  describe('money', () => {
    it('formats through the meta-aware currency formatter', () => {
      expect(facts({ deal_value: 1500 }).dealValue.value).toBe('₹ 1500.00')
      expect(facts({ expected_deal_value: 900 }).expectedValue.value).toBe(
        '₹ 900.00',
      )
    })

    it('shows an em dash for a missing value, never a zero', () => {
      // A rendered 0 asserts a number nobody entered.
      expect(facts({}).dealValue.value).toBe('—')
      expect(facts({ deal_value: null }).dealValue.value).toBe('—')
      expect(facts({ deal_value: 0 }).dealValue.value).toBe('—')
      expect(facts({}).expectedValue.value).toBe('—')
    })
  })

  describe('probability', () => {
    it('trims meaningless precision', () => {
      expect(facts({ probability: 10 }).probabilityLabel.value).toBe('10%')
      expect(facts({ probability: '10.000' }).probabilityLabel.value).toBe(
        '10%',
      )
    })

    it('keeps a real decimal', () => {
      expect(facts({ probability: 12.5 }).probabilityLabel.value).toBe('12.5%')
    })

    it('distinguishes an explicit zero from no value', () => {
      // 0% is a real, meaningful probability; absent is not.
      expect(facts({ probability: 0 }).probabilityLabel.value).toBe('0%')
      expect(facts({}).probabilityLabel.value).toBe('—')
      expect(facts({ probability: '' }).probabilityLabel.value).toBe('—')
      expect(facts({ probability: 'abc' }).probabilityLabel.value).toBe('—')
    })
  })

  describe('expected close', () => {
    it('formats a date and dashes a missing one', () => {
      expect(
        facts({ expected_closure_date: '2026-10-01' }).expectedCloseLabel.value,
      ).toBe('fmt:2026-10-01')
      expect(facts({}).expectedCloseLabel.value).toBe('—')
    })
  })

  describe('owner', () => {
    it('resolves a full name, falling back to the raw id', () => {
      expect(facts({ deal_owner: 'ada@crm.test' }).ownerName.value).toBe(
        'Ada Lovelace',
      )
      expect(facts({ deal_owner: 'ghost@crm.test' }).ownerName.value).toBe(
        'ghost@crm.test',
      )
      expect(facts({}).ownerName.value).toBe('')
    })
  })

  describe('pipeline stages', () => {
    it("passes the site's own status rows straight through", () => {
      // Ordering and terminality are StatusPipeline's job, from position/type.
      const stages = facts({}).pipelineStages.value
      expect(stages.map((s) => s.name)).toEqual(['Qualification', 'Won'])
    })
  })

  describe('reactivity and shape', () => {
    it('tracks changes to the document', () => {
      const doc = ref({ deal_value: 100 })
      const { dealValue } = useDealFacts(doc)
      expect(dealValue.value).toBe('₹ 100.00')
      doc.value = { deal_value: 250 }
      expect(dealValue.value).toBe('₹ 250.00')
    })

    it('accepts a plain object as well as a ref', () => {
      // MobileDeal and Deal both pass refs, but the composable should not care.
      expect(useDealFacts({ organization: 'Acme' }).dealName.value).toBe('Acme')
    })

    it('survives an undefined document', () => {
      const f = useDealFacts(undefined)
      expect(f.dealName.value).toBe('')
      expect(f.dealValue.value).toBe('—')
      expect(f.probabilityLabel.value).toBe('—')
      expect(f.ownerName.value).toBe('')
    })
  })
})
