import { createApp } from 'vue'

/**
 * Run a composable inside a real component instance.
 *
 * A composable that uses `onMounted` / `onUnmounted` — or anything else that
 * needs an active instance — cannot simply be called from a test: the hooks
 * are dropped with a warning and never fire. Mounting the component under test
 * is the usual answer in this suite, but for a composable with no component of
 * its own that means inventing a host and stubbing whatever it renders.
 *
 * This gives it the smallest possible host: an app whose only job is to call
 * the composable and render nothing.
 *
 * ```js
 * const [alerts, app] = withSetup(useEventNotificationAlert)
 * // …assertions…
 * app.unmount()   // fires onUnmounted, so cleanup can be asserted
 * ```
 *
 * @param {Function} composable
 * @param  {...any} args - passed through to the composable
 * @returns {[any, import('vue').App]} what it returned, and the host app
 */
export function withSetup(composable, ...args) {
  let result
  const app = createApp({
    setup() {
      result = composable(...args)
      return () => null
    },
  })
  app.mount(document.createElement('div'))
  return [result, app]
}
