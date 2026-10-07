<template>
  <div class="flex items-center justify-between border-b border-[var(--crm-border)] bg-[var(--crm-topbar)] backdrop-blur-md sticky top-0 z-20 px-4 py-2.5 h-13 shrink-0 select-none">
    <!-- Left Section: Hamburger & Breadcrumbs target -->
    <div class="flex items-center gap-2 min-w-0 flex-1">
      <button
        v-if="isMobile"
        class="p-2 -ml-1 text-[var(--crm-text-2)] hover:bg-[var(--crm-surface-2)] rounded-lg transition-colors focus:outline-none"
        :aria-label="__('Toggle navigation menu')"
        @click="toggleSidebar"
      >
        <MenuIcon class="size-5" />
      </button>
      <div id="app-header" class="min-w-0 flex-1"></div>
    </div>

    <!-- Center/Right Section -->
    <div class="flex items-center gap-3 shrink-0 pl-3">
      <!-- Search has no header affordance on desktop (⌘K opens it); the icon is
           kept only on mobile, which has no keyboard shortcut. -->
      <button
        class="flex sm:hidden p-2 rounded-full hover:bg-[var(--crm-surface-2)] text-[var(--crm-text-2)] transition-colors focus:outline-none shrink-0"
        :aria-label="__('Open search')"
        @click="openCommandPalette"
      >
        <SearchIcon class="size-5" />
      </button>

      <!-- Context-aware Create: a page can register its own create flow
           (Notes/Call Logs/Calendar); otherwise a doctype list page creates
           that doctype directly; otherwise it falls back to the dropdown.
           Hidden on detail pages — there you're focused on one record and the
           page's own primary action (e.g. Convert to Deal) sits by the avatar. -->
      <template v-if="!isDetailPage">
        <Button
          v-if="pageCreateAction || currentDoctype"
          variant="solid"
          class="bg-brand-500 hover:bg-brand-600 text-white font-sans shrink-0 font-medium text-sm"
          @click="
            pageCreateAction
              ? pageCreateAction()
              : createDocument(currentDoctype, {}, null, () =>
                  pageReloadAction?.(),
                )
          "
        >
          <template #prefix>
            <PlusIcon class="size-4" />
          </template>
          <span class="hidden md:inline">{{ __('Create') }}</span>
        </Button>
        <Dropdown v-else :options="quickCreateOptions">
          <template #default>
            <Button
              variant="solid"
              class="bg-brand-500 hover:bg-brand-600 text-white font-sans shrink-0 font-medium text-sm"
            >
              <template #prefix>
                <PlusIcon class="size-4" />
              </template>
              <span class="hidden md:inline">{{ __('Create') }}</span>
            </Button>
          </template>
        </Dropdown>
      </template>

      <!-- Telephony / Call UI -->
      <CallUI />

      <!-- Per-page primary action (detail pages teleport here, e.g. Convert to Deal) -->
      <div id="app-header-primary" class="flex items-center gap-2 empty:hidden"></div>

      <!-- Divider separates page/global actions from the account menu — only
           shown when something actually sits to its left (Create or a primary
           action), so a bare detail page doesn't get a stray line. -->
      <div
        v-if="!isDetailPage || headerPrimaryActionPresent"
        class="h-6 w-px bg-[var(--crm-border)] shrink-0"
      ></div>

      <!-- User Menu — also hosts theme toggle + notifications -->
      <UserDropdown variant="avatar" class="shrink-0" />
    </div>
  </div>
</template>

<script setup>
import CallUI from '@/components/Telephony/CallUI.vue'
import UserDropdown from '@/components/UserDropdown.vue'
import MenuIcon from '~icons/lucide/menu'
import SearchIcon from '~icons/lucide/search'
import PlusIcon from '~icons/lucide/plus'
import { isMobileView as isMobile, mobileSidebarOpened } from '@/composables/settings'
import { isCommandPaletteOpen } from '@/composables/commandPalette'
import { createDocument } from '@/composables/document'
import { isLeadsEnabled } from '@/utils/leads'
import { Dropdown } from 'frappe-ui'
import { useRoute } from 'vue-router'
import { computed } from 'vue'
import {
  pageCreateAction,
  pageReloadAction,
  headerPrimaryActionPresent,
} from '@/composables/pageActions'

const route = useRoute()

// Map a list-page route to the doctype its "Create" should open. Pages not
// listed here (Dashboard, Calendar, Call Logs, Notes, ...) fall back to the
// quick-create dropdown.
const routeDoctypeMap = {
  Leads: 'CRM Lead',
  Deals: 'CRM Deal',
  Contacts: 'Contact',
  Organizations: 'CRM Organization',
  Tasks: 'CRM Task',
}
const currentDoctype = computed(() => routeDoctypeMap[route.name])

// Detail (single-record) routes — Create is hidden here; the page's own primary
// action is teleported next to the avatar via #app-header-primary.
const detailRoutes = ['Lead', 'Deal', 'Contact', 'Organization', 'Task', 'Note']
const isDetailPage = computed(() => detailRoutes.includes(route.name))

const openCommandPalette = () => {
  isCommandPaletteOpen.value = true
}

const toggleSidebar = () => {
  mobileSidebarOpened.value = !mobileSidebarOpened.value
}

const quickCreateOptions = [
  {
    group: 'Create New',
    hideLabel: true,
    items: [
      ...(isLeadsEnabled()
        ? [
            {
              label: __('Lead'),
              onClick: () => createDocument('CRM Lead'),
            },
          ]
        : []),
      {
        label: __('Deal'),
        onClick: () => createDocument('CRM Deal'),
      },
      {
        label: __('Contact'),
        onClick: () => createDocument('Contact'),
      },
      {
        label: __('Organization'),
        onClick: () => createDocument('CRM Organization'),
      },
      {
        label: __('Task'),
        onClick: () => createDocument('CRM Task'),
      },
    ],
  },
]
</script>
