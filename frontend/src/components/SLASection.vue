<template>
  <div class="flex flex-col gap-1.5 border-b sm:px-6 py-3 px-4">
    <div
      v-for="s in slaSection"
      :key="s.label"
      class="flex items-center gap-2 text-base leading-5"
    >
      <!-- Same label column as SidePanelLayout: this block sits directly above
           it in the record panel, so a different width, weight or colour here
           reads as two unrelated lists. The old `w-[106px]` + `truncate` also
           cut "First Response Due" down to "First Respo…"; wrapping to a
           second line says the whole field name instead. -->
      <div
        class="w-[42%] min-w-24 shrink-0 flex items-start gap-1.5 py-1 text-sm font-semibold leading-snug text-ink-gray-8"
      >
        <FeatherIcon
          :name="s.label === 'Status' ? 'activity' : 'clock'"
          class="size-3.5 shrink-0 mt-0.5 text-[var(--crm-accent-primary)]"
        />
        <span class="break-words">{{ __(s.label) }}</span>
      </div>
      <div class="grid min-h-[28px] items-center">
        <Tooltip v-if="s.tooltipText" :text="__(s.tooltipText)">
          <div class="ml-2 cursor-pointer">
            <Badge
              v-if="s.type == 'Badge'"
              class="-ml-1"
              :label="s.value"
              variant="subtle"
              :theme="s.color"
            />
            <div v-else>{{ s.value }}</div>
          </div>
        </Tooltip>
        <Dropdown v-if="s.type == 'Select'" :options="s.options">
          <template #default="{ open }">
            <Button
              class="form-control bg-surface-base hover:bg-surface-base"
              :label="s.value"
              :iconRight="open ? 'chevron-up' : 'chevron-down'"
            >
              <template #prefix>
                <span
                  class="size-2 shrink-0 rounded-full"
                  :style="{ background: statusDotColor(s.value) }"
                />
              </template>
            </Button>
          </template>
        </Dropdown>
      </div>
    </div>
  </div>
</template>
<script setup>
import { Dropdown, Tooltip, FeatherIcon } from 'frappe-ui'
import { timeAgo, formatDate, formatTime } from '@/utils'
import { statusesStore } from '@/stores/statuses'
import { useTelemetry } from 'frappe-ui/frappe'
import { computed } from 'vue'

const data = defineModel({ type: Object, default: () => ({}) })
const emit = defineEmits(['updateField'])

const { communicationStatuses } = statusesStore()
const { capture } = useTelemetry()

// Dot beside the communication status. Open/replied read as healthy, paused or
// closed as neutral — mirrors how the status pills are coloured elsewhere.
function statusDotColor(status) {
  const s = (status || '').toLowerCase()
  if (/open|replied|active/.test(s)) return 'var(--crm-success)'
  if (/hold|paused|waiting|pending/.test(s)) return 'var(--crm-warning)'
  if (/closed|resolved|done/.test(s)) return 'var(--crm-text-4)'
  return 'var(--crm-accent-primary)'
}

let slaSection = computed(() => {
  let sections = []
  let status = data.value.sla_status
  let tooltipText = status
  let color =
    data.value.sla_status == 'Failed'
      ? 'red'
      : data.value.sla_status == 'Fulfilled'
        ? 'green'
        : 'orange'
  let respondedOn =
    data.value.last_responded_on || data.value.first_responded_on
  let responseTime =
    data.value.last_response_time || data.value.first_response_time

  if (status == 'First Response Due' || status == 'Rolling Response Due') {
    status = timeAgo(data.value.response_by)
    if (status == 'just now') {
      status = 'In less than a minute'
    }
    tooltipText = formatDate(data.value.response_by)
    if (new Date(data.value.response_by) < new Date()) {
      color = 'red'
      if (status == __('In less than a minute')) {
        status = 'less than a minute ago'
      }
    }
  } else if (['Fulfilled', 'Failed'].includes(status)) {
    status = __(status) + ' in ' + formatTime(responseTime)
    tooltipText = formatDate(respondedOn)
  }

  let responseType = 'First Response'

  if (
    Boolean(data.value.first_responded_on) &&
    Boolean(data.value.last_responded_on) &&
    (data.value.sla_status != 'Fulfilled' ||
      data.value.first_responded_on != data.value.last_responded_on)
  ) {
    responseType = 'Rolling Response'
  }

  sections.push(
    ...[
      {
        label: responseType,
        type: 'Badge',
        value: __(status),
        tooltipText: tooltipText,
        color: color,
      },
      {
        label: 'Status',
        value: data.value.communication_status,
        type: 'Select',
        options: communicationStatuses.data?.map((status) => ({
          label: status.name,
          value: status.name,
          onClick: () => {
            capture('sla_status_change')
            emit('updateField', 'communication_status', status.name)
          },
        })),
      },
    ],
  )
  return sections
})
</script>

<style scoped>
:deep(.form-control button) {
  border-color: transparent;
  background: transparent;
}
</style>
