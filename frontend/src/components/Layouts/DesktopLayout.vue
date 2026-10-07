<template>
  <div class="flex h-screen w-screen bg-[var(--crm-bg)] overflow-hidden font-sans">
    <a
      href="#main-content"
      class="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:bg-brand-600 focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-xl focus:outline-none"
    >
      {{ __('Skip to main content') }}
    </a>
    <div class="h-full shrink-0">
      <AppSidebar />
    </div>
    <div class="flex-1 flex flex-col h-full overflow-hidden bg-[var(--crm-bg)]">
      <AppHeader />
      <main id="main-content" tabindex="-1" class="flex-1 overflow-auto relative focus:outline-none">
        <slot />
      </main>
    </div>
    <Notifications />
    <GlobalModals />
  </div>
</template>
<script setup>
import AppSidebar from '@/components/Layouts/AppSidebar.vue'
import AppHeader from '@/components/Layouts/AppHeader.vue'
import Notifications from '@/components/Notifications.vue'
import GlobalModals from '@/components/Modals/GlobalModals.vue'
</script>
