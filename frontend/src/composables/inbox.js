import { createResource } from 'frappe-ui'
import { ref, watch } from 'vue'

/**
 * How many conversations wait on a reply (xbr_crm/api/inbox.py): the sidebar's
 * Inbox badge. One shared resource, refreshed every minute and whenever the
 * inbox opens a thread or sends a reply.
 */
export const needsReplyCount = createResource({
  url: 'xbr_crm.api.inbox.get_needs_reply_count',
  cache: 'crm-inbox-needs-reply',
  initialData: 0,
  auto: true,
})

let timer = null
export function startInboxPolling() {
  if (timer) return
  timer = setInterval(() => needsReplyCount.reload(), 60 * 1000)
}

/**
 * The Inbox filters. Kept here, outside the page, so they stay as the person
 * set them until they change them: opening a conversation, going to a pipeline
 * and coming back, or reloading the page all keep them. Saved in this
 * browser only (localStorage); a blocked or private-mode storage just means
 * they start at the defaults.
 */
const FILTERS_KEY = 'crm-inbox-filters'
const DEFAULT_FILTERS = { search: '', filter: 'all', channel: '', stage: '' }

function loadFilters() {
  try {
    const saved = JSON.parse(localStorage.getItem(FILTERS_KEY) || '{}')
    return { ...DEFAULT_FILTERS, ...(saved && typeof saved === 'object' ? saved : {}) }
  } catch {
    return { ...DEFAULT_FILTERS }
  }
}

const saved = loadFilters()
export const inboxFilters = {
  search: ref(String(saved.search || '')),
  filter: ref(['all', 'needs_reply', 'mine'].includes(saved.filter) ? saved.filter : 'all'),
  channel: ref(['', 'email', 'whatsapp'].includes(saved.channel) ? saved.channel : ''),
  stage: ref(String(saved.stage || '')),
}

watch(Object.values(inboxFilters), () => {
  try {
    localStorage.setItem(
      FILTERS_KEY,
      JSON.stringify(Object.fromEntries(Object.entries(inboxFilters).map(([k, v]) => [k, v.value]))),
    )
  } catch {
    // Storage unavailable: the filters still hold for this visit.
  }
})
