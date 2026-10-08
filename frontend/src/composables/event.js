import { usersStore } from '@/stores/users'
import { dayjs, createListResource } from 'frappe-ui'
import { computed, ref, watch } from 'vue'
import { allTimeSlots } from '@/components/Calendar/utils'

export const showEventModal = ref(false)
export const activeEvent = ref(null)

export function useEvent({
  doctype,
  docname,
  filters = null,
  participants = true,
  notifications = true,
}) {
  const { getUser } = usersStore()

  if (!filters) {
    if (doctype && docname) {
      filters = {
        reference_doctype: doctype,
        reference_docname: docname,
      }
    } else {
      filters = {}
    }
  }

  const eventsResource = createListResource({
    doctype: 'Event',
    cache: ['calendar-events', docname],
    fields: [
      'name',
      'status',
      'subject',
      'description',
      'starts_on',
      'ends_on',
      'all_day',
      'event_type',
      'location',
      'color',
      'attending',
      'owner',
      'reference_doctype',
      'reference_docname',
      'creation',
    ],
    filters: filters,
    auto: true,
    limit: 50,
    orderBy: 'creation desc',
  })

  // Attendees and reminders are child rows, read for all listed events at once.
  const eventParticipantsResource = createListResource({
    doctype: 'Event Participants',
    fields: ['*'],
    parent: 'Event',
    pageLength: 9999,
  })

  const eventNotificationsResource = createListResource({
    doctype: 'Event Notifications',
    fields: ['*'],
    parent: 'Event',
    pageLength: 9999,
    orderBy: 'idx asc',
  })

  // Re-read them whenever the event list loads, so an edited event shows its
  // current attendees and reminders. (`update` alone only sets the filters.)
  watch(
    () => eventsResource.data,
    (data) => {
      const names = (data || []).map((e) => e.name)
      if (!names.length) return
      const children = [
        [participants, eventParticipantsResource, 'event_participants'],
        [notifications, eventNotificationsResource, 'notifications'],
      ]
      for (const [enabled, resource, parentfield] of children) {
        if (!enabled) continue
        resource.update({
          filters: { parenttype: 'Event', parentfield, parent: ['in', names] },
        })
        resource.reload()
      }
    },
    { immediate: true },
  )

  const events = computed(() => {
    if (!eventsResource.data) return []

    // Who created the event. Resolved for every event, whether or not it has
    // guests, so the timeline never shows a nameless row or blank avatar.
    eventsResource.data.forEach((event) => {
      if (typeof event.owner !== 'object') {
        event.owner = { ...eventOwner(event.owner, getUser), name: event.owner }
      }

      if (participants) {
        const rows = (eventParticipantsResource.data || []).filter(
          (participant) => participant.parent === event.name,
        )
        event.event_participants = [...rows]
        event.participants = [
          event.owner,
          ...rows.map((participant) => ({
            label: getUser(participant.email).full_name || participant.email,
            image: getUser(participant.email).user_image || '',
            name: participant.email,
          })),
        ]
      }

      if (notifications) {
        event.notifications = (eventNotificationsResource.data || []).filter(
          (notification) => notification.parent === event.name,
        )
      }
    })

    return eventsResource.data
  })

  const startEndTime = (
    startTime,
    endTime,
    isFullDay = false,
    format = 'h:mm a',
  ) => {
    const start = dayjs(startTime)
    const end = dayjs(endTime)

    if (isFullDay) return __('All Day')

    return `${start.format(format)} - ${end.format(format)}`
  }

  const startDate = (startTime, format = 'ddd, D MMM YYYY') => {
    const start = dayjs(startTime)
    return start.format(format)
  }

  return {
    eventsResource,
    eventParticipantsResource,
    events,
    startEndTime,
    startDate,
  }
}

export function normalizeParticipants(list = []) {
  const seen = new Set()
  const out = []
  for (const a of list || []) {
    if (!a?.email || seen.has(a.email)) continue
    seen.add(a.email)
    out.push({
      email: a.email,
      reference_doctype: a.reference_doctype || 'Contact',
      reference_docname: a.reference_docname || '',
    })
  }
  return out
}

export function formatDuration(mins) {
  if (mins < 60) return __('{0} mins', [mins])
  let hours = mins / 60
  if (hours % 1 !== 0 && hours % 1 !== 0.5) {
    hours = hours.toFixed(2)
  }
  if (Number.isInteger(hours)) {
    return hours === 1 ? __('1 hr') : __('{0} hrs', [hours])
  }
  return `${hours} hrs`
}

export function buildEndTimeOptions(fromTime) {
  const timeSlots = allTimeSlots()
  if (!fromTime) return timeSlots
  const startIndex = timeSlots.findIndex((o) => o.value > fromTime)
  if (startIndex === -1) return []
  const [fh, fm] = fromTime.split(':').map((n) => parseInt(n))
  const fromTotal = fh * 60 + fm
  return timeSlots.slice(startIndex).map((o) => {
    const [th, tm] = o.value.split(':').map((n) => parseInt(n))
    const toTotal = th * 60 + tm
    const duration = toTotal - fromTotal
    return { ...o, label: `${o.label} (${formatDuration(duration)})` }
  })
}

export function computeAutoToTime(fromTime) {
  if (!fromTime) return ''
  const [hour, minute] = fromTime.split(':').map((n) => parseInt(n))
  let nh = hour + 1
  let nm = minute
  if (nh >= 24) {
    nh = 23
    nm = 59
  }
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`
}

export function validateTimeRange({
  fromDate,
  toDate,
  fromTime,
  toTime,
  isFullDay,
}) {
  if (isFullDay) return { valid: true, error: null }
  if (!fromTime || !toTime) {
    return { valid: false, error: __('Start & End Time Are Required') }
  }
  const start = dayjs(fromDate + ' ' + fromTime)
  // The end belongs to `toDate` when there is one. Comparing both ends against
  // `fromDate` made every overnight event invalid — including the default a new
  // event gets when opened after 23:00.
  const end = dayjs((toDate || fromDate) + ' ' + toTime)
  if (!start.isValid() || !end.isValid()) {
    return { valid: false, error: __('Invalid Start Or End Time') }
  }
  if (end.diff(start, 'minute') <= 0) {
    return { valid: false, error: __('End Time Should Be After Start Time') }
  }
  return { valid: true, error: null }
}

/**
 * Display identity for an event's owner.
 *
 * Exported because the two call sites (the timeline's `events` computed and
 * parseEventDoc) each wrap it in a slightly different shape — `name` vs
 * `value` — and had drifted into two copies of the lookup. One of them also
 * had no fallback, so a user the store could not resolve produced an empty
 * label and an avatar with no initials to draw.
 *
 * @param {string} userId - The user id stored on the event.
 * @param {Function} getUser - usersStore().getUser, injected so this stays pure.
 * @returns {{label: string, image: string|null}} Always a usable label.
 */
export function eventOwner(userId, getUser) {
  const user = getUser(userId) || {}
  return {
    // Falling back to the id matters: an unresolvable user should still be
    // named, and Avatar derives its initials from the label.
    label: user.full_name || userId,
    image: user.user_image,
  }
}

export function parseEventDoc(doc) {
  if (!doc) return {}
  const { getUser } = usersStore()

  return {
    id: doc.name,
    title: doc.subject,
    description: doc.description,
    status: doc.status,
    fromDate: dayjs(doc.starts_on).format('YYYY-MM-DD'),
    toDate: dayjs(doc.ends_on).format('YYYY-MM-DD'),
    fromTime: dayjs(doc.starts_on).format('HH:mm'),
    toTime: dayjs(doc.ends_on).format('HH:mm'),
    isFullDay: doc.all_day,
    eventType: doc.event_type,
    location: doc.location || '',
    color: doc.color,
    attending: doc.attending,
    referenceDoctype: doc.reference_doctype,
    referenceDocname: doc.reference_docname,
    event_participants: doc.event_participants || [],
    notifications: doc.notifications || [],
    owner: doc.owner
      ? { ...eventOwner(doc.owner, getUser), value: doc.owner }
      : null,
  }
}
