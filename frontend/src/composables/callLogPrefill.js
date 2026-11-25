import { call } from 'frappe-ui'
import { watch } from 'vue'

/**
 * Create Call Log fills From and To itself (xbr_crm/api/call_log.py):
 *
 *   Outgoing: From = my number,     To = the pipeline's number
 *   Incoming: From = their number,  To = my number
 *
 * Changing the type swaps them. A number someone typed is never overwritten:
 * a field is only (re)filled while it is empty or still holds what was filled
 * in automatically. A new log also starts as an Outgoing, Completed call.
 */
export function numbersFor(type, mine, theirs) {
  return type === 'Incoming'
    ? { from: theirs, to: mine }
    : { from: mine, to: theirs }
}

export async function prefillCallLog(getDoc) {
  const doc = getDoc()
  if (!doc.type) doc.type = 'Outgoing'
  if (!doc.status) doc.status = 'Completed'

  let numbers = { mine: '', theirs: '' }
  try {
    numbers =
      (await call('xbr_crm.api.call_log.get_prefill', {
        reference_doctype: doc.reference_doctype,
        reference_docname: doc.reference_docname,
      })) || numbers
  } catch {
    // No numbers to offer: the form simply stays empty, as before.
  }

  let filled = { from: '', to: '' }
  function apply() {
    const d = getDoc()
    const want = numbersFor(d.type, numbers.mine || '', numbers.theirs || '')
    for (const field of ['from', 'to']) {
      if (!d[field] || d[field] === filled[field]) d[field] = want[field]
    }
    filled = want
  }
  apply()
  return watch(() => getDoc().type, apply)
}
