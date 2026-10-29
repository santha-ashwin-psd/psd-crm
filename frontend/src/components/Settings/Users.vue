<template>
  <SettingsLayoutBase
    :title="__('Users')"
  >
    <template #title>
      <div class="flex items-center gap-3.5">
        <span
          class="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--crm-chip-blue)] text-[var(--crm-accent-primary)]"
        >
          <LucideUsers class="size-5" />
        </span>
        <div class="flex flex-col gap-1">
          <h2 class="text-2xl font-semibold leading-none text-ink-gray-9">
            {{ __('Users') }}
          </h2>
          <p class="text-p-base text-ink-gray-6">
            {{
              __(
                'Manage CRM users by adding or inviting them, and assign roles to control their access and permissions.',
              )
            }}
          </p>
        </div>
      </div>
    </template>

    <template #header-actions>
      <Dropdown
        :options="[
          {
            label: __('Add Existing User'),
            onClick: () => (showAddExistingModal = true),
          },
          {
            label: __('Invite New User'),
            onClick: () => (activeSettingsPage = 'Invite User'),
          },
        ]"
        :button="{ label: __('New'), iconLeft: 'plus', variant: 'solid' }"
        placement="right"
      />
    </template>

    <template #content>
      <div class="flex flex-col gap-4">
        <!-- Search + role filter -->
        <div
          v-if="!users.loading && users.data?.crmUsers?.length > 1"
          class="users-filters flex items-center gap-3"
        >
          <TextInput
            ref="searchRef"
            v-model="search"
            :placeholder="__('Search user...')"
            class="flex-1"
            :debounce="300"
          >
            <template #prefix>
              <span
                class="lucide-search h-4 w-4 text-ink-gray-5"
                aria-hidden="true"
              />
            </template>
          </TextInput>
          <FormControl
            v-model="currentRole"
            type="select"
            class="flex-1"
            :options="roleFilterOptions"
          />
        </div>

        <!-- Loading -->
        <div
          v-if="users.loading"
          class="flex flex-col gap-4"
          aria-busy="true"
          :aria-label="__('Loading users')"
        >
          <SkeletonLoader v-for="i in 4" :key="i" type="settings-row" />
        </div>

        <!-- Empty -->
        <EmptyState
          v-else-if="users.data?.crmUsers?.length == 1"
          name="Users"
          :description="__('Add one to get started.')"
          icon="user"
        />

        <!-- Users -->
        <template v-else>
          <div
            v-for="user in usersList"
            :key="user.name"
            class="crm-settings-row"
          >
            <Avatar
              :image="user.user_image"
              :label="user.full_name"
              size="2xl"
              class="shrink-0"
            />
            <div class="min-w-0 flex-1">
              <div class="truncate text-base font-semibold text-ink-gray-9">
                {{ user.full_name }}
              </div>
              <div class="mt-0.5 truncate text-sm text-ink-gray-6">
                {{ user.name }}
              </div>
            </div>

            <div class="flex shrink-0 items-center gap-2">
              <Tooltip
                v-if="isManager() && user.role == 'System Manager'"
                :text="__('Cannot change role of user with Admin access')"
              >
                <Button
                  class="role-pill role-pill-admin"
                  :label="__('Admin')"
                  icon-left="shield"
                />
              </Tooltip>
              <Dropdown
                v-else
                :options="getDropdownOptions(user)"
                :button="{
                  label: roleMap[user.crm_role || user.role],
                  iconRight: 'chevron-down',
                  iconLeft: roleIcon(user.crm_role || user.role),
                  class: 'role-pill',
                }"
                placement="right"
              />
              <Dropdown
                :options="getMoreOptions(user)"
                :button="{
                  icon: 'more-horizontal',
                  variant: 'ghost',
                  onblur: (e) => {
                    e.stopPropagation()
                    confirmRemove = false
                  },
                }"
                placement="right"
              />
            </div>
          </div>

          <div v-if="users.hasNextPage" class="flex justify-center">
            <Button
              class="crm-settings-action"
              :loading="users.loading"
              :label="__('Load More')"
              icon-left="lucide-refresh-cw"
              @click="() => users.next()"
            />
          </div>
        </template>
      </div>
    </template>
  </SettingsLayoutBase>

  <AddExistingUserModal
    v-if="showAddExistingModal"
    v-model="showAddExistingModal"
  />
</template>

<script setup>
import SettingsLayoutBase from '@/components/Layouts/SettingsLayoutBase.vue'
import AddExistingUserModal from '@/components/Modals/AddExistingUserModal.vue'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import EmptyState from '@/components/ListViews/EmptyState.vue'
import LucideUsers from '~icons/lucide/users'
import { activeSettingsPage } from '@/composables/settings'
import { usersStore } from '@/stores/users'
import { DropdownOption } from '@/utils'
import {
  Dropdown,
  Avatar,
  TextInput,
  FormControl,
  toast,
  call,
  Tooltip,
} from 'frappe-ui'
import { ref, computed, onMounted } from 'vue'
import { ConfirmDelete } from '../../utils'
import { formatError } from '../../utils/formatError'

const { users, isAdmin, isManager, canManageRoles } = usersStore()

const showAddExistingModal = ref(false)
const searchRef = ref(null)
const search = ref('')
const currentRole = ref('All')

const roleMap = {
  'Company Admin': __('Company Admin'),
  'System Manager': __('Admin'),
  'Sales Manager': __('Manager'),
  'Sales User': __('Sales User'),
}

const roleFilterOptions = [
  { label: __('All Roles'), value: 'All' },
  { label: __('Company Admin'), value: 'Company Admin' },
  { label: __('Manager'), value: 'Sales Manager' },
  { label: __('Sales User'), value: 'Sales User' },
]

function roleIcon(role) {
  if (role === 'Company Admin' || role === 'System Manager') return 'shield'
  if (role === 'Sales Manager') return 'briefcase'
  return 'user-check'
}

const usersList = computed(() => {
  const query = search.value.trim().toLowerCase()
  let filteredUsers =
    users.data?.crmUsers?.filter((user) => user.name !== 'Administrator') || []

  return filteredUsers
    .filter(
      (user) =>
        !query ||
        user.name?.toLowerCase().includes(query) ||
        user.full_name?.toLowerCase().includes(query),
    )
    .filter((user) => {
      if (currentRole.value === 'All') return true
      return user.role === currentRole.value
    })
})

const confirmRemove = ref(false)

function getMoreOptions(user) {
  return [
    ...ConfirmDelete({
      onConfirmDelete: () => removeUser(user),
      isConfirmingDelete: confirmRemove,
      label: __('Remove'),
    }),
  ]
}

function getDropdownOptions(user) {
  let options = [
    {
      label: __('Company Admin'),
      component: () =>
        DropdownOption({
          option: __('Company Admin'),
          icon: 'shield',
          selected: (user.crm_role || user.role) === 'Company Admin',
        }),
      onClick: () => updateRole(user, 'Company Admin'),
      condition: () => canManageRoles(),
    },
    {
      label: __('Manager'),
      component: () =>
        DropdownOption({
          option: __('Manager'),
          icon: 'briefcase',
          selected: (user.crm_role || user.role) === 'Sales Manager',
        }),
      onClick: () => updateRole(user, 'Sales Manager'),
      condition: () => canManageRoles(),
    },
    {
      label: __('Sales User'),
      component: () =>
        DropdownOption({
          option: __('Sales User'),
          icon: 'user-check',
          selected: (user.crm_role || user.role) === 'Sales User',
        }),
      onClick: () => updateRole(user, 'Sales User'),
    },
  ]

  // `?? true`, not `|| true`: the latter is true for every input, so the
  // filter kept everything and the `condition: () => isAdmin()` guards below
  // never did anything — non-admins were offered the admin and manager roles.
  // `??` still defaults an absent condition to visible.
  return options.filter((option) => option.condition?.() ?? true)
}

function updateRole(user, newRole) {
  if ((user.crm_role || user.role) === newRole) return

  call('xbr_crm.tenancy.admin.update_member_role', {
    user: user.name,
    role: newRole,
  })
    .then(() => {
      toast.success(
        __('{0} has been granted {1} access', [
          user.full_name,
          roleMap[newRole],
        ]),
      )
      users.reload()
    })
    .catch((e) => {
      toast.error(formatError(e, 'Something went wrong'))
    })
}

function removeUser(user) {
  call('xbr_crm.tenancy.admin.remove_member', {
    user: user.name,
  })
    .then(() => {
      toast.success(__('User {0} has been removed', [user.full_name]))
      users.reload()
    })
    .catch((e) => {
      toast.error(formatError(e, 'Something went wrong'))
    })
}

onMounted(() => {
  if (searchRef.value) {
    searchRef.value.el.focus()
  }
})
</script>