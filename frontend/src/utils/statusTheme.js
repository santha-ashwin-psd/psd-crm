/**
 * Semantic tone for a status value — the ONE place a status becomes a meaning.
 *
 * The design brief's central colour rule is that colour must carry meaning:
 * green means won, red means lost, amber means "needs attention", blue is
 * informational and grey is neutral metadata. Before this, six surfaces made
 * that decision independently — `orgStatusColor`, `taskStatusColorClass`,
 * `contactStatusColor`, `callStatusColorClass`, and the per-status hue the
 * statuses store hands to Leads and Deals — so the same state could read as
 * three different meanings on three pages, and Deal statuses resolved to no
 * colour at all.
 *
 * ---------------------------------------------------------------------------
 * WHY NOT SUBSTRING MATCHING
 * ---------------------------------------------------------------------------
 * Substring tests are the obvious implementation and they are wrong. "Active"
 * is a substring of "Inactive"; "Qualified" all but contains "Qualification";
 * "Unqualified" contains "qualified". A rule ordered to dodge one of those
 * collisions still silently mis-tones the next status someone adds.
 *
 * So resolution is, in order:
 *
 *   1. EXACT match on the normalised string. Every status the product ships
 *      is listed in {@link EXACT}, so the answer is a table lookup, not a
 *      guess. "qualification" and "qualified" are separate keys and cannot
 *      collide however they are spelled.
 *
 *   2. WHOLE-WORD match for statuses a site has renamed or invented. The
 *      value is split into words and each word is compared for EQUALITY
 *      against the vocabularies in {@link WORDS} — never with `includes`.
 *      "Inactive" tokenises to ["inactive"], which is not the word "active",
 *      so the collision cannot occur by construction.
 *
 *   3. NEUTRAL. Grey is the honest answer for a state with no defined
 *      meaning, and it keeps a custom status from borrowing a colour that
 *      implies something untrue.
 *
 * Pair with the `.crm-tone-*` classes in styles/design-system.css and the
 * shared StatusBadge.vue, which is the only component that should render one.
 */

/** The five tones, in precedence order (see {@link toneForStatus}). */
export const TONES = ['danger', 'success', 'warning', 'info', 'neutral']

/**
 * Exact lookup for every status the product ships, keyed by the normalised
 * value (lowercased, punctuation-preserved, whitespace collapsed).
 *
 * Grouped by the doctype that introduces them, but the table is flat on
 * purpose: a status means the same thing wherever it appears, which is the
 * entire point of unifying these.
 */
export const EXACT = Object.freeze({
  // ---- CRM Lead Status ----
  new: 'info',
  contacted: 'info',
  nurture: 'warning',
  qualified: 'success',
  unqualified: 'danger',
  junk: 'danger',

  // ---- CRM Deal Status ----
  qualification: 'info', // the opening STAGE, not the "qualified" outcome
  'demo/making': 'info',
  demo: 'info',
  'proposal/quotation': 'info',
  proposal: 'info',
  quotation: 'info',
  negotiation: 'warning',
  'ready to close': 'success',
  won: 'success',
  lost: 'danger',
  'closed won': 'success',
  'closed lost': 'danger',

  // ---- CRM Task Status ----
  backlog: 'neutral',
  todo: 'info',
  'to do': 'info',
  'to-do': 'info',
  'in progress': 'info',
  done: 'success',
  cancelled: 'danger',
  canceled: 'danger',

  // ---- CRM Organization ----
  prospect: 'info',
  active: 'success',
  customer: 'success',
  inactive: 'neutral',

  // ---- Contact / communication ----
  passive: 'warning',
  open: 'info',
  replied: 'success',

  // ---- CRM Call Log (values from utils/callLog.js) ----
  completed: 'success',
  initiated: 'info',
  queued: 'info',
  ringing: 'info',
  busy: 'warning', // displayed as "Declined"
  'no answer': 'danger', // displayed as "Missed Call"
  missed: 'danger',
  failed: 'danger',

  // ---- SLA status (CRM Lead / CRM Deal `sla_status`) ----
  'first response due': 'warning',
  'rolling response due': 'warning',
  fulfilled: 'success',

  // ---- generic ----
  pending: 'warning',
  'on hold': 'warning',
  ongoing: 'info',
  overdue: 'danger',
  paused: 'warning',
  scheduled: 'info',
  planned: 'info',
  draft: 'neutral',
  archived: 'neutral',
  closed: 'neutral',
})

/**
 * Whole-word vocabularies for statuses not in {@link EXACT}.
 *
 * Every entry is compared with `===` against a tokenised word, never as a
 * substring. Multi-word statuses can therefore match on any one of their
 * words: "Closed Won" tokenises to ["closed", "won"], where "closed" is
 * neutral and "won" is success — resolved by the precedence in
 * {@link TONES}, which puts success above neutral, so it reads as a win.
 * "Closed Lost" resolves to danger by the same rule.
 */
export const WORDS = Object.freeze({
  danger: Object.freeze([
    'lost',
    'junk',
    'spam',
    'unqualified',
    'disqualified',
    'rejected',
    'reject',
    'declined',
    'failed',
    'failure',
    'cancelled',
    'canceled',
    'overdue',
    'expired',
    'churned',
    'churn',
    'error',
    'missed',
    'blocked',
  ]),
  success: Object.freeze([
    'won',
    'qualified',
    'converted',
    'convert',
    'complete',
    'completed',
    'done',
    'approved',
    'active',
    'customer',
    'replied',
    'success',
    'successful',
    'fulfilled',
    'resolved',
    'finished',
  ]),
  warning: Object.freeze([
    'negotiation',
    'negotiating',
    'pending',
    'awaiting',
    'hold',
    'paused',
    'nurture',
    'nurturing',
    'warm',
    'passive',
    'escalated',
    'followup',
    'attention',
    'review',
    'busy',
  ]),
  info: Object.freeze([
    'new',
    'open',
    'contacted',
    'contact',
    'demo',
    'proposal',
    'quotation',
    'qualification',
    'progress',
    'working',
    'ongoing',
    'todo',
    'scheduled',
    'planned',
    'prospect',
    'initiated',
    'ringing',
    'reached',
    // NB: 'active' deliberately lives only in `success` — listing it here too
    // would be dead weight (success is checked first) and would suggest the
    // word is ambiguous when it is not.
  ]),
  neutral: Object.freeze([
    'backlog',
    'draft',
    'inactive',
    'archived',
    'archive',
    'closed',
    'unknown',
    'none',
    'default',
  ]),
})

/**
 * Standalone words that invert a following positive — "Not Qualified" is the
 * opposite of "Qualified", and word matching alone cannot see that.
 *
 * Only whole-word negators belong here. Prefixed forms ("Unqualified",
 * "Disqualified") tokenise as a single word and are listed directly in the
 * danger vocabulary instead.
 */
const NEGATORS = Object.freeze(['not', 'no', 'never', 'without'])

/**
 * Normalise a status for lookup: lowercase, trimmed, inner whitespace
 * collapsed. Punctuation is preserved so "demo/making" stays addressable as
 * a single exact key.
 *
 * @param {unknown} status
 * @returns {string} normalised value, or `''` when not a usable string.
 */
function normalise(status) {
  if (typeof status !== 'string') return ''
  return status.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Map a status value onto one of {@link TONES}.
 *
 * @param {string|null|undefined} status - Raw status, e.g. `'Ready to Close'`.
 * @returns {string} `danger` | `success` | `warning` | `info` | `neutral`.
 */
export function toneForStatus(status) {
  const value = normalise(status)
  if (!value) return 'neutral'

  // 1 — exact, the path every shipped status takes.
  if (Object.prototype.hasOwnProperty.call(EXACT, value)) return EXACT[value]

  // 2 — whole-word, for renamed or site-invented statuses. Word equality only;
  //     `includes` is never used, so "inactive" can never match "active".
  const words = value.split(/[^a-z0-9]+/).filter(Boolean)
  if (words.length) {
    // 2a — negation. Word matching alone cannot see that "Not Qualified" is
    //      the opposite of "Qualified": both contain the word, and the
    //      meaning lives in the word before it. A standalone negator in front
    //      of a positive therefore flips the result. (Prefixed negations —
    //      "Unqualified", "Disqualified" — are single tokens and are already
    //      listed in the danger vocabulary.)
    if (
      words.some((w) => NEGATORS.includes(w)) &&
      words.some((w) => WORDS.success.includes(w))
    ) {
      return 'danger'
    }

    for (const tone of TONES) {
      const vocabulary = WORDS[tone]
      if (words.some((word) => vocabulary.includes(word))) return tone
    }
  }

  // 3 — no defined meaning.
  return 'neutral'
}

/**
 * CSS class carrying a status's tone, for the `.crm-tone-*` classes.
 *
 * Returns a complete literal class name (never an interpolated fragment) so
 * Tailwind's content scan and any CSS purge step both see it.
 *
 * @param {string|null|undefined} status
 * @returns {string} e.g. `'crm-tone-success'`.
 */
export function toneClass(status) {
  return `crm-tone-${toneForStatus(status)}`
}
