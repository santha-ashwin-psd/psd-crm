<template>
  <SettingsLayoutBase :title="__('Follow-ups')">
    <template #title>
      <div class="flex items-start gap-3.5">
        <span
          class="mt-0.5 grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--crm-chip-blue)] text-[var(--crm-accent-primary)]"
        >
          <LucideCalendarClock class="size-5" />
        </span>
        <div class="flex flex-col gap-1">
          <h2 class="text-2xl font-semibold leading-none text-ink-gray-9">
            {{ __('Follow-ups') }}
          </h2>
          <p class="text-p-base text-ink-gray-6">
            {{
              __(
                'Moving a pipeline into the follow-up stage asks for a follow-up date and creates a task with a reminder for its owner. Pipelines left there without activity are emailed to their owner and manager daily.',
              )
            }}
          </p>
        </div>
      </div>
    </template>

    <template #header-actions>
      <Button
        v-if="isDirty"
        :label="__('Update')"
        variant="solid"
        icon-left="check"
        :loading="settings.save.loading"
        @click="update"
      />
    </template>

    <template #content>
      <div v-if="settings.doc" class="flex flex-col gap-4">
        <div class="crm-settings-row">
          <span class="crm-settings-row-icon"
            ><LucideFlag class="size-5"
          /></span>
          <div class="min-w-0 flex-1">
            <div class="text-base font-semibold text-ink-gray-9">
              {{ __('Follow-up stage') }}
            </div>
            <div class="mt-0.5 text-sm leading-relaxed text-ink-gray-6">
              {{ __('The pipeline stage that means "waiting to follow up".') }}
            </div>
          </div>
          <Link
            v-model="settings.doc.follow_up_stage"
            doctype="CRM Deal Status"
            class="!w-48 shrink-0"
          />
        </div>

        <div class="crm-settings-row">
          <span class="crm-settings-row-icon"
            ><LucideMailWarning class="size-5"
          /></span>
          <div class="min-w-0 flex-1">
            <div class="text-base font-semibold text-ink-gray-9">
              {{ __('Email stuck follow-ups') }}
            </div>
            <div class="mt-0.5 text-sm leading-relaxed text-ink-gray-6">
              {{
                __(
                  'Every morning at 9:00, owners (and their manager in the sales hierarchy) get a list of their pipelines with no calls, emails, notes, comments or task updates for the number of days below.',
                )
              }}
            </div>
          </div>
          <Switch
            v-model="enabled"
            :aria-label="__('Email stuck follow-ups')"
            class="shrink-0"
          />
        </div>

        <div class="crm-settings-row" :class="{ 'opacity-60': !enabled }">
          <span class="crm-settings-row-icon"
            ><LucideHourglass class="size-5"
          /></span>
          <div class="min-w-0 flex-1">
            <div class="text-base font-semibold text-ink-gray-9">
              {{ __('Stuck after (days)') }}
            </div>
            <div class="mt-0.5 text-sm leading-relaxed text-ink-gray-6">
              {{
                __('Days without activity before a pipeline counts as stuck.')
              }}
            </div>
            <p
              v-if="daysError"
              class="mt-1 text-xs text-ink-red-4"
              role="alert"
            >
              {{ daysError }}
            </p>
          </div>
          <FormControl
            v-model.number="settings.doc.stuck_follow_up_days"
            type="number"
            min="1"
            :disabled="!enabled"
            class="!w-24 shrink-0"
          />
        </div>
      </div>
    </template>
  </SettingsLayoutBase>
</template>

<script setup>
import SettingsLayoutBase from '@/components/Layouts/SettingsLayoutBase.vue'
import Link from '@/components/Controls/Link.vue'
import LucideCalendarClock from '~icons/lucide/calendar-clock'
import LucideFlag from '~icons/lucide/flag'
import LucideMailWarning from '~icons/lucide/mail-warning'
import LucideHourglass from '~icons/lucide/hourglass'
import { getSettings } from '@/stores/settings'
import { formatError } from '@/utils/formatError'
import {
  Button,
  FormControl,
  Switch,
  toast,
  createDocumentResource,
} from 'frappe-ui'
import { computed } from 'vue'

const settings = createDocumentResource({
  doctype: 'FCRM Settings',
  name: 'FCRM Settings',
  auto: true,
})

const enabled = computed({
  get: () => Boolean(settings.doc?.enable_stuck_follow_up_alerts),
  set: (value) => (settings.doc.enable_stuck_follow_up_alerts = value ? 1 : 0),
})

const daysError = computed(() => {
  const days = Number(settings.doc?.stuck_follow_up_days)
  return enabled.value && !(days >= 1) ? __('Enter 1 day or more') : ''
})

const isDirty = computed(
  () => JSON.stringify(settings.doc) !== JSON.stringify(settings.originalDoc),
)

function update() {
  if (daysError.value) return
  settings.save.submit(null, {
    onSuccess: () => {
      // The app reads the follow-up stage from the shared settings store.
      getSettings()._settings.reload()
      toast.success(__('Settings updated successfully'))
    },
    onError: (error) =>
      toast.error(formatError(error, 'Failed to save settings')),
  })
}

defineExpose({ update, enabled, daysError })
</script>
