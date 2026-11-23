const LOST_FIELDS = ['lost_reason', 'lost_notes']

/**
 * Whether a side-panel section only holds the lost-reason fields.
 *
 * Matched by its fields rather than its name, so a site that rebuilt the
 * section in the layout editor (and got a new random name) is still covered.
 *
 * @param {{ name?: string, columns?: Array<{ fields?: Array<string|object> }> }} section
 */
export function isLostReasonSection(section) {
  if (section?.name === 'lost_reason_section') return true
  const fields = (section?.columns || []).flatMap((c) => c.fields || [])
  if (!fields.length) return false
  return fields.every((f) =>
    LOST_FIELDS.includes(typeof f === 'string' ? f : f?.fieldname),
  )
}

/**
 * Whether to show the lost-reason section for a deal: in a Lost stage, or when
 * a reason was recorded (so moving a deal back out of Lost never hides data).
 * Elsewhere the empty "Lost Reason" box only made an open deal look lost.
 *
 * @param {object} doc - The deal.
 * @param {(status: string) => ({ type?: string }|undefined)} getDealStatus
 */
export function showLostReasonSection(doc, getDealStatus) {
  if (!doc) return false
  if (doc.lost_reason || doc.lost_notes) return true
  return getDealStatus(doc.status)?.type === 'Lost'
}
