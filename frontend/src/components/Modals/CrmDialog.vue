<!--
  CrmDialog — the shared modal shell.

  Every popup in the app is meant to read as the same surface as the Settings
  modal: a 36px accent chip, a 16/600 title, an optional subtitle, a hairline
  divider, a scrolling body and a footer bar. Building that once here means a
  new modal inherits it for free, and the header treatment stays a one-line
  change (CRM_DIALOG_HEADER_VARIANT in ./crmDialogTheme.js) rather than an edit
  to forty files.

  It wraps frappe-ui's Dialog with `bare` + `#default`, not the `#body` slot —
  `#body` warns on every render; `bare` is the sanctioned way to opt out of
  frappe-ui's own chrome and produces the same "panel with nothing in it".

  Styles live in src/index.css under `.crm-dialog__*`, not in a <style scoped>
  block: the body slot is full of frappe-ui internals that a data-v attribute
  never reaches — the same reason .crm-settings-modal and .crm-doc-modal are
  global.
-->
<template>
  <Dialog
    :open="open"
    :size="size"
    bare
    :dismissible="dismissible"
    @update:open="(value) => emit('update:open', value)"
    @close="emit('close')"
    @after-leave="emit('after-leave')"
  >
    <template #default="{ close }">
      <div
        class="crm-dialog font-sans"
        :class="[rootClass, { 'crm-dialog--wash': showWash }]"
      >
        <!-- The wash is a child of the panel, not of the header, so it fades
             down past the header into the top of the body exactly as it does
             in the Settings pane. Header and body go transparent in this
             variant so the panel's own surface shows through beneath it. -->
        <template v-if="showWash">
          <div class="crm-dialog__wash-gradient" aria-hidden="true" />
          <svg
            class="crm-dialog__wash crm-wash-mask"
            viewBox="0 0 1200 220"
            preserveAspectRatio="none"
            fill="none"
            aria-hidden="true"
          >
            <g
              stroke="var(--crm-accent-primary)"
              stroke-opacity="0.13"
              stroke-width="1"
              fill="none"
            >
              <path v-for="d in CRM_WASH_PATHS" :key="d" :d="d" />
            </g>
          </svg>
        </template>

        <div
          v-if="!hideHeader"
          class="crm-dialog__header"
          :class="`crm-dialog__header--${variant}`"
        >
          <div class="crm-dialog__heading">
            <span
              v-if="showChip && icon"
              class="crm-dialog__chip"
              :class="`crm-dialog__chip--${theme}`"
            >
              <span
                v-if="isLucideName"
                :class="[icon, 'size-[18px]']"
                aria-hidden="true"
              />
              <FeatherIcon
                v-else-if="typeof icon === 'string'"
                :name="icon"
                class="size-[18px]"
              />
              <component :is="icon" v-else class="size-[18px]" />
            </span>
            <div class="min-w-0">
              <h3 class="crm-dialog__title">
                <slot name="title">{{ __(title) }}</slot>
              </h3>
              <p
                v-if="subtitle || $slots.subtitle"
                class="crm-dialog__subtitle"
              >
                <slot name="subtitle">{{ __(subtitle) }}</slot>
              </p>
            </div>
          </div>

          <div class="crm-dialog__header-actions">
            <slot name="header-actions" :close="close" />
            <button
              v-if="showClose"
              type="button"
              class="crm-dialog__close"
              :aria-label="__('Close')"
              @click="close"
            >
              <FeatherIcon name="x" class="size-4" />
            </button>
          </div>
        </div>

        <div
          class="crm-dialog__body"
          :class="[bodyClass, { 'crm-dialog__body--flush': flush }]"
          :style="{ maxHeight: maxBodyHeight }"
        >
          <slot :close="close" />
        </div>

        <!-- The footer element only exists when something fills it, so a
             dialog with no actions doesn't show an empty bar. -->
        <div
          v-if="$slots.footer"
          class="crm-dialog__footer"
          :class="`crm-dialog__footer--${footerAlign}`"
        >
          <slot name="footer" :close="close" />
        </div>
      </div>
    </template>
  </Dialog>
</template>

<script setup>
import { Dialog, FeatherIcon } from 'frappe-ui'
import { computed } from 'vue'
import {
  CRM_DIALOG_HEADER_VARIANT,
  CRM_DIALOG_SIZES,
  CRM_WASH_PATHS,
} from './crmDialogTheme'

const props = defineProps({
  /** v-model:open */
  open: { type: Boolean, default: false },

  /** The 3-step scale — anything else is a bug, not a design choice. */
  size: {
    type: String,
    default: 'xl',
    validator: (v) => CRM_DIALOG_SIZES.includes(v),
  },

  title: { type: String, default: '' },
  subtitle: { type: String, default: '' },

  /** A feather name, a `lucide-*` class string, or an icon component. */
  icon: { type: [String, Object, Function], default: '' },
  theme: {
    type: String,
    default: 'blue',
    validator: (v) => ['blue', 'red', 'green', 'amber', 'gray'].includes(v),
  },

  /** Per-dialog escape hatch. Leave unset — the app-wide switch owns this. */
  headerVariant: {
    type: String,
    default: null,
    validator: (v) => v === null || ['chip', 'plain', 'wash'].includes(v),
  },

  hideHeader: { type: Boolean, default: false },
  showClose: { type: Boolean, default: true },
  dismissible: { type: Boolean, default: true },

  /** Body scroll cap, clamped against the panel's my-8 and viewport padding
      so a tall dialog still fits a short phone. */
  maxBodyHeight: { type: String, default: 'min(65vh, calc(100vh - 14rem))' },

  /** Drop the body's padding — for full-bleed lists, editors and maps. */
  flush: { type: Boolean, default: false },

  rootClass: { type: [String, Array, Object], default: '' },
  bodyClass: { type: [String, Array, Object], default: '' },

  footerAlign: {
    type: String,
    default: 'end',
    validator: (v) => ['end', 'between'].includes(v),
  },
})

const emit = defineEmits(['update:open', 'close', 'after-leave'])

const variant = computed(
  () => props.headerVariant ?? CRM_DIALOG_HEADER_VARIANT,
)
const showChip = computed(() => variant.value !== 'plain')
// A headerless dialog (AboutModal) has nothing for the wash to sit behind.
const showWash = computed(() => variant.value === 'wash' && !props.hideHeader)
const isLucideName = computed(
  () => typeof props.icon === 'string' && props.icon.startsWith('lucide-'),
)
</script>
