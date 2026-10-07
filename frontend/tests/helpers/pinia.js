import { createPinia, setActivePinia } from 'pinia'
import { reactive } from 'vue'
import { vi } from 'vitest'

/**
 * Install a fresh pinia for a test.
 *
 * The app's stores are `defineStore` setup stores, so calling one outside a
 * component needs an active pinia or it throws "getActivePinia() was called
 * but there was no active Pinia". A new instance per test also stops state
 * leaking between them.
 *
 * @returns {import('pinia').Pinia}
 */
export function withPinia() {
  const pinia = createPinia()
  setActivePinia(pinia)
  return pinia
}

/**
 * Stand-in for frappe-ui's `createListResource` / `createResource`.
 *
 * The real ones fetch on creation when `auto: true`, which a unit test must
 * not do. This keeps the parts stores actually read — `data`, and the
 * `transform` hook — and records calls to the rest.
 *
 * Seed it with `resource._seed(rows)` to push rows through `transform` exactly
 * as a real response would.
 *
 * @param {Object} [options] - The options the store passed in.
 * @returns {Object} A reactive fake resource.
 */
export function fakeResource(options = {}) {
  const resource = reactive({
    options,
    data: options.initialData ?? null,
    loading: false,
    error: null,
    fetch: vi.fn(),
    reload: vi.fn(),
    submit: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    setValue: vi.fn(),
    delete: vi.fn(),
    reset: vi.fn(),
    /**
     * Push rows through the store's `transform` and store the result, the way
     * a real fetch would.
     * @param {any} rows
     */
    _seed(rows) {
      resource.data = options.transform ? options.transform(rows) : rows
      options.onSuccess?.(resource.data)
      return resource.data
    },
  })
  return resource
}
