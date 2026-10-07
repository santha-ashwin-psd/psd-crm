import { ref } from 'vue'

// The Leads on/off switch (FCRM Settings → enable_leads).
//
// Kept apart from stores/settings.js on purpose: that module creates its
// document resource the moment it is imported, and the router imports this one
// before main.js has configured frappe-ui's request fetcher. Importing the
// store from here would fire that request too early, against the wrong URL.
const liveValue = ref(null)

/** Called by the settings store whenever FCRM Settings (re)loads. */
export function setLeadsEnabled(value) {
  liveValue.value = value == null ? null : Boolean(value)
}

/**
 * Whether the Leads feature is switched on.
 *
 * Uses the loaded settings once available and the boot value before that, so
 * the router guard and the first sidebar render agree with the server without
 * waiting on a request.
 */
export function isLeadsEnabled() {
  return liveValue.value ?? Boolean(window.enable_leads)
}

/**
 * Options for the "Lead or Deal" document-type pickers in Settings
 * (assignment rules, SLAs, email templates, web forms). Lead is left out while
 * Leads are switched off.
 */
export function leadDealDoctypeOptions() {
  return [
    ...(isLeadsEnabled() ? [{ label: __('Lead'), value: 'CRM Lead' }] : []),
    { label: __('Deal'), value: 'CRM Deal' },
  ]
}

/** The doctype a new Lead-or-Deal setting starts on. */
export function defaultLeadDealDoctype() {
  return isLeadsEnabled() ? 'CRM Lead' : 'CRM Deal'
}
