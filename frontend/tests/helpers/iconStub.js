/**
 * Stand-in for every `~icons/*` import.
 *
 * Those are virtual modules produced by unplugin-icons via the frappe-ui vite
 * plugin. That plugin also wires up a dev proxy and Jinja boot-data injection,
 * none of which a unit test wants, so `vitest.config.js` aliases the whole
 * `~icons/` namespace here instead. Icon glyphs are never what a unit test is
 * asserting on; that a component renders *an* icon is enough.
 */
export default {
  name: 'IconStub',
  template: '<svg class="stub-icon" aria-hidden="true" />',
}
