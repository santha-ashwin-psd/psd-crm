<template>
  <CrmDialog
    v-model:open="isOpen"
    size="xl"
    icon="lucide-keyboard"
    :title="__('Keyboard Shortcuts')"
    body-class="space-y-5"
    footer-align="between"
  >
    <section v-for="section in sections" :key="section.title">
      <h3
        class="text-[10px] font-bold uppercase tracking-widest text-[var(--crm-text-4)] mb-2 px-1"
      >
        {{ section.title }}
      </h3>
      <div class="space-y-0.5">
        <div
          v-for="item in section.items"
          :key="item.description"
          class="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-[var(--crm-surface-2)] transition-colors duration-100"
        >
          <span class="text-sm text-[var(--crm-text-2)]">{{
            item.description
          }}</span>
          <div class="flex items-center gap-1 shrink-0 ml-4">
            <kbd
              v-for="(key, ki) in item.keys"
              :key="ki"
              class="inline-flex items-center px-1.5 py-0.5 text-[11px] font-mono font-medium text-[var(--crm-text-3)] bg-[var(--crm-surface-2)] border border-[var(--crm-border)] rounded shadow-sm leading-none"
              >{{ key }}</kbd
            >
            <span
              v-if="item.altKeys"
              class="text-[var(--crm-text-4)] text-xs mx-0.5"
              >{{ __('or') }}</span
            >
            <kbd
              v-for="(key, ki) in item.altKeys || []"
              :key="'alt-' + ki"
              class="inline-flex items-center px-1.5 py-0.5 text-[11px] font-mono font-medium text-[var(--crm-text-3)] bg-[var(--crm-surface-2)] border border-[var(--crm-border)] rounded shadow-sm leading-none"
              >{{ key }}</kbd
            >
          </div>
        </div>
      </div>
    </section>

    <template #footer>
      <span class="text-xs text-[var(--crm-text-4)]">
        {{ __('Press') }}
        <kbd
          class="inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono font-medium text-[var(--crm-text-4)] bg-[var(--crm-surface)] border border-[var(--crm-border)] rounded shadow-sm"
          >Esc</kbd
        >
        {{ __('to close') }}
      </span>
      <span
        class="text-[10px] text-[var(--crm-text-4)] font-medium tracking-wide uppercase"
        >{{ __('Frappe CRM') }}</span
      >
    </template>
  </CrmDialog>
</template>

<script setup>
import CrmDialog from '@/components/Modals/CrmDialog.vue'
import { ref, computed } from 'vue'

const isOpen = ref(false)

// Focus trapping, the Esc key and the overlay click are the dialog's job now —
// this used to hand-roll all three around a `tabindex="-1"` panel.
function open() {
  isOpen.value = true
}

function close() {
  isOpen.value = false
}

// Expose open() so App.vue can trigger it via template ref
defineExpose({ open, close })

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent)
const mod = isMac ? '⌘' : 'Ctrl'

const sections = computed(() => [
  {
    title: __('Global'),
    items: [
      { description: __('Open search'), keys: [mod, 'K'], altKeys: ['/'] },
      { description: __('Show keyboard shortcuts'), keys: ['?'] },
    ],
  },
  {
    title: __('List Views'),
    items: [
      { description: __('Create new record'), keys: ['N'] },
      { description: __('Clear selection'), keys: ['Esc'] },
    ],
  },
  {
    title: __('Detail View'),
    items: [
      { description: __('Go back to list'), keys: ['Esc'] },
    ],
  },
  {
    title: __('Modals & Dialogs'),
    items: [
      { description: __('Close modal'), keys: ['Esc'] },
      { description: __('Confirm / Submit'), keys: [mod, 'Enter'] },
    ],
  },
])
</script>
