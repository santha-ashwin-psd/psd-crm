import { computed, unref } from 'vue'
import { getMeta } from '@/stores/meta'
import { usersStore } from '@/stores/users'
import { statusesStore } from '@/stores/statuses'
import { formatDate } from '@/utils'

/**
 * The header facts for a deal, formatted for display.
 *
 * Extracted because the desktop (pages/Deal.vue) and mobile (pages/MobileDeal.vue)
 * detail pages need exactly the same six values and the same pipeline stages,
 * and the two pages had already drifted apart once — mobile still showed only
 * a status dropdown while desktop had gained an identity line and a fact band.
 * One definition means the two cannot disagree about what a deal is worth.
 *
 * Presentation is deliberately NOT included: the two pages lay these out very
 * differently (a six-tile band vs a two-column strip), and forcing a shared
 * layout on them would be abstraction for its own sake.
 *
 * @param {import('vue').Ref<object>|object} doc - The deal document (ref or plain).
 * @param {import('vue').Ref<object>|object} [organization] - Optional linked org.
 */
export function useDealFacts(doc, organization) {
  const { getFormattedCurrency } = getMeta('CRM Deal')
  const { getUser } = usersStore()
  const { dealStatuses } = statusesStore()

  const d = () => unref(doc) || {}
  const org = () => unref(organization) || null

  /**
   * The customer, which is the deal's identity.
   *
   * Deliberately separate from the doctype's `title` field: that resolves to
   * the record name when no organization is set, which is how the page came to
   * show the deal ID as both its heading and its subtitle.
   */
  const dealName = computed(() => d().organization || org()?.name || '')

  // Money and dates go through the same meta-aware formatters the list and the
  // side panel use, so the deal's own currency and the site's date format are
  // respected rather than re-implemented. A missing value is an em dash, never
  // a zero — a zero asserts a number nobody entered.
  const dealValue = computed(() =>
    d().deal_value ? getFormattedCurrency('deal_value', d()) : '—',
  )

  const expectedValue = computed(() =>
    d().expected_deal_value
      ? getFormattedCurrency('expected_deal_value', d())
      : '—',
  )

  /**
   * Probability, trimmed of meaningless precision.
   *
   * The meta formatter renders a Percent field at the field's full precision
   * ("10.000%"), which reads as spurious accuracy on a header tile. 10 shows
   * as "10%"; a real 12.5 still shows as "12.5%".
   */
  const probabilityLabel = computed(() => {
    const raw = d().probability
    if (raw === null || raw === undefined || raw === '') return '—'
    const n = Number(raw)
    if (Number.isNaN(n)) return '—'
    return `${parseFloat(n.toFixed(2))}%`
  })

  const expectedCloseLabel = computed(() =>
    d().expected_closure_date
      ? formatDate(d().expected_closure_date, '', true)
      : '—',
  )

  const ownerName = computed(() => {
    const o = d().deal_owner
    if (!o) return ''
    return getUser(o)?.full_name || o
  })

  /**
   * Stages for the pipeline: the site's own CRM Deal Status rows. Ordering and
   * which stages are terminal are decided by StatusPipeline from each row's
   * `position` and `type`, so a site that renames or reorders its stages needs
   * no change here.
   */
  const pipelineStages = computed(() => dealStatuses.data || [])

  return {
    dealName,
    dealValue,
    expectedValue,
    probabilityLabel,
    expectedCloseLabel,
    ownerName,
    pipelineStages,
  }
}
