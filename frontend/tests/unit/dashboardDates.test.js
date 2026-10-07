import { getLastXDays, formatter, formatRange } from '@/utils/dashboard'

/**
 * These helpers all read "today", so every test pins the clock. Without that
 * the suite would pass in one month and fail in the next.
 */
describe('dashboard date helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-20T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('getLastXDays', () => {
    it('defaults to a 30-day window ending today', () => {
      expect(getLastXDays()).toBe('2026-07-21,2026-08-20')
    })

    it('honours an explicit range', () => {
      expect(getLastXDays(7)).toBe('2026-08-13,2026-08-20')
      expect(getLastXDays(1)).toBe('2026-08-19,2026-08-20')
    })

    it('returns today twice for a zero range', () => {
      expect(getLastXDays(0)).toBe('2026-08-20,2026-08-20')
    })

    it('crosses a month boundary correctly', () => {
      // 90 days back from 20 Aug lands in May, not "month minus 3".
      expect(getLastXDays(90)).toBe('2026-05-22,2026-08-20')
    })

    it('crosses a year boundary correctly', () => {
      expect(getLastXDays(365)).toBe('2025-08-20,2026-08-20')
    })
  })

  describe('formatRange', () => {
    it('omits the year for dates in the current year', () => {
      expect(formatRange('2026-08-20')).toBe('Aug 20')
    })

    it('includes the year for other years', () => {
      expect(formatRange('2025-12-31')).toBe('Dec 31, 2025')
      expect(formatRange('2027-01-01')).toBe('Jan 1, 2027')
    })

    it('does not zero-pad the day', () => {
      expect(formatRange('2026-08-05')).toBe('Aug 5')
    })
  })

  describe('formatter', () => {
    it('renders a comma-separated range as prose', () => {
      expect(formatter('2026-07-21,2026-08-20')).toBe('Jul 21 to Aug 20')
    })

    it('shows the year on whichever end needs it', () => {
      expect(formatter('2025-08-20,2026-08-20')).toBe('Aug 20, 2025 to Aug 20')
    })

    it('round-trips the output of getLastXDays', () => {
      expect(formatter(getLastXDays(7))).toBe('Aug 13 to Aug 20')
    })
  })
})
