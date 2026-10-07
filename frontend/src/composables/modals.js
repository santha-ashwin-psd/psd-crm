import { ref } from 'vue'

export const showQuickEntryModal = ref(false)
export const quickEntryProps = ref({})

export const showAboutModal = ref(false)

export const showChangePasswordModal = ref(false)

/**
 * Doctypes whose title and body ARE the document, rather than two of several
 * equal attributes. Their create/edit popups get the composer treatment —
 * borderless title and body, metadata demoted to a compact grid — instead of
 * the generic label-above-box doctype form.
 *
 * Shared because two different components can render the same form: the page's
 * own create action opens DoctypeModal, while the header "+ Create" opens
 * CreateDocumentModal. Both must agree or the same task looks like two products.
 *
 * See `.crm-doc-modal--composer` in index.css.
 */
export const COMPOSER_DOCTYPES = ['CRM Task', 'FCRM Note']

export function composerClassFor(doctype) {
  return COMPOSER_DOCTYPES.includes(doctype) ? 'crm-doc-modal--composer' : ''
}
