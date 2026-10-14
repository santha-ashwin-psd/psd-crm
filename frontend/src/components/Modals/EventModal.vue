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

          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <EntryField :label="__('Attendees')" icon="lucide-users">
              <Attendee
                v-model="peoples"
                input-class="!h-10 !border-0 !bg-transparent !shadow-none !ring-0 !text-[15px]"
                :validate="validateEmail"
                :error-message="
                  (value) => __('{0} is an invalid email address', [value])
                "
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

          <div class="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
            <EntryField :label="__('Location')" icon="lucide-map-pin">
              <TextInput
                v-model="_event.location"
                class="w-full"
                :placeholder="__('Add Location')"
              />
            </EntryField>
            <EntryField
              :label="__('Description')"
              icon="lucide-file-text"
              multiline
            >
              <TextEditor
                editor-class="!prose-sm min-h-[64px] max-h-40 overflow-auto px-3 py-2.5 text-[15px] text-ink-gray-8 focus:outline-none"
                :bubbleMenu="true"
                :content="_event.description"
                :placeholder="__('Add event description...')"
                @change="(val) => (_event.description = val)"
              />
            </EntryField>
          </div>

          <!-- NOTIFICATIONS -->
          <section class="crm-entry-panel">
            <button
              type="button"
              class="flex w-full items-center gap-3 text-left"
              :aria-expanded="showReminders"
              @click="showReminders = !showReminders"
            >
              <span
                class="lucide-bell size-5 shrink-0 text-[var(--crm-accent-primary)]"
              />
              <div class="min-w-0 flex-1">
                <div class="text-base font-semibold text-[var(--crm-text)]">
                  {{ __('Notifications') }}
                </div>
                <div class="text-[13px] text-[var(--crm-text-3)]">
                  {{ __('Get reminded before the event') }}
                </div>
              </div>
              <span
                class="size-5 shrink-0 text-[var(--crm-text-2)]"
                :class="
                  showReminders ? 'lucide-chevron-up' : 'lucide-chevron-down'
                "
              />
            </button>
            <div v-if="showReminders" class="mt-4 flex flex-col gap-3">
              <FormControl
                type="checkbox"
                :label="__('Send email notification')"
                :modelValue="emailReminders"
                @update:modelValue="setEmailReminders"
              />
              <div class="flex items-start gap-4">
                <span
                  class="mt-1.5 w-24 shrink-0 text-[15px] text-[var(--crm-text-2)]"
                >
                  {{ __('Remind me') }}
                </span>
                <EventNotifications
                  v-model="_event.notifications"
                  class="min-w-0 flex-1"
                  :isAllDay="_event.isFullDay"
                  :showType="false"
                  chevron
                  trigger-class="!h-10 min-w-[220px] max-w-[320px] justify-between gap-3 !rounded-[10px] !border-[var(--crm-border-strong)] !px-3.5 !text-[15px]"
                />
              </div>
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
          :disabled="!dirty || loadingDetails"
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
import EventNotifications from '@/components/Calendar/EventNotifications.vue'
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
  if (!_event.value.title) {
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
      value: people.length
        ? people.length > 2
          ? __('{0} and {1} more', [
              people.slice(0, 2).join(', '),
              people.length - 2,
            ])
          : people.join(', ')
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
