<template>
  <LayoutHeader>
    <template #left-header>
      <ViewBreadcrumbs routeName="Calendar" />
    </template>
    <template #right-header />
  </LayoutHeader>
  <div class="flex h-screen overflow-hidden bg-[var(--crm-bg)]">
    <Calendar
      ref="calendar"
      class="crm-calendar flex-1 overflow-hidden"
      :config="{
        defaultMode: defaultMode,
        isEditMode: true,
        eventIcons: {},
        allowCustomClickEvents: true,
        enableShortcuts: false,
        noBorder: true,
      }"
      :events="events.data"
      :onClick="showDetails"
      :onDblClick="editDetails"
      :onCellClick="newEvent"
      @create="(event) => createEvent(event)"
      @update="(event) => updateEvent(event, true)"
      @delete="(eventID) => deleteEvent(eventID)"
      @rangeChange="handleRangeChange"
    >
      <template
        #header="{
          currentMonthYear,
          activeView,
          selectedMonthDate,
          decrement,
          increment,
          updateActiveView,
          onMonthYearChange,
          setCalendarDate,
        }"
      >
        <div
          class="mx-4 mb-6 mt-5 flex flex-wrap items-center justify-between gap-3"
        >
          <!-- Month/year title + navigation group -->
          <div class="flex items-center gap-3">
            <DatePicker
              :modelValue="selectedMonthDate"
              :clearable="false"
              @update:modelValue="(val) => onMonthYearChange(val)"
            >
              <template #target="{ togglePopover }">
                <button
                  class="flex items-center gap-1.5 text-xl font-semibold text-ink-gray-9 transition-colors hover:text-ink-gray-7"
                  @click="togglePopover"
                >
                  {{ currentMonthYear }}
                  <FeatherIcon
                    name="chevron-down"
                    class="size-4 text-ink-gray-5"
                  />
                </button>
              </template>
            </DatePicker>

            <div
              class="inline-flex items-center overflow-hidden rounded-lg border border-[var(--crm-border)] bg-[var(--crm-surface)]"
            >
              <button
                class="grid size-8 place-items-center text-ink-gray-6 transition-colors hover:bg-[var(--crm-surface-2)] hover:text-ink-gray-9"
                :aria-label="__('Previous')"
                @click="decrement"
              >
                <FeatherIcon name="chevron-left" class="size-4" />
              </button>
              <button
                class="h-8 border-x border-[var(--crm-border)] px-3 text-sm font-medium text-ink-gray-7 transition-colors hover:bg-[var(--crm-surface-2)]"
                @click="setCalendarDate()"
              >
                {{ __('Today') }}
              </button>
              <button
                class="grid size-8 place-items-center text-ink-gray-6 transition-colors hover:bg-[var(--crm-surface-2)] hover:text-ink-gray-9"
                :aria-label="__('Next')"
                @click="increment"
              >
                <FeatherIcon name="chevron-right" class="size-4" />
              </button>
            </div>
          </div>

          <!-- View switcher (segmented) + user -->
          <div class="flex items-center gap-3">
            <div
              class="inline-flex items-center gap-0.5 rounded-lg border border-[var(--crm-border)] bg-[var(--crm-surface)] p-0.5"
            >
              <button
                v-for="v in ['Day', 'Week', 'Month']"
                :key="v"
                class="rounded-md px-3 py-1 text-sm transition-colors"
                :class="
                  activeView === v
                    ? 'bg-[var(--crm-accent-primary)] font-medium text-white shadow-sm'
                    : 'text-ink-gray-6 hover:text-ink-gray-9'
                "
                @click="updateActiveView(v)"
              >
                {{ __(v) }}
              </button>
            </div>

            <Link
              class="form-control w-44 [&_button]:!rounded-lg [&_button]:!border [&_button]:!border-[var(--crm-border)] [&_button]:!bg-[var(--crm-surface)] [&_button:hover]:!bg-[var(--crm-surface-2)]"
              :value="getUser(currentUser).full_name"
              doctype="User"
              :placeholder="__('John Doe')"
              :filters="{
                name: ['in', users.data.crmUsers?.map((user) => user.name)],
                ignore_user_type: 1,
              }"
              :hideMe="true"
              @change="(option) => updateUser(option)"
            >
              <template #prefix>
                <UserAvatar class="mr-2 !h-4 !w-4" :user="currentUser" />
              </template>
              <template #item-prefix="{ option }">
                <UserAvatar class="mr-2" :user="option.value" size="sm" />
              </template>
              <template #item-label="{ option }">
                <Tooltip :text="option.value">
                  <div class="cursor-pointer text-ink-gray-9">
                    {{ getUser(option.value).full_name }}
                  </div>
                </Tooltip>
              </template>
            </Link>
          </div>
        </div>
      </template>
    </Calendar>

    <!-- Event Panel Container -->
    <div
      class="overflow-hidden flex-none transition-all duration-300 ease-in-out flex flex-col"
      :class="
        showEventPanel ? 'w-[352px] border-l bg-surface-base' : 'w-0 border-l-0'
      "
    >
      <CalendarEventPanel
        v-if="showEventPanel"
        ref="eventPanel"
        v-model="showEventPanel"
        v-model:event="event"
        :mode="mode"
        @new="newEvent"
        @save="saveEvent"
        @edit="editDetails"
        @delete="deleteEvent"
        @duplicate="duplicateEvent"
        @details="showDetails"
        @close="close"
        @sync="syncEvent"
      />
    </div>
  </div>
</template>
<script setup>
import { formatError } from '@/utils/formatError'
import CalendarEventPanel from '@/components/Calendar/CalendarEventPanel.vue'
import ViewBreadcrumbs from '@/components/ViewBreadcrumbs.vue'
import LayoutHeader from '@/components/LayoutHeader.vue'
import Link from '@/components/Controls/Link.vue'
import { sessionStore } from '@/stores/session'
import { usersStore } from '@/stores/users'
import { globalStore } from '@/stores/global'
import { getSettings } from '@/stores/settings'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import {
  Calendar,
  createListResource,
  dayjs,
  DatePicker,
  Tooltip,
  FeatherIcon,
  CalendarActiveEvent as activeEvent,
  call,
  toast,
} from 'frappe-ui'
import {
  onMounted,
  onBeforeUnmount,
  ref,
  computed,
  provide,
  nextTick,
} from 'vue'
import { pageCreateAction } from '@/composables/pageActions'
import { useRoute } from 'vue-router'

const { user } = sessionStore()
const { $dialog } = globalStore()
const { settings } = getSettings()
const { users, getUser } = usersStore()
const route = useRoute()

const modeMap = {
  Daily: 'Day',
  Weekly: 'Week',
  Monthly: 'Month',
}

const defaultMode = computed(() => {
  return modeMap[settings.value?.default_calendar_view] || 'Week'
})

const calendar = ref(null)
const activeRangeKey = ref('')
const currentUser = ref(user)

async function updateUser(u) {
  currentUser.value = u
  events.update({
    orFilters: buildEventOrFilters(),
  })
  await events.reload()
}

function buildEventFilters(range) {
  const filters = [['status', '=', 'Open']]
  if (range?.startDate && range?.endDate) {
    const start = dayjs(range.startDate)
      .startOf('day')
      .format('YYYY-MM-DD HH:mm:ss')
    const end = dayjs(range.endDate).endOf('day').format('YYYY-MM-DD HH:mm:ss')
    filters.push(['starts_on', '<=', end])
    filters.push(['ends_on', '>=', start])
  }
  return filters
}

function buildEventOrFilters() {
  return [
    ['owner', '=', currentUser.value],
    ['Event Participants', 'email', '=', currentUser.value],
  ]
}

const events = createListResource({
  doctype: 'Event',
  fields: [
    'name',
    'status',
    'subject',
    'description',
    'location',
    'starts_on',
    'ends_on',
    'all_day',
    'event_type',
    'color',
    'attending',
    'reference_doctype',
    'reference_docname',
  ],
  filters: buildEventFilters(),
  orFilters: buildEventOrFilters(),
  pageLength: 9999,
  auto: true,
  transform: (data) =>
    data
      .map((ev) => ({
        id: ev.name,
        title: ev.subject,
        description: ev.description,
        status: ev.status,
        fromDate: dayjs(ev.starts_on).format('YYYY-MM-DD'),
        toDate: dayjs(ev.ends_on).format('YYYY-MM-DD'),
        fromTime: dayjs(ev.starts_on).format('HH:mm'),
        toTime: dayjs(ev.ends_on).format('HH:mm'),
        isFullDay: ev.all_day,
        eventType: ev.event_type,
        location: ev.location,
        color: ev.color,
        attending: ev.attending,
        referenceDoctype: ev.reference_doctype,
        referenceDocname: ev.reference_docname,
      }))
      .filter(
        (ev, index, self) => index === self.findIndex((e) => e.id === ev.id),
      ),
})

provide('events', events)

const eventPanel = ref(null)
const showEventPanel = ref(false)
const event = ref({})
const mode = ref('')

const isCreateDisabled = computed(() =>
  ['edit', 'new', 'duplicate'].includes(mode.value),
)

// Temp event helpers
const TEMP_EVENT_IDS = new Set(['new-event', 'duplicate-event'])
const isTempEvent = (id) => TEMP_EVENT_IDS.has(id)
function removeTempEvents() {
  if (!Array.isArray(events.data)) return
  events.data = events.data.filter((ev) => !isTempEvent(ev.id))
}

function openEvent(e, nextMode, reloadEvent = false) {
  const _e = e?.calendarEvent || e
  if (!_e?.id || isTempEvent(_e.id)) return
  removeTempEvents()
  showEventPanel.value = true
  event.value = { id: _e.id, reloadEvent }
  activeEvent.value = _e.id
  mode.value = nextMode
}

function saveEvent(_event) {
  if (!_event?.id || isTempEvent(_event.id)) return createEvent(_event)
  updateEvent(_event)
}

function buildEventPayload(_event) {
  return {
    subject: _event.title,
    description: _event.description,
    starts_on: `${_event.fromDate} ${_event.fromTime}`,
    ends_on: `${_event.toDate} ${_event.toTime}`,
    all_day: _event.isFullDay || false,
    event_type: _event.eventType,
    location: _event.location,
    color: _event.color,
    attending: _event.attending,
    reference_doctype: _event.referenceDoctype,
    reference_docname: _event.referenceDocname,
    event_participants: _event.event_participants,
    notifications: _event.notifications,
  }
}

function createEvent(_event) {
  if (!_event?.title) return
  events.insert.submit(buildEventPayload(_event), {
    onSuccess: async (e) => {
      await updateUser(user)
      toast.success(__('Event created successfully'))
      showDetails({ id: e.name })
    },
    onError: (err) => {
      toast.error(formatError(err, 'Failed to create event'))
      console.error('Failed creating event', err)
    },
  })
}

async function updateEvent(_event, afterDrag = false) {
  if (!_event.id) return

  _event.fromTime = dayjs(_event.fromTime, 'HH:mm').format('HH:mm')
  _event.toTime = dayjs(_event.toTime, 'HH:mm').format('HH:mm')

  if (
    ['duplicate', 'new'].includes(mode.value) &&
    !['duplicate-event', 'new-event'].includes(_event.id) &&
    afterDrag
  ) {
    event.value = { id: _event.id }
    activeEvent.value = _event.id
    mode.value = 'details'
  }

  if (mode.value == 'edit' && afterDrag) {
    eventPanel.value.updateEvent({
      fromDate: _event.fromDate,
      toDate: _event.toDate,
      fromTime: _event.fromTime,
      toTime: _event.toTime,
    })
    return
  }

  if (!mode.value || mode.value == 'edit' || mode.value === 'details') {
    // Ensure Contacts exist for participants referencing a new/unknown Contact, if not create them
    if (
      Array.isArray(_event.event_participants) &&
      _event.event_participants.length
    ) {
      _event.event_participants = await ensureParticipantContacts(
        _event.event_participants,
      )
    }

    events.setValue.submit(
      { name: _event.id, ...buildEventPayload(_event) },
      {
        onSuccess: async (e) => {
          await events.reload()
          if (showEventPanel.value) showDetails({ id: e.name }, true)
        },
        onError: (err) => {
          toast.error(formatError(err, 'Failed to update event'))
          console.error('Failed updating event', err)
        },
      },
    )
  } else {
    event.value = { ..._event }
  }
}

function deleteEvent(eventID) {
  if (!eventID) return

  $dialog({
    title: __('Delete'),
    message: __('Are you sure you want to delete this event?'),
    actions: [
      {
        label: __('Delete'),
        variant: 'solid',
        theme: 'red',
        onClick: (close) => {
          events.delete.submit(eventID, {
            onSuccess: () => {
              toast.success(__('Event deleted successfully'))
              events.reload()
            },
            onError: (err) => {
              toast.error(formatError(err, 'Failed to delete event'))
              console.error('Failed deleting event', err)
            },
          })
          showEventPanel.value = false
          event.value = {}
          activeEvent.value = ''
          mode.value = ''
          close()
        },
      },
    ],
  })
}

function syncEvent(eventID, _event) {
  if (!eventID || !Array.isArray(events.data)) return
  const target = events.data.find((event) => event.id === eventID)
  if (!target) return
  Object.assign(target, _event)
}

async function handleRangeChange(range) {
  if (!range?.startDate || !range?.endDate) return
  const key = `${range.view}-${range.startDate}-${range.endDate}`
  if (key === activeRangeKey.value) {
    if (events.list?.loading || events.list?.fetched) return
  }
  activeRangeKey.value = key
  events.update({
    filters: buildEventFilters(range),
    orFilters: buildEventOrFilters(),
  })
  await events.reload()
}

onMounted(async () => {
  activeEvent.value = ''
  mode.value = ''
  showEventPanel.value = false

  const { eventId, date } = route.query
  if (eventId && date) {
    await events.promise
    await nextTick()

    // Set calendar date to the event's date
    if (calendar.value.onMonthYearChange) {
      calendar.value.onMonthYearChange(dayjs(date).toDate())
    }

    showDetails({ id: eventId })
  }

  // Wire the header's +Create button to the new-event flow (respects the
  // same disabled guard the old page button used).
  pageCreateAction.value = () => {
    if (!isCreateDisabled.value) newEvent()
  }
})
onBeforeUnmount(() => (pageCreateAction.value = null))

// Global shortcut: Cmd/Ctrl + E -> new event (when not already creating/editing)
useKeyboardShortcuts({
  shortcuts: [
    {
      match: (e) =>
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        !e.altKey &&
        e.key.toLowerCase() === 'e',
      guard: () => !isCreateDisabled.value,
      action: () =>
        newEvent({
          date: dayjs().format('YYYY-MM-DD'),
          time: dayjs().format('HH:mm'),
          isFullDay: false,
        }),
    },
  ],
})

function showDetails(e, reloadEvent = false) {
  openEvent(e, 'details', reloadEvent)
}

function editDetails(e) {
  openEvent(e, 'edit')
}

function buildTempEvent(e = {}, duplicate = false) {
  const id = duplicate ? 'duplicate-event' : 'new-event'

  return {
    id,
    title: e.title,
    description: e.description || '',
    date: e.fromDate,
    fromDate: e.fromDate,
    toDate: e.toDate,
    fromTime: e.fromTime,
    toTime: e.toTime,
    location: e.location || '',
    isFullDay: e.isFullDay || false,
    eventType: e.eventType || 'Private',
    color: e.color || 'green',
    attending: e.attending || 'Yes',
    referenceDoctype: e.referenceDoctype,
    referenceDocname: e.referenceDocname,
    event_participants: e.event_participants || [],
    notifications: e.notifications || [],
  }
}

function newEvent(e = {}, duplicate = false) {
  removeTempEvents()

  let base = { ...e }
  if (!duplicate) {
    const [fromTime, toTime] = getFromToTime(e.time)
    const fromDate = dayjs(e.date).format('YYYY-MM-DD')
    base = {
      ...base,
      fromDate,
      toDate: fromDate,
      fromTime,
      toTime,
      isFullDay: e.isFullDay,
    }
  }

  event.value = buildTempEvent(base, duplicate)
  if (!Array.isArray(events.data)) {
    events.data = []
  }
  events.data.push(event.value)
  showEventPanel.value = true
  activeEvent.value = event.value.id
  mode.value = duplicate ? 'duplicate' : 'new'
}

function duplicateEvent(e) {
  newEvent(e, true)
}

function close() {
  showEventPanel.value = false
  event.value = {}
  activeEvent.value = ''
  mode.value = ''

  removeTempEvents()
}

// utils
function getFromToTime(time) {
  const pad = (v) => String(v).padStart(2, '0')
  let now = dayjs()
  let h = now.hour()
  let m = Math.floor(now.minute() / 15) * 15
  let fromHour = h
  let fromMinute = m
  if (time) {
    if (/am|pm/i.test(time)) {
      const raw = time.trim().replace(' ', '')
      const ampm = raw.slice(-2).toLowerCase()
      let hour = parseInt(raw.slice(0, -2))
      if (ampm === 'pm' && hour < 12) hour += 12
      if (ampm === 'am' && hour === 12) hour = 0
      fromHour = hour
      fromMinute = 0
    } else if (/^\d{1,2}:?\d{0,2}$/.test(time)) {
      const [hh, mm = '00'] = time.split(':')
      fromHour = parseInt(hh)
      fromMinute = parseInt(mm) || 0
    }
  }
  const toHour = (fromHour + 1) % 24
  return [
    `${pad(fromHour)}:${pad(fromMinute)}`,
    `${pad(toHour)}:${pad(fromMinute)}`,
  ]
}

async function ensureParticipantContacts(participants) {
  if (!Array.isArray(participants) || !participants.length) return participants
  const updated = []
  for (const part of participants) {
    const p = { ...part }
    try {
      if (
        p.reference_doctype === 'Contact' &&
        (!p.reference_docname || p.reference_docname === 'new') &&
        p.email
      ) {
        const firstName = p.email.split('@')[0] || p.email
        const contactDoc = await call('frappe.client.insert', {
          doc: {
            doctype: 'Contact',
            first_name: firstName,
            email_ids: [{ email_id: p.email, is_primary: 1 }],
          },
        })
        if (contactDoc?.name) p.reference_docname = contactDoc.name
      }
    } catch (e) {
      console.error('Failed creating contact for participant', p.email, e)
    }
    updated.push(p)
  }
  return updated
}
</script>

<style scoped>
/* =====================================================================
   Calendar — full redesign. The grid is a frappe-ui <Calendar>; we style
   its internals via :deep() to match the Books design system (tokenized,
   theme-aware). The custom toolbar lives in the #header slot above.
   ===================================================================== */

/* Shell → one clean rounded card on the page background, with breathing room
   above it (between the app header and the card). */
.crm-calendar {
  margin: 0.75rem 1rem 1rem;
  border: 1px solid var(--crm-border);
  border-radius: var(--crm-radius-lg);
  background: var(--crm-surface);
  box-shadow: var(--crm-shadow-sm);
}

/* Weekday header row (Sun … Sat) → uppercase, tracked, muted band. */
.crm-calendar :deep(.grid.grid-cols-7 > span) {
  height: 40px !important;
  font-size: 11px !important;
  font-weight: 600 !important;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--crm-text-3) !important;
  border-bottom: 1px solid var(--crm-border);
  background: var(--crm-surface-2);
}

/* All grid / cell hairlines → design-token border (was outline-gray). */
.crm-calendar :deep([class*='border-outline']),
.crm-calendar :deep(.grid.grid-cols-7.flex-1 > div) {
  border-color: var(--crm-border) !important;
}

/* Day cells → hover highlight; weekends get a faint tint. */
.crm-calendar :deep(.grid.grid-cols-7.flex-1 > div) {
  transition: background-color 0.12s ease;
}
.crm-calendar :deep(.grid.grid-cols-7.flex-1 > div:hover) {
  background-color: var(--crm-row-hover) !important;
}
.crm-calendar :deep(.bg-surface-gray-1) {
  background-color: var(--crm-surface-2) !important;
}

/* Date number → larger, crisper; current vs other-month contrast via tokens. */
.crm-calendar :deep(.text-xs .cursor-pointer) {
  font-size: 13px !important;
  font-weight: 600 !important;
}
.crm-calendar :deep(.text-xs .text-ink-gray-6) {
  color: var(--crm-text-2) !important;
}
.crm-calendar :deep(.text-xs .text-ink-gray-4) {
  color: var(--crm-text-4) !important;
}

/* Today → brand-filled circle (was a near-black square). */
.crm-calendar :deep(.bg-surface-gray-10.rounded) {
  background-color: var(--crm-accent-primary) !important;
  color: #ffffff !important;
  border-radius: var(--crm-radius-pill) !important;
  font-weight: 700 !important;
}

/* Event chips → rounded, tidy, with lift on hover (keeps the color bar). */
.crm-calendar :deep(.event) {
  border-radius: var(--crm-radius-sm) !important;
  padding: 4px 7px !important;
}
.crm-calendar :deep(.event:hover) {
  box-shadow: var(--crm-shadow-sm);
  transform: translateY(-1px);
}
.crm-calendar :deep(.event .event-border) {
  border-radius: var(--crm-radius-pill) !important;
}
.crm-calendar :deep(.event .text-sm-medium) {
  font-size: 12px !important;
  font-weight: 500 !important;
}
</style>
