<template>
  <div
    class="grid py-3.5 px-4 items-center"
    style="grid-template-columns: 3fr 1fr"
  >
    <div class="text-ink-gray-7 font-medium">{{ __(localData.day) }}</div>
    <div class="flex justify-start">
      <Switch v-model="localData.active" @update:model-value="toggleDay" />
    </div>
  </div>
  <hr v-if="!isLast" />
</template>

<script setup>
import { Switch } from 'frappe-ui'
import { inject, reactive } from 'vue'

const assignmentRuleData = inject('assignmentRuleData')

const props = defineProps({
  data: { type: Object, required: true },
  isLast: { type: Boolean, default: false },
})

const localData = reactive(props.data)

const toggleDay = (isActive) => {
  const dayIndex = assignmentRuleData.value.assignmentDays.findIndex(
    (d) => d === localData.day,
  )

  if (isActive) {
    if (dayIndex === -1) {
      assignmentRuleData.value.assignmentDays.push(localData.day)
    }
  } else if (dayIndex !== -1) {
    // The old `else` branch ran even when findIndex returned -1, and
    // `splice(-1, 1)` counts from the end — so switching off a day that was
    // not in the list quietly removed whichever day happened to be last.
    assignmentRuleData.value.assignmentDays.splice(dayIndex, 1)
  }
}
</script>
