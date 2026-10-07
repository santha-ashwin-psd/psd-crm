// The stub must be reactive: these preferences are `computed`, so a plain
// object would cache on first read and the "tracks a later change" test would
// be asserting the mock's behaviour rather than the composable's.
vi.mock('@/stores/settings', async () => {
  const { reactive } = await import('vue')
  const _settings = reactive({ doc: {} })
  return { getSettings: () => ({ _settings }) }
})

import {
  useTimelinePreferences,
  timestampCell,
} from '@/composables/useTimelinePreferences'
import { getSettings } from '@/stores/settings'

const settings = getSettings()._settings

describe('useTimelinePreferences', () => {
  beforeEach(() => {
    settings.doc = {}
  })

  it('defaults to relative timestamps, oldest first', () => {
    const prefs = useTimelinePreferences()
    expect(prefs.timestampFormat.value).toBe('Relative')
    expect(prefs.sortOrder.value).toBe('Oldest First')
    expect(prefs.showExactTimestamp.value).toBe(false)
    expect(prefs.isNewestFirst.value).toBe(false)
  })

  it('reads the configured timestamp format', () => {
    settings.doc = { crm_timeline_timestamp_format: 'Exact' }
    const prefs = useTimelinePreferences()
    expect(prefs.timestampFormat.value).toBe('Exact')
    expect(prefs.showExactTimestamp.value).toBe(true)
  })

  it('reads the configured sort order', () => {
    settings.doc = { crm_timeline_sort_order: 'Newest First' }
    expect(useTimelinePreferences().isNewestFirst.value).toBe(true)
  })

  it('falls back to the defaults when settings have not loaded', () => {
    settings.doc = null
    const prefs = useTimelinePreferences()
    expect(prefs.timestampFormat.value).toBe('Relative')
    expect(prefs.sortOrder.value).toBe('Oldest First')
  })

  it('tracks a later settings change', () => {
    const prefs = useTimelinePreferences()
    expect(prefs.showExactTimestamp.value).toBe(false)
    settings.doc = { crm_timeline_timestamp_format: 'Exact' }
    expect(prefs.showExactTimestamp.value).toBe(true)
  })
})

describe('timestampCell', () => {
  // The relative half is computed against "now", so the clock is pinned and
  // the fixture sits safely in the past. Without this the expectations flip to
  // "in 3 hours" depending on the time of day the suite runs.
  const PAST = '2026-08-18 09:00:00'

  beforeEach(() => {
    settings.doc = {}
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-20T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns blanks for no date', () => {
    expect(timestampCell(null)).toEqual({ label: '', timeAgo: '' })
    expect(timestampCell('')).toEqual({ label: '', timeAgo: '' })
    expect(timestampCell(undefined)).toEqual({ label: '', timeAgo: '' })
  })

  it('shows the relative time with the exact date as the tooltip by default', () => {
    const cell = timestampCell(PAST)
    // `timeAgo` is what renders; `label` is the tooltip behind it.
    expect(cell.timeAgo).toMatch(/ago|now|just/i)
    expect(cell.label).toMatch(/2026|Aug/)
  })

  it('swaps the two when Exact is configured', () => {
    settings.doc = { crm_timeline_timestamp_format: 'Exact' }
    const cell = timestampCell(PAST)
    expect(cell.timeAgo).toMatch(/2026|Aug/)
    expect(cell.label).toMatch(/ago|now|just/i)
  })

  it('always returns both halves so the tooltip is never empty', () => {
    const cell = timestampCell(PAST)
    expect(cell.label).toBeTruthy()
    expect(cell.timeAgo).toBeTruthy()
  })
})
