<template>
  <SettingsLayoutBase
    :title="__('Calendar Settings')"
  >
    <template #title>
      <div class="flex items-center gap-3.5">
        <span
          class="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--crm-chip-blue)] text-[var(--crm-accent-primary)]"
        >
          <LucideCalendar class="size-5" />
        </span>
        <div class="flex flex-col gap-1">
          <h2 class="text-2xl font-semibold leading-none text-ink-gray-9">
            {{ __('Calendar Settings') }}
          </h2>
          <p class="text-p-base text-ink-gray-6">
            {{
              __(
                'Configure your Calendar Settings like Default View and Event Notifications here.',
              )
            }}
          </p>
        </div>
      </div>
    </template>

    <template #content>
      <div class="flex flex-col gap-4">
        <!-- Default View -->
        <div class="crm-settings-row">
          <span class="crm-settings-row-icon">
            <LucideEye class="size-5" />
          </span>
          <div class="min-w-0 flex-1">
            <div class="text-base font-semibold text-ink-gray-9">
              {{ __('Default View') }}
            </div>
            <div class="mt-0.5 text-sm leading-relaxed text-ink-gray-6">
              {{
                __(
                  'Select the default view for your calendar. This will be the initial view when you open the calendar.',
                )
              }}
            </div>
          </div>
          <div class="shrink-0">
            <FormControl
              v-model="settings.doc.default_calendar_view"
              type="select"
              class="w-32"
              :options="viewOptions"
              :placeholder="__('Select View')"
            />
          </div>
        </div>

        <!-- Event Notifications -->
        <div class="crm-settings-row !items-start">
          <span class="crm-settings-row-icon">
            <LucideBell class="size-5" />
          </span>
          <div class="flex min-w-0 flex-1 flex-col gap-3">
            <div>
              <div class="text-base font-semibold text-ink-gray-9">
                {{ __('Event Notifications') }}
              </div>
              <div class="mt-0.5 text-sm leading-relaxed text-ink-gray-6">
                {{
                  __(
                    'Reminders will be sent before the event starts, based on the configured time.',
                  )
                }}
              </div>
            </div>

            <div
              v-if="notifications?.length"
              class="flex flex-col gap-2"
            >
              <div
                v-for="notification in notifications"
                :key="notification.name"
                class="flex flex-wrap items-center gap-2"
              >
                <FormControl
                  v-model.number="notification.before"
                  class="w-20 shrink-0"
                  type="number"
                  :min="min(notification)"
                  :max="max(notification)"
                  :step="notification.interval == 'minutes' ? 5 : 1"
                  :placeholder="__('10')"
                  @blur="handleIntervalChange(notification)"
                />
                <FormControl
                  v-model="notification.interval"
                  class="w-32 shrink-0"
                  type="select"
                  :options="intervalOptions(notification)"
                  :placeholder="__('minutes')"
                  @update:modelValue="() => handleIntervalChange(notification)"
                />
                <FormControl
                  type="checkbox"
                  :label="__('Email')"
                  :modelValue="notification.type === 'Email'"
                  @update:modelValue="
                    (on) => (notification.type = on ? 'Email' : 'Notification')
                  "
                />
                <Button
                  icon="lucide-x"
                  variant="ghost"
                  :aria-label="__('Remove notification')"
                  @click="
                    notifications.splice(notifications.indexOf(notification), 1)
                  "
                />
              </div>
            </div>

            <Button
              class="crm-settings-action w-fit"
              :label="__('Add Notification')"
              iconLeft="plus"
              @click="
                notifications.push({
                  type: 'Email',
                  before: 10,
                  interval: 'minutes',
                })
              "
            />
          </div>
        </div>

        <!-- All Day Event Notifications -->
        <div class="crm-settings-row !items-start">
          <span class="crm-settings-row-icon">
            <LucideClock class="size-5" />
          </span>
          <div class="flex min-w-0 flex-1 flex-col gap-3">
            <div>
              <div class="text-base font-semibold text-ink-gray-9">
                {{ __('All Day Event Notifications') }}
              </div>
              <div class="mt-0.5 text-sm leading-relaxed text-ink-gray-6">
                {{
                  __(
                    'For all-day events, set a time to send reminders before the event starts.',
                  )
                }}
              </div>
            </div>

            <div
              v-if="allDayNotifications?.length"
              class="flex flex-col gap-2"
            >
              <div
                v-for="notification in allDayNotifications"
                :key="notification.name"
                class="flex flex-wrap items-center gap-2"
              >
                <FormControl
                  v-model.number="notification.before"
                  class="w-20 shrink-0"
                  type="number"
                  :min="min(notification)"
                  :max="max(notification)"
                  :placeholder="__('10')"
                  @blur="handleIntervalChange(notification)"
                />
                <FormControl
                  v-model="notification.interval"
                  class="w-32 shrink-0"
                  type="select"
                  :options="allDayIntervalOptions(notification)"
                  :placeholder="__('days')"
                  @update:modelValue="() => handleIntervalChange(notification)"
                />
                <span class="text-sm text-ink-gray-6">
                  {{ __('before at') }}
                </span>
                <TimePicker
                  v-model="notification.time"
                  class="w-32 shrink-0"
                  :placeholder="__('08:00 pm')"
                />
                <FormControl
                  type="checkbox"
                  :label="__('Email')"
                  :modelValue="notification.type === 'Email'"
                  @update:modelValue="
                    (on) => (notification.type = on ? 'Email' : 'Notification')
                  "
                />
                <Button
                  icon="lucide-x"
                  variant="ghost"
                  :aria-label="__('Remove notification')"
                  @click="
                    allDayNotifications.splice(
                      allDayNotifications.indexOf(notification),
                      1,
                    )
                  "
                />
              </div>
            </div>

            <Button
              class="crm-settings-action w-fit"
              :label="__('Add Notification')"
              iconLeft="plus"
              @click="
                allDayNotifications.push({
                  type: 'Email',
                  before: 1,
                  interval: 'days',
                  time: '08:00',
                })
              "
            />
          </div>
        </div>

        <!-- Save bar -->
        <div class="crm-settings-savebar">
          <div class="flex min-w-0 items-center gap-2.5">
            <FeatherIcon
              name="info"
              class="size-4 shrink-0 text-[var(--crm-accent-primary)]"
            />
            <span class="text-sm text-ink-gray-6">
              {{
                __('Calendar notifications help you stay on top of your schedule.')
              }}
            </span>
          </div>
          <Button
            class="shrink-0"
            variant="solid"
            icon-left="check"
            :label="__('Save Changes')"
            :loading="settings.save.loading"
            @click="updateSettings"
          />
        </div>
      </div>
    </template>
  </SettingsLayoutBase>
</template>

<script setup>
import SettingsLayoutBase from '@/components/Layouts/SettingsLayoutBase.vue'
import LucideCalendar from '~icons/lucide/calendar'
import LucideEye from '~icons/lucide/eye'
import LucideBell from '~icons/lucide/bell'
import LucideClock from '~icons/lucide/clock'
import { getSettings } from '@/stores/settings'
import { showSettings } from '@/composables/settings'
import { min, max, handleIntervalChange } from '@/components/Calendar/utils'
import { FormControl, TimePicker, FeatherIcon } from 'frappe-ui'
import { computed } from 'vue'

const { _settings: settings } = getSettings()

const viewOptions = [
  { label: __('Daily'), value: 'Daily' },
  { label: __('Weekly'), value: 'Weekly' },
  { label: __('Monthly'), value: 'Monthly' },
]

// Labels are singular at 1, so they depend on the row's own value.
function intervalOptions(n) {
  const one = n.before == 1
  return [
    { label: one ? __('minute') : __('minutes'), value: 'minutes' },
    { label: one ? __('hour') : __('hours'), value: 'hours' },
    { label: one ? __('day') : __('days'), value: 'days' },
    { label: one ? __('week') : __('weeks'), value: 'weeks' },
  ]
}

function allDayIntervalOptions(n) {
  const one = n.before == 1
  return [
    { label: one ? __('day') : __('days'), value: 'days' },
    { label: one ? __('week') : __('weeks'), value: 'weeks' },
  ]
}

const notifications = computed({
  get: () => settings.doc.event_notifications || [],
  set: (val) => (settings.doc.event_notifications = val),
})

const allDayNotifications = computed({
  get: () => settings.doc.all_day_event_notifications || [],
  set: (val) => (settings.doc.all_day_event_notifications = val),
})

function updateSettings() {
  settings.save.submit(null, {
    onSuccess: () => {
      showSettings.value = false
    },
  })
}
</script>
