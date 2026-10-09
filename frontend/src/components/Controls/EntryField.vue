<!--
  EntryField — a labelled input with a leading icon segment.

  The icon sits in its own cell, divided from the control by a hairline, and
  the wrapper owns the border, radius and focus ring. The control inside
  (FormControl, Link, DatePicker, select…) keeps its own behaviour; its chrome
  is flattened by the `.crm-entry-field` rules in src/index.css so every kind of
  control looks the same in this frame.
-->
<template>
  <div class="flex min-w-0 flex-col gap-1.5">
    <label
      v-if="label"
      class="text-[13px] font-medium text-[var(--crm-text-2)]"
    >
      {{ label }}
      <span v-if="required" class="text-[var(--crm-danger,#dc2626)]">*</span>
      <span v-if="hint" class="font-normal text-[var(--crm-text-4)]">{{
        hint
      }}</span>
    </label>
    <div
      class="crm-entry-field"
      :class="{ 'crm-entry-field--multiline': multiline }"
    >
      <span
        v-if="icon || $slots.prefix"
        class="crm-entry-field__icon"
        aria-hidden="true"
      >
        <slot name="prefix"><span :class="[icon, 'size-4']" /></slot>
      </span>
      <div class="crm-entry-field__control">
        <slot />
      </div>
    </div>
    <slot name="error" />
  </div>
</template>

<script setup>
defineProps({
  label: { type: String, default: '' },
  // A lucide class, e.g. 'lucide-user'.
  icon: { type: String, default: '' },
  required: { type: Boolean, default: false },
  hint: { type: String, default: '' },
  multiline: { type: Boolean, default: false },
})
</script>
