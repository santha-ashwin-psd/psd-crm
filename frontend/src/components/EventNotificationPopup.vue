<template>
  <Teleport to="body">
    <div
      v-if="visibleAlerts.length > 0"
      class="fixed bottom-4 right-4 z-50 w-96"
    >
      <TransitionGroup name="popup" tag="div" class="space-y-2">
        <div
          v-for="alert in visibleAlerts"
          :key="alert.id"
          class="crm-toast group flex flex-col relative"
        >
          <div class="flex justify-between items-center gap-1 p-3">
            <div class="flex items-stretch space-x-2">
              <div>
                <span
                  v-if="isTask(alert)"
                  class="lucide-square-check-big block size-4 text-[var(--crm-accent-primary)]"
                  aria-hidden="true"
                />
                <CalendarIcon v-else class="size-4 text-cyan-500" />
              </div>
              <div class="flex flex-col text-base">
                <div
                  class="font-medium text-ink-gray-8 mb-1 cursor-pointer"
                  @click="openEvent(alert)"
                >
                  {{
                    alert.notification.subject ||
                    (isTask(alert) ? __('Task') : __('Event Notification'))
                  }}
                </div>
                <div class="text-ink-gray-6">
                  {{ formatEventTime(alert.notification) }}
                </div>
              </div>
            </div>

            <MultipleAvatar
              v-if="getParticipants(alert.notification)?.length > 0"
              :avatars="getParticipants(alert.notification)"
              size="md"
              @click="openEvent(alert)"
            />
          </div>
          <Button
            class="absolute -top-2 -left-2 shadow ring-inset !bg-[var(--crm-surface)] hover:!bg-[var(--crm-surface-2)] text-ink-gray-3 !p-0 !size-5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            @click="completeAlert(alert.id)"
          >
            <span
              class="lucide-x size-4 text-ink-gray-3 stroke-2"
              aria-hidden="true"
            />
          </Button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup>
import { useEventNotificationAlert } from '@/data/notifications'
import { usersStore } from '@/stores/users'
import { Button, dayjs } from 'frappe-ui'
import { computed } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()

const { getUser } = usersStore()

const {
  eventNotificationAlerts,
  completeEventNotificationAlert,
  removeCompletedEventNotificationAlerts,
} = useEventNotificationAlert()

const visibleAlerts = computed(() => {
  return eventNotificationAlerts.value.filter((alert) => !alert.completed)
})

// Task reminders come through the same channel with `kind: 'task'`
// (xbr_crm/reminders/tasks.py) and open the task instead of the calendar.
function isTask(alert) {
  return alert.notification?.kind === 'task'
}

function openEvent(e) {
  completeAlert(e.id)
  if (isTask(e)) {
    router.push({ name: 'Tasks', query: { open: e.notification.task } })
    return
  }
  router.push({
    name: 'Calendar',
    query: {
      eventId: e.notification.event_name,
      date: dayjs(e.notification.starts_on).format('YYYY-MM-DD'),
    },
  })
}

function completeAlert(id) {
  completeEventNotificationAlert(id)

  setTimeout(() => removeCompletedEventNotificationAlerts(), 300)
}

function formatEventTime(notification) {
  if (notification.kind === 'task') {
    if (!notification.starts_on) return ''
    const due = dayjs(notification.starts_on)
    const when = due.isSame(dayjs(), 'day')
      ? due.format('h:mm a')
      : due.format('D MMM, h:mm a')
    return notification.priority
      ? __('Due {0} · {1} priority', [when, __(notification.priority)])
      : __('Due {0}', [when])
  }
  if (notification.all_day_event) {
    return __('All Day')
  } else if (notification.starts_on) {
    const startTime = dayjs(notification.starts_on).format('h:mm a')
    const endTime = dayjs(notification.ends_on).format('h:mm a')
    return `${startTime} - ${endTime}`
  }
  return ''
}

function getParticipants(notification) {
  const participants = notification.event_participants?.map((p) => p) || []

  if (!participants.length) return []

  if (notification.owner && !participants.includes(notification.owner)) {
    participants.push(notification.owner)
  }

  return (
    participants.map((p) => {
      return {
        label: getUser(p).full_name || p,
        image: getUser(p).user_image || '',
        name: p,
      }
    }) || []
  )
}

</script>

<style scoped>
/* Custom animations for popup appearance */
.popup-enter-active {
  transition: all 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.popup-leave-active {
  transition: all 0.4s cubic-bezier(0.55, 0.085, 0.68, 0.53);
}

.popup-enter-from {
  transform: translateX(100%) scale(0.9);
  opacity: 0;
}

.popup-leave-to {
  transform: translateX(100%) scale(0.9);
  opacity: 0;
}

.popup-move {
  transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
</style>
