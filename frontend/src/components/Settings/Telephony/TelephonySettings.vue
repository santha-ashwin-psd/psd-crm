<template>
  <div class="flex h-full flex-col gap-6 px-6 py-8">
    <!-- Header -->
    <div class="flex items-start justify-between gap-4">
      <div class="flex items-center gap-3.5">
        <span
          class="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--crm-chip-blue)] text-[var(--crm-accent-primary)]"
        >
          <LucidePhone class="size-5" />
        </span>
        <div class="flex flex-col gap-1">
          <div class="flex items-center gap-2">
            <h2 class="text-2xl font-semibold leading-none text-ink-gray-9">
              {{ __('Telephony Settings') }}
            </h2>
            <Badge
              v-if="isDirty"
              :label="__('Not Saved')"
              variant="subtle"
              theme="orange"
            />
          </div>
          <p class="text-p-base text-ink-gray-6">
            {{ __('Configure Telephony Settings for your CRM.') }}
          </p>
        </div>
      </div>
      <Button
        v-if="isDirty"
        class="shrink-0"
        :loading="isNewDoc ? insertResource.loading : telephonyAgent.save?.loading"
        :label="__('Update')"
        icon-left="check"
        variant="solid"
        @click="update"
      />
    </div>

    <div v-if="telephonyAgent.doc" class="flex-1 flex flex-col overflow-y-auto">

      <div class="flex items-center justify-between gap-8 py-3 pl-2 pr-1">
        <div class="flex flex-col">
          <div class="text-p-base-medium text-ink-gray-7 truncate">
            {{ __('Default Medium') }}
          </div>
          <div class="text-p-sm text-ink-gray-5">
            {{ __('Default Calling Medium for Logged In User') }}
          </div>
        </div>
        <div class="flex items-center gap-1">
          <FormControl
            v-model="telephonyAgent.doc.default_medium"
            type="select"
            class="w-44 p-1"
            :options="[
              { label: __(''), value: '' },
              { label: __('Twilio'), value: 'Twilio' },
              { label: __('Exotel'), value: 'Exotel' },
            ]"
            :placeholder="__('Select Medium')"
          />
          <Button
            v-if="telephonyAgent.doc.default_medium"
            icon="lucide-x"
            :tooltip="__('Clear')"
            @click="telephonyAgent.doc.default_medium = ''"
          />
        </div>
      </div>
      <div
        v-if="isEnabled('twilio')"
        class="h-px border-t mx-2 border-outline-elevation-2"
      />
      <div
        v-if="isEnabled('twilio')"
        class="flex items-center justify-between gap-8 py-3 pl-2 pr-1"
      >
        <div class="flex flex-col">
          <div class="text-p-base-medium text-ink-gray-7 truncate">
            {{ __('Twilio Number') }}
          </div>
          <div class="text-p-sm text-ink-gray-5">
            {{ __('Set the Twilio number to be used for outgoing calls.') }}
          </div>
        </div>
        <div>
          <FormControl
            v-model="telephonyAgent.doc.twilio_number"
            class="flex-1 truncate w-44 p-1"
            :placeholder="__('Enter Twilio Number')"
            placement="bottom-end"
          />
        </div>
      </div>
      <div
        v-if="isEnabled('exotel')"
        class="h-px border-t mx-2 border-outline-elevation-2"
      />
      <div
        v-if="isEnabled('exotel')"
        class="flex items-center justify-between gap-8 py-3 pl-2 pr-1"
      >
        <div class="flex flex-col">
          <div class="text-p-base-medium text-ink-gray-7 truncate">
            {{ __('Exotel Number') }}
          </div>
          <div class="text-p-sm text-ink-gray-5">
            {{ __('Set the Exotel number to be used for outgoing calls.') }}
          </div>
        </div>
        <div>
          <FormControl
            v-model="telephonyAgent.doc.exotel_number"
            class="flex-1 truncate w-44 p-1"
            :placeholder="__('Enter Exotel Number')"
            placement="bottom-end"
          />
        </div>
      </div>
      <div
        v-if="isEnabled('exotel')"
        class="flex items-center justify-between gap-8 py-3 pl-2 pr-1"
      >
        <div class="flex flex-col">
          <div class="text-p-base-medium text-ink-gray-7 truncate">
            {{ __('Personal Mobile No.') }}
          </div>
          <div class="text-p-sm text-ink-gray-5">
            {{
              __(
                'Enter your personal mobile number used by Exotel to make calls',
              )
            }}
          </div>
        </div>
        <div>
          <FormControl
            v-model="telephonyAgent.doc.mobile_no"
            class="flex-1 truncate w-44 p-1"
            :placeholder="__('Enter Personal Mobile No.')"
            placement="bottom-end"
          />
        </div>
      </div>

      <div
        v-if="isManager()"
        class="flex items-center justify-between text-lg-semibold text-ink-gray-8 mt-4 py-3 px-2"
      >
        {{ __('Integrations') }}
      </div>

      <div
        v-if="isManager()"
        class="flex items-center justify-between py-3 px-2"
      >
        <div class="flex flex-col gap-1">
          <span class="text-base-medium text-ink-gray-8">
            {{ __('Twilio') }}
          </span>
          <span class="text-p-sm text-ink-gray-6">
            {{
              __('Configure your Twilio Telephony Integration Settings here')
            }}
          </span>
        </div>
        <Button
          :label="
            isEnabled('twilio') ? __('Update Configuration') : __('Configure')
          "
          @click="emit('updateStep', 'twilio-settings')"
        />
      </div>

      <div
        v-if="isManager()"
        class="h-px border-t mx-2 border-outline-elevation-2"
      />

      <div
        v-if="isManager()"
        class="flex items-center justify-between py-3 px-2"
      >
        <div class="flex flex-col gap-1">
          <span class="text-base-medium text-ink-gray-8">
            {{ __('Exotel') }}
          </span>
          <span class="text-p-sm text-ink-gray-6">
            {{
              __('Configure your Exotel Telephony Integration Settings here')
            }}
          </span>
        </div>
        <Button
          :label="
            isEnabled('exotel') ? __('Update Configuration') : __('Configure')
          "
          @click="emit('updateStep', 'exotel-settings')"
        />
      </div>
      <ErrorMessage
        :message="isNewDoc ? insertResource.error : telephonyAgent.save?.error"
      />
    </div>
    <div
      v-else
      class="flex-1 flex flex-col gap-3 overflow-y-auto px-2 py-4"
      aria-busy="true"
      aria-label="Loading telephony settings"
    >
      <SkeletonLoader v-for="i in 3" :key="i" type="settings-row" />
    </div>
  </div>
</template>
<script setup>
import LucidePhone from '~icons/lucide/phone'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import {
  FormControl,
  Badge,
  ErrorMessage,
  createResource,
  toast,
} from 'frappe-ui'
import { useTelephony } from '@/composables/telephony'
import { formatError } from '@/utils/formatError'
import { useDocument } from '@/data/document'
import { usersStore } from '@/stores/users'
import { ref, computed } from 'vue'

const { isEnabled } = useTelephony()

const emit = defineEmits(['updateStep'])

const { getUser, isManager } = usersStore()

const isNewDoc = ref(false)

const { document: telephonyAgent } = useDocument(
  'CRM Telephony Agent',
  getUser().name,
  {
    onError: (err) => {
      if (err.exc_type === 'DoesNotExistError') {
        isNewDoc.value = true
        telephonyAgent.doc = {}
        telephonyAgent.originalDoc = {}
      }
    },
  },
)

const insertResource = createResource({
  url: 'frappe.client.insert',
  onSuccess: (data) => {
    isNewDoc.value = false
    telephonyAgent.doc = data
    telephonyAgent.originalDoc = JSON.parse(JSON.stringify(data))
    toast.success(__('Document created successfully'))
  },
  onError: (err) => {
    // `?.forEach` on a missing `messages` is a no-op, so a transport failure
    // showed the user nothing whatsoever — the Save button simply did nothing.
    if (err?.messages?.length) {
      err.messages.forEach((msg) => toast.error(msg))
    } else {
      toast.error(formatError(err, 'Failed to save telephony settings'))
    }
  },
})

function update() {
  if (!isDirty.value) return

  if (isNewDoc.value) {
    insertResource.submit({
      doc: {
        doctype: 'CRM Telephony Agent',
        user: getUser().name,
        ...telephonyAgent.doc,
      },
    })
  } else {
    telephonyAgent.save.submit()
  }
}

const isDirty = computed(() => {
  return (
    telephonyAgent.doc &&
    telephonyAgent.originalDoc &&
    JSON.stringify(telephonyAgent.doc) !==
      JSON.stringify(telephonyAgent.originalDoc)
  )
})
</script>
