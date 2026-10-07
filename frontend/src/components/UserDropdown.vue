<template>
  <Dropdown :options="dropdownItems" v-bind="$attrs">
    <template #default="{ open }">
      <button
        v-if="variant === 'avatar'"
        class="group relative flex items-center gap-1 rounded-full focus:outline-none"
        aria-label="User Menu"
      >
        <Avatar
          size="md"
          class="h-9 w-9 rounded-full transition-all duration-200 group-hover:ring-2 group-hover:ring-brand-500/50"
          :label="user.full_name"
          :image="user.user_image"
        />
        <!-- Unread notifications were only ever visible as a text label inside
             the already-open menu, so there was nothing to tell you to open it.
             The ring matches the page surface so the dot reads as lifted off
             the avatar rather than painted onto it. -->
        <span
          v-if="unreadNotificationsCount"
          class="absolute -right-0.5 -top-0.5 grid h-4 min-w-[16px] place-items-center rounded-full bg-[var(--crm-danger)] px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-[var(--crm-topbar)]"
          :aria-label="
            __('{0} unread notifications', [unreadNotificationsCount])
          "
        >
          {{ unreadNotificationsCount > 99 ? '99+' : unreadNotificationsCount }}
        </span>
        <span
          class="size-4 text-[var(--crm-text-3)] transition-transform duration-200"
          :class="[open ? 'lucide-chevron-up' : 'lucide-chevron-down']"
          aria-hidden="true"
        />
      </button>
      <button
        v-else
        class="flex h-12 items-center rounded-lg py-2 duration-200 ease-in-out border border-[var(--crm-border)]/80 bg-[var(--crm-surface-2)]/60 hover:bg-[var(--crm-surface-2)]"
        :class="
          isCollapsed
            ? 'w-auto px-0'
            : open
              ? 'w-full px-2.5 bg-[var(--crm-surface-2)] border-[var(--crm-border-strong)] shadow-sm'
              : 'w-full px-2.5'
        "
      >
        <BrandLogo v-model="brand" class="h-8 max-w-16 flex-shrink-0" />
        <div
          class="flex flex-1 flex-col text-left duration-200 ease-in-out truncate"
          :class="
            isCollapsed
              ? 'ml-0 w-0 overflow-hidden opacity-0'
              : 'ml-2 w-auto opacity-100'
          "
        >
          <div class="text-sm font-bold leading-none text-[var(--crm-text)] truncate">
            {{ __(brand.name || 'CRM') }}
          </div>
          <div class="mt-1 text-xs leading-none text-[var(--crm-text-2)] truncate">
            {{ user.full_name }}
          </div>
        </div>
        <div
          class="duration-200 ease-in-out"
          :class="
            isCollapsed
              ? 'ml-0 w-0 overflow-hidden opacity-0'
              : 'ml-2 w-auto opacity-100'
          "
        >
          <span
            class="lucide-chevron-down size-4 text-[var(--crm-text-3)]"
            aria-hidden="true"
          />
        </div>
      </button>
    </template>
  </Dropdown>
</template>

<script setup>
import BrandLogo from '@/components/BrandLogo.vue'
import FrappeCloudIcon from '@/components/Icons/FrappeCloudIcon.vue'
import AppsIcon from '@/components/Icons/AppsIcon.vue'
import MoonIcon from '~icons/lucide/moon'
import BellIcon from '~icons/lucide/bell'
import { sessionStore } from '@/stores/session'
import { usersStore } from '@/stores/users'
import { getSettings } from '@/stores/settings'
import { showSettings, isMobileView } from '@/composables/settings'
import { showAboutModal } from '@/composables/modals'
import { confirmLoginToFrappeCloud } from '@/composables/frappecloud'
import {
  unreadNotificationsCount,
  notificationsStore,
} from '@/stores/notifications'
import { createResource, Dropdown, Avatar, useTheme } from 'frappe-ui'
import { computed, h, markRaw } from 'vue'

defineProps({
  isCollapsed: { type: Boolean, default: false },
  variant: { type: String, default: 'default' },
})

const { settings, brand } = getSettings()
const { logout } = sessionStore()
const { getUser } = usersStore()
const { toggle: toggleNotificationPanel } = notificationsStore()

const user = computed(() => getUser() || {})

// Shares the useTheme singleton with Preferences. Resolves 'system' to the
// theme actually applied, so the switch reflects what the user is seeing.
const { currentTheme, setTheme, getSystemTheme } = useTheme()
const isDark = computed(
  () =>
    (currentTheme.value === 'system'
      ? getSystemTheme()
      : currentTheme.value) === 'dark',
)
// Theme + Notifications live in this menu (moved out of the top bar to declutter
// the header). Prepended to whatever server-configured dropdown items exist.
const personalItems = computed(() => ({
  group: 'Personal',
  hideLabel: true,
  items: [
    {
      // A switch names the setting, not the action — the label stays
      // "Dark mode" and the toggle shows whether it is on.
      icon: markRaw(MoonIcon),
      label: __('Dark mode'),
      switch: true,
      switchValue: isDark.value,
      onClick: (value) => setTheme(value ? 'dark' : 'light'),
    },
    {
      icon: markRaw(BellIcon),
      label: unreadNotificationsCount.value
        ? __('Notifications ({0})', [unreadNotificationsCount.value])
        : __('Notifications'),
      onClick: () => toggleNotificationPanel(),
    },
  ],
}))

const apps = createResource({
  url: 'frappe.apps.get_apps',
  cache: 'apps',
  auto: true,
  transform: (data) => [deskApp(), ...crmSiblingApps(data)],
})

const dropdownItems = computed(() => {
  // Theme + Notifications always lead the menu, even before server settings load.
  let _dropdownItems = [personalItems.value]

  if (!settings.value?.dropdown_items) return _dropdownItems

  let items = settings.value.dropdown_items

  _dropdownItems.push({
    group: 'Dropdown Items',
    hideLabel: true,
    items: [],
  })

  items.forEach((item) => {
    if (item.hidden) return
    if (item.type !== 'Separator') {
      _dropdownItems[_dropdownItems.length - 1].items.push(
        dropdownItemObj(item),
      )
    } else {
      _dropdownItems.push({
        group: '',
        hideLabel: true,
        items: [],
      })
    }
  })

  return _dropdownItems
})

function dropdownItemObj(item) {
  let _item = JSON.parse(JSON.stringify(item))
  let icon = _item.icon || 'external-link'
  if (typeof icon === 'string' && icon.startsWith('<svg')) {
    icon = markRaw(h('div', { innerHTML: icon }))
  }
  _item.icon = icon

  if (_item.is_standard) {
    return getStandardItem(_item)
  }

  return {
    icon: _item.icon,
    label: __(_item.label),
    onClick: () =>
      window.open(_item.route, _item.open_in_new_window ? '_blank' : ''),
  }
}

function getStandardItem(item) {
  switch (item.name1) {
    case 'app_selector':
      return {
        icon: markRaw(AppsIcon),
        label: __(item.label),
        submenu: appMenuItems(),
      }
    case 'settings':
      return {
        icon: item.icon,
        label: __(item.label),
        onClick: () => (showSettings.value = true),
        condition: () => !isMobileView.value,
      }
    case 'login_to_fc':
      return {
        icon: h(FrappeCloudIcon),
        label: __(item.label),
        onClick: () => confirmLoginToFrappeCloud(),
        condition: () => !isMobileView.value && window.is_fc_site,
      }
    case 'about':
      return {
        icon: item.icon,
        label: __(item.label),
        onClick: () => (showAboutModal.value = true),
      }
    case 'logout':
      return {
        icon: item.icon,
        label: __(item.label),
        theme: 'red',
        onClick: () => logout.submit(),
      }
  }
}

function appMenuItems() {
  return (apps.data || []).map((app) => ({
    label: app.title,
    onClick: () => (window.location.href = app.route),
    slots: {
      prefix: () => h('img', { class: 'size-5 rounded', src: app.logo }),
    },
  }))
}

function deskApp() {
  return {
    name: 'frappe',
    logo: '/assets/frappe/images/framework.png',
    title: __('Desk'),
    route: '/desk',
  }
}

function crmSiblingApps(data) {
  return data
    .filter((app) => app.name !== 'crm')
    .map((app) => ({
      name: app.name,
      logo: app.logo,
      title: __(app.title),
      route: app.route,
    }))
}
</script>
