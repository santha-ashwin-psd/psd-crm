/**
 * Text helpers for the shared empty state and activity headers.
 *
 * Extracted from `components/ListViews/EmptyState.vue` and
 * `components/Activities/ActivityHeader.vue` so they can be unit tested. One
 * EmptyState component backs every empty screen in the app, so a regression
 * here is visible in ~19 places at once.
 */

/**
 * Split a description into one string per sentence, so each renders on its own
 * line rather than wrapping wherever the box happens to end.
 *
 * Deliberately avoids a lookbehind assertion: that is a parse-time error on
 * older Safari, which would take down the whole chunk rather than just this
 * function.
 *
 * @param {string} text - Description, typically one or two sentences.
 * @returns {string[]} One entry per sentence. Single-sentence input is
 *   returned unchanged, punctuation and all.
 */
export function splitDescriptionLines(text) {
  const value = text || ''
  const parts = value.split(/\.\s+/)
  if (parts.length === 1) return [value]
  // Restore the period the split consumed, except on the trailing fragment,
  // which keeps whatever punctuation it already had.
  return parts.map((part, i) => (i === parts.length - 1 ? part : `${part}.`))
}

/**
 * The noun used when addressing the current record in prose, by doctype.
 *
 * @type {Object<string, () => string>}
 */
export const DOCTYPE_NOUNS = {
  'CRM Deal': () => __('deal'),
  'CRM Lead': () => __('lead'),
  Contact: () => __('contact'),
  'CRM Organization': () => __('organization'),
}

/**
 * Standfirst under the Notes tab heading. The noun follows the doctype,
 * because the same header serves leads, contacts and organizations too.
 *
 * @param {string} doctype - e.g. `'CRM Deal'`.
 * @returns {string} The subtitle sentence.
 */
export function notesSubtitle(doctype) {
  const noun = DOCTYPE_NOUNS[doctype]
  const word = noun ? noun() : __('record')
  return __('Capture important details and updates about this {0}.', [word])
}
