<template>
  <SettingsLayoutBase
    :title="__('Send Invites To')"
  >
    <template #title>
      <div class="flex items-center gap-3.5">
        <span
          class="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--crm-chip-blue)] text-[var(--crm-accent-primary)]"
        >
          <LucideUserPlus class="size-5" />
        </span>
        <div class="flex flex-col gap-1">
          <h2 class="text-2xl font-semibold leading-none text-ink-gray-9">
            {{ __('Send Invites To') }}
          </h2>
          <p class="text-p-base text-ink-gray-6">
            {{
              __(
                'Invite users to access CRM. Specify their roles to control access and permissions.',
              )
            }}
          </p>
        </div>
      </div>
    </template>

    <template #header-actions>
      <Button
        class="crm-settings-action"
        :label="__('Send Invites')"
        icon-left="send"
        :disabled="!invitees.length || userExistMessage || inviteeExistMessage"
        :loading="inviteByEmail.loading"
        @click="inviteByEmail.submit()"
      />
    </template>

    <template #content>
      <div class="invite-card">
        <!-- Invite By Email -->
        <section class="flex flex-col gap-2">
          <div>
            <div class="text-base font-semibold text-ink-gray-9">
              {{ __('Invite By Email') }}
            </div>
            <div class="mt-0.5 text-sm text-ink-gray-6">
              {{ __('Enter one or more email addresses to invite users.') }}
            </div>
          </div>

          <div class="crm-icon-field">
            <FeatherIcon
              name="mail"
              class="pointer-events-none absolute left-3 top-3.5 z-10 size-4 text-ink-gray-5"
            />
            <FormControl
              type="textarea"
                            placeholder="user1@example.com, user2@example.com, ..."
              :debounce="100"
              :disabled="inviteByEmail.loading"
              @input="updateInvitees($event.target.value)"
            />
          </div>

          <div
            v-if="userExistMessage || inviteeExistMessage"
            class="text-sm text-ink-red-6"
          >
            {{ userExistMessage || inviteeExistMessage }}
          </div>
          <div v-else class="text-sm text-ink-gray-5">
            {{
              __(
                'You can invite multiple users by comma separating their email addresses.',
              )
            }}
          </div>
        </section>

        <div class="invite-divider" />

        <!-- Invite As -->
        <section class="flex flex-col gap-2">
          <div>
            <div class="text-base font-semibold text-ink-gray-9">
              {{ __('Invite As') }}
            </div>
            <div class="mt-0.5 text-sm text-ink-gray-6">
              {{ __('Select the role for the invited users.') }}
            </div>
          </div>

          <div class="crm-icon-field">
            <FeatherIcon
              name="shield"
              class="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-ink-gray-5"
            />
            <FormControl
              v-model="role"
              type="select"
                            :options="roleOptions"
            />
          </div>

          <div class="text-sm text-ink-gray-5">{{ description }}</div>
        </section>

        <!-- Pending Invites -->
        <template v-if="pendingInvitations.data?.length && !invitees.length">
          <div class="invite-divider" />

          <section class="flex flex-col gap-3">
            <div>
              <div class="text-base font-semibold text-ink-gray-9">
                {{ __('Pending Invites') }}
              </div>
              <div class="mt-0.5 text-sm text-ink-gray-6">
                {{ __('These invites are not yet accepted.') }}
              </div>
            </div>

            <ul class="flex flex-col gap-2">
              <li
                v-for="user in pendingInvitations.data"
                :key="user.name"
                class="invite-pending"
              >
                <Avatar :label="user.email" size="lg" class="shrink-0" />
                <span class="truncate text-base text-ink-gray-8">
                  {{ user.email }}
                </span>
                <span class="invite-role-badge shrink-0">
                  {{ roleMap[user.role] }}
                </span>
                <Button
                  class="ml-auto shrink-0"
                  :tooltip="__('Delete Invitation')"
                  icon="lucide-x"
                  variant="ghost"
                  :loading="
                    pendingInvitations.delete.loading &&
                    pendingInvitations.delete.params.name === user.name
                  "
                  @click="pendingInvitations.delete.submit(user.name)"
                />
              </li>
            </ul>
          </section>
        </template>

        <ErrorMessage :message="error" />
      </div>
    </template>
  </SettingsLayoutBase>
</template>

<script setup>
import SettingsLayoutBase from '@/components/Layouts/SettingsLayoutBase.vue'
import LucideUserPlus from '~icons/lucide/user-plus'
import { validateEmail, convertArrayToString } from '@/utils'
import { formatError } from '@/utils/formatError'
import { usersStore } from '@/stores/users'
import { useOnboarding, useTelemetry } from 'frappe-ui/frappe'
import {
  toast,
  createListResource,
  createResource,
  FormControl,
  FeatherIcon,
  Avatar,
  ErrorMessage,
} from 'frappe-ui'
import { ref, computed } from 'vue'

const { updateOnboardingStep } = useOnboarding('frappecrm')
const { users, isAdmin } = usersStore()
const { capture } = useTelemetry()

const invitees = ref([])
const role = ref('Sales User')
const error = ref(null)

const userExistMessage = computed(() => {
  const inviteesSet = new Set(invitees.value)
  if (!inviteesSet.size) return null

  if (!users.data?.crmUsers?.length) return null
  const existingEmails = (users.data?.crmUsers || []).map((user) => user.name)
  const existingUsersSet = new Set(existingEmails)

  const existingInvitees = inviteesSet.intersection(existingUsersSet)
  if (existingInvitees.size === 0) return null

  return __('User with email {0} already exists', [
    Array.from(existingInvitees).join(', '),
  ])
})

const inviteeExistMessage = computed(() => {
  const inviteesSet = new Set(invitees.value)
  if (!inviteesSet.size) return null

  if (!pendingInvitations.data?.length) return null
  const existingEmails = pendingInvitations.data.map((user) => user.email)
  const existingUsersSet = new Set(existingEmails)

  const existingInvitees = inviteesSet.intersection(existingUsersSet)
  if (existingInvitees.size === 0) return null

  return __('User with email {0} already invited', [
    Array.from(existingInvitees).join(', '),
  ])
})

const description = computed(() => {
  return {
    'Company Admin': __(
      'Can manage everything in your company, including users, settings and customizations.',
    ),
    'Sales Manager': __(
      'Can manage and invite new users, and create public & private views (reports).',
    ),
    'Sales User': __(
      'Can work with leads and deals and create private views (reports).',
    ),
  }[role.value]
})

const roleOptions = computed(() => {
  return [
    { value: 'Sales User', label: __('Sales User') },
    ...(isAdmin() ? [{ value: 'Sales Manager', label: __('Manager') }] : []),
    ...(isAdmin() ? [{ value: 'Company Admin', label: __('Company Admin') }] : []),
  ]
})

const roleMap = {
  'Sales User': __('Sales User'),
  'Sales Manager': __('Manager'),
  'Company Admin': __('Company Admin'),
}

const inviteByEmail = createResource({
  // Tenancy: creates the users directly in the caller's own company and emails
  // each a temporary password. The company is taken from the caller's member
  // row server-side, never from here.
  url: 'crm.tenancy.admin.invite_users',
  makeParams() {
    return {
      emails: convertArrayToString(invitees.value),
      role: role.value,
    }
  },
  onSuccess(result) {
    role.value = 'Sales User'
    error.value = null
    invitees.value = []

    const invited = result?.invited?.length || 0
    const skipped = result?.skipped || []
    const failed = result?.failed || []

    if (invited) {
      toast.success(
        invited === 1
          ? __('Invitation sent')
          : __('{0} invitations sent', [invited]),
      )
      updateOnboardingStep('invite_your_team')
      capture('user_invited')
    }
    // Surfaced rather than swallowed: a silent no-op looks like success.
    if (skipped.length) {
      toast.info(__('Already a user: {0}', [skipped.join(', ')]))
    }
    if (failed.length) {
      toast.error(failed.map((f) => `${f.email}: ${f.reason}`).join(' · '))
    }
  },
  onError(err) {
    // No fallback at all before this: a failure with no `messages` left
    // `error` undefined and popped an empty toast — visibly something went
    // wrong, with no indication of what.
    error.value = formatError(err, 'Could not send invitations')
    toast.error(error.value)
  },
})

const pendingInvitations = createListResource({
  type: 'list',
  doctype: 'CRM Invitation',
  filters: { status: 'Pending' },
  fields: ['name', 'email', 'role'],
  pageLength: 999,
  auto: true,
})

function updateInvitees(value) {
  const emails = value
    .split(',')
    .map((email) => email.trim())
    .filter((email) => validateEmail(email))
  invitees.value = emails
}
</script>

<style scoped>
/* All three sections live in one card, separated by hairlines. */
.invite-card {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 22px;
  border-radius: var(--crm-radius-lg);
  border: 1px solid var(--crm-settings-border);
  background: var(--crm-surface);
  box-shadow: var(--crm-shadow-sm);
}
.invite-divider {
  height: 1px;
  background: var(--crm-settings-border);
}

.invite-pending {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: var(--crm-radius);
  border: 1px solid var(--crm-settings-border);
  background: var(--crm-surface);
}
.invite-role-badge {
  padding: 3px 10px;
  border-radius: var(--crm-radius-pill);
  background: var(--crm-chip-blue);
  color: var(--crm-accent-primary);
  font-size: 12px;
  font-weight: 500;
}
</style>
