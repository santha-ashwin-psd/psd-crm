<template>
  <SettingsLayoutBase>
    <template #title>
      <div class="flex gap-2 items-center">
        <div class="flex min-w-0 items-start gap-3">
          <button
            class="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg text-ink-gray-7 transition hover:bg-[var(--crm-surface-2)]"
            :aria-label="__('Go back')"
            @click="emit('updateStep', 'telephony-settings')"
          >
            <FeatherIcon name="arrow-left" class="size-4" />
          </button>
          <div class="flex min-w-0 flex-col gap-1">
            <h2 class="truncate text-2xl font-semibold leading-none text-ink-gray-9">
              {{ __('Twilio Settings') }}
            </h2>
            <p class="text-p-base text-ink-gray-6">{{ __('Configure your Twilio account for calling.') }}</p>
          </div>
        </div>
        <Badge
          v-if="twilio.doc?.enabled && isDirty"
          :label="__('Not Saved')"
          variant="subtle"
          theme="orange"
        />
      </div>
    </template>
    <template #header-actions>
      <div v-if="twilio.doc?.enabled && !twilio.get.loading" class="flex gap-2">
        <Button
          v-if="isDirty"
          :label="__('Discard Changes')"
          variant="subtle"
          @click="twilio.reload()"
        />
        <Button :label="__('Disable')" variant="subtle" @click="disable" />
        <Button
          variant="solid"
          :label="__('Update')"
          :loading="twilio.save.loading"
          :disabled="!isDirty"
          class="!bg-brand-600 hover:!bg-brand-700 text-white"
          @click="update"
        />
      </div>
    </template>
    <template #content>
      <div v-if="twilio.doc" class="h-full">
        <div v-if="twilio.doc.enabled" class="flex flex-col gap-3 py-2">

          <!-- Credentials section label -->
          <div class="px-1 pb-1">
            <p class="text-xs font-semibold uppercase tracking-widest text-[var(--crm-text-4)]">
              {{ __('Credentials') }}
            </p>
          </div>

          <!-- Account SID row -->
          <div class="flex items-center justify-between rounded-xl border border-[var(--crm-settings-border)] bg-[var(--crm-surface)] px-4 py-3.5 shadow-sm hover:border-[var(--crm-border)] hover:shadow transition-all duration-150">
            <div class="flex flex-col gap-0.5">
              <div class="text-sm font-semibold text-[var(--crm-text)]">{{ __('Account SID') }}</div>
              <div class="text-xs text-[var(--crm-text-3)]">{{ __('Your Twilio Account SID — starts with AC') }}</div>
            </div>
            <div class="flex items-center gap-2 ml-8">
              <input
                v-model="twilio.doc.account_sid"
                :type="showSID ? 'text' : 'password'"
                placeholder="ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
                autocomplete="off"
                class="w-64 rounded-lg border border-[var(--crm-border)] bg-[var(--crm-surface-2)] px-3 py-1.5 text-sm font-mono text-[var(--crm-text)] outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 transition"
              />
              <button
                type="button"
                class="text-[var(--crm-text-4)] hover:text-[var(--crm-text-2)] transition-colors"
                :title="showSID ? __('Hide') : __('Show')"
                @click="showSID = !showSID"
              >
                <component :is="showSID ? 'lucide-eye-off' : 'lucide-eye'" class="size-4" />
              </button>
            </div>
          </div>

          <!-- Auth Token row -->
          <div class="flex items-center justify-between rounded-xl border border-[var(--crm-settings-border)] bg-[var(--crm-surface)] px-4 py-3.5 shadow-sm hover:border-[var(--crm-border)] hover:shadow transition-all duration-150">
            <div class="flex flex-col gap-0.5">
              <div class="text-sm font-semibold text-[var(--crm-text)]">{{ __('Auth Token') }}</div>
              <div class="text-xs text-[var(--crm-text-3)]">{{ __('Your Twilio Auth Token — keep this secret') }}</div>
            </div>
            <div class="flex items-center gap-2 ml-8">
              <Password
                v-model="twilio.doc.auth_token"
                :label="''"
                placeholder="••••••••••••"
                class="w-64"
              />
            </div>
          </div>

          <!-- Twilio App Name row -->
          <div
            v-if="twilio.originalDoc?.account_sid && twilioApps.length > 0"
            class="flex items-center justify-between rounded-xl border border-[var(--crm-settings-border)] bg-[var(--crm-surface)] px-4 py-3.5 shadow-sm hover:border-[var(--crm-border)] hover:shadow transition-all duration-150"
          >
            <div class="flex flex-col gap-0.5">
              <div class="text-sm font-semibold text-[var(--crm-text)]">{{ __('Twilio App Name') }}</div>
              <div class="text-xs text-[var(--crm-text-3)]">{{ __('Select a Twilio App for your CRM') }}</div>
            </div>
            <div class="flex items-center gap-2 ml-8">
              <Combobox v-model="twilio.doc.app_name" :options="twilioApps">
                <template #footer>
                  <Button
                    :label="__('Refresh Apps')"
                    theme="gray"
                    variant="subtle"
                    class="w-full"
                    icon-left="lucide-refresh-cw"
                    :loading="twilio.fetchTwilioApps.loading"
                    @click="twilio.fetchTwilioApps.fetch"
                  />
                </template>
              </Combobox>
            </div>
          </div>

          <!-- Record Calls row -->
          <div class="flex items-center justify-between rounded-xl border border-[var(--crm-settings-border)] bg-[var(--crm-surface)] px-4 py-3.5 shadow-sm hover:border-[var(--crm-border)] hover:shadow transition-all duration-150">
            <div class="flex flex-col gap-0.5">
              <div class="text-sm font-semibold text-[var(--crm-text)]">{{ __('Record Calls') }}</div>
              <div class="text-xs text-[var(--crm-text-3)]">{{ __('Enable call recording for incoming and outgoing calls') }}</div>
            </div>
            <div class="shrink-0 ml-8">
              <Switch v-model="twilio.doc.record_calls" size="sm" />
            </div>
          </div>
        </div>

        <!-- Disabled state -->
        <div v-else class="relative flex h-full w-full justify-center">
          <div
            class="absolute left-1/2 flex w-72 -translate-x-1/2 flex-col items-center gap-4 text-center"
            :style="{ top: '32%' }"
          >
            <div class="flex size-14 items-center justify-center rounded-2xl bg-brand-50 border border-brand-100">
              <PhoneIcon class="size-7 text-brand-500" />
            </div>
            <div class="flex flex-col gap-1">
              <span class="text-base font-semibold text-[var(--crm-text)]">{{ __('Twilio Integration Disabled') }}</span>
              <span class="text-sm text-[var(--crm-text-3)] leading-relaxed">
                {{ __('Enable Twilio integration to make and receive calls directly from your CRM') }}
              </span>
            </div>
            <Button
              :label="__('Enable')"
              variant="solid"
              class="!bg-brand-600 hover:!bg-brand-700 text-white"
              @click="enable"
            />
          </div>
        </div>
      </div>
      <div
        v-else-if="twilio.get.loading"
        class="flex items-center justify-center mt-[35%]"
      >
        <LoadingIndicator class="size-6" />
      </div>
    </template>
  </SettingsLayoutBase>
</template>
<script setup>
import {
  setEnabled } from '@/composables/telephony'
import { FeatherIcon } from 'frappe-ui'
import { useDocument } from '@/data/document'
import { Combobox, Switch } from 'frappe-ui'
import { computed, ref } from 'vue'

const emit = defineEmits(['updateStep'])

const showSID = ref(false)

const { document: twilio } = useDocument(
  'CRM Twilio Settings',
  'CRM Twilio Settings',
  {
    whitelistedMethods: {
      fetchTwilioApps: {
        method: 'fetch_applications',
        onSuccess: () => twilio.reload(),
      },
    },
  },
)

const twilioApps = computed(() => {
  if (!twilio.doc?.account_sid) return []
  let comma_separated_apps = twilio.doc?.twilio_apps
  let apps = []
  if (comma_separated_apps) {
    apps = comma_separated_apps.split(',').map((app) => {
      return { label: app, value: app }
    })
  }
  return apps
})

function enable() {
  twilio.doc.enabled = true
}

function disable() {
  twilio.doc.enabled = false
  update()
}

function update() {
  // `setEnabled` drives `callEnabled`, which gates the Calls tab and the call
  // button across the app. Running it outside the callback meant a refused save
  // still turned telephony on in the UI, pointing at a configuration the server
  // never accepted.
  twilio.save.submit(null, {
    onSuccess: () => {
      twilio.reload()
      setEnabled('twilio', twilio.doc.enabled)
    },
  })
}

const isDirty = computed(() => {
  return (
    twilio.doc &&
    twilio.originalDoc &&
    JSON.stringify(twilio.doc) !== JSON.stringify(twilio.originalDoc)
  )
})
</script>
