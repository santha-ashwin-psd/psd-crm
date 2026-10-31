/**
 * Semantic meaning for a task's priority and due date.
 *
 * Both map onto the same five tones the rest of the CRM uses
 * (styles/design-system.css `.crm-tone-*`), so a "High" task and a "Lost" deal
 * speak the same colour language. Kept separate from utils/statusTheme because
 * priority and due-ness are different axes from status — feeding "High" into
 * `toneForStatus` would (correctly) return neutral, since it is not a status.
 *
 * Colour is never the only signal: callers pair these with the priority word
 * and a dated label, per the accessibility rule that meaning must not depend
 * on hue alone.
 */

/** The priority values CRM Task actually offers (Select: Low/Medium/High). */
export const TASK_PRIORITIES = ['Low', 'Medium', 'High']

/**
 * Tone for a task priority.
 *
 * High is the only one drawn in the danger colour: if every priority were
 * coloured, a board of Medium tasks would read as uniformly urgent and the
 * High ones would stop standing out. Low is deliberately neutral.
 *
 * @param {string|null|undefined} priority
 * @returns {string} `danger` | `warning` | `neutral`
 */
export function priorityTone(priority) {
  switch (
    String(priority || '')
      .trim()
      .toLowerCase()
  ) {
    case 'high':
      return 'danger'
    case 'medium':
      return 'warning'
    default:
      // Low, blank, or anything a site has customised to.
      return 'neutral'
  }
}

/** CSS class carrying a priority's tone. A whole literal, so purge-safe. */
export function priorityToneClass(priority) {
  return `crm-tone-${priorityTone(priority)}`
}

/** Whether a task is finished, so its due date is history rather than an alarm. */
export function isClosedTask(status) {
  return status === 'Done' || status === 'Canceled'
}

/**
 * Where a due date sits relative to now.
 *
 * `due_date` on CRM Task is a Datetime, so "today" is a calendar-day test, not
 * a 24-hour window: a task due at 09:00 today is still due *today* when read
 * at 17:00, and only becomes overdue tomorrow. That matches how people read a
 * board, and avoids a task flipping to "overdue" mid-afternoon.
 *
 * @param {string|Date|null|undefined} due
 * @param {Date} [now] - Injectable for tests.
 * @returns {string} `overdue` | `today` | `upcoming` | `none`
 */
export function dueState(due, now = new Date()) {
  if (!due) return 'none'
  const d = due instanceof Date ? due : new Date(due)
  if (Number.isNaN(d.getTime())) return 'none'

  const startOfDay = (x) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((startOfDay(d) - startOfDay(now)) / 86_400_000)

  if (days < 0) return 'overdue'
  if (days === 0) return 'today'
  return 'upcoming'
}

/**
 * Tone for a due date. Only genuinely time-critical states take a colour —
 * an ordinary future date is metadata, not an alarm.
 *
 * @param {string|Date|null|undefined} due
 * @param {Date} [now]
 * @returns {string} `danger` | `warning` | `neutral`
 */
export function dueTone(due, now = new Date()) {
  const state = dueState(due, now)
  if (state === 'overdue') return 'danger'
  if (state === 'today') return 'warning'
  return 'neutral'
}

/** CSS class carrying a due date's tone. */
export function dueToneClass(due, now = new Date()) {
  return `crm-tone-${dueTone(due, now)}`
}
