import { createResource } from 'frappe-ui'

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
