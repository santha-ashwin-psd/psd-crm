<template>
  <span class="crm-badge" :class="toneClass(status)">
    <slot>{{ displayLabel }}</slot>
  </span>
</template>

<script setup>
/**
 * The status badge. There is exactly one, and this is it.
 *
 * Every list, detail page, KPI card, kanban card, task, call log, contact and
 * organization renders its status through this component, so the same status
 * is the same shape and the same colour everywhere in the product. Before
 * this there were six competing implementations: four bespoke per-view colour
 * maps (organizations, tasks, contacts, call logs), the per-status hue the
 * statuses store hands to Leads and Deals, and frappe-ui's own `Badge` in the
 * activity timeline — which is why a list showed a grey rectangular
 * UPPERCASE pill while the timeline beside it showed a green rounded
 * sentence-case one.
 *
 * Colour comes from utils/statusTheme.js and nowhere else. The component
 * carries no palette of its own; it sets a `.crm-tone-*` class and the
 * `.crm-badge` rule in styles/design-system.css reads `--tone-soft` /
 * `--tone-text` from it.
 *
 * It renders a single root element, so a caller's `@click` (the list views
 * use one to apply a status filter) falls through untouched.
 */
import { toneClass } from '@/utils/statusTheme'
import { computed } from 'vue'

const props = defineProps({
  /**
   * Raw status value — this is what decides the tone. Always pass the stored
   * value, never a translated or prettified one, or a site running in another
   * language would lose its colours.
   */
  status: { type: String, default: '' },
  /**
   * Display text, when it differs from `status` (a translated label, or a
   * status object's `.label`). Defaults to `status`. Tone is never taken from
   * this.
   */
  label: { type: String, default: '' },
})

const displayLabel = computed(() => props.label || props.status)
</script>
