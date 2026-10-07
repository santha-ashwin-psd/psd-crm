<!-- eslint-disable vue/no-v-html -->
<template>
  <Transition name="slide-right">
    <div
      v-if="visible"
      ref="target"
      class="fixed right-0 top-0 z-50 h-screen bg-[var(--crm-surface)] border-l border-[var(--crm-border)] shadow-[var(--crm-shadow-lg)] flex flex-col w-[400px]"
    >
    <div class="flex h-screen flex-col text-[var(--crm-text)]">
      <!-- Header metrics match .crm-dialog__header (14px/20px, 16/600, chip)
           so the rail reads as the same surface family as the popups. -->
      <div class="flex justify-between items-center gap-3 px-5 py-3.5 border-b border-[var(--crm-border)]">
        <div class="flex items-center gap-3 min-w-0">
          <span class="crm-dialog__chip">
            <span class="lucide-bell size-[18px]" aria-hidden="true" />
          </span>
          <div class="crm-dialog__title">
            {{ __('Notifications') }}
          </div>
        </div>
        <div class="flex gap-1">
          <Button
            v-if="activeTab == 'all' && notifications.data?.length"
            :tooltip="__('Mark all as read')"
            :icon="MarkAsDoneIcon"
            variant="ghost"
            @click="markAllAsRead"
          />
        </div>
      </div>
      <TabButtons
        v-model="activeTab"
        :buttons="tabs"
        class="flex px-4 py-2 border-b border-[var(--crm-settings-border)] bg-[var(--crm-surface-2)]/50 [&_button]:w-full [&_div]:w-full [&_button>span]:w-full"
      />
      <div v-if="activeTab == 'all'" class="flex h-full">
        <div
          v-if="notifications.data?.length"
          class="divide-y divide-outline-elevation-2 overflow-auto text-base"
        >
          <RouterLink
            v-for="n in notifications.data"
            :key="n.comment"
            :to="getRoute(n)"
            class="flex cursor-pointer items-start gap-2.5 px-4 py-2.5 hover:bg-surface-gray-2"
            @click="markAsRead(n.comment || n.notification_type_doc)"
          >
            <div class="mt-1 flex items-center gap-2.5">
              <div
                class="size-[5px] rounded-full"
                :class="[n.read ? 'bg-transparent' : 'bg-surface-gray-10']"
              />
              <WhatsAppIcon v-if="n.type == 'WhatsApp'" class="size-7" />
              <UserAvatar v-else :user="n.from_user.name" size="lg" />
            </div>
            <div>
              <div
                v-if="n.notification_text"
                v-html="sanitizeHTML(n.notification_text)"
              />
              <div v-else class="mb-2 space-x-1 leading-5 text-ink-gray-5">
                <span class="font-medium text-ink-gray-9">
                  {{ n.from_user.full_name }}
                </span>
                <span>
                  {{ __('mentioned you in {0}', [__(n.reference_doctype)]) }}
                </span>
                <span class="font-medium text-ink-gray-9">
                  {{ n.reference_name }}
                </span>
              </div>
              <div class="text-sm text-ink-gray-5">
                {{ __(timeAgo(n.creation)) }}
              </div>
            </div>
          </RouterLink>
        </div>
        <EmptyState
          v-else
          title="No New Notifications"
          description="You have no new notifications"
          :icon="NotificationsIcon"
        />
      </div>
      <div v-else-if="activeTab == 'events'" class="flex h-full">
        <EventNotificationsArea />
      </div>
    </div>
    </div>
  </Transition>
</template>
<script setup>
import WhatsAppIcon from '@/components/Icons/WhatsAppIcon.vue'
import MarkAsDoneIcon from '@/components/Icons/MarkAsDoneIcon.vue'
import NotificationsIcon from '@/components/Icons/NotificationsIcon.vue'
import EventNotificationsArea from '@/components/EventNotificationsArea.vue'
import EmptyState from '@/components/ListViews/EmptyState.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import {
  visible,
  notifications,
  notificationsStore,
} from '@/stores/notifications'
import { useEventNotificationAlert } from '@/data/notifications'
import { globalStore } from '@/stores/global'
import { timeAgo, sanitizeHTML } from '@/utils'
import { onClickOutside } from '@vueuse/core'
import { useTelemetry } from 'frappe-ui/frappe'
import { TabButtons } from 'frappe-ui'
import { ref, onMounted, onBeforeUnmount } from 'vue'

const { $socket } = globalStore()
const { mark_as_read, toggle, mark_doc_as_read } = notificationsStore()
const { handleEventNotification } = useEventNotificationAlert()
const { capture } = useTelemetry()

const activeTab = ref('all')
const tabs = [
  { label: __('All'), value: 'all' },
  { label: __('Events'), value: 'events' },
  // { label: __('Mentions'), value: 'mentions' },
]

const target = ref(null)
onClickOutside(
  target,
  () => {
    if (visible.value) toggle()
  },
  {
    ignore: ['#notifications-btn'],
  },
)

function markAsRead(doc) {
  capture('notification_mark_as_read')
  mark_doc_as_read(doc)
}

function markAllAsRead() {
  capture('notification_mark_all_as_read')
  mark_as_read.reload()
}

// Named so `off` can remove exactly these. socket.io's `off(event)` with no
// handler drops EVERY listener for that event — MobileNotification registers
// its own `crm_notification` listener, so an untargeted off() there silently
// killed this one (and this panel is mounted for the whole session).
const onCrmNotification = () => notifications.reload()
const onEventNotification = (data) => handleEventNotification(data)

onBeforeUnmount(() => {
  $socket.off('crm_notification', onCrmNotification)
  $socket.off('event_notification', onEventNotification)
})

onMounted(() => {
  $socket.on('crm_notification', onCrmNotification)
  $socket.on('event_notification', onEventNotification)
})

function getRoute(notification) {
  let params = {
    leadId: notification.reference_name,
  }
  if (notification.route_name === 'Deal') {
    params = {
      dealId: notification.reference_name,
    }
  }

  return {
    name: notification.route_name,
    params: params,
    hash: notification.hash,
  }
}
</script>

<style scoped>
.slide-right-enter-active,
.slide-right-leave-active {
  transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}
.slide-right-enter-from,
.slide-right-leave-to {
  transform: translateX(100%);
}
</style>
