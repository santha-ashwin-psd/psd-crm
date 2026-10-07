<template>
  <SettingsLayoutBase
    :title="__('General Settings')"
  >
    <template #title>
      <div class="flex items-center gap-3.5">
        <span
          class="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--crm-chip-blue)] text-[var(--crm-accent-primary)]"
        >
          <FeatherIcon name="settings" class="size-5" />
        </span>
        <div class="flex flex-col gap-1">
          <h2 class="text-2xl font-semibold leading-none text-ink-gray-9">
            {{ __('General Settings') }}
          </h2>
          <p class="text-p-base text-ink-gray-6">
            {{ __('Configure general settings for your application') }}
          </p>
        </div>
      </div>
    </template>

    <template #content>
      <div class="flex flex-col gap-4">
        <div v-for="row in rows" :key="row.field" class="crm-settings-row">
          <span class="crm-settings-row-icon">
            <component :is="row.icon" class="size-5" />
          </span>

          <div class="min-w-0 flex-1">
            <div class="text-base font-semibold text-ink-gray-9">
              {{ row.title }}
            </div>
            <div class="mt-0.5 text-sm leading-relaxed text-ink-gray-6">
              {{ row.description }}
            </div>
          </div>

          <div class="shrink-0">
            <Switch
              v-if="row.type === 'switch'"
              :modelValue="Boolean(settings.doc?.[row.field])"
              size="sm"
              @update:modelValue="(val) => onToggle(row.field, val)"
            />
            <FormControl
              v-else
              type="select"
              class="w-40"
              :modelValue="settings.doc?.[row.field]"
              :options="row.options"
              :placeholder="row.placeholder"
              @update:modelValue="(val) => onSelect(row.field, val)"
            />
          </div>
        </div>
      </div>
    </template>
  </SettingsLayoutBase>
</template>

<script setup>
import SettingsLayoutBase from '@/components/Layouts/SettingsLayoutBase.vue'
import LucideClock from '~icons/lucide/clock'
import LucideCornerUpLeft from '~icons/lucide/corner-up-left'
import LucideMail from '~icons/lucide/mail'
import LucideCalendarClock from '~icons/lucide/calendar-clock'
import LucideArrowUpDown from '~icons/lucide/arrow-up-down'
import LucideUserPlus from '~icons/lucide/user-plus'
import { getSettings } from '@/stores/settings'
import { isLeadsEnabled } from '@/utils/leads'
import { FormControl, Switch, FeatherIcon, toast } from 'frappe-ui'
import { markRaw } from 'vue'

const { _settings: settings } = getSettings()

const timestampFormatOptions = [
  { label: __('Relative'), value: 'Relative' },
  { label: __('Exact'), value: 'Exact' },
]
const sortOrderOptions = [
  { label: __('Oldest First'), value: 'Oldest First' },
  { label: __('Newest First'), value: 'Newest First' },
]

// Copy below names "lead/deal" only while Leads are in use.
const leadsEnabled = isLeadsEnabled()

const rows = [
  {
    field: 'enable_leads',
    type: 'switch',
    icon: markRaw(LucideUserPlus),
    title: __('Enable Leads'),
    description: __(
      'Show Leads across the CRM. When off, Leads are hidden everywhere and cannot be created or edited; existing lead data is kept.',
    ),
  },
  {
    field: 'update_timestamp_on_new_communication',
    type: 'switch',
    icon: markRaw(LucideClock),
    title: __('Update timestamp on new communication'),
    description: leadsEnabled
      ? __(
          'Update the modified timestamp on new email communication & comments for leads & deals',
        )
      : __(
          'Update the modified timestamp on new email communication & comments for deals',
        ),
  },
  {
    field: 'auto_mark_replied_on_response',
    type: 'switch',
    icon: markRaw(LucideCornerUpLeft),
    title: leadsEnabled
      ? __('Mark lead/deal as replied on response')
      : __('Mark deal as replied on response'),
    description: leadsEnabled
      ? __(
          'Automatically sets Communication Status to "Replied" for the lead or deal when a response is received. Applies only when SLA is enabled',
        )
      : __(
          'Automatically sets Communication Status to "Replied" for the deal when a response is received. Applies only when SLA is enabled',
        ),
  },
  {
    field: 'auto_reopen_on_new_communication',
    type: 'switch',
    icon: markRaw(LucideMail),
    title: leadsEnabled
      ? __('Reopen lead/deal on new communication')
      : __('Reopen deal on new communication'),
    description: leadsEnabled
      ? __(
          'Automatically sets Communication Status to "Open" for the lead or deal when a new communication is created. Applies only when SLA is enabled',
        )
      : __(
          'Automatically sets Communication Status to "Open" for the deal when a new communication is created. Applies only when SLA is enabled',
        ),
  },
  {
    field: 'crm_timeline_timestamp_format',
    type: 'select',
    icon: markRaw(LucideCalendarClock),
    title: __('Timeline timestamp format'),
    description: __(
      'Show timestamps in the activity timeline as relative time (5 mins ago) or an exact date & time',
    ),
    options: timestampFormatOptions,
    placeholder: __('Relative'),
  },
  {
    field: 'crm_timeline_sort_order',
    type: 'select',
    icon: markRaw(LucideArrowUpDown),
    title: __('Timeline sort order'),
    description: __(
      'Order of activities, emails, comments and calls in the timeline',
    ),
    options: sortOrderOptions,
    placeholder: __('Oldest First'),
  },
]

function onToggle(field, val) {
  settings.doc[field] = val
  settings.save.submit(null, {
    onSuccess: () => {
      toast.success(
        val
          ? __('Setting enabled successfully')
          : __('Setting disabled successfully'),
      )
      // Navigation, menus and routes are all built from this flag; reload so
      // every part of the app picks up the change at once.
      if (field === 'enable_leads') setTimeout(() => window.location.reload(), 600)
    },
  })
}

function onSelect(field, val) {
  settings.doc[field] = val
  settings.save.submit(null, {
    onSuccess: () => toast.success(__('Setting updated successfully')),
  })
}
</script>
