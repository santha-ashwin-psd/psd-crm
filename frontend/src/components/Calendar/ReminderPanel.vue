<!--
  ReminderPanel — the Reminders card shared by the event modal and the task
  modals: a collapsible header with a one-line summary, the reminder list
  (EventReminders), and one "Also send by email" switch.

  Each reminder row still stores its own type (Email = in the CRM + email,
  Notification = in the CRM only), which is what the reminder scheduler reads.
  The switch writes every row, and rows added later follow it.
-->
<template>
  <section class="crm-entry-panel">
    <button
      type="button"
      class="flex w-full items-center gap-3 text-left"
      :aria-expanded="open"
      @click="open = !open"
    >
      <span class="crm-entry-card__chip !size-9 !rounded-[10px]"
        ><span class="lucide-bell size-[18px]"
      /></span>
      <div class="min-w-0 flex-1">
        <div class="text-base font-semibold text-[var(--crm-text)]">
          {{ __('Reminders') }}
        </div>
        <div class="truncate text-[13px] text-[var(--crm-text-3)]">
          {{ summary }}
        </div>
      </div>
      <span
        class="size-5 shrink-0 text-[var(--crm-text-2)]"
        :class="open ? 'lucide-chevron-up' : 'lucide-chevron-down'"
      />
    </button>
    <div v-if="open" class="mt-4 flex flex-col gap-4">
      <EventReminders v-model="rows" :isAllDay="isAllDay" />
      <label class="crm-reminder-email">
        <span class="lucide-mail size-4 shrink-0" aria-hidden="true" />
        <span class="min-w-0 flex-1">
          <span class="block text-sm font-medium text-[var(--crm-text)]">
            {{ __('Also send by email') }}
          </span>
          <span class="block text-[13px] text-[var(--crm-text-3)]">
            {{
              emailOn
                ? emailOnHelp || __('Each reminder is also emailed.')
                : __('Reminders only show in the CRM. No emails are sent.')
            }}
          </span>
        </span>
        <Switch :modelValue="emailOn" @update:modelValue="setEmail" />
      </label>
    </div>
  </section>
</template>

<script setup>
import EventReminders from '@/components/Calendar/EventReminders.vue'
import { Switch } from 'frappe-ui'
import { computed, ref, watch } from 'vue'

const props = defineProps({
  isAllDay: { type: Boolean, default: false },
  // What "on" means for this kind of item, e.g. who gets the email.
  emailOnHelp: { type: String, default: '' },
  defaultOpen: { type: Boolean, default: true },
})

const rows = defineModel({ type: Array, default: () => [] })

const open = ref(props.defaultOpen)
const emailOn = ref(true)

// Always an array, so the first added row is seen as added (below) rather than
// as a newly loaded list.
if (!Array.isArray(rows.value)) rows.value = []

// A row without a type predates the switch; it was always emailed.
const isEmail = (row) => row.type !== 'Notification'

// A new list (a saved item loaded, or another item opened): read the switch
// from its rows. An empty list keeps the switch as it is, so turning email off
// and then adding the first reminder doesn't flip it back on. Rows added later
// are covered by the length watcher below.
watch(
  rows,
  (list) => {
    if (list?.length) emailOn.value = list.every(isEmail)
  },
  { immediate: true },
)

// Rows the person adds take the switch's setting. Loading a saved list (a new
// array) is not adding: its rows keep the types they were saved with.
watch(
  () => [rows.value, (rows.value || []).length],
  ([list, len], [prevList, prevLen] = []) => {
    if (list !== prevList || len <= (prevLen || 0)) return
    for (const row of list.slice(prevLen || 0)) {
      row.type = emailOn.value ? 'Email' : 'Notification'
    }
  },
)

function setEmail(on) {
  emailOn.value = Boolean(on)
  for (const row of rows.value || []) {
    row.type = on ? 'Email' : 'Notification'
  }
}

const summary = computed(() => {
  const n = (rows.value || []).length
  if (!n) return __('No reminders set')
  const count = n === 1 ? __('1 reminder') : __('{0} reminders', [n])
  return emailOn.value
    ? __('{0} · in the CRM and by email', [count])
    : __('{0} · in the CRM only', [count])
})
</script>
