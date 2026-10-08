import { describe, it, expect } from 'vitest'
import { reminderSummary } from '@/components/Calendar/utils'

describe('reminderSummary', () => {
  it('lists every reminder', () => {
    expect(
      reminderSummary([
        { before: 10, interval: 'minutes' },
        { before: 1, interval: 'hours' },
        { before: 2, interval: 'days' },
      ]),
    ).toBe('10 minutes before, 1 hour before, 2 days before')
  })

  it('adds the time of day for all-day events', () => {
    expect(
      reminderSummary([{ before: 1, interval: 'days', time: '08:00' }], true),
    ).toBe('1 day before at 8:00 am')
    expect(
      reminderSummary(
        [{ before: 1, interval: 'weeks', time: '14:30:00' }],
        true,
      ),
    ).toBe('1 week before at 2:30 pm')
  })

  it('is empty without reminders', () => {
    expect(reminderSummary([])).toBe('')
    expect(reminderSummary(undefined)).toBe('')
  })
})
