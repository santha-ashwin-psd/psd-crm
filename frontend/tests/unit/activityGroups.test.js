import { describe, it, expect } from 'vitest'
import {
  ACTIVITY_GROUPS,
  activityDayGroup,
  startsDayGroup,
} from '@/utils/activityGroups'

// Fixed "now" so these never depend on the clock they run at.
const NOW = new Date(2026, 8, 6, 14, 30) // 6 Sep 2026, 14:30 local
const at = (y, m, d, h = 12, min = 0) => new Date(y, m, d, h, min)

describe('activityDayGroup', () => {
  it('buckets by calendar day, not elapsed hours', () => {
    // 23:00 last night is Yesterday even though it is under 24h ago at 00:30.
    const justAfterMidnight = new Date(2026, 8, 6, 0, 30)
    expect(activityDayGroup(at(2026, 8, 5, 23, 0), justAfterMidnight)).toBe(
      'yesterday',
    )
  })

  it.each([
    ['same day, earlier', at(2026, 8, 6, 9), 'today'],
    ['same day, later', at(2026, 8, 6, 23, 59), 'today'],
    ['one day back', at(2026, 8, 5), 'yesterday'],
    ['two days back', at(2026, 8, 4), 'earlier'],
    ['last month', at(2026, 7, 12), 'earlier'],
    ['last year', at(2025, 8, 6), 'earlier'],
  ])('%s → %s', (_label, date, expected) => {
    expect(activityDayGroup(date, NOW)).toBe(expected)
  })

  it('treats a future timestamp as today rather than a past bucket', () => {
    // Clock skew or a scheduled record must never read as "Earlier".
    expect(activityDayGroup(at(2026, 8, 7), NOW)).toBe('today')
    expect(activityDayGroup(at(2027, 0, 1), NOW)).toBe('today')
  })

  it('accepts the string timestamps the API returns', () => {
    expect(activityDayGroup('2026-09-06 09:15:00', NOW)).toBe('today')
    expect(activityDayGroup('2026-09-05 09:15:00', NOW)).toBe('yesterday')
    expect(activityDayGroup('2026-01-05 09:15:00', NOW)).toBe('earlier')
  })

  it.each([[null], [undefined], [''], ['not a date'], [{}]])(
    'returns no group for %p',
    (input) => {
      expect(activityDayGroup(input, NOW)).toBe('')
    },
  )

  it('only ever returns a declared group', () => {
    for (const v of [at(2026, 8, 6), at(2026, 8, 5), at(2020, 0, 1)]) {
      expect(ACTIVITY_GROUPS).toContain(activityDayGroup(v, NOW))
    }
  })
})

describe('startsDayGroup', () => {
  const pick = (a) => a.creation
  const list = [
    { creation: at(2026, 8, 6, 10) }, // today
    { creation: at(2026, 8, 6, 9) }, // today
    { creation: at(2026, 8, 5, 18) }, // yesterday
    { creation: at(2026, 8, 1, 18) }, // earlier
    { creation: at(2026, 7, 2, 18) }, // earlier
  ]

  it('marks the first item and each change of day', () => {
    const flags = list.map((_, i) => startsDayGroup(list, i, pick, NOW))
    expect(flags).toEqual([true, false, true, true, false])
  })

  it('is correct with the timeline sorted oldest-first too', () => {
    // The sort toggle can reverse the stream; grouping keys off a change in
    // the neighbour, not an absolute position, so both orders work.
    const reversed = [...list].reverse()
    const flags = reversed.map((_, i) => startsDayGroup(reversed, i, pick, NOW))
    expect(flags).toEqual([true, false, true, true, false])
  })

  it('emits exactly one heading per contiguous run', () => {
    const headings = list.filter((_, i) => startsDayGroup(list, i, pick, NOW))
    expect(headings).toHaveLength(3) // today, yesterday, earlier
  })

  it('never marks an item whose timestamp is unusable', () => {
    const withBad = [{ creation: null }, { creation: at(2026, 8, 6) }]
    expect(startsDayGroup(withBad, 0, pick, NOW)).toBe(false)
    expect(startsDayGroup(withBad, 1, pick, NOW)).toBe(true)
  })

  it('is safe at the edges', () => {
    expect(startsDayGroup(list, -1, pick, NOW)).toBe(false)
    expect(startsDayGroup(list, 99, pick, NOW)).toBe(false)
    expect(startsDayGroup(null, 0, pick, NOW)).toBe(false)
    expect(startsDayGroup([], 0, pick, NOW)).toBe(false)
  })
})
