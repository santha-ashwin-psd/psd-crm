<template>
  <SettingsLayoutBase
    :title="__('System Defaults')"
  >
    <template #title>
      <div class="flex items-start gap-3.5">
        <span
          class="mt-0.5 grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--crm-chip-blue)] text-[var(--crm-accent-primary)]"
        >
          <FeatherIcon name="sliders" class="size-5" />
        </span>
        <div class="flex flex-col gap-1">
          <h2 class="text-2xl font-semibold leading-none text-ink-gray-9">
            {{ __('System Defaults') }}
          </h2>
          <p class="text-p-base text-ink-gray-6">
            {{
              __(
                'Configure default settings for your CRM system, including default currency, date formats, and other system-wide preferences to ensure consistency across your system.',
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
        :loading="settings.loading"
        @click="updateSettings"
      />
    </template>

    <template #content>
      <div class="flex flex-col gap-4">
        <div v-for="row in rows" :key="row.field" class="crm-settings-row">
          <span class="crm-settings-row-icon">
            <!-- A few defaults read better as a glyph than an icon. -->
            <span
              v-if="row.glyph"
              class="text-sm font-bold leading-none tracking-tight"
            >
              {{ row.glyph }}
            </span>
            <component :is="row.icon" v-else class="size-5" />
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
            <Link
              v-if="row.type === 'link'"
              v-model="settings.doc[row.field]"
              :doctype="row.doctype"
              :class="row.width"
            />
            <Select
              v-else
              v-model="settings.doc[row.field]"
              :options="getOptions(row.field)"
              :placeholder="row.placeholder"
              :class="row.width"
            />
          </div>
        </div>
      </div>
    </template>
  </SettingsLayoutBase>
</template>

<script setup>
import SettingsLayoutBase from '@/components/Layouts/SettingsLayoutBase.vue'
import Link from '@/components/Controls/Link.vue'
import LucideCircleDollarSign from '~icons/lucide/circle-dollar-sign'
import LucideHash from '~icons/lucide/hash'
import LucideCalendar from '~icons/lucide/calendar'
import LucideClock from '~icons/lucide/clock'
import { getMeta } from '@/stores/meta'
import { formatError } from '@/utils/formatError'
import {
  Select,
  Button,
  FeatherIcon,
  toast,
  createDocumentResource,
} from 'frappe-ui'
import { computed, markRaw } from 'vue'

const { getFields } = getMeta('System Settings')

const settings = createDocumentResource({
  doctype: 'System Settings',
  name: 'System Settings',
})

const rows = [
  {
    field: 'currency',
    type: 'link',
    doctype: 'Currency',
    icon: markRaw(LucideCircleDollarSign),
    title: __('Currency'),
    description: __(
      'Defines the default currency for all records, can be overridden at the field level',
    ),
    width: '!w-28',
  },
  {
    field: 'currency_precision',
    icon: markRaw(LucideHash),
    title: __('Currency Precision'),
    description: __('Number of decimal places used for all currency values'),
    placeholder: 3,
    width: '!w-24',
  },
  {
    field: 'number_format',
    glyph: '123',
    title: __('Number Format'),
    description: __(
      'Controls how numbers are displayed (e.g., commas, decimal separators)',
    ),
    width: '!w-40',
  },
  {
    field: 'float_precision',
    glyph: '0.0',
    title: __('Float Precision'),
    description: __('Number of decimal places for non-currency numeric fields'),
    placeholder: 3,
    width: '!w-24',
  },
  {
    field: 'date_format',
    icon: markRaw(LucideCalendar),
    title: __('Date Format'),
    description: __('Display format for dates across the system'),
    width: '!w-36',
  },
  {
    field: 'time_format',
    icon: markRaw(LucideClock),
    title: __('Time Format'),
    description: __('Select whether to display time with or without seconds'),
    width: '!w-32',
  },
]

const isDirty = computed(() => {
  return JSON.stringify(settings.doc) !== JSON.stringify(settings.originalDoc)
})

function updateSettings() {
  settings.save.submit(null, {
    onSuccess: () => {
      toast.success(__('Settings updated successfully'))
    },
    onError(error) {
      toast.error(formatError(error, 'Failed to save settings'))
    },
  })
}

const fieldsMeta = computed(() => getFields() || [])

function getOptions(fieldname) {
  const field = fieldsMeta.value.find((f) => f.fieldname === fieldname)
  return field?.options || []
}
</script>
