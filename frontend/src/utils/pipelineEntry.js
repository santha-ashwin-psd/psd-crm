// Helpers for the Create Pipeline form: input clean-up, validation, the extra
// layout fields, and the browser-only draft.

// Fields the form lays out itself. Anything else in the admin's Quick Entry
// layout is shown under "More details".
export const CORE_FIELDS = [
  'organization',
  'organization_name',
  'website',
  'industry',
  'territory',
  'no_of_employees',
  'contact',
  'first_name',
  'last_name',
  'email',
  'mobile_no',
  'status',
  'deal_owner',
  'source',
  'deal_value',
  'expected_closure_date',
  'probability',
  'next_step',
]

// Kept by "Create & New": entries made in a batch usually share these.
export const STICKY_FIELDS = ['deal_owner', 'status', 'source', 'currency']

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// Same rule as the server (web_lead.normalize_mobile + pipeline_entry.clean_mobile):
// Indian mobiles become +91XXXXXXXXXX, other numbers must start with +.
// Returns { value, error }.
export function cleanMobile(raw) {
  const text = String(raw || '').trim()
  if (!text) return { value: '', error: null }
  let digits = text.replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2)
  else if (digits.length === 11 && digits.startsWith('0'))
    digits = digits.slice(1)
  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    return { value: `+91${digits}`, error: null }
  }
  const all = text.replace(/\D/g, '')
  if (text.startsWith('+') && all.length >= 8 && all.length <= 15) {
    return { value: `+${all}`, error: null }
  }
  return {
    value: text,
    error: __(
      'Enter a 10-digit mobile number, or an international one starting with +',
    ),
  }
}

export function isValidEmail(raw) {
  return EMAIL_RE.test(String(raw || '').trim())
}

// Every problem at once, keyed by field name, so each shows under its field.
export function validateEntry(doc, { existingContact = false } = {}) {
  const errors = {}
  if (!doc.status) errors.status = __('Choose a stage')

  if (!existingContact) {
    const hasContact = doc.last_name || doc.email || doc.mobile_no
    if (hasContact && !String(doc.first_name || '').trim()) {
      errors.first_name = __('First name is required for a new contact')
    }
    const mobile = cleanMobile(doc.mobile_no)
    if (mobile.error) errors.mobile_no = mobile.error
    if (doc.email && !isValidEmail(doc.email)) {
      errors.email = __('Enter a valid email address')
    }
  }

  if (doc.deal_value !== '' && doc.deal_value != null) {
    const value = Number(String(doc.deal_value).replace(/,/g, ''))
    if (Number.isNaN(value) || value < 0) {
      errors.deal_value = __('Enter an amount of 0 or more')
    }
  }
  if (doc.probability !== '' && doc.probability != null) {
    const p = Number(doc.probability)
    if (Number.isNaN(p) || p < 0 || p > 100) {
      errors.probability = __('Between 0 and 100')
    }
  }
  return errors
}

// The admin's layout without the fields the form already shows; sections and
// columns left empty are dropped. Returns [] when nothing is left.
export function extraTabs(tabs) {
  if (!Array.isArray(tabs)) return []
  return tabs
    .map((tab) => ({
      ...tab,
      sections: (tab.sections || [])
        .map((section) => ({
          ...section,
          hidden: false,
          columns: (section.columns || [])
            .map((column) => ({
              ...column,
              fields: (column.fields || []).filter(
                (f) => f && !CORE_FIELDS.includes(f.fieldname),
              ),
            }))
            .filter((column) => column.fields.length),
        }))
        .filter((section) => section.columns.length),
    }))
    .filter((tab) => tab.sections.length)
}

// ---------------------------------------------------------------------------
// Draft (this browser only)
// ---------------------------------------------------------------------------

const DRAFT_DAYS = 7

export function draftKey(user) {
  return `crm:pipeline-draft:${user || 'anonymous'}`
}

// Something worth keeping: any field typed beyond the defaults.
export function hasContent(doc, note) {
  const typed = [
    'first_name',
    'last_name',
    'email',
    'mobile_no',
    'contact',
    'organization',
    'organization_name',
    'deal_value',
    'expected_closure_date',
    'next_step',
  ]
  return (
    Boolean(note?.trim()) || typed.some((f) => String(doc?.[f] ?? '').trim())
  )
}

export function saveDraft(user, doc, note) {
  try {
    if (!hasContent(doc, note)) {
      localStorage.removeItem(draftKey(user))
      return
    }
    localStorage.setItem(
      draftKey(user),
      JSON.stringify({ savedAt: Date.now(), doc, note }),
    )
  } catch {
    // Storage blocked (private window): drafts are a convenience only.
  }
}

export function loadDraft(user) {
  try {
    const raw = localStorage.getItem(draftKey(user))
    if (!raw) return null
    const draft = JSON.parse(raw)
    if (!draft?.savedAt || Date.now() - draft.savedAt > DRAFT_DAYS * 864e5) {
      localStorage.removeItem(draftKey(user))
      return null
    }
    return draft
  } catch {
    return null
  }
}

export function clearDraft(user) {
  try {
    localStorage.removeItem(draftKey(user))
  } catch {
    // ignore
  }
}
