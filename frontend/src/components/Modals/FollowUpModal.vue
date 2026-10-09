<template>
  <CrmDialog
    v-model:open="open"
    size="sm"
    icon="calendar"
    :title="__('When will you follow up?')"
    :subtitle="
      __('A task with an email and in-app reminder is created for the owner.')
    "
  >
    <div class="flex flex-col gap-4">
      <div class="flex flex-col gap-1.5">
        <span class="text-xs text-ink-gray-5">{{
          __('Follow-up date and time')
        }}</span>
        <DateTimePicker
          :value="when"
          :placeholder="__('Pick a date and time')"
          @change="(v) => (when = v)"
        />
        <div class="flex flex-wrap gap-1.5">
          <Button
            v-for="choice in quickChoices"
            :key="choice.label"
            size="sm"
            :label="choice.label"
            @click="when = choice.value()"
          />
        </div>
        <p v-if="error" class="text-xs text-ink-red-4" role="alert">
          {{ error }}
        </p>
      </div>
      <FormControl
        v-model="note"
        type="textarea"
        :rows="3"
        :label="__('What is the follow-up about? (optional)')"
        :placeholder="__('e.g. Call back about the fee structure')"
      />
    </div>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <Button :label="__('Cancel')" @click="finish(null)" />
        <Button variant="solid" :label="__('Save')" @click="save" />
      </div>
    </template>
  </CrmDialog>
</template>

<script setup>
import CrmDialog from '@/components/Modals/CrmDialog.vue'
import { followUpPrompt, defaultFollowUp } from '@/composables/followUp'
import { DateTimePicker, FormControl, dayjs } from 'frappe-ui'
import { computed, ref } from 'vue'

const initial = followUpPrompt.value?.initial || {}
const when = ref(initial.next_follow_up || defaultFollowUp())
const note = ref(initial.follow_up_note || '')
const error = ref('')

const at = (days, hour = 10) =>
  dayjs()
    .add(days, 'day')
    .hour(hour)
    .minute(0)
    .second(0)
    .format('YYYY-MM-DD HH:mm:ss')

const quickChoices = [
  { label: __('Tomorrow 10 AM'), value: () => at(1) },
  { label: __('In 3 days'), value: () => at(3) },
  { label: __('Next week'), value: () => at(7) },
]

// Closing the dialog any other way (Esc, the ×) counts as Cancel.
const open = computed({
  get: () => Boolean(followUpPrompt.value),
  set: (value) => {
    if (!value) finish(null)
  },
})

function save() {
  if (!when.value) {
    error.value = __('Choose when you will follow up')
    return
  }
  if (dayjs(when.value).isBefore(dayjs())) {
    error.value = __('Choose a time in the future')
    return
  }
  finish({
    next_follow_up: dayjs(when.value).format('YYYY-MM-DD HH:mm:ss'),
    follow_up_note: note.value.trim(),
  })
}

function finish(result) {
  const prompt = followUpPrompt.value
  followUpPrompt.value = null
  prompt?.resolve(result)
}

defineExpose({ save, finish, when, note, error })
</script>
