<template>
  <TransitionRoot :show="sidebarOpened">
    <Dialog as="div" class="fixed inset-0 z-40" @close="sidebarOpened = false">
      <TransitionChild
        as="template"
        enter="transition ease-in-out duration-200 transform"
        enter-from="-translate-x-full"
        enter-to="translate-x-0"
        leave="transition ease-in-out duration-200 transform"
        leave-from="translate-x-0"
        leave-to="-translate-x-full"
      >
        <div class="crm-mobile-sidebar font-sans">
          <!-- Brand Header -->
          <div class="crm-sidebar-brand">
            <BrandLogo v-model="brand" class="crm-sidebar-brand-mark" />
            <span class="crm-sidebar-brand-text">
              {{ __(brand.name || 'CRM') }}
            </span>
            <button
              class="crm-sidebar-close-mob"
              aria-label="Close menu"
              @click="sidebarOpened = false"
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div class="crm-sidebar-nav">
            <div v-for="view in allViews" :key="view.label">
              <CollapsibleSection
                :label="view.name"
                :hideLabel="view.hideLabel"
                :opened="view.opened"
              >
                <template #header="{ opened, hide, toggle }">
                  <div
                    v-if="!hide"
                    class="crm-sidebar-section"
                    :class="{ 'crm-sidebar-section-active': opened }"
                    @click="toggle()"
                  >
                    <span class="crm-section-chev" :class="{ 'rotate-90': opened }" aria-hidden="true">
                      <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5">
                        <polyline points="9 6 15 12 9 18" />
                      </svg>
                    </span>
                    <span>{{ __(view.name) }}</span>
                  </div>
                </template>
                <nav class="flex flex-col">
                  <SidebarLink
                    v-for="link in view.views"
                    :key="link.label"
                    :icon="link.icon"
                    :label="__(link.label)"
                    :to="link.to"
                  />
                </nav>
              </CollapsibleSection>
            </div>
          </div>
          <div class="mobile-sidebar-footer">
            <SidebarLink :label="__('Logout')" @click="() => logout.submit()">
              <template #icon>
                <LogOutIcon class="h-4 w-4" />
              </template>
            </SidebarLink>
          </div>
        </div>
      </TransitionChild>
      <TransitionChild
        as="template"
        enter="transition-opacity ease-linear duration-200"
        enter-from="opacity-0"
        enter-to="opacity-100"
        leave="transition-opacity ease-linear duration-200"
        leave-from="opacity-100"
        leave-to="opacity-0"
      >
        <DialogOverlay class="fixed inset-0 bg-[var(--crm-overlay)] backdrop-blur-[2px]" />
      </TransitionChild>
    </Dialog>
  </TransitionRoot>
</template>
<script setup>
import {
  TransitionRoot,
  TransitionChild,
  Dialog,
  DialogOverlay,
} from '@headlessui/vue'
import CollapsibleSection from '@/components/CollapsibleSection.vue'
import PinIcon from '@/components/Icons/PinIcon.vue'
import BrandLogo from '@/components/BrandLogo.vue'
import LeadsIcon from '@/components/Icons/LeadsIcon.vue'
import DealsIcon from '@/components/Icons/DealsIcon.vue'
import ContactsIcon from '@/components/Icons/ContactsIcon.vue'
import OrganizationsIcon from '@/components/Icons/OrganizationsIcon.vue'
import NoteIcon from '@/components/Icons/NoteIcon.vue'
import TaskIcon from '@/components/Icons/TaskIcon.vue'
import PhoneIcon from '@/components/Icons/PhoneIcon.vue'
import SidebarLink from '@/components/SidebarLink.vue'
import LogOutIcon from '~icons/lucide/log-out'
import { sessionStore } from '@/stores/session'
import { viewsStore } from '@/stores/views'
import { getSettings } from '@/stores/settings'
import { isLeadsEnabled } from '@/utils/leads'
import { computed, h } from 'vue'
import { mobileSidebarOpened as sidebarOpened } from '@/composables/settings'

const { logout } = sessionStore()
const { getPinnedViews, getPublicViews } = viewsStore()
const { brand } = getSettings()

const links = [
  {
    label: 'Leads',
    icon: LeadsIcon,
    to: 'Leads',
  },
  {
    label: 'Deals',
    icon: DealsIcon,
    to: 'Deals',
  },
  {
    label: 'Contacts',
    icon: ContactsIcon,
    to: 'Contacts',
  },
  {
    label: 'Organizations',
    icon: OrganizationsIcon,
    to: 'Organizations',
  },
  {
    label: 'Notes',
    icon: NoteIcon,
    to: 'Notes',
  },
  {
    label: 'Tasks',
    icon: TaskIcon,
    to: 'Tasks',
  },
  {
    label: 'Call Logs',
    icon: PhoneIcon,
    to: 'Call Logs',
  },
]

const allViews = computed(() => {
  let _views = [
    {
      name: 'All Views',
      hideLabel: true,
      opened: true,
      views: links.filter((link) => link.to !== 'Leads' || isLeadsEnabled()),
    },
  ]
  if (getPublicViews().length) {
    _views.push({
      name: 'Public Views',
      opened: true,
      views: parseView(getPublicViews()),
    })
  }

  if (getPinnedViews().length) {
    _views.push({
      name: 'Pinned Views',
      opened: true,
      views: parseView(getPinnedViews()),
    })
  }
  return _views
})

function parseView(views) {
  return views.map((view) => {
    return {
      label: view.label,
      icon: getIcon(view.route_name, view.icon),
      to: {
        name: view.route_name,
        params: { viewType: view.type || 'list' },
        query: { view: view.name },
      },
    }
  })
}

function getIcon(routeName, icon) {
  if (icon) return h('div', { class: 'size-auto' }, icon)

  switch (routeName) {
    case 'Leads':
      return LeadsIcon
    case 'Deals':
      return DealsIcon
    case 'Contacts':
      return ContactsIcon
    case 'Organizations':
      return OrganizationsIcon
    case 'Notes':
      return NoteIcon
    case 'Call Logs':
      return PhoneIcon
    default:
      return PinIcon
  }
}
</script>

<style scoped>
/* Mirrors AppSidebar's danger link — its rule is scoped to that component. */
.mobile-sidebar-footer {
  margin-top: auto;
  padding: 8px 0 4px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}
.mobile-sidebar-footer :deep(.crm-sidebar-item) {
  color: #fca5a5;
}
.mobile-sidebar-footer :deep(.crm-sidebar-item:hover) {
  color: #fecaca;
  background-color: rgba(220, 38, 38, 0.12);
}

.crm-mobile-sidebar {
  position: relative;
  z-index: 10;
  display: flex;
  height: 100%;
  width: 260px;
  flex-direction: column;
  justify-content: space-between;
  background: #21263c;
  color: #e5e7eb;
}

.crm-sidebar-brand {
  background: #181c2e;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 54px;
  padding: 0 12px 0 14px;
  border-bottom: 1px solid #1f2937;
  flex-shrink: 0;
  user-select: none;
}
.crm-sidebar-brand-mark {
  height: 30px;
  max-width: 30px;
  flex-shrink: 0;
  border-radius: var(--crm-radius-sm);
}
.crm-sidebar-brand-text {
  font-size: 18px;
  font-weight: var(--weight-normal);
  color: #f9fafb;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* Geometry matches .crm-dialog__close (32px / 10px). The colours stay on the
   dark literals on purpose — this rail mirrors the desktop navy nav, not the
   light dialog surfaces. */
.crm-sidebar-close-mob {
  flex-shrink: 0;
  background: transparent;
  border: 1px solid #374151;
  color: #9ca3af;
  width: 32px;
  height: 32px;
  border-radius: var(--crm-radius-md);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.crm-sidebar-close-mob:hover {
  background: #1f2937;
  color: #e5e7eb;
}

.crm-sidebar-nav {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px 0;
}
.crm-sidebar-nav::-webkit-scrollbar {
  width: 4px;
}
.crm-sidebar-nav::-webkit-scrollbar-track {
  background: transparent;
}
.crm-sidebar-nav::-webkit-scrollbar-thumb {
  background: #374151;
  border-radius: var(--crm-radius-xs);
}

.crm-sidebar-section {
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: space-between;
  font-size: 13px;
  font-weight: var(--weight-normal);
  letter-spacing: 0.07em;
  color: #f0f0f0;
  padding: 10px 13px;
  margin: 0 10px;
  white-space: nowrap;
  overflow: hidden;
  cursor: pointer;
  user-select: none;
  border-radius: var(--crm-radius-sm);
  transition: color 0.12s, background-color 0.12s;
}
.crm-sidebar-section:hover,
.crm-sidebar-section-active {
  color: #ffffff;
  background-color: #333850;
}
.crm-section-chev {
  display: inline-flex;
  opacity: 0.6;
  flex-shrink: 0;
  transition: transform 0.2s;
  order: -1;
}
.crm-section-chev.rotate-90 {
  transform: rotate(90deg);
}
</style>