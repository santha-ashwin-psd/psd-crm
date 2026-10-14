<!--
  EventReminders — the reminder list in the event modal.

  Each reminder is one row: a plain-language choice ("10 minutes before",
  "1 day before"), a Custom option that reveals number + unit, and for all-day
  events the time of day it fires. Rows keep the Event Notifications shape
  ({ type, before, interval, time }) so saving and the reminder scheduler are
  unchanged; the email/in-app `type` is set by the host (EventModal).
-->
<template>
  <div class="flex flex-col gap-2.5">
    <div v-for="(row, i) in rows" :key="row.name || i" class="crm-reminder-row">
      <span
        class="lucide-bell-ring size-4 shrink-0 text-[var(--crm-accent-primary)]"
        aria-hidden="true"
      />
      <FormControl
        class="crm-reminder-row__select"
        type="select"
        :aria-label="__('Reminder {0}', [i + 1])"
        :options="optionsFor(row)"
        :modelValue="presetKey(row)"
        @update:modelValue="(key) => applyPreset(row, key)"
      />
      <div
        v-if="customRows.has(row) || presetKey(row) === CUSTOM"
        class="flex shrink-0 items-center gap-2"
      >
        <div class="w-20">
          <FormControl
            v-model.number="row.before"
            type="number"
            :aria-label="__('How many')"
            :min="min(row)"
            :max="max(row)"
            :step="row.interval === 'minutes' ? 5 : 1"
            @blur="handleIntervalChange(row)"
          />
        </div>
        <div class="w-40">
          <FormControl
            v-model="row.interval"
            type="select"
            :aria-label="__('Unit')"
            :options="unitOptions(row)"
            @update:modelValue="handleIntervalChange(row)"
          />
        </div>
      </div>
      <div v-if="isAllDay" class="flex shrink-0 items-center gap-2">
        <span class="text-sm text-[var(--crm-text-3)]">{{ __('at') }}</span>
        <div class="w-28">
          <TimePicker v-model="row.time" :placeholder="__('08:00 am')" />
        </div>
      </div>
      <span
        v-if="duplicates.has(i)"
        class="text-sm text-[var(--crm-danger)]"
        role="alert"
      >
        {{ __('Same time as another reminder') }}
      </span>
      <Button
        class="ml-auto"
        variant="ghost"
        icon="lucide-x"
        :tooltip="__('Remove reminder')"
        :aria-label="__('Remove reminder')"
        @click="remove(i)"
      />
    </div>

    <!-- Empty: one click adds a common reminder. -->
    <div v-if="!rows.length" class="flex flex-wrap items-center gap-2">
      <span class="text-sm text-[var(--crm-text-3)]">
        {{ __('No reminders yet. Quick add:') }}
      </span>
      <button
        v-for="q in quickAdds"
        :key="q.label"
        type="button"
        class="crm-reminder-chip"
        @click="add(q)"
      >
        <span class="lucide-plus size-3.5" aria-hidden="true" />
        {{ q.label }}
      </button>
    </div>
    <Button
      v-else-if="rows.length < MAX_REMINDERS && nextUnused"
      class="self-start"
      variant="ghost"
      icon-left="plus"
      :label="__('Add reminder')"
      @click="add()"
    />
  </div>
</template>

<script setup>
import {
  min,
  max,
  handleIntervalChange,
  reminderKey,
  duplicateReminders,
} from '@/components/Calendar/utils'
import { TimePicker } from 'frappe-ui'
import { computed, reactive, watch } from 'vue'

const props = defineProps({
  isAllDay: { type: Boolean, default: false },
})

const rows = defineModel({ type: Array, default: () => [] })

const MAX_REMINDERS = 5
const CUSTOM = 'custom'
// Rows the user switched to Custom keep showing the number + unit inputs even
// when their value happens to match a preset.
const customRows = reactive(new WeakSet())

const TIMED_PRESETS = [
  [5, 'minutes'],
  [10, 'minutes'],
  [15, 'minutes'],
  [30, 'minutes'],
  [1, 'hours'],
  [2, 'hours'],
  [1, 'days'],
  [1, 'weeks'],
]
const ALL_DAY_PRESETS = [
  [1, 'days'],
  [2, 'days'],
  [1, 'weeks'],
]

const UNIT = {
  minutes: ['minute', 'minutes'],
  hours: ['hour', 'hours'],
  days: ['day', 'days'],
  weeks: ['week', 'weeks'],
}

function describe(before, interval) {
  const [one, many] = UNIT[interval] || ['', '']
  return __('{0} {1} before', [before, before == 1 ? __(one) : __(many)])
}

const presets = computed(() =>
  props.isAllDay ? ALL_DAY_PRESETS : TIMED_PRESETS,
)

// Two reminders at the same moment would just notify twice, so a row is only
// offered the presets no other row already uses.
const duplicates = computed(() =>
  duplicateReminders(rows.value, props.isAllDay),
)

function keyOf(before, interval, time) {
  return reminderKey({ before, interval, time }, props.isAllDay)
}

function usedBy(others) {
  return new Set(others.map((r) => reminderKey(r, props.isAllDay)))
}

function optionsFor(row) {
  const used = usedBy((rows.value || []).filter((r) => r !== row))
  return [
    ...presets.value
      .filter(([b, i]) => !used.has(keyOf(b, i, row.time)))
      .map(([b, i]) => ({ label: describe(b, i), value: `${b}-${i}` })),
    { label: __('Custom…'), value: CUSTOM },
  ]
}

// The first suggestion no row uses yet; none left means nothing to add.
const nextUnused = computed(() => {
  const used = usedBy(rows.value || [])
  return presets.value.find(([b, i]) => !used.has(keyOf(b, i, '08:00')))
})

const quickAdds = computed(() =>
  (props.isAllDay
    ? [
        [1, 'days'],
        [1, 'weeks'],
      ]
    : [
        [10, 'minutes'],
        [1, 'hours'],
        [1, 'days'],
      ]
  ).map(([before, interval]) => ({
    before,
    interval,
    label: describe(before, interval),
  })),
)

function presetKey(row) {
  if (customRows.has(row)) return CUSTOM
  const key = `${row.before}-${row.interval}`
  return presets.value.some(([b, i]) => `${b}-${i}` === key) ? key : CUSTOM
}

function applyPreset(row, key) {
  if (key === CUSTOM) {
    customRows.add(row)
    return
  }
  customRows.delete(row)
  const [before, interval] = key.split('-')
  row.before = Number(before)
  row.interval = interval
}

function unitOptions(row) {
  const units = props.isAllDay
    ? ['days', 'weeks']
    : ['minutes', 'hours', 'days', 'weeks']
  return units.map((u) => ({
    label: row.before == 1 ? __(`${UNIT[u][0]} before`) : __(`${u} before`),
    value: u,
  }))
}

function add(preset) {
  rows.value ??= []
  // A new row takes the first suggestion not already used, so "Add reminder"
  // never stacks two identical reminders.
  const [before, interval] = preset
    ? [preset.before, preset.interval]
    : nextUnused.value || []
  if (!before) return
  rows.value.push({
    type: 'Email',
    before,
    interval,
    ...(props.isAllDay ? { time: '08:00' } : {}),
  })
}

function remove(i) {
  rows.value.splice(i, 1)
}

// All-day reminders fire at a time of day N days/weeks before, so minute and
// hour offsets don't apply: move them to days and give them a time.
watch(
  () => props.isAllDay,
  (allDay) => {
    if (!allDay) return
    for (const row of rows.value || []) {
      if (row.interval === 'minutes' || row.interval === 'hours') {
        row.interval = 'days'
        row.before = 1
      }
      if (!row.time) row.time = '08:00'
    }
    // Converting minutes/hours to "1 day" can make rows identical; keep one.
    const dupes = duplicateReminders(rows.value, true)
    if (dupes.size) rows.value = rows.value.filter((_, i) => !dupes.has(i))
  },
  { immediate: true },
)
</script>
