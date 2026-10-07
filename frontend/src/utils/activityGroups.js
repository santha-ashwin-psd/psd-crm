/**
 * Chronological grouping for the activity timeline.
 *
 * A timeline of bare per-item timestamps ("yesterday", "1 week ago") gives no
 * structure to scan: there is nothing to tell you where one day ends and the
 * next begins. Grouping the stream under Today / Yesterday / Earlier headings
 * is what turns it into something readable at a glance.
 *
 * Deliberately returns a stable key rather than a display string: translation
 * belongs in the component, and a key is what makes this testable without a
 * `__()` global in scope.
 */

/** The three buckets, in the order they read on the page. */
export const ACTIVITY_GROUPS = ['today', 'yesterday', 'earlier']

/**
 * Which day-bucket a timestamp falls into, relative to `now`.
 *
 * Compared by calendar day, not by elapsed hours: an event at 23:00 last night
 * is "Yesterday" at 00:30 today, not "2 hours ago"-adjacent to today. Anything
 * in the future is treated as today, so a scheduled or clock-skewed record
 * never lands in a bucket labelled as past.
 *
 * @param {string|Date|null|undefined} value - Timestamp (e.g. `creation`).
 * @param {Date} [now] - Injectable for tests.
 * @returns {string} `'today'` | `'yesterday'` | `'earlier'`, or `''` when the
 *   value is missing or unparseable — callers render no heading for those.
 */
export function activityDayGroup(value, now = new Date()) {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''

  const startOfDay = (x) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000)

  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  return 'earlier'
}

/**
 * Does `list[index]` begin a new day-group?
 *
 * Works off a change in the neighbouring item's group rather than off absolute
 * positions, so it is correct whether the timeline is sorted newest- or
 * oldest-first (both orders are reachable from the UI's sort toggle).
 *
 * @param {Array<object>} list - The activities, in display order.
 * @param {number} index
 * @param {(item: object) => string|Date|undefined} pick - Reads the timestamp.
 * @param {Date} [now]
 * @returns {boolean}
 */
export function startsDayGroup(list, index, pick, now = new Date()) {
  if (!Array.isArray(list) || index < 0 || index >= list.length) return false
  const group = activityDayGroup(pick(list[index]), now)
  if (!group) return false
  if (index === 0) return true
  return group !== activityDayGroup(pick(list[index - 1]), now)
}
