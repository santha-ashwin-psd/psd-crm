// Minimal globals that CRM code expects
globalThis.__ = (msg, args) => {
  if (!args) return msg
  let str = msg
  if (Array.isArray(args)) {
    args.forEach((arg, i) => {
      str = str.replace(`{${i}}`, arg)
    })
  }
  return str
}

globalThis.window = globalThis.window || {}
globalThis.window.sysdefaults = { currency: 'USD' }

// Page size is persisted per device (composables/pageLength.js), so a test that
// calls setPageSize() leaves the value behind for every test that follows it in
// the same file. Only these keys are cleared — several suites seed localStorage
// deliberately (useActiveTabManager, ListRows, Resizer) and must keep it.
beforeEach(() => {
  try {
    for (const key of Object.keys(globalThis.localStorage ?? {})) {
      if (key.startsWith('crm:pageLength:')) localStorage.removeItem(key)
    }
  } catch {
    // No localStorage in this environment — nothing to reset.
  }
})

/**
 * No test may reach the network.
 *
 * A component whose meta/resource mock is missing falls through to the real
 * `createResource`, which calls `fetch`. happy-dom happily attempts it, the
 * request fails against nothing, and the rejection surfaces at the *end* of the
 * run as an unhandled error with no test attached to it. A single un-mocked
 * component produced 7,703 of them, held the Vite server open past the run, and
 * made a dozen unrelated tests flake — while the suite still reported green.
 *
 * Throwing here instead puts the failure in the test that caused it, with the
 * URL in the message. A suite that genuinely wants to exercise fetch can stub
 * it itself; assigning over this is enough.
 */
globalThis.fetch = () => {
  throw new Error(
    'A test tried to reach the network. Mock the store or resource it comes ' +
      'from — see tests/setup.js for why this throws.',
  )
}
