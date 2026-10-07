import { mount } from '@vue/test-utils'

/**
 * Stubs for the frappe-ui components that `src/main.js` registers globally.
 *
 * A component under test uses `<Button>` / `<Badge>` / `<FeatherIcon>` without
 * importing them, so mounting it in isolation would fail on unknown elements.
 * Stubbing rather than registering the real components keeps unit tests off
 * the frappe-ui plugin (which opens a socket) and keeps assertions about our
 * own markup stable when frappe-ui restyles theirs.
 *
 * @type {Object<string, import('vue').Component>}
 */
export const globalComponentStubs = {
  Button: {
    props: ['label', 'variant', 'icon', 'iconLeft', 'iconRight', 'loading'],
    template:
      '<button class="stub-button" :data-variant="variant">{{ label }}<slot /></button>',
  },
  Badge: {
    props: ['label', 'theme', 'variant'],
    template: '<span class="stub-badge">{{ label }}<slot /></span>',
  },
  FeatherIcon: {
    props: ['name'],
    template: '<svg class="stub-feather" :data-name="name" />',
  },
  FormControl: {
    props: ['modelValue', 'type', 'placeholder', 'options', 'label'],
    template:
      '<div class="stub-form-control" :data-type="type"><slot name="prefix" /><input :placeholder="placeholder" /></div>',
  },
  TextInput: {
    props: ['modelValue', 'type', 'placeholder'],
    template: '<input class="stub-text-input" :placeholder="placeholder" />',
  },
  Input: {
    props: ['modelValue', 'type'],
    template: '<input class="stub-input" />',
  },
  ErrorMessage: {
    props: ['message'],
    template: '<div class="stub-error">{{ message }}</div>',
  },
  Dialog: {
    props: ['open'],
    template: '<div class="stub-dialog"><slot name="body" /><slot /></div>',
  },
  // CrmDialog is imported explicitly by the modals that use it, so without a
  // stub the real one mounts, pulls in frappe-ui's Dialog, and portals its
  // content to document.body — where `wrapper.find()` cannot reach it.
  CrmDialog: {
    props: [
      'open',
      'modelValue',
      'size',
      'title',
      'subtitle',
      'icon',
      'theme',
      'headerVariant',
      'hideHeader',
      'flush',
      'bodyClass',
      'footerAlign',
    ],
    // Renders only while open, as the real one does: frappe-ui portals the
    // content on open, so a closed dialog contributes nothing to the page. An
    // always-rendering stub mounts nested editors that should not exist yet —
    // a second "Add Condition" menu, a recursive conditions tree.
    template:
      '<div v-if="open || modelValue" class="stub-crm-dialog">' +
      '<h3 class="stub-crm-dialog-title">{{ title }}</h3>' +
      '<p class="stub-crm-dialog-subtitle">{{ subtitle }}</p>' +
      '<slot name="title" /><slot name="subtitle" />' +
      '<slot name="header-actions" :close="close" />' +
      '<slot :close="close" />' +
      '<slot name="footer" :close="close" />' +
      '</div>',
    methods: {
      close() {
        this.$emit('update:open', false)
        this.$emit('close')
      },
    },
  },
  Alert: { template: '<div class="stub-alert"><slot /></div>' },
}

/**
 * Mount a component with the app's global components stubbed.
 *
 * @param {import('vue').Component} component - Component under test.
 * @param {Object} [options] - Standard `@vue/test-utils` mount options. Any
 *   `global.stubs` supplied here are merged over the defaults.
 * @returns {import('@vue/test-utils').VueWrapper}
 */
export function mountComponent(component, options = {}) {
  const { global: globalOptions = {}, ...rest } = options
  const { config = {}, ...restGlobal } = globalOptions
  return mount(component, {
    ...rest,
    global: {
      ...restGlobal,
      stubs: { ...globalComponentStubs, ...(globalOptions.stubs || {}) },
      config: {
        ...config,
        globalProperties: {
          // `__()` used inside a <template> resolves through the component
          // instance, not module scope, so the global in tests/setup.js is not
          // enough — the app registers it as a global property via
          // translationPlugin, and mounts here need the same.
          __: globalThis.__,
          ...(config.globalProperties || {}),
        },
      },
    },
  })
}
