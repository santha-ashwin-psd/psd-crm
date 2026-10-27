<template>
  <SettingsLayoutBase :title="__('WhatsApp Automation')">
    <template #title>
      <div class="flex items-start gap-3.5">
        <span
          class="mt-0.5 grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--crm-chip-blue)] text-[var(--crm-accent-primary)]"
        >
          <WhatsAppIcon class="size-5" />
        </span>
        <div class="flex flex-col gap-1">
          <h2 class="text-2xl font-semibold leading-none text-ink-gray-9">
            {{ __('WhatsApp Automation') }}
          </h2>
          <p class="text-p-base text-ink-gray-6">
            {{
              __(
                'Send reminders and follow-ups on WhatsApp, and start pipelines from new WhatsApp numbers. Everything here is off until you switch it on. Messages your business starts must use a template approved by Meta.',
              )
            }}
          </p>
        </div>
      </div>
    </template>

    <template #header-actions>
      <Button
        v-if="isDirty"
        :label="__('Update')"
        variant="solid"
        icon-left="check"
        :loading="settings.save.loading"
        @click="update"
      />
    </template>

    <template #content>
      <div v-if="settings.doc" class="flex flex-col gap-4">
        <div
          v-for="row in rows"
          :key="row.switch"
          class="crm-settings-row !items-start"
        >
          <span class="crm-settings-row-icon">
            <component :is="row.icon" class="size-5" />
          </span>
          <div class="flex min-w-0 flex-1 flex-col gap-3">
            <div>
              <div class="text-base font-semibold text-ink-gray-9">
                {{ row.title }}
              </div>
              <div class="mt-0.5 text-sm leading-relaxed text-ink-gray-6">
                {{ row.description }}
              </div>
            </div>
            <div
              v-if="row.template && settings.doc[row.switch]"
              class="flex flex-col gap-1.5"
            >
              <span class="text-sm font-medium text-ink-gray-7">
                {{ __('Approved template') }}
              </span>
              <Link
                v-model="settings.doc[row.template]"
                doctype="WhatsApp Templates"
                :filters="{ status: 'APPROVED' }"
                :placeholder="__('Select a template')"
                class="!w-72"
              />
              <span class="text-xs text-ink-gray-5">{{ row.params }}</span>
              <p
                v-if="!settings.doc[row.template]"
                class="text-xs text-[var(--crm-danger-text)]"
                role="alert"
              >
                {{ __('Nothing is sent until a template is chosen.') }}
              </p>
            </div>
          </div>
          <Switch
            :modelValue="Boolean(settings.doc[row.switch])"
            :aria-label="row.title"
            class="shrink-0"
            @update:modelValue="(on) => (settings.doc[row.switch] = on ? 1 : 0)"
          />
        </div>
      </div>
    </template>
  </SettingsLayoutBase>
</template>

<script setup>
import SettingsLayoutBase from '@/components/Layouts/SettingsLayoutBase.vue'
import Link from '@/components/Controls/Link.vue'
import WhatsAppIcon from '@/components/Icons/WhatsAppIcon.vue'
import LucideBellRing from '~icons/lucide/bell-ring'
import LucideCalendarClock from '~icons/lucide/calendar-clock'
import LucideInbox from '~icons/lucide/inbox'
import { formatError } from '@/utils/formatError'
import { Button, Switch, toast, createDocumentResource } from 'frappe-ui'
import { computed } from 'vue'

const settings = createDocumentResource({
  doctype: 'FCRM Settings',
  name: 'FCRM Settings',
  auto: true,
})

const rows = [
  {
    switch: 'whatsapp_reminders',
    template: 'whatsapp_reminder_template',
    icon: LucideBellRing,
    title: __('Reminders to the team'),
    description: __(
      'When an event or task reminder fires, also send it on WhatsApp to each CRM user it goes to, at the mobile number on their user profile.',
    ),
    params: __('Template values in order: recipient name, item title, when.'),
  },
  {
    switch: 'whatsapp_follow_ups',
    template: 'whatsapp_follow_up_template',
    icon: LucideCalendarClock,
    title: __('Follow-ups to customers'),
    description: __(
      'When a pipeline in the follow-up stage reaches its follow-up date, send its contact a WhatsApp message. Sent once per follow-up date, and never late.',
    ),
    params: __(
      'Template values in order: contact first name, owner name, organisation.',
    ),
  },
  {
    switch: 'whatsapp_creates_pipeline',
    icon: LucideInbox,
    title: __('Pipelines from WhatsApp'),
    description: __(
      'A message from a number the CRM does not know creates a contact and a pipeline in the first stage, like an inquiry email.',
    ),
  },
]

const isDirty = computed(
  () => JSON.stringify(settings.doc) !== JSON.stringify(settings.originalDoc),
)

function update() {
  settings.save.submit(null, {
    onSuccess: () => toast.success(__('Settings updated successfully')),
    onError: (error) =>
      toast.error(formatError(error, 'Failed to save settings')),
  })
}
</script>
