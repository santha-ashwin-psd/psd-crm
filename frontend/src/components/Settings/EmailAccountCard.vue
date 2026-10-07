<template>
  <div class="crm-settings-row cursor-pointer">
    <span class="email-provider-chip">
      <EmailProviderIcon :logo="emailIcon[emailAccount.service]" />
    </span>

    <div class="min-w-0 flex-1">
      <div class="truncate text-base font-semibold text-ink-gray-9">
        {{ emailAccount.email_account_name }}
      </div>
      <div class="mt-0.5 truncate text-sm text-ink-gray-6">
        {{ emailAccount.email_id }}
      </div>
    </div>

    <div class="flex shrink-0 flex-col items-end gap-1">
      <span v-if="isDefault" class="email-default-badge">
        {{ __('Default') }}
      </span>
      <span class="text-sm text-ink-gray-5">{{ badgeTitle }}</span>
    </div>

    <Button icon="more-vertical" variant="ghost" class="shrink-0" @click.stop />
  </div>
</template>

<script setup>
import { emailIcon } from './emailConfig'
import EmailProviderIcon from './EmailProviderIcon.vue'
import { computed } from 'vue'

const props = defineProps({
  emailAccount: { type: Object, required: true },
})

const isDefault = computed(
  () =>
    props.emailAccount.default_incoming || props.emailAccount.default_outgoing,
)

const badgeTitle = computed(() => {
  if (
    props.emailAccount.default_incoming &&
    props.emailAccount.default_outgoing
  ) {
    return __('Default Sending & Inbox')
  } else if (props.emailAccount.default_incoming) {
    return __('Default Inbox')
  } else if (props.emailAccount.default_outgoing) {
    return __('Default Sending')
  } else {
    return __('Inbox')
  }
})
</script>

<style scoped>
.email-provider-chip {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: var(--crm-radius);
  border: 1px solid var(--crm-settings-border);
  background: var(--crm-surface);
}
.email-default-badge {
  padding: 2px 10px;
  border-radius: var(--crm-radius-pill);
  background: var(--crm-chip-green);
  color: var(--crm-success);
  font-size: 12px;
  font-weight: 500;
}
</style>
