<template>
  <div class="flex h-screen w-screen overflow-hidden font-sans">
    <MobileSidebar />
    <div class="flex h-full flex-1 flex-col overflow-hidden bg-[var(--crm-bg)]">
      <AppHeader />
      <div class="flex-1 overflow-auto relative">
        <slot />
      </div>
    </div>
    <Notifications />
    <GlobalModals />
  </div>
</template>
<script setup>
import MobileSidebar from '@/components/Mobile/MobileSidebar.vue'
import AppHeader from '@/components/Layouts/AppHeader.vue'
import Notifications from '@/components/Notifications.vue'
import GlobalModals from '@/components/Modals/GlobalModals.vue'
</script>
