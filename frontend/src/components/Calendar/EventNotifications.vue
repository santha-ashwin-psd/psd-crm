<template>
  <div class="flex flex-col gap-2 truncate">
    <div
      class="inline-flex items-center cursor-pointer transition-colors focus:outline-none shrink-0 text-ink-gray-8 bg-surface-base border border-outline-gray-2 hover:border-outline-gray-3 active:border-outline-gray-3 active:bg-surface-gray-4 focus-visible:ring focus-visible:ring-outline-gray-3 h-7 text-base px-2 rounded"
      @click="addShowNotifications"
    >
      <div class="truncate">
        {{ notificationSummary }}
      </div>
    </div>
    <div v-if="notifications?.length && show" class="flex flex-col gap-2">
      <div v-for="(notification, i) in notifications" :key="notification.name">
        <div v-if="isAllDay" class="flex gap-1">
          <div class="flex flex-col flex-1 items-center gap-2">
            <div class="flex items-center gap-2 w-full">
              <div>{{ __('at') }}</div>
              <TimePicker
                v-if="isAllDay"
                v-model="notification.time"
                class="flex-1 shrink-0"
                variant="outline"
                :placeholder="__('08:00 AM')"
              />
            </div>
            <div class="flex items-center gap-2 w-full">
              <FormControl
                v-model.number="notification.before"
                class="w-fit"
                type="number"
                :min="min(notification)"
                :max="max(notification)"
                variant="outline"
                :placeholder="__('10')"
                @blur="handleIntervalChange(notification)"
              />
              <FormControl
                v-model="notification.interval"
                class="flex-1 shrink-0"
                type="select"
                :options="intervalOptions(notification)"
                variant="outline"
                :placeholder="__('minutes')"
                @update:modelValue="() => handleIntervalChange(notification)"
              />
            </div>
            <div v-if="showType" class="w-full">
              <FormControl
                type="checkbox"
                :label="__('Also send as email')"
                :modelValue="notification.type === 'Email'"
                @update:modelValue="
                  (on) => (notification.type = on ? 'Email' : 'Notification')
                "
              />
            </div>
            <Button
              v-if="i == notifications.length - 1"
              class="w-full"
              :icon-left="BellIcon"
              :label="__('Add Notification')"
              variant="outline"
              size="sm"
              @click="addNotification"
            />
          </div>
          <Button
            icon="lucide-x"
            variant="ghost"
            @click="
              notifications.splice(notifications.indexOf(notification), 1)
            "
          />
        </div>
        <div v-else class="flex gap-1">
          <div class="flex flex-col flex-1 items-center gap-2">
            <div class="flex items-center gap-2 w-full">
              <FormControl
                v-model.number="notification.before"
                class="w-fit"
                type="number"
                :min="min(notification)"
                :max="max(notification)"
                :step="notification.interval === 'minutes' ? 5 : 1"
                variant="outline"
                :placeholder="__('10')"
                @blur="handleIntervalChange(notification)"
              />
              <FormControl
                v-model="notification.interval"
                class="flex-1 shrink-0"
                type="select"
                :options="intervalOptions(notification)"
                variant="outline"
                :placeholder="__('minutes')"
                @update:modelValue="() => handleIntervalChange(notification)"
              />
            </div>
            <div v-if="showType" class="w-full">
              <FormControl
                type="checkbox"
                :label="__('Also send as email')"
                :modelValue="notification.type === 'Email'"
                @update:modelValue="
                  (on) => (notification.type = on ? 'Email' : 'Notification')
                "
              />
            </div>
            <Button
              v-if="i == notifications.length - 1"
              class="w-full"
              :icon-left="BellIcon"
              :label="__('Add Notification')"
              variant="outline"
              size="sm"
              @click="addNotification"
            />
          </div>
          <Button
            icon="lucide-x"
            variant="ghost"
            @click="
              notifications.splice(notifications.indexOf(notification), 1)
            "
          />
        </div>
        <div
          v-if="i < notifications.length - 1"
          class="w-full h-px mt-3 mb-1 border-t border-outline-gray-1"
        />
      </div>
    </div>
  </div>
</template>
<script setup>
import BellIcon from '@/components/Icons/BellIcon.vue'
import {
  min,
  max,
  handleIntervalChange,
  reminderSummary,
  formatReminderTime as formatTime,
} from '@/components/Calendar/utils'
import { TimePicker } from 'frappe-ui'
import { computed, ref } from 'vue'

const props = defineProps({
  isAllDay: { type: Boolean, default: false },
  // Tasks always remind by email and in-app, so they hide the email checkbox.
  showType: { type: Boolean, default: true },
})

const notifications = defineModel({ type: Array, default: () => [] })
const show = ref(false)

const intervalOptions = (n) => {
  if (props.isAllDay) {
    if (n.interval === 'minutes' || n.interval === 'hours') {
      n.interval = 'days'
    }

    if (!n.time) {
      n.time = '08:00'
    }

    return [
      {
        label: n.before == 1 ? __('day before') : __('days before'),
        value: 'days',
      },
      {
        label: n.before == 1 ? __('week before') : __('weeks before'),
        value: 'weeks',
      },
    ]
  }
  return [
    {
      label: n.before == 1 ? __('minute before') : __('minutes before'),
      value: 'minutes',
    },
    {
      label: n.before == 1 ? __('hour before') : __('hours before'),
      value: 'hours',
    },
    {
      label: n.before == 1 ? __('day before') : __('days before'),
      value: 'days',
    },
    {
      label: n.before == 1 ? __('week before') : __('weeks before'),
      value: 'weeks',
    },
  ]
}

function addNotification() {
  notifications.value ??= []
  if (props.isAllDay) {
    notifications.value.push({
      type: 'Email',
      before: 1,
      interval: 'days',
      time: '08:00',
    })
  } else {
    notifications.value.push({
      type: 'Email',
      before: 10,
      interval: 'minutes',
    })
  }
}

function addShowNotifications() {
  if (!notifications.value?.length) {
    addNotification()
    show.value = true
  } else {
    show.value = !show.value
  }
}

const notificationSummary = computed(() => {
  if (!notifications.value?.length) return __('Add Notification')
  return reminderSummary(notifications.value, props.isAllDay)
})
</script>
