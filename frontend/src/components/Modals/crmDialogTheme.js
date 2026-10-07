/**
 * The single switch for the dialog header treatment.
 *
 *   'chip'   icon chip + title + optional subtitle          (default)
 *   'plain'  title + optional subtitle, no chip
 *   'wash'   'chip' plus the Settings gradient + topo lines behind the header
 *
 * Changing this constant restyles every CrmDialog in the app at once. An
 * individual dialog can override it with the `headerVariant` prop, but
 * shouldn't — the point of the constant is that popups stay uniform.
 */
export const CRM_DIALOG_HEADER_VARIANT = 'wash'

/**
 * Settings.vue's 7-path topographic wash, lifted out so the shell and the
 * Settings pane draw the same curves instead of each owning a copy.
 */
export const CRM_WASH_PATHS = [
  'M-40 8 C 240 -62, 470 96, 770 26 S 1160 -50, 1300 42',
  'M-40 40 C 240 -30, 470 128, 770 58 S 1160 -18, 1300 74',
  'M-40 72 C 240 2, 470 160, 770 90 S 1160 14, 1300 106',
  'M-40 104 C 240 34, 470 192, 770 122 S 1160 46, 1300 138',
  'M-40 136 C 240 66, 470 224, 770 154 S 1160 78, 1300 170',
  'M-40 168 C 240 98, 470 256, 770 186 S 1160 110, 1300 202',
  'M-40 200 C 240 130, 470 288, 770 218 S 1160 142, 1300 234',
]

/**
 * The 3-step width scale. `5xl` is reserved for the Settings modal, whose
 * two-pane layout is the reason the scale exists.
 */
export const CRM_DIALOG_SIZES = ['sm', 'xl', '4xl', '5xl']

/**
 * Map a caller-supplied frappe-ui size onto the scale. Used by the modals that
 * forward a size they were handed (CreateDocumentModal, $dialog payloads).
 */
export function clampDialogSize(size) {
  if (CRM_DIALOG_SIZES.includes(size)) return size
  if (['xs', 'sm', 'md'].includes(size)) return 'sm'
  if (['lg', 'xl', '2xl', '3xl'].includes(size)) return 'xl'
  return '4xl'
}
