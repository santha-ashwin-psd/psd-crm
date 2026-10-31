import { describe, it, expect } from 'vitest'
import {
  TASK_PRIORITIES,
  priorityTone,
  priorityToneClass,
  dueState,
  dueTone,
  dueToneClass,
  isClosedTask,
} from '@/utils/taskMeta'

const NOW = new Date(2026, 8, 8, 15, 0) // 8 Sep 2026, 15:00 local
const at = (y, m, d, h = 12, min = 0) => new Date(y, m, d, h, min)

describe('priorityTone', () => {
  it.each([
    ['High', 'danger'],
    ['Medium', 'warning'],
    ['Low', 'neutral'],
  ])('%s → %s', (p, tone) => {
    expect(priorityTone(p)).toBe(tone)
  })

  it('covers every priority the doctype offers', () => {
    for (const p of TASK_PRIORITIES) {
      expect(['danger', 'warning', 'neutral']).toContain(priorityTone(p))
    }
  })

  it('does not paint every priority — Low stays neutral', () => {
    // If all three were coloured, a board of Medium tasks would read as
    // uniformly urgent and High would stop standing out.
    expect(priorityTone('Low')).toBe('neutral')
    expect(priorityTone('High')).not.toBe(priorityTone('Medium'))
  })

  it('is case- and whitespace-insensitive', () => {
    expect(priorityTone('  high ')).toBe('danger')
    expect(priorityTone('MEDIUM')).toBe('warning')
  })

  it.each([[null], [undefined], [''], ['Urgent'], [42]])(
    'falls back to neutral for %p',
    (p) => {
      expect(priorityTone(p)).toBe('neutral')
    },
  )

  it('returns a complete literal class name', () => {
    expect(priorityToneClass('High')).toBe('crm-tone-danger')
    expect(priorityToneClass(null)).toBe('crm-tone-neutral')
  })
})

describe('dueState', () => {
  it('treats today as a calendar day, not a 24-hour window', () => {
    // Due 09:00 today, read at 15:00 today — still "today", not overdue.
    expect(dueState(at(2026, 8, 8, 9), NOW)).toBe('today')
    expect(dueState(at(2026, 8, 8, 23, 59), NOW)).toBe('today')
    expect(dueState(at(2026, 8, 8, 0, 1), NOW)).toBe('today')
  })

  it.each([
    ['yesterday', at(2026, 8, 7), 'overdue'],
    ['last week', at(2026, 8, 1), 'overdue'],
    ['tomorrow', at(2026, 8, 9), 'upcoming'],
    ['next month', at(2026, 9, 8), 'upcoming'],
  ])('%s → %s', (_l, d, expected) => {
    expect(dueState(d, NOW)).toBe(expected)
  })

  it('accepts the datetime strings the API returns', () => {
    expect(dueState('2026-09-08 09:00:00', NOW)).toBe('today')
    expect(dueState('2026-09-07 09:00:00', NOW)).toBe('overdue')
    expect(dueState('2026-09-20 09:00:00', NOW)).toBe('upcoming')
  })

  it.each([[null], [undefined], [''], ['not a date']])(
    'reports no due date for %p',
    (d) => {
      expect(dueState(d, NOW)).toBe('none')
    },
  )
})

describe('dueTone', () => {
  it('colours only the time-critical states', () => {
    expect(dueTone(at(2026, 8, 7), NOW)).toBe('danger') // overdue
    expect(dueTone(at(2026, 8, 8), NOW)).toBe('warning') // today
    expect(dueTone(at(2026, 8, 20), NOW)).toBe('neutral') // upcoming
    expect(dueTone(null, NOW)).toBe('neutral') // none
  })

  it('does not make an ordinary future date look like an alarm', () => {
    expect(dueTone(at(2026, 8, 30), NOW)).not.toBe('danger')
    expect(dueTone(at(2026, 8, 30), NOW)).not.toBe('warning')
  })

  it('returns a complete literal class name', () => {
    expect(dueToneClass(at(2026, 8, 7), NOW)).toBe('crm-tone-danger')
    expect(dueToneClass(null, NOW)).toBe('crm-tone-neutral')
  })
})

describe('isClosedTask', () => {
  it('treats Done and Canceled as closed, so they are never overdue', () => {
    expect(isClosedTask('Done')).toBe(true)
    expect(isClosedTask('Canceled')).toBe(true)
  })

  it('treats every other status as open', () => {
    for (const s of ['Backlog', 'Todo', 'In Progress', '', null, undefined]) {
      expect(isClosedTask(s)).toBe(false)
    }
  })
})
