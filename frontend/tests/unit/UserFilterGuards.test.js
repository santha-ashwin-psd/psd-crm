/**
 * Eight places read `users.data.crmUsers`. What makes them safe is not a guard
 * on `users.data` — the store is created with `initialData: []`, so `data` is
 * `[]` before the fetch, `[]` again if it fails, and `{ allUsers, crmUsers }`
 * on success. It is never null.
 *
 * What actually matters is the `?.` *after* `crmUsers`: on the `[]` value,
 * `data.crmUsers` is `undefined`, so `undefined?.map(...)` is fine and
 * `undefined.map(...)` throws. This suite pins that distinction, because an
 * earlier round guarded the wrong half of the expression on a false premise.
 * See "a fix that was withdrawn" in the report.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (rel) => readFileSync(resolve(process.cwd(), 'src', rel), 'utf8')

const FILES = [
  'stores/users.js',
  'components/AssignToBody.vue',
  'components/Modals/AssignmentModal.vue',
  'components/Modals/AddExistingUserModal.vue',
  'components/Controls/Grid.vue',
  'components/Settings/InviteUserPage.vue',
  'pages/Dashboard.vue',
  'pages/Calendar.vue',
  'components/FieldLayout/Field.vue',
  'components/SidePanelLayout.vue',
]

// The hazard is calling a method straight off `crmUsers` — `crmUsers.map(...)`
// — because the value is `undefined` whenever the fetch has not succeeded.
// `crmUsers?.map(...)`, `crmUsers || []` and simply returning the value are
// all fine, so only a bare `.` followed by a name counts.
const HAZARD = /crmUsers\.\w/g

const hazardsIn = (rel) => {
  const src = read(rel)
  return [...src.matchAll(HAZARD)].map((m) => ({
    text: src.slice(Math.max(0, m.index - 24), m.index + 24).trim(),
    line: src.slice(0, m.index).split('\n').length,
  }))
}

describe('reading the CRM user list before it has loaded', () => {
  it('the store starts the list as an empty array, not null', () => {
    // This is the fact the rest of the suite rests on. If it changes to
    // `initialData: null` every one of these accesses becomes a real hazard.
    expect(read('stores/users.js')).toContain('initialData: []')
  })

  it('finds the reads it is meant to be checking', () => {
    const total = FILES.reduce(
      (n, f) => n + (read(f).match(/crmUsers/g) || []).length,
      0,
    )
    expect(total).toBeGreaterThanOrEqual(8)
  })

  describe.each(FILES)('%s', (rel) => {
    it('never calls a list method without allowing for the empty case', () => {
      const hazards = hazardsIn(rel)
      // AddExistingUserModal is the one exception, and its own `v-if` does the
      // work — asserted separately below.
      const allowed =
        rel === 'components/Modals/AddExistingUserModal.vue' ? 1 : 0
      expect(
        hazards.length,
        hazards.map((h) => `${rel}:${h.line} — ${h.text}`).join(' | '),
      ).toBe(allowed)
    })
  })

  it('lets the one bare access stand, because a v-if precedes it', () => {
    const src = read('components/Modals/AddExistingUserModal.vue')
    expect(src).toContain('v-if="users?.data?.crmUsers?.length"')
    expect(src).toContain('users.data.crmUsers.map((user) => user.name)')
  })
})

describe('the invite page, before the user list is available', () => {
  it('does not call .map on a list that is not there', () => {
    // Regression: `users.data.crmUsers.map(...)` inside a computed. With the
    // store's `initialData: []`, `data.crmUsers` is `undefined` whenever the
    // fetch has failed — and this is the one site of the eight with no `?.`
    // after `crmUsers`, so opening the invite page then threw.
    const src = read('components/Settings/InviteUserPage.vue')
    expect(src).toContain("(users.data?.crmUsers || []).map((user) => user.name)")
  })
})

describe("turning a Select field's options into a list", () => {
  // The same three-line helper exists in three files. Unlike `users.data`,
  // a field's `options` genuinely is null when a script supplies them at
  // runtime — so all three copies need the guard. Two were fixed as B88 and
  // B115; the third was found by checking for the same expression elsewhere.
  const COPIES = [
    'components/Filter.vue',
    'components/ConditionsFilter/CFCondition.vue',
    'components/Modals/EditValueModal.vue',
  ]

  it.each(COPIES)('%s guards a field with no options', (rel) => {
    const src = read(rel)
    const fn = src.slice(src.indexOf('function getSelectOptions'))
    expect(fn.slice(0, fn.indexOf('\n}'))).toMatch(/options \|\| ''/)
  })

  it('still has all three copies to check', () => {
    for (const rel of COPIES) {
      expect(read(rel), rel).toContain('function getSelectOptions')
    }
  })
})
