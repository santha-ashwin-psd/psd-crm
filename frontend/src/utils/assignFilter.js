/**
 * `_assign` equality filters.
 *
 * Frappe stores `_assign` as a JSON array of users, e.g.
 * `["alice@example.com","bob@example.com"]`. A plain `=` comparison therefore
 * never matches a single assignee, which is why Equals / Not equals used to be
 * unavailable on that field.
 *
 * We express them as a LIKE anchored on the quotes that surround an array
 * member. That matches one whole entry, so — unlike a bare LIKE — filtering
 * for "bob@example.com" does not also match "bobby@example.com".
 */

export const ASSIGN_FIELD = '_assign'

const ASSIGN_EQUALITY_OPERATORS = ['equals', 'not equals']
const ASSIGN_LIKE_OPERATORS = ['like', 'not like']

/** Matches a value this module produced: `%"…"%` */
const QUOTED_MEMBER = /^%"(.*)"%$/s

export function isAssignEqualityFilter(filter) {
  return (
    filter?.fieldname === ASSIGN_FIELD &&
    ASSIGN_EQUALITY_OPERATORS.includes(filter.operator)
  )
}

/**
 * Rewrite an `_assign` Equals / Not equals filter into the LIKE form the
 * backend can actually evaluate. Returns a new object; other filters are
 * returned untouched.
 */
export function toAssignMemberFilter(filter) {
  if (!isAssignEqualityFilter(filter)) return filter
  return {
    ...filter,
    operator: filter.operator === 'equals' ? 'like' : 'not like',
    value: `%"${filter.value}"%`,
  }
}

/**
 * Inverse of `toAssignMemberFilter`, so a saved filter reopens in the UI as
 * Equals with a clean value rather than LIKE with a quoted one. Returns null
 * when the filter was not produced by this module.
 */
export function fromAssignMemberFilter(fieldname, operator, value) {
  if (fieldname !== ASSIGN_FIELD) return null
  if (!ASSIGN_LIKE_OPERATORS.includes(operator)) return null
  if (typeof value !== 'string') return null

  const match = value.match(QUOTED_MEMBER)
  if (!match) return null

  return {
    operator: operator === 'like' ? 'equals' : 'not equals',
    value: match[1],
  }
}
