<template>
  <CrmDialog
    v-model:open="show"
    size="5xl"
    icon="lucide-calendar-days"
    :title="
      mode === 'edit'
        ? __('Edit an Event')
        : mode === 'duplicate'
          ? __('Duplicate an Event')
          : __('Create an Event')
    "
    :subtitle="
      __(
        'Schedule a meeting, call or follow-up with your contact or organisation',
      )
    "
    root-class="crm-dialog--entry crm-dialog--entry-md"
    body-class="crm-doc-modal"
    max-body-height="min(72vh, calc(100vh - 13rem))"
    footer-align="between"
  >
    <template #header-actions>
      <Button
        v-if="mode === 'edit'"
        variant="ghost"
        :tooltip="__('Delete')"
        @click="deleteEvent"
      >
        <template #icon>
          <LucideTrash2 class="h-4 w-4" />
        </template>
      </Button>
      <Button
        v-if="mode === 'edit'"
        variant="ghost"
        :tooltip="__('Duplicate')"
        @click="duplicateEvent"
      >
        <template #icon>
          <LucideCopy class="h-4 w-4" />
        </template>
      </Button>
    </template>
    <template #default>
      <div
        class="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]"
      >
        <!-- LEFT: the event itself -->
        <div class="flex min-w-0 flex-col gap-5">
          <div class="crm-entry-section-title">
            <span class="crm-entry-card__chip !size-9 !rounded-[10px]"
              ><span class="lucide-calendar-days size-[18px]"
            /></span>
            {{ __('Event Details') }}
          </div>

          <EntryField :label="__('Title')" required>
            <!-- The colour picker is the Title's icon segment. -->
            <template #prefix>
              <Dropdown :options="colors">
                <button
                  type="button"
                  class="grid size-8 place-items-center rounded-md hover:bg-[var(--crm-surface-2)]"
                  :aria-label="__('Event colour')"
                  :title="__('Event colour')"
                >
                  <span
                    class="size-3 rounded-full"
                    :style="{ backgroundColor: _event.color || '#30A66D' }"
                  />
                </button>
              </Dropdown>
            </template>
            <TextInput
              ref="title"
              v-model="_event.title"
              class="w-full"
              :placeholder="__('e.g. Call with John Doe')"
              required
            />
          </EntryField>

          <div
            class="grid grid-cols-1 items-end gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto]"
          >
            <EntryField :label="__('Date')" icon="lucide-calendar">
              <DatePicker
                variant="outline"
                :value="_event.fromDate"
                :format="'MMM D, YYYY'"
                :placeholder="__('May 1, 2025')"
                :clearable="false"
                @update:modelValue="(date) => updateDate(date, true)"
              >
                <template #suffix="{ togglePopover }">
                  <span
                    class="lucide-chevron-down h-4 w-4 cursor-pointer"
                    aria-hidden="true"
                    @click="togglePopover"
                  />
                </template>
              </DatePicker>
            </EntryField>
            <EntryField
              v-if="!_event.isFullDay"
              :label="__('Time')"
              icon="lucide-clock"
            >
              <div class="flex w-full items-center">
                <TimePicker
                  class="flex-1"
                  variant="outline"
                  :modelValue="_event.fromTime"
                  :placeholder="__('Start Time')"
                  @update:modelValue="(time) => updateTime(time, true)"
                />
                <span class="px-1 text-[var(--crm-text-4)]">–</span>
                <TimePicker
                  class="flex-1"
                  variant="outline"
                  :modelValue="_event.toTime"
                  :options="toOptions"
                  :placeholder="__('End Time')"
                  placement="bottom-end"
                  @update:modelValue="(time) => updateTime(time)"
                />
              </div>
            </EntryField>
            <div v-else />
            <label
              class="flex h-[42px] items-center gap-3 text-[15px] text-[var(--crm-text-2)]"
            >
              {{ __('All Day') }}
              <Switch v-model="_event.isFullDay" />
            </label>
          </div>

          <!-- Single-line fields side by side; the two that grow (attendees,
               description) get the full width so they never push a
               neighbour out of line. -->
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <EntryField :label="__('Location')" icon="lucide-map-pin">
              <TextInput
                v-model="_event.location"
                class="w-full"
                :placeholder="__('Add Location')"
              />
            </EntryField>
            <EntryField :label="__('Visibility')" icon="lucide-eye" accent>
              <FormControl
                v-model="_event.eventType"
                type="select"
                :options="[
                  { label: __('Private'), value: 'Private' },
                  { label: __('Public'), value: 'Public' },
                ]"
                :placeholder="__('Private or Public')"
              />
            </EntryField>
          </div>

          <div class="flex flex-col gap-2.5">
            <EntryField :label="__('Attendees')" icon="lucide-users">
              <Attendee
                v-model="peoples"
                :show-selected="false"
                input-class="!h-10 !border-0 !bg-transparent !shadow-none !ring-0 !text-[15px]"
                :placeholder="__('Search people or type an email')"
                :validate="validateEmail"
                :error-message="
                  (value) => __('{0} is an invalid email address', [value])
                "
              />
            </EntryField>
            <!-- Chosen attendees: compact wrapping pills; long emails truncate
                 with a tooltip, and a long list folds into "+N more". -->
            <div v-if="peoples.length" class="crm-attendee-list">
              <span
                v-for="p in visibleAttendees"
                :key="p.email"
                class="crm-attendee-pill"
                :title="p.email"
              >
                <UserAvatar :user="p.email" size="xs" class="shrink-0" />
                <span class="truncate">{{ p.email }}</span>
                <button
                  type="button"
                  class="crm-attendee-pill__remove"
                  :aria-label="__('Remove {0}', [p.email])"
                  @click="removeAttendee(p.email)"
                >
                  <span class="lucide-x size-3" aria-hidden="true" />
                </button>
              </span>
              <button
                v-if="peoples.length > ATTENDEE_FOLD"
                type="button"
                class="crm-attendee-more"
                @click="showAllAttendees = !showAllAttendees"
              >
                {{
                  showAllAttendees
                    ? __('Show less')
                    : __('+{0} more', [peoples.length - ATTENDEE_FOLD])
                }}
              </button>
            </div>
          </div>

          <EntryField
            :label="__('Description')"
            icon="lucide-file-text"
            multiline
          >
            <TextEditor
              editor-class="!prose-sm min-h-[88px] max-h-48 overflow-y-auto overflow-x-hidden break-words [overflow-wrap:anywhere] px-3 py-2.5 text-[15px] text-ink-gray-8 focus:outline-none"
              :bubbleMenu="true"
              :content="_event.description"
              :placeholder="__('Add agenda, notes or a meeting link…')"
              @change="(val) => (_event.description = val)"
            />
          </EntryField>

          <!-- REMINDERS -->
          <section class="crm-entry-panel">
            <button
              type="button"
              class="flex w-full items-center gap-3 text-left"
              :aria-expanded="showReminders"
              @click="showReminders = !showReminders"
            >
              <span class="crm-entry-card__chip !size-9 !rounded-[10px]"
                ><span class="lucide-bell size-[18px]"
              /></span>
              <div class="min-w-0 flex-1">
                <div class="text-base font-semibold text-[var(--crm-text)]">
                  {{ __('Reminders') }}
                </div>
                <div class="truncate text-[13px] text-[var(--crm-text-3)]">
                  {{ reminderSummaryText }}
                </div>
              </div>
              <span
                class="size-5 shrink-0 text-[var(--crm-text-2)]"
                :class="
                  showReminders ? 'lucide-chevron-up' : 'lucide-chevron-down'
                "
              />
            </button>
            <div v-if="showReminders" class="mt-4 flex flex-col gap-4">
              <EventReminders
                v-model="_event.notifications"
                :isAllDay="_event.isFullDay"
              />
              <label class="crm-reminder-email">
                <span class="lucide-mail size-4 shrink-0" aria-hidden="true" />
                <span class="min-w-0 flex-1">
                  <span
                    class="block text-sm font-medium text-[var(--crm-text)]"
                  >
                    {{ __('Also send by email') }}
                  </span>
                  <span class="block text-[13px] text-[var(--crm-text-3)]">
                    {{
                      emailReminders
                        ? __(
                            'Each reminder is emailed to you and every attendee, and shows in the CRM.',
                          )
                        : __(
                            'Reminders only show in the CRM. No emails are sent.',
                          )
                    }}
                  </span>
                </span>
                <Switch
                  :modelValue="emailReminders"
                  @update:modelValue="setEmailReminders"
                />
              </label>
            </div>
          </section>
        </div>

        <!-- RIGHT: live summary of what will be saved -->
        <aside class="crm-entry-guide hidden lg:flex">
          <span class="crm-entry-guide__dot left-[18%] top-[14%] size-2" />
          <span class="crm-entry-guide__dot right-[16%] top-[9%] size-1.5" />
          <span class="crm-entry-guide__badge"
            ><span class="lucide-calendar-clock size-8"
          /></span>
          <h3 class="text-xl font-bold text-[var(--crm-text)]">
            {{ __('Event Summary') }}
          </h3>
          <p class="max-w-[260px] text-sm leading-6 text-[var(--crm-text-2)]">
            {{
              __(
                'All the details will be saved to your CRM calendar and reminders.',
              )
            }}
          </p>
          <dl class="crm-entry-summary">
            <div v-for="row in summary" :key="row.label">
              <dt>
                <span :class="[row.icon, 'size-4']" />
                {{ row.label }}
              </dt>
              <dd :class="{ 'crm-entry-summary__empty': !row.value }">
                {{ row.value || __('Not added') }}
              </dd>
            </div>
          </dl>
        </aside>
      </div>
    </template>
    <template v-if="eventsResource" #footer>
      <ErrorMessage v-if="error" :message="__(error)" />
      <span
        v-else
        class="hidden items-center gap-2 text-sm text-[var(--crm-text-2)] sm:flex"
      >
        <span class="lucide-info size-4 text-[var(--crm-accent-primary)]" />
        {{
          __(
            'You can always view and edit this event from the Calendar section.',
          )
        }}
      </span>
      <div class="flex justify-end gap-3">
        <Button
          size="lg"
          variant="outline"
          class="min-w-[120px]"
          :label="__('Cancel')"
          @click="show = false"
        />
        <Button
          size="lg"
          variant="solid"
          class="min-w-[140px]"
          :label="
            mode === 'edit'
              ? __('Update Event')
              : mode === 'duplicate'
                ? __('Duplicate Event')
                : __('Create Event')
          "
          :disabled="!canSave"
          :loading="
            mode === 'edit'
              ? eventsResource.setValue.loading
              : eventsResource.insert.loading
          "
          @click="update"
        />
      </div>
    </template>
  </CrmDialog>
</template>
<script setup>
import CrmDialog from '@/components/Modals/CrmDialog.vue'
import { duplicateReminders } from '@/components/Calendar/utils'
import EventReminders from '@/components/Calendar/EventReminders.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import Attendee from '@/components/Calendar/Attendee.vue'
import EntryField from '@/components/Controls/EntryField.vue'
import {
  Switch,
  TextEditor,
  ErrorMessage,
  DatePicker,
  TimePicker,
  dayjs,
  Dropdown,
  call,
} from 'frappe-ui'
import { globalStore } from '@/stores/global'
import { validateEmail } from '@/utils'
import {
  useEvent,
  normalizeParticipants,
  buildEndTimeOptions,
  computeAutoToTime,
  validateTimeRange,
} from '@/composables/event'
import { CalendarColorMap as colorMap } from 'frappe-ui'
import { onMounted, ref, computed, h, watch } from 'vue'

const props = defineProps({
  event: { type: Object, default: () => ({}) },
  doctype: { type: String, default: '' },
  docname: { type: String, default: '' },
})

const { $dialog } = globalStore()

const show = defineModel({ type: Boolean })

const { eventsResource } = useEvent({
  doctype: props.doctype,
  docname: props.docname,
})

const title = ref(null)
const error = ref(null)
const mode = computed(() => {
  return _event.value.id == 'duplicate'
    ? 'duplicate'
    : _event.value.id
      ? 'edit'
      : 'create'
})

const oldEvent = ref({})
const _event = ref({
  title: '',
  description: '',
  fromDate: '',
  toDate: '',
  fromTime: '',
  toTime: '',
  isFullDay: false,
  eventType: 'Public',
  location: '',
  color: 'green',
  referenceDoctype: '',
  referenceDocname: '',
  event_participants: [],
  notifications: [],
})

const dirty = computed(() => {
  return JSON.stringify(_event.value) !== JSON.stringify(oldEvent.value)
})

// The required fields, not just "something changed": typing a title and deleting
// it, or flipping All day, changes the form but still leaves nothing to save.
const hasRequired = computed(() => {
  const e = _event.value
  if (!e.title?.trim() || !e.fromDate) return false
  if (duplicateReminders(e.notifications, e.isFullDay).size) return false
  return e.isFullDay || Boolean(e.fromTime && e.toTime)
})

const canSave = computed(
  () => hasRequired.value && dirty.value && !loadingDetails.value,
)

const peoples = computed({
  get() {
    return _event.value.event_participants || []
  },
  set(list) {
    _event.value.event_participants = normalizeParticipants(list)
  },
})

onMounted(() => {
  if (props.event) {
    let start = dayjs(props.event.starts_on)
    let end = dayjs(props.event.ends_on)

    if (!props.event.name) {
      start = dayjs()
      end = dayjs().add(1, 'hour')
    }

    adoptReminders(props.event.notifications)
    _event.value = {
      id: props.event.name || '',
      title: props.event.subject,
      description: props.event.description,
      fromDate: start.format('YYYY-MM-DD'),
      toDate: end.format('YYYY-MM-DD'),
      fromTime: start.format('HH:mm'),
      toTime: end.format('HH:mm'),
      isFullDay: props.event.all_day,
      eventType: props.event.event_type,
      location: props.event.location || '',
      color: props.event.color,
      referenceDoctype: props.event.reference_doctype,
      referenceDocname: props.event.reference_docname,
      event_participants: props.event.event_participants || [],
      notifications: props.event.notifications || [],
    }

    oldEvent.value = JSON.parse(JSON.stringify(_event.value))

    setTimeout(() => title.value?.el?.focus(), 100)

    if (props.event.name) loadDetails(props.event.name)
  }
})

// The event passed in comes from the activity list, which does not carry its
// reminders and attendees. Saving without them would delete both, so they are
// read from the event itself and Update stays disabled until they arrive.
const loadingDetails = ref(false)

async function loadDetails(name) {
  loadingDetails.value = true
  try {
    const doc = await call('frappe.client.get', { doctype: 'Event', name })
    const details = {
      event_participants: doc.event_participants || [],
      notifications: doc.notifications || [],
    }
    adoptReminders(details.notifications)
    Object.assign(_event.value, JSON.parse(JSON.stringify(details)))
    Object.assign(oldEvent.value, JSON.parse(JSON.stringify(details)))
  } catch {
    error.value = __(
      'Could not load the reminders and attendees. Close and reopen the event.',
    )
    return
  }
  loadingDetails.value = false
}

function updateDate(d) {
  _event.value.fromDate = d
  _event.value.toDate = d
}

function updateTime(t, fromTime = false) {
  error.value = null
  const prevTo = _event.value.toTime
  if (fromTime) {
    _event.value.fromTime = t
    if (!_event.value.toTime || _event.value.toTime <= t) {
      _event.value.toTime = computeAutoToTime(t)
    }
  } else {
    _event.value.toTime = t
  }
  const { valid, error: err } = validateTimeRange({
    fromDate: _event.value.fromDate,
    toDate: _event.value.toDate,
    fromTime: _event.value.fromTime,
    toTime: _event.value.toTime,
    isFullDay: _event.value.isFullDay,
  })
  if (!valid) {
    error.value = err
    _event.value.toTime = prevTo
  }
}

function update() {
  error.value = null
  if (!_event.value.title?.trim()) {
    error.value = __('Title is required')
    // Guarded like the other two focus calls in this file — the message
    // matters more than the focus, and a null ref must not swallow it.
    title.value?.el?.focus()
    return
  }

  const { valid, error: err } = validateTimeRange({
    fromDate: _event.value.fromDate,
    toDate: _event.value.toDate,
    fromTime: _event.value.fromTime,
    toTime: _event.value.toTime,
    isFullDay: _event.value.isFullDay,
  })
  if (!valid) {
    error.value = err
    return
  }

  if (_event.value.id && _event.value.id !== 'duplicate') {
    updateEvent()
  } else {
    createEvent()
  }
}

function createEvent() {
  eventsResource.insert.submit(
    {
      subject: _event.value.title,
      description: _event.value.description,
      starts_on: _event.value.fromDate + ' ' + _event.value.fromTime,
      ends_on: _event.value.toDate + ' ' + _event.value.toTime,
      all_day: _event.value.isFullDay || false,
      event_type: _event.value.eventType,
      location: _event.value.location || '',
      color: _event.value.color,
      reference_doctype: props.doctype,
      reference_docname: props.docname,
      event_participants: _event.value.event_participants,
      notifications: _event.value.notifications,
    },
    {
      onSuccess: async () => {
        await eventsResource.reload()
        show.value = false
      },
    },
  )
}

function updateEvent() {
  if (!_event.value.id) {
    error.value = __('Event ID is required')
    return
  }

  eventsResource.setValue.submit(
    {
      name: _event.value.id,
      subject: _event.value.title,
      description: _event.value.description,
      starts_on: _event.value.fromDate + ' ' + _event.value.fromTime,
      ends_on: _event.value.toDate + ' ' + _event.value.toTime,
      all_day: _event.value.isFullDay,
      event_type: _event.value.eventType,
      location: _event.value.location || '',
      color: _event.value.color,
      reference_doctype: props.doctype,
      reference_docname: props.docname,
      event_participants: _event.value.event_participants,
      notifications: _event.value.notifications,
    },
    {
      onSuccess: async () => {
        await eventsResource.reload()
        show.value = false
      },
    },
  )
}

function duplicateEvent() {
  if (!_event.value.id) return

  _event.value.id = 'duplicate'
  _event.value.title = _event.value.title + ' (Copy)'
  setTimeout(() => title.value?.el?.focus(), 100)
}

function deleteEvent() {
  if (!_event.value.id) return

  $dialog({
    title: __('Delete'),
    message: __('Are you sure you want to delete this event?'),
    actions: [
      {
        label: __('Delete'),
        variant: 'solid',
        theme: 'red',
        onClick: (close) => {
          eventsResource.delete.submit(_event.value.id, {
            onSuccess: async () => {
              await eventsResource.reload()
              show.value = false
              close()
            },
          })
        },
      },
    ],
  })
}

const toOptions = computed(() => buildEndTimeOptions(_event.value.fromTime))

// --- Reminders --------------------------------------------------------------
// One "Send email notification" switch for the event. Each reminder row still
// stores its own type (Email = bell + email, Notification = bell only), so the
// switch writes every row, and rows added later follow it.
const showReminders = ref(true)
const emailReminders = ref(true)
// Set while reminders are loaded from a saved event, so loading them doesn't
// count as the user adding rows.
let loadingReminders = false

function adoptReminders(rows) {
  loadingReminders = true
  emailReminders.value = rows?.length
    ? rows.every((r) => r.type === 'Email')
    : true
  setTimeout(() => (loadingReminders = false))
}

function setEmailReminders(on) {
  emailReminders.value = Boolean(on)
  for (const row of _event.value.notifications || []) {
    row.type = on ? 'Email' : 'Notification'
  }
}

watch(
  () => (_event.value.notifications || []).length,
  (len, prev) => {
    if (!loadingReminders && len > (prev || 0)) {
      const rows = _event.value.notifications
      for (const row of rows.slice(prev || 0)) {
        row.type = emailReminders.value ? 'Email' : 'Notification'
      }
    }
  },
)

// --- Attendees ---------------------------------------------------------------
const ATTENDEE_FOLD = 6
const showAllAttendees = ref(false)
const visibleAttendees = computed(() =>
  showAllAttendees.value
    ? peoples.value
    : peoples.value.slice(0, ATTENDEE_FOLD),
)
function removeAttendee(email) {
  peoples.value = peoples.value.filter((p) => p.email !== email)
}

const reminderSummaryText = computed(() => {
  const n = (_event.value.notifications || []).length
  if (!n) return __('No reminders set')
  const count = n === 1 ? __('1 reminder') : __('{0} reminders', [n])
  return emailReminders.value
    ? __('{0} · in the CRM and by email', [count])
    : __('{0} · in the CRM only', [count])
})

// --- Summary ----------------------------------------------------------------
const summary = computed(() => {
  const e = _event.value
  let when = ''
  if (e.fromDate) {
    when = dayjs(e.fromDate).format('MMM D, YYYY')
    when += e.isFullDay
      ? ' • ' + __('All day')
      : e.fromTime
        ? ` • ${e.fromTime}${e.toTime ? ' – ' + e.toTime : ''}`
        : ''
  }
  const people = (e.event_participants || []).map((p) => p.email || p)
  return [
    { icon: 'lucide-calendar-days', label: __('Title'), value: e.title },
    { icon: 'lucide-clock', label: __('Date & Time'), value: when },
    {
      icon: 'lucide-users',
      label: __('Attendees'),
      // A count once there are several: a column of wrapped emails told the
      // reader less than the number does.
      value:
        people.length === 1
          ? people[0]
          : people.length
            ? __('{0} attendees', [people.length])
            : '',
    },
    { icon: 'lucide-map-pin', label: __('Location'), value: e.location },
    {
      icon: 'lucide-eye',
      label: __('Visibility'),
      // An unset type behaves as Private: only the owner and attendees see it.
      value: __(e.eventType || 'Private'),
    },
  ]
})

const colors = Object.keys(colorMap).map((c) => ({
  label: c.charAt(0).toUpperCase() + c.slice(1),
  value: colorMap[c].color,
  icon: h('div', {
    class: '!size-2.5 rounded-full',
    style: { backgroundColor: colorMap[c].color },
  }),
  onClick: () => (_event.value.color = colorMap[c].color),
}))
</script>
