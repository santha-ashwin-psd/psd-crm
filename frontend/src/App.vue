<template>
  <FrappeUIProvider>
    <NotPermitted v-if="$route.name === 'Not Permitted'" />
    <router-view v-else-if="$route.name === 'Onboarding'" />
    <Layout v-else-if="session.isLoggedIn" class="isolate">
      <router-view :key="viewKey" />
    </Layout>
    <Dialogs />
    <DoctypeModals />
    <EventNotificationPopup />
    <CommandPalette />
    <ShortcutsHelpModal ref="shortcutsHelpModalRef" />
  </FrappeUIProvider>
</template>

<script setup>
import NotPermitted from '@/pages/NotPermitted.vue'
import EventNotificationPopup from '@/components/EventNotificationPopup.vue'
import DoctypeModals from '@/components/Modals/DoctypeModals.vue'
import CommandPalette from '@/components/Modals/CommandPalette.vue'
import ShortcutsHelpModal from '@/components/Modals/ShortcutsHelpModal.vue'
import { Dialogs } from '@/utils/dialogs'
import { sessionStore } from '@/stores/session'
import { FrappeUIProvider, setConfig, useTheme } from 'frappe-ui'
import { computed, defineAsyncComponent, provide, ref } from 'vue'
import { isCommandPaletteOpen } from '@/composables/commandPalette'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'

import { useWindowSize } from '@vueuse/core'
import { useRoute } from 'vue-router'

const session = sessionStore()

// Pages are rebuilt when the URL changes, so a new record or saved view starts
// fresh. A page marked `keepOnQueryChange` (Inbox) only uses the query to
// remember what is open; rebuilding it would throw away its filters.
const route = useRoute()
const viewKey = computed(() =>
  route.meta?.keepOnQueryChange ? route.path : route.fullPath,
)
provide('session', session)

const shortcutsHelpModalRef = ref(null)

const { setTheme } = useTheme()
if (!localStorage.getItem('theme')) {
  setTheme('light')
}

const MobileLayout = defineAsyncComponent(
  () => import('./components/Layouts/MobileLayout.vue'),
)
const DesktopLayout = defineAsyncComponent(
  () => import('./components/Layouts/DesktopLayout.vue'),
)

const { width } = useWindowSize()
const Layout = computed(() => {
  if (width.value < 1024) {
    return MobileLayout
  } else {
    return DesktopLayout
  }
})

useKeyboardShortcuts({
  shortcuts: [
    {
      match: (e) => (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k',
      action: () => {
        isCommandPaletteOpen.value = true
      },
    },
    {
      keys: '/',
      action: () => {
        isCommandPaletteOpen.value = true
      },
    },
    {
      keys: '?',
      action: () => {
        shortcutsHelpModalRef.value?.open()
      },
    },
  ],
})

setConfig('systemTimezone', window.timezone?.system || null)
setConfig('localTimezone', window.timezone?.user || null)
setConfig('translatedMessages', window.translated_messages || {})
</script>
