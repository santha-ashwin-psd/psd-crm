<!-- eslint-disable vue/no-v-html -->
<template>
  <CrmDialog
    v-model:open="show"
    size="xl"
    :icon="summary?.type?.icon || 'phone'"
    :title="__('Call Details')"
    :subtitle="summary ? `${__(summary.type.label)} ${__('Call')}` : ''"
    body-class="crm-doc-modal"
  >
    <template #header-actions>
      <Dropdown
        :options="[
          {
            group: __('Options'),
            hideLabel: true,
            items: [
              {
                label: note ? __('Edit Note') : __('Add Note'),
                icon: NoteIcon,
                onClick: () => showNote(note),
              },
              {
                label: task ? __('Edit Task') : __('Add Task'),
                icon: TaskIcon,
                onClick: () => showTask(task),
              },
            ],
          },
        ]"
      >
        <template #default>
          <Button variant="ghost" icon="lucide-more-horizontal" />
        </template>
      </Dropdown>
      <Button
        v-if="!isMobileView"
        variant="ghost"
        :tooltip="__('Edit Call Log')"
        :icon="EditIcon"
        @click="openCallLogModal"
      />
    </template>

    <div class="space-y-4">
      <!-- Caller → Receiver hero -->
      <div
        v-if="summary"
        class="rounded-xl border border-[var(--crm-border)] bg-[var(--crm-surface-2)] px-4 py-5"
      >
        <div class="flex items-center justify-center gap-4">
          <div class="flex min-w-0 flex-col items-center gap-2">
            <Avatar
              :image="summary.caller.image"
              :label="summary.caller.label"
              size="2xl"
            />
            <span
              class="max-w-[130px] truncate text-sm font-medium text-ink-gray-8"
              >{{ summary.caller.label }}</span
            >
          </div>
          <div class="flex flex-col items-center gap-1 text-ink-gray-4">
            <FeatherIcon :name="summary.type.icon" class="size-4" />
            <span class="lucide-arrow-right size-5" aria-hidden="true" />
          </div>
          <div class="flex min-w-0 flex-col items-center gap-2">
            <Avatar
              :image="summary.receiver.image"
              :label="summary.receiver.label"
              size="2xl"
            />
            <span
              class="max-w-[130px] truncate text-sm font-medium text-ink-gray-8"
              >{{ summary.receiver.label }}</span
            >
          </div>
        </div>
        <div
          class="mt-4 flex flex-wrap items-center justify-center gap-2 border-t border-[var(--crm-border)] pt-4"
        >
          <StatusBadge
            :status="summary.status.label"
            :label="summary.status.label"
          />
          <span class="crm-call-chip">
            <FeatherIcon name="clock" class="size-3.5" />
            {{ summary.duration }}
          </span>
          <span class="crm-call-chip">
            <FeatherIcon name="calendar" class="size-3.5" />
            {{ summary.time }}
          </span>
        </div>
      </div>

      <!-- Extra detail rows (reference doc, recording, note, task) -->
      <div
        v-if="extraFields.length"
        class="flex flex-col divide-y divide-[var(--crm-border)] overflow-hidden rounded-xl border border-[var(--crm-border)]"
      >
        <div
          v-for="field in extraFields"
          :key="field.name"
          class="flex items-start gap-3 px-3.5 py-3 text-base text-ink-gray-8"
        >
          <div
            class="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--crm-surface-2)] text-ink-gray-6"
          >
            <component :is="field.icon" />
          </div>
          <div class="flex min-h-8 w-full items-center gap-2">
            <template v-if="field.name == 'recording_url_path'">
              <audio class="audio-control w-full" controls :src="field.value" />
            </template>
            <div
              v-else-if="field.name == 'note'"
              class="w-full cursor-pointer rounded-lg border border-[var(--crm-border)] bg-[var(--crm-surface-2)] px-2.5 py-2 text-sm text-ink-gray-7"
              @click="() => showNote(field.value?.name)"
            >
              <FadedScrollableDiv class="max-h-24 min-h-10 overflow-y-auto">
                <div
                  v-if="field.value?.title"
                  :class="[field.value?.content ? 'mb-1 font-semibold' : '']"
                  v-html="sanitizeHTML(field.value?.title)"
                />
                <div
                  v-if="field.value?.content"
                  v-html="sanitizeHTML(field.value?.content)"
                />
              </FadedScrollableDiv>
            </div>
            <div
              v-else-if="field.name == 'task'"
              class="w-full cursor-pointer rounded-lg border border-[var(--crm-border)] bg-[var(--crm-surface-2)] px-2.5 py-2 text-sm text-ink-gray-7"
              @click="() => showTask(field.value?.name)"
            >
              <FadedScrollableDiv class="max-h-24 min-h-10 overflow-y-auto">
                <div
                  v-if="field.value?.title"
                  :class="[
                    field.value?.description ? 'mb-1 font-semibold' : '',
                  ]"
                  v-html="sanitizeHTML(field.value?.title)"
                />
                <div
                  v-if="field.value?.description"
                  v-html="sanitizeHTML(field.value?.description)"
                />
              </FadedScrollableDiv>
            </div>
            <template v-else>
              <span class="text-ink-gray-8">{{ field.value }}</span>
              <button
                v-if="field.link"
                class="ml-auto grid size-6 place-items-center rounded text-ink-gray-5 hover:bg-[var(--crm-surface-2)] hover:text-ink-gray-8"
                @click="() => field.link()"
              >
                <ArrowUpRightIcon class="size-4" />
              </button>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- v-if on the slot itself, not on a button inside it: the shell renders
         the footer bar only when the slot is actually provided, so a call that
         already has a lead or deal gets no empty bar. -->
    <template
      v-if="isLeadsEnabled() && !callLog?.data?._lead && !callLog?.data?._deal"
      #footer
    >
      <Button variant="solid" :label="__('Create Lead')" @click="createLead" />
    </template>
  </CrmDialog>
</template>

<script setup>
import StatusBadge from '@/components/StatusBadge.vue'
import CrmDialog from '@/components/Modals/CrmDialog.vue'
import EditIcon from '@/components/Icons/EditIcon.vue'
import ArrowUpRightIcon from '@/components/Icons/ArrowUpRightIcon.vue'
import DurationIcon from '@/components/Icons/DurationIcon.vue'
import ContactsIcon from '@/components/Icons/ContactsIcon.vue'
import LeadsIcon from '@/components/Icons/LeadsIcon.vue'
import Dealsicon from '@/components/Icons/DealsIcon.vue'
import CalendarIcon from '@/components/Icons/CalendarIcon.vue'
import NoteIcon from '@/components/Icons/NoteIcon.vue'
import TaskIcon from '@/components/Icons/TaskIcon.vue'
import CheckCircleIcon from '@/components/Icons/CheckCircleIcon.vue'
import FadedScrollableDiv from '@/components/FadedScrollableDiv.vue'
import { getCallLogDetail } from '@/utils/callLog'
import { sanitizeHTML } from '@/utils'
import { isMobileView } from '@/composables/settings'
import { useDoctypeModal } from '@/composables/doctypeModal'
import { useDocument } from '@/data/document'
import { useOnboarding, useTelemetry } from 'frappe-ui/frappe'
import { FeatherIcon, Dropdown, Avatar, call, toast } from 'frappe-ui'
import { ref, computed, h, watch } from 'vue'
import { useRouter } from 'vue-router'
import { isLeadsEnabled } from '@/utils/leads'

const router = useRouter()

const show = defineModel({ type: Boolean })

const callLog = defineModel('callLog', { type: Object })

const { updateOnboardingStep } = useOnboarding('frappecrm')
const { capture } = useTelemetry()
const { showModal } = useDoctypeModal()

const note = ref('')
const task = ref('')

function showNote(name) {
  showModal({
    name,
    doctype: 'FCRM Note',
    title: 'Note',
    callbacks: {
      afterInsert: (d) => addNoteToCallLog(d, true),
      afterUpdate: (d) => addNoteToCallLog(d, false),
    },
  })
}

function showTask(name) {
  showModal({
    name,
    doctype: 'CRM Task',
    title: 'Task',
    defaults: { status: 'Backlog', priority: 'Low' },
    callbacks: {
      afterInsert: (d) => addTaskToCallLog(d, true),
      afterUpdate: (d) => addTaskToCallLog(d, false),
    },
  })
}

async function addNoteToCallLog(_note, isInsert = false) {
  if (isInsert && _note.name) {
    await call('xbr_crm.integrations.api.add_note_to_call_log', {
      call_sid: callLog.value?.data?.id,
      note: _note,
    })
    updateOnboardingStep('create_first_note')
    capture('note_created')
  } else {
    capture('note_updated')
  }
  callLog.value?.reload?.()
}

async function addTaskToCallLog(_task, isInsert = false) {
  if (isInsert && _task.name) {
    await call('xbr_crm.integrations.api.add_task_to_call_log', {
      call_sid: callLog.value?.data?.id,
      task: _task,
    })
    updateOnboardingStep('create_first_task')
    capture('task_created')
  } else {
    capture('task_updated')
  }
  callLog.value?.reload?.()
}

const detailFields = computed(() => {
  if (!callLog.value?.data) return []

  let data = JSON.parse(JSON.stringify(callLog.value?.data))

  for (const key in data) {
    data[key] = getCallLogDetail(key, data)
  }

  // A call linked to a lead has nowhere to go while Leads are switched off.
  const showLead = Boolean(data._lead) && isLeadsEnabled()
  let details = [
    {
      icon: h(FeatherIcon, {
        name: data.type.icon,
        class: 'h-3.5 w-3.5',
      }),
      name: 'type',
      value: data.type.label + ' Call',
    },
    {
      icon: ContactsIcon,
      name: 'receiver',
      value: {
        receiver: data.receiver,
        caller: data.caller,
      },
    },
    {
      icon: showLead ? LeadsIcon : Dealsicon,
      name: 'reference_doc',
      value: showLead ? __('Lead') : __('Deal'),
      link: () => {
        if (showLead) {
          router.push({
            name: 'Lead',
            params: { leadId: data._lead },
          })
        } else {
          router.push({
            name: 'Deal',
            params: { dealId: data._deal },
          })
        }
      },
      // A call linked to a lead has nowhere to go while Leads are switched off.
      condition: () => showLead || data._deal,
    },
    {
      icon: CalendarIcon,
      name: 'creation',
      value: data.creation.label,
      tooltip: data.creation.label,
    },
    {
      icon: DurationIcon,
      name: 'duration',
      value: data.duration.label,
    },
    {
      icon: CheckCircleIcon,
      name: 'status',
      value: data.status.label,
      color: data.status.color,
    },
    {
      icon: h(FeatherIcon, {
        name: 'play-circle',
        class: 'h-4 w-4 mt-2',
      }),
      name: 'recording_url_path',
      value: data.recording_url_path,
    },
    {
      icon: NoteIcon,
      name: 'note',
      value: data._notes?.[0] ?? null,
    },
    {
      icon: TaskIcon,
      name: 'task',
      value: data._tasks?.[0] ?? null,
    },
  ]

  return details
    .filter((detail) => detail.value)
    .filter((detail) => (detail.condition ? detail.condition() : true))
})

// Key call facts surfaced in the hero summary (type / caller / receiver /
// status / time / duration).
const summary = computed(() => {
  if (!callLog.value?.data) return null
  const data = JSON.parse(JSON.stringify(callLog.value.data))
  for (const key in data) data[key] = getCallLogDetail(key, data)
  return {
    type: data.type,
    caller: data.caller,
    receiver: data.receiver,
    status: data.status,
    time: data.creation?.label,
    duration: data.duration?.label,
  }
})

// Everything not already shown in the hero (reference doc, recording, note, task).
const extraFields = computed(() =>
  detailFields.value.filter((f) =>
    ['reference_doc', 'recording_url_path', 'note', 'task'].includes(f.name),
  ),
)

// Call-log status theme name → the `!text-<color>-600` class the status pill
// derives its currentColor tint from.

const d = ref({})
const leadDetails = ref({})

async function createLead() {
  await d.value.triggerOnCreateLead?.(
    callLog.value?.data,
    leadDetails.value,
    () => (show.value = false),
  )

  call('xbr_crm.fcrm.doctype.crm_call_log.crm_call_log.create_lead_from_call_log', {
    call_log: callLog.value?.data,
    lead_details: leadDetails.value,
  })
    .then((d) => {
      if (d) {
        router.push({ name: 'Lead', params: { leadId: d } })
      }
    })
    .catch((err) => {
      toast.error(
        __('Error creating lead: {0}', [err.messages?.[0] || err.message]),
      )
    })
}

function openCallLogModal() {
  showModal({
    name: callLog.value?.data?.name,
    doctype: 'CRM Call Log',
    title: 'Call Log',
    callbacks: {
      afterUpdate: () => {
        callLog.value.reload()
        capture('call_log_updated')
      },
    },
  })
}

watch(
  () => callLog.value?.data,
  (data) => {
    if (!data) return
    const parsed = JSON.parse(JSON.stringify(data))
    note.value = parsed._notes?.[0]?.name ?? null
    task.value = parsed._tasks?.[0]?.name ?? null
  },
  { immediate: true, deep: true },
)

watch(
  () => callLog.value?.data?.name,
  (value) => {
    if (!value) return
    d.value = useDocument('CRM Call Log', value)
  },
)
</script>

<style scoped>
.crm-call-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: var(--crm-radius-pill);
  font-size: 12px;
  font-weight: 600;
  color: var(--crm-text-2);
  background: var(--crm-surface);
  border: 1px solid var(--crm-border);
}

.audio-control {
  height: 36px;
  outline: none;
  border-radius: var(--crm-radius-md);
  cursor: pointer;
  background-color: rgb(237, 237, 237);
}

audio::-webkit-media-controls-panel {
  background-color: rgb(237, 237, 237) !important;
}

.audio-control::-webkit-media-controls-panel {
  background-color: white;
}
</style>
