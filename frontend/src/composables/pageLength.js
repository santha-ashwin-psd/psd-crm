import { useStorage } from '@vueuse/core'

/**
 * The server's own default, from `crm.api.doc.get_data`
 * (crm/api/doc.py — `page_length: int = 20, page_length_count: int = 20`).
 *
 * This value and PAGE_SIZE_OPTIONS must stay in lockstep. ListPagination
 * renders a native <select>, and a `value` that matches no <option> sets
 * selectedIndex to -1 and renders BLANK — which is what made the page-size
 * control look empty: the options were [10, 25, 50, 100] while the value
 * resolved to 20.
 */
export const DEFAULT_PAGE_LENGTH = 20

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100]

/**
 * Page size is a per-device preference, not part of a view's definition.
 *
 * It deliberately does NOT live on CRM View Settings: those rows can be
 * `public`, so persisting it there would mean one user picking 100 changes the
 * page size for everyone sharing that view.
 *
 * @param {string} doctype
 * @param {string} viewKey - the saved view name, or 'default'
 */
export function usePageLength(doctype, viewKey = 'default') {
  return useStorage(`crm:pageLength:${doctype}:${viewKey}`, DEFAULT_PAGE_LENGTH)
}
