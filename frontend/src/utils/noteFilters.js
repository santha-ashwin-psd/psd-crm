/**
 * Client-side filtering for the notes shown on a document's Notes tab.
 *
 * Extracted from `components/Activities/Activities.vue` so it can be unit
 * tested. Notes for a document are already loaded, so filtering here costs no
 * round trip.
 */

/** Scope values accepted by {@link filterNotes}. */
export const NOTE_SCOPE = {
  ALL: 'all',
  MINE: 'mine',
}

/**
 * Options offered by the Notes tab's scope dropdown.
 *
 * @returns {Array<{label: string, value: string}>}
 */
export function noteScopeOptions() {
  return [
    { label: __('All Notes'), value: NOTE_SCOPE.ALL },
    { label: __('My Notes'), value: NOTE_SCOPE.MINE },
  ]
}

/**
 * Strip HTML tags from note content so a search for "meeting" isn't defeated
 * by markup sitting between the letters.
 *
 * @param {string} html - Note content as stored (HTML).
 * @returns {string} Plain text, tags replaced by single spaces.
 */
export function stripHtml(html) {
  return (html || '').replace(/<[^>]*>/g, ' ')
}

/**
 * Filter notes by owner scope and a free-text query. The query matches the
 * title or the tag-stripped content, case-insensitively.
 *
 * @param {Array<Object>} notes - Notes to filter.
 * @param {Object} [options]
 * @param {string} [options.scope='all'] - `'all'` or `'mine'`.
 * @param {string} [options.query=''] - Free-text search; blank matches all.
 * @param {string} [options.currentUser] - Email used to resolve `'mine'`.
 * @returns {Array<Object>} A new array; the input is never mutated.
 */
export function filterNotes(notes, options = {}) {
  const { scope = NOTE_SCOPE.ALL, query = '', currentUser } = options
  let list = notes || []

  if (scope === NOTE_SCOPE.MINE) {
    list = list.filter((note) => note.owner === currentUser)
  }

  const needle = (query || '').trim().toLowerCase()
  if (!needle) return list

  return list.filter((note) => {
    const title = (note.title || '').toLowerCase()
    const content = stripHtml(note.content).toLowerCase()
    return title.includes(needle) || content.includes(needle)
  })
}
