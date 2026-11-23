import { getSettings } from '@/stores/settings'
import { formatError } from '@/utils/formatError'
import { call, toast } from 'frappe-ui'
import { computed, ref } from 'vue'

/**
 * "Draft with AI" for a composer (xbr_crm/ai/drafts.py). Only pipelines have a
 * conversation the AI can read, so it is offered on CRM Deal only, and only
 * while the AI assistant is switched on.
 *
 * @param {() => string} doctype
 * @param {() => string} docname
 * @param {'email' | 'whatsapp' | (() => string)} channel fixed, or read at draft time
 */
export function useAiDraft(doctype, docname, channel) {
  const drafting = ref(false)

  const available = computed(
    () =>
      doctype() === 'CRM Deal' &&
      Boolean(docname()) &&
      Boolean(getSettings()._settings.doc?.ai_enabled),
  )

  /**
   * @param {string} notes what the salesperson typed so far, used as points to cover
   * @returns {Promise<{text: string, html: string} | null>}
   */
  async function draft(notes = '') {
    drafting.value = true
    try {
      return await call('xbr_crm.ai.drafts.draft_reply', {
        deal: docname(),
        channel: typeof channel === 'function' ? channel() : channel,
        notes,
      })
    } catch (error) {
      toast.error(formatError(error, __('AI could not write a draft')))
      return null
    } finally {
      drafting.value = false
    }
  }

  return { available, drafting, draft }
}
