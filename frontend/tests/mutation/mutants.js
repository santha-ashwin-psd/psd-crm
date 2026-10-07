/**
 * Mutants: deliberate changes to the source, each paired with the suite that
 * should notice.
 *
 * The point is not coverage — `yarn test:coverage` answers whether a line
 * *ran*. This answers whether anything would *complain* if the line were
 * wrong, which is a different and harder question. Six times during the
 * original test-writing effort a test passed while proving nothing; this is
 * the standing check against that.
 *
 * Two kinds of entry:
 *
 *   expect: 'caught'  — the suite must fail. A surviving mutant means the
 *                       behaviour is covered but not constrained.
 *   expect: 'missed'  — a negative control, mutating something no test asserts
 *                       on. These must survive. If one is ever caught, either
 *                       the runner is broken or someone has (usefully) written
 *                       a test for it — see the note at the bottom.
 *
 * Adding one: pick a real invariant, not a typo. "Rounding becomes
 * truncation" is a mutant; renaming a variable is not.
 */
export const mutants = [
  // ── utils ────────────────────────────────────────────────────────────────
  {
    // `Math.round(` alone matches three rounding methods in this file, and only
    // the first would be mutated — the runner now rejects that as ambiguous.
    // This anchor names Commercial Rounding, the default.
    file: 'src/utils/numberFormat.js',
    suite: 'numberFormat.test.js',
    find: 'num = Math.round(num + epsilon)',
    replace: 'num = Math.floor(num + epsilon)',
    describes: 'commercial rounding becomes truncation',
    expect: 'caught',
  },
  {
    file: 'src/utils/index.js',
    suite: 'utilsIndexPart2.test.js',
    find: "op === 'like'",
    replace: "op === 'LIKE'",
    describes: 'the like operator stops matching in condition building',
    expect: 'caught',
  },

  // ── stores ───────────────────────────────────────────────────────────────
  {
    file: 'src/stores/statuses.js',
    suite: 'StatusLookupGuards.test.js',
    find: 'return dealStatusesByName[name]',
    replace: 'return leadStatusesByName[name]',
    describes: 'deal statuses resolve against the lead map',
    expect: 'caught',
  },

  // ── filtering ────────────────────────────────────────────────────────────
  {
    file: 'src/components/Filter.vue',
    suite: 'FilterBuilder.test.js',
    find: "if (typeDate.includes(fieldtype)) {\n    return 'between'",
    replace: "if (typeDate.includes(fieldtype)) {\n    return 'equals'",
    describes: 'dates default to equals instead of a range',
    expect: 'caught',
  },
  {
    file: 'src/components/ConditionsFilter/CFConditions.vue',
    suite: 'ConditionsFilter.test.js',
    find: 'if (conditionIndex === -1) return',
    replace: 'if (false) return',
    describes: 'the -1 splice guard is removed',
    expect: 'caught',
  },

  // ── lists and views ──────────────────────────────────────────────────────
  {
    file: 'src/components/ViewControls.vue',
    suite: 'ViewControls.test.js',
    find: 'const p = Math.min(Math.max(1, page), maxPage)',
    replace: 'const p = page',
    describes: 'pagination stops clamping to the available pages',
    expect: 'caught',
  },
  {
    file: 'src/components/Kanban/KanbanView.vue',
    suite: 'Kanban.test.js',
    find: "blueGray: 'bg-slate-500'",
    replace: "blueGray: 'bg-slate-400'",
    describes: 'blue-grey becomes indistinguishable from grey',
    expect: 'caught',
  },

  // ── the record form ──────────────────────────────────────────────────────
  {
    file: 'src/components/FieldLayout/Field.vue',
    suite: 'FieldTransforms.test.js',
    find: "if (field.options[0].value !== '' && !field.reqd) {",
    replace: 'if (false) {',
    describes: 'optional selects lose their blank option',
    expect: 'caught',
  },
  {
    file: 'src/components/SidePanelLayout.vue',
    suite: 'SidePanelLayout.test.js',
    find: "field.fieldtype == 'Check' ||",
    replace: 'false ||',
    describes: 'empty checkboxes are hidden like other read-only fields',
    expect: 'caught',
  },
  {
    file: 'src/pages/Deal.vue',
    suite: 'DealRecord.test.js',
    find: 'if (!primaryContact) {',
    replace: 'if (primaryContact) {',
    describes: 'the primary-contact guard inverts',
    expect: 'caught',
  },

  // ── the timeline ─────────────────────────────────────────────────────────
  {
    file: 'src/components/Activities/Activities.vue',
    suite: 'ActivityTimeline.test.js',
    find: "if (key !== 'comments') return",
    replace: 'if (false) return',
    describes: 'the cross-tab comment filter stops filtering',
    expect: 'caught',
  },
  {
    file: 'src/components/Calendar/CalendarEventPanel.vue',
    suite: 'CalendarEventPanel.test.js',
    find: 'if (!currentAttendee.value) return',
    replace: 'if (false) return',
    describes: 'the missing-participant guard is removed',
    expect: 'caught',
  },

  // ── controls ─────────────────────────────────────────────────────────────
  {
    file: 'src/components/Controls/GeolocationControl.vue',
    suite: 'GeolocationMap.test.js',
    find: 'if (ne.equals(sw)) {',
    replace: 'if (false) {',
    describes: 'single-point map framing is skipped',
    expect: 'caught',
  },
  {
    file: 'src/components/Resizer.vue',
    suite: 'Resizer.test.js',
    find: 'if (sidebarWidth.value < props.minWidth)',
    replace: 'if (false)',
    describes: 'the minimum resize width stops applying',
    expect: 'caught',
  },
  {
    file: 'src/components/FilesUploader/FilesUploader.vue',
    suite: 'FilesUploader.test.js',
    find: 'if (pendingUploads > 0) return',
    replace: 'if (false) return',
    describes: 'uploads report before they have all finished',
    expect: 'caught',
  },

  // ── settings ─────────────────────────────────────────────────────────────
  {
    file: 'src/components/Settings/Forms/FormBuilderPanel.vue',
    suite: 'FormBuilderLayout.test.js',
    find: 'const MAX_COLUMNS = 4',
    replace: 'const MAX_COLUMNS = 99',
    describes: 'the form-builder column ceiling is lifted',
    expect: 'caught',
  },

  // ── negative controls ────────────────────────────────────────────────────
  // Deliberately in code no test asserts on. These MUST survive: a runner that
  // can only ever report "caught" tells you nothing.
  {
    file: 'src/pages/Deal.vue',
    suite: 'DealRecord.test.js',
    find: 'Please set an email address to send emails',
    replace: 'MUTANT CONTROL — no test asserts on this string',
    describes: 'control: reword an untested toast on the deal page',
    expect: 'missed',
  },
  {
    file: 'src/components/Kanban/KanbanView.vue',
    suite: 'Kanban.test.js',
    find: 'No records in this stage',
    replace: 'MUTANT CONTROL — no test asserts on this string',
    describes: 'control: reword an untested Kanban empty state',
    expect: 'missed',
  },
]

/**
 * A control being caught is not automatically a failure of the code — it can
 * mean someone wrote a test for that string, which is a good thing. The runner
 * reports it as an error so the mutant list gets updated deliberately rather
 * than drifting: move the entry to `expect: 'caught'`, or point the control at
 * something still untested.
 */
