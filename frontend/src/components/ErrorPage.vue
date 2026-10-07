<template>
  <div class="flex h-full w-full items-center justify-center p-6 bg-[var(--crm-surface-2)]/50">
    <div class="flex flex-col items-center text-center max-w-md w-full p-8 rounded-2xl bg-[var(--crm-surface)] border border-[var(--crm-border)]/80 shadow-sm space-y-4">
      <div class="flex items-center justify-center size-14 rounded-2xl bg-rose-50 border border-rose-100 text-rose-600 shadow-sm">
        <span class="lucide-alert-triangle size-7" aria-hidden="true" />
      </div>

      <div class="space-y-1">
        <h2 class="text-xl font-bold text-[var(--crm-text)] tracking-tight">
          {{ errorTitle }}
        </h2>
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div class="text-sm text-[var(--crm-text-3)] leading-relaxed" v-html="sanitizeHTML(errorMessage)" />
      </div>

      <div class="pt-2 w-full flex justify-center">
        <Button
          variant="solid"
          :label="isLeadsEnabled() ? __('Go to Leads') : __('Go to Deals')"
          :route="{ name: isLeadsEnabled() ? 'Leads' : 'Deals' }"
          class="w-full sm:w-auto"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { sanitizeHTML } from '@/utils'
import { isLeadsEnabled } from '@/utils/leads'
defineProps({
  errorTitle: { type: String, required: true },
  errorMessage: { type: String, required: true },
})
</script>
