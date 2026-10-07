import { ref } from 'vue'

// The current page's primary "Create" action. Pages with a specialised create
// flow (Notes, Call Logs, Calendar events, ...) register a function here on
// mount and clear it on unmount; the global header's +Create button triggers it.
// When null, the header falls back to route→doctype createDocument, then to the
// quick-create dropdown.
export const pageCreateAction = ref(null)

// The current page's list-refresh function. ViewControls owns the list resource,
// so a create started from the global header has no other way to refresh it —
// which is why a new record only appeared after a manual reload. List pages
// register this on mount and clear it on unmount.
export const pageReloadAction = ref(null)

// Whether the current page teleported a primary action (e.g. "Convert to Deal")
// into the header's #app-header-primary slot. LayoutHeader sets this on mount so
// the global header can, for instance, only show its divider when there is
// actually an action sitting to the left of the account menu.
export const headerPrimaryActionPresent = ref(false)
