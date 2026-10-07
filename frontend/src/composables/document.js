import { ref } from 'vue'
import { call, toast } from 'frappe-ui'

export const showCreateDocumentModal = ref(false)
export const createDocumentDoctype = ref('')
export const createDocumentData = ref({})
export const createDocumentCallback = ref(null)

async function shouldCreateProductInERPNext() {
  try {
    const [enabled, syncProducts] = await Promise.all([
      getERPNextSetting('enabled'),
      getERPNextSetting('sync_products'),
    ])
    return !!enabled && !!syncProducts
  } catch {
    return false
  }
}

function getERPNextSetting(field) {
  return call('frappe.client.get_single_value', {
    doctype: 'ERPNext CRM Settings',
    field,
  })
}

export async function createDocument(doctype, obj, close, callback) {
  if (!doctype) return
  if (doctype === 'CRM Product' && (await shouldCreateProductInERPNext())) {
    close?.()
    toast.info(__('Create products as Items in ERPNext'))
    window.open('/app/item/new', '_blank')
    return
  }
  close?.()
  createDocumentDoctype.value = doctype
  createDocumentData.value = obj || {}
  createDocumentCallback.value = callback || null
  showCreateDocumentModal.value = true
}

/**
 * Invoke whatever `createDocument()` registered, then forget it.
 *
 * GlobalModals used to call `createDocumentCallback(data)` straight from the
 * template. When nothing had registered one — every create started from the app
 * header — that is a call to `null`, which throws and aborts the handler, so the
 * list never refreshed and the new record only appeared on a manual reload.
 *
 * Clearing it is the other half: the ref was never reset, so a callback left
 * behind by one modal stayed armed and fired again on the next, unrelated
 * create.
 */
export function runCreateDocumentCallback(data) {
  const callback = createDocumentCallback.value
  createDocumentCallback.value = null
  callback?.(data)
}
