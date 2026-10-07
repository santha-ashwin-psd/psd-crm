<template>
  <div class="flex h-full flex-col gap-6 p-8 text-ink-gray-8">
    <!-- Header -->
    <div class="flex items-start justify-between gap-4">
      <div class="flex items-center gap-3.5">
        <span
          class="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--crm-chip-blue)] text-[var(--crm-accent-primary)]"
        >
          <LucideHouse class="size-5" />
        </span>
        <div class="flex flex-col gap-1">
          <div class="flex items-center gap-2">
            <h2 class="text-2xl font-semibold leading-none text-ink-gray-9">
              {{ __('Home Actions') }}
            </h2>
          </div>
          <p class="text-p-base text-ink-gray-6">
            {{ __('Configure actions that appear on the home dropdown.') }}
          </p>
        </div>
      </div>
      <Button
        v-if="document.isDirty"
        class="shrink-0"
        :label="__('Update')"
        variant="solid"
        icon-left="check"
        :loading="document.loading"
        @click="updateSettings"
      />
    </div>

    <!-- Fields -->
    <div class="flex flex-1 flex-col overflow-y-auto">
      <Grid
        v-model="document.doc.dropdown_items"
        doctype="CRM Dropdown Item"
        parentDoctype="FCRM Settings"
        parentFieldname="dropdown_items"
      />
    </div>
    <div v-if="errorMessage">
      <ErrorMessage :message="__(errorMessage)" />
    </div>
  </div>
</template>
<script setup>
import Grid from '@/components/Controls/Grid.vue'
import LucideHouse from '~icons/lucide/house'
import { ErrorMessage } from 'frappe-ui'
import { showSettings } from '@/composables/settings'
import { useDocument } from '@/data/document'
import { ref, provide } from 'vue'

const { document, triggerOnChange } = useDocument(
  'FCRM Settings',
  'FCRM Settings',
)

provide('triggerOnChange', triggerOnChange)

const errorMessage = ref('')

function updateSettings() {
  document.save.submit(null, {
    onSuccess: () => {
      showSettings.value = false
    },
  })
}
</script>
