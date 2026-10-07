vi.mock('@/stores/statuses', () => ({
  statusesStore: () => ({
    communicationStatuses: { data: [{ name: 'Open' }, { name: 'Replied' }] },
  }),
}))

vi.mock('frappe-ui/frappe', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useTelemetry: () => ({ capture: vi.fn() }) }
})

import SLASection from '@/components/SLASection.vue'
import { mountComponent } from '../helpers/mount'

const STUBS = {
  Dropdown: {
    name: 'Dropdown',
    props: ['options'],
    template: '<div class="menu"><slot /></div>',
  },
  Tooltip: {
    name: 'Tooltip',
    props: ['text'],
    template: '<div class="tip" :data-text="text"><slot /></div>',
  },
}

const mountSla = (data) =>
  mountComponent(SLASection, {
    props: { modelValue: data },
    global: { stubs: STUBS },
  })

/** The section descriptors the component builds for the panel. */
const sections = (wrapper) => wrapper.vm.slaSection

describe('SLASection', () => {
  // The "due" branches compare against now, so the clock is pinned.
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-20T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('status colour', () => {
    it('is red when the SLA failed', () => {
      const [first] = sections(mountSla({ sla_status: 'Failed', first_response_time: 60 }))
      expect(first.color).toBe('red')
    })

    it('is green when the SLA was met', () => {
      const [first] = sections(
        mountSla({ sla_status: 'Fulfilled', first_response_time: 60 }),
      )
      expect(first.color).toBe('green')
    })

    it('is amber while a response is still due', () => {
      const [first] = sections(
        mountSla({
          sla_status: 'First Response Due',
          response_by: '2026-08-20T18:00:00Z',
        }),
      )
      expect(first.color).toBe('orange')
    })

    it('turns red once the deadline has passed', () => {
      // An overdue response is a failure in waiting, and should read like one.
      const [first] = sections(
        mountSla({
          sla_status: 'First Response Due',
          response_by: '2026-08-20T06:00:00Z',
        }),
      )
      expect(first.color).toBe('red')
    })
  })

  describe('status wording', () => {
    it('reports how long a met SLA took', () => {
      const [first] = sections(
        mountSla({ sla_status: 'Fulfilled', first_response_time: 3661 }),
      )
      expect(first.value).toContain('Fulfilled in')
      expect(first.value).toContain('1h')
    })

    it('reports how long a failed SLA took', () => {
      const [first] = sections(
        mountSla({ sla_status: 'Failed', first_response_time: 90 }),
      )
      expect(first.value).toContain('Failed in')
    })

    it('counts down to the deadline while due', () => {
      const [first] = sections(
        mountSla({
          sla_status: 'First Response Due',
          response_by: '2026-08-20T18:00:00Z',
        }),
      )
      expect(first.value).toMatch(/hour|minute|in /i)
    })

    it('prefers the last response time when there has been more than one', () => {
      const [first] = sections(
        mountSla({
          sla_status: 'Fulfilled',
          first_response_time: 60,
          last_response_time: 7200,
        }),
      )
      expect(first.value).toContain('2h')
    })
  })

  describe('response type', () => {
    it('calls a single reply a First Response', () => {
      const wrapper = mountSla({
        sla_status: 'Fulfilled',
        first_responded_on: '2026-08-20T09:00:00Z',
        first_response_time: 60,
      })
      expect(JSON.stringify(sections(wrapper))).toContain('First Response')
    })

    it('calls a later reply a Rolling Response', () => {
      // Once a second reply lands at a different time, the SLA is tracking the
      // rolling response rather than the first one.
      const wrapper = mountSla({
        sla_status: 'First Response Due',
        response_by: '2026-08-20T18:00:00Z',
        first_responded_on: '2026-08-20T09:00:00Z',
        last_responded_on: '2026-08-20T11:00:00Z',
        first_response_time: 60,
      })
      expect(JSON.stringify(sections(wrapper))).toContain('Rolling Response')
    })

    it('stays a First Response when both timestamps match a fulfilled SLA', () => {
      const wrapper = mountSla({
        sla_status: 'Fulfilled',
        first_responded_on: '2026-08-20T09:00:00Z',
        last_responded_on: '2026-08-20T09:00:00Z',
        first_response_time: 60,
      })
      expect(JSON.stringify(sections(wrapper))).not.toContain('Rolling Response')
    })
  })

  describe('communication status dot', () => {
    it('reads open and replied as healthy', () => {
      const vm = mountSla({}).vm
      expect(vm.statusDotColor('Open')).toBe('var(--crm-success)')
      expect(vm.statusDotColor('Replied')).toBe('var(--crm-success)')
    })

    it('reads waiting states as amber', () => {
      const vm = mountSla({}).vm
      expect(vm.statusDotColor('On Hold')).toBe('var(--crm-warning)')
      expect(vm.statusDotColor('Paused')).toBe('var(--crm-warning)')
    })

    it('greys out finished states', () => {
      const vm = mountSla({}).vm
      expect(vm.statusDotColor('Closed')).toBe('var(--crm-text-4)')
      expect(vm.statusDotColor('Resolved')).toBe('var(--crm-text-4)')
    })

    it('falls back to the accent for anything unrecognised', () => {
      const vm = mountSla({}).vm
      expect(vm.statusDotColor('Something Else')).toBe(
        'var(--crm-accent-primary)',
      )
      expect(vm.statusDotColor('')).toBe('var(--crm-accent-primary)')
      expect(vm.statusDotColor(null)).toBe('var(--crm-accent-primary)')
    })

    it('ignores case', () => {
      expect(mountSla({}).vm.statusDotColor('OPEN')).toBe('var(--crm-success)')
    })
  })

  describe('resilience', () => {
    it('renders with an empty document', () => {
      expect(() => mountSla({})).not.toThrow()
    })
  })
})
