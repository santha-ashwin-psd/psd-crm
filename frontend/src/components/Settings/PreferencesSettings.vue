<template>
  <SettingsLayoutBase
    v-if="user.doc"
    :title="__('Preferences')"
  >
    <template #title>
      <div class="flex items-center gap-3.5">
        <span
          class="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--crm-chip-blue)] text-[var(--crm-accent-primary)]"
        >
          <FeatherIcon name="sliders" class="size-5" />
        </span>
        <div class="flex flex-col gap-1">
          <h2 class="text-2xl font-semibold leading-none text-ink-gray-9">
            {{ __('Preferences') }}
          </h2>
          <p class="text-p-base text-ink-gray-6">
            {{
              __(
                'Choose how you want to use the application by setting your preferences.',
              )
            }}
          </p>
        </div>
      </div>
    </template>
    <template #content>
      <div class="flex flex-col gap-8">
        <!-- Appearance -->
        <section class="flex flex-col gap-5">
          <div class="flex items-center gap-2">
            <FeatherIcon
              name="monitor"
              class="size-4 text-[var(--crm-accent-primary)]"
            />
            <span class="text-base font-semibold text-ink-gray-9">
              {{ __('Appearance') }}
            </span>
          </div>
          <div class="flex flex-col gap-3">
            <div class="flex flex-col gap-0.5">
              <span class="text-base font-medium text-ink-gray-8">
                {{ __('Theme') }}
              </span>
              <span class="text-sm text-ink-gray-6">
                {{ __('Switch between light, dark, or system theme') }}
              </span>
            </div>
            <ThemeSwitcher
              :logo="brand.logo || CRMLogo"
              :name="brand.name || 'CRM'"
            />
          </div>
        </section>

        <!-- Language & Time -->
        <section class="flex flex-col gap-5">
          <div class="flex items-center gap-2">
            <FeatherIcon
              name="globe"
              class="size-4 text-[var(--crm-accent-primary)]"
            />
            <span class="text-base font-semibold text-ink-gray-9">
              {{ __('Language & Time') }}
            </span>
          </div>
          <div class="flex items-center justify-between gap-4">
            <div class="flex flex-col gap-0.5">
              <span class="text-base font-medium text-ink-gray-8">
                {{ __('Language') }}
              </span>
              <span class="text-sm text-ink-gray-6">
                {{ __('Change language of the application.') }}
              </span>
            </div>
            <div class="settings-field settings-field-link w-60 shrink-0">
              <FeatherIcon
                name="globe"
                class="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-ink-gray-5"
              />
              <Link
                v-model="language"
                doctype="Language"
                :placeholder="__('System Default')"
                class="w-full"
              />
            </div>
          </div>
          <div class="flex items-center justify-between gap-4">
            <div class="flex flex-col gap-0.5">
              <span class="text-base font-medium text-ink-gray-8">
                {{ __('Timezone') }}
              </span>
              <span class="text-sm text-ink-gray-6">
                {{ __('Change timezone of the application.') }}
              </span>
            </div>
            <div class="settings-field settings-field-combo w-60 shrink-0">
              <FeatherIcon
                name="clock"
                class="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-ink-gray-5"
              />
              <Combobox
                v-model="user.doc.time_zone"
                class="w-full"
                :options="getTimezoneOptions()"
              />
            </div>
          </div>
        </section>

        <!-- Save -->
        <div
          class="flex items-center justify-end border-t border-[var(--crm-settings-border)] pt-5"
        >
          <Button
            variant="solid"
            :label="__('Save Preferences')"
            icon-left="check"
            :loading="user.save.loading"
            @click="save()"
          />
        </div>
      </div>
    </template>
  </SettingsLayoutBase>
</template>

<script setup>
import CRMLogo from '@/components/Icons/CRMLogo.vue'
import ThemeSwitcher from '@/components/Settings/ThemeSwitcher.vue'
import SettingsLayoutBase from '@/components/Layouts/SettingsLayoutBase.vue'
import Link from '@/components/Controls/Link.vue'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import { formatError } from '@/utils/formatError'
import { getSettings } from '@/stores/settings'
import {
  Combobox,
  FeatherIcon,
  toast,
  createResource,
  createDocumentResource,
} from 'frappe-ui'
import { ref, computed, inject } from 'vue'

const refreshRequired = ref(false)

const { user: sessionUser } = inject('session')

const { brand } = getSettings()
const user = createDocumentResource({ doctype: 'User', name: sessionUser })

function save() {
  refreshRequired.value =
    user.doc.language !== user.originalDoc?.language ||
    user.doc.time_zone !== user.originalDoc?.time_zone

  user.save.submit(null, {
    onSuccess: () => {
      toast.success(__('Preferences Updated Successfully'))
      if (refreshRequired.value) {
        window.location.reload()
      }
    },
    onError: (err) => {
      toast.error(formatError(err, __('Failed to update preferences')))
    },
  })
}

const isDirty = computed(() => {
  return JSON.stringify(user.doc) !== JSON.stringify(user.originalDoc)
})

// An empty User.language means "inherit the site default", which left the
// control blank. Fall back to the system value for display; only an explicit
// pick writes back to the doc.
const systemLanguage = createResource({
  url: 'frappe.client.get_single_value',
  params: { doctype: 'System Settings', field: 'language' },
  cache: 'SystemLanguage',
  auto: true,
})

const language = computed({
  get: () => user.doc.language || systemLanguage.data || '',
  set: (val) => (user.doc.language = val),
})

const timeZones = createResource({
  url: 'frappe.core.doctype.user.user.get_timezones',
  cache: 'TimeZones',
  auto: true,
})

function getTimezoneOptions() {
  return timeZones.data?.timezones.map((tz) => ({ label: tz, value: tz })) || []
}

useKeyboardShortcuts({
  ignoreTyping: false,
  shortcuts: [
    {
      match: (e) => (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's',
      action: () => {
        if (isDirty.value) {
          save()
        }
      },
    },
  ],
})
</script>

