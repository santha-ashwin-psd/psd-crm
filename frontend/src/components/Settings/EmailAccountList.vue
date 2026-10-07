<template>
  <SettingsLayoutBase :title="__('Email Accounts')">
    <template #title>
      <div class="flex items-center gap-3.5">
        <span
          class="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--crm-chip-blue)] text-[var(--crm-accent-primary)]"
        >
          <LucideMail class="size-5" />
        </span>
        <div class="flex flex-col gap-1">
          <h2 class="text-2xl font-semibold leading-none text-ink-gray-9">
            {{ __('Email Accounts') }}
          </h2>
          <p class="text-p-base text-ink-gray-6">
            {{
              __(
                'Manage your email accounts to send and receive emails directly from CRM. You can add multiple accounts and set one as default for incoming and outgoing emails.',
              )
            }}
          </p>
        </div>
      </div>
    </template>

    <template #header-actions>
      <Button
        :label="__('Add Account')"
        variant="solid"
        icon-left="lucide-plus"
        @click="emit('update:step', 'email-add')"
      />
    </template>

    <template #content>
      <div class="flex flex-col gap-4">
        <div
          v-if="emailAccounts.loading"
          class="flex flex-col gap-4"
          aria-busy="true"
          :aria-label="__('Loading email accounts')"
        >
          <SkeletonLoader v-for="i in 2" :key="i" type="settings-row" />
        </div>

        <template v-else>
          <EmailAccountCard
            v-for="emailAccount in emailAccounts.data"
            :key="emailAccount.name"
            :emailAccount="emailAccount"
            @click="emit('update:step', 'email-edit', emailAccount)"
          />

          <!-- Prompt to add another (or a first) account -->
          <div class="email-empty">
            <span class="email-empty-icon">
              <LucideMail class="size-8" />
            </span>
            <div class="text-lg font-semibold text-ink-gray-9">
              {{
                emailAccounts.data?.length
                  ? __('No other email accounts yet')
                  : __('No email accounts yet')
              }}
            </div>
            <div class="text-sm text-ink-gray-6">
              {{
                __(
                  'Add more email accounts to send and receive emails from CRM.',
                )
              }}
            </div>
            <Button
              class="mt-1"
              :label="__('Add Account')"
              variant="solid"
              icon-left="lucide-plus"
              @click="emit('update:step', 'email-add')"
            />
          </div>
        </template>
      </div>
    </template>
  </SettingsLayoutBase>
</template>

<script setup>
import SettingsLayoutBase from '@/components/Layouts/SettingsLayoutBase.vue'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import EmailAccountCard from './EmailAccountCard.vue'
import LucideMail from '~icons/lucide/mail'
import { createListResource } from 'frappe-ui'

const emit = defineEmits(['update:step'])

const emailAccounts = createListResource({
  doctype: 'Email Account',
  cache: true,
  fields: ['*'],
  filters: {
    email_id: ['Not Like', '%example%'],
  },
  pageLength: 10,
  auto: true,
  onSuccess: (accounts) => {
    // convert 0 to false to handle boolean fields
    accounts.forEach((account) => {
      account.enable_incoming = Boolean(account.enable_incoming)
      account.enable_outgoing = Boolean(account.enable_outgoing)
      account.default_incoming = Boolean(account.default_incoming)
      account.default_outgoing = Boolean(account.default_outgoing)
      // The fifth checkbox on the edit form, and it was missing here. Left as
      // a raw 0/1 it never matches the `false` the form initialises to, so the
      // account looks edited the moment it is opened.
      account.create_lead_from_incoming_email = Boolean(
        account.create_lead_from_incoming_email,
      )
    })
  },
})
</script>

<style scoped>
.email-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 24px;
  text-align: center;
  border-radius: var(--crm-radius-lg);
  border: 2px dashed var(--crm-settings-border);
  background: var(--crm-surface);
}
.email-empty-icon {
  display: grid;
  place-items: center;
  width: 72px;
  height: 72px;
  margin-bottom: 8px;
  border-radius: var(--crm-radius-lg);
  background: var(--crm-chip-blue);
  color: var(--crm-accent-primary);
}
</style>
