<template>
  <EventModal
    v-if="showEventModal"
    v-model="showEventModal"
    :event="activeEvent"
    :doctype="doctype"
    :docname="doc?.name"
  />
</template>
<script setup>
import EventModal from '@/components/Modals/EventModal.vue'
import { showEventModal, activeEvent } from '@/composables/event'
import { useDoctypeModal } from '@/composables/doctypeModal'
import { formatError } from '@/utils/formatError'
import { useOnboarding, useTelemetry } from 'frappe-ui/frappe'
import { call, toast } from 'frappe-ui'
import { useRoute, useRouter } from 'vue-router'

const props = defineProps({
  doctype: { type: String, default: '' },
  doc: { type: Object, default: () => ({}) },
})

const activities = defineModel({ type: Object })

const { showModal } = useDoctypeModal()
const { updateOnboardingStep } = useOnboarding('frappecrm')
const { capture } = useTelemetry()

// Event
function showEvent(e) {
  showEventModal.value = true
  activeEvent.value = e
}

// Tasks
function showTask(task) {
  // props.doc is a computed over the document resource, so it is `{}` until
  // the record loads. Without this, clicking New before it resolved inserted a
  // row with reference_docname = NULL — an orphan that shows as unlinked
  // everywhere and cannot be traced back. One already exists in the wild.
  if (!props.doc?.name) {
    toast.warning(__('Still loading — try again in a moment.'))
    return
  }

  showModal({
    name: task?.name,
    doctype: 'CRM Task',
    title: 'Task',
    defaults: {
      reference_doctype: props.doctype,
      reference_docname: props.doc?.name,
    },
    callbacks: {
      afterInsert: (d) => afterDoctype(d, true),
      afterUpdate: afterDoctype,
    },
  })
}

async function deleteTask(name) {
  // Unguarded before: a refused delete rejected into nothing and the task
  // stayed on screen with no explanation.
  try {
    await call('frappe.client.delete', {
      doctype: 'CRM Task',
      name,
    })
    activities.value.reload()
  } catch (e) {
    toast.error(formatError(e, 'Could not delete the task'))
  }
}

function updateTaskStatus(status, task) {
  call('frappe.client.set_value', {
    doctype: 'CRM Task',
    name: task.name,
    fieldname: 'status',
    value: status,
  })
    .then(() => {
      activities.value.reload()
    })
    .catch((e) => {
      // Without this the status silently snapped back on the next reload.
      toast.error(formatError(e, 'Could not update the task status'))
    })
}

// Notes
function showNote(note) {
  // props.doc is a computed over the document resource, so it is `{}` until
  // the record loads. Without this, clicking New before it resolved inserted a
  // row with reference_docname = NULL — an orphan that shows as unlinked
  // everywhere and cannot be traced back. One already exists in the wild.
  if (!props.doc?.name) {
    toast.warning(__('Still loading — try again in a moment.'))
    return
  }

  showModal({
    name: note?.name,
    doctype: 'FCRM Note',
    title: 'Note',
    defaults: {
      reference_doctype: props.doctype,
      reference_docname: props.doc?.name,
    },
    callbacks: {
      afterInsert: (d) => afterDoctype(d, true),
      afterUpdate: afterDoctype,
    },
  })
}

function afterDoctype(d, isInsert = false) {
  activities.value.reload()

  let name =
    d.doctype == 'FCRM Note'
      ? 'note'
      : d.doctype == 'CRM Task'
        ? 'task'
        : 'call_log'

  let redirectHash = name + 's'
  if (d.doctype == 'CRM Call Log') {
    redirectHash = 'calls'
  }

  if (isInsert) {
    updateOnboardingStep('create_first_' + name)
    capture(name + '_created')
  } else {
    capture(name + '_updated')
  }

  redirect(redirectHash)
}

// Call Logs
function createCallLog() {
  // props.doc is a computed over the document resource, so it is `{}` until
  // the record loads. Without this, clicking New before it resolved inserted a
  // row with reference_docname = NULL — an orphan that shows as unlinked
  // everywhere and cannot be traced back. One already exists in the wild.
  if (!props.doc?.name) {
    toast.warning(__('Still loading — try again in a moment.'))
    return
  }

  showModal({
    doctype: 'CRM Call Log',
    title: 'Call Log',
    defaults: {
      reference_doctype: props.doctype,
      reference_docname: props.doc?.name,
      reference_doc: { ...props.doc },
    },
    callbacks: {
      afterInsert: (d) => afterDoctype(d, true),
      afterUpdate: afterDoctype,
    },
  })
}

// common
const route = useRoute()
const router = useRouter()

function redirect(tabName) {
  if (route.name == 'Lead' || route.name == 'Deal') {
    let hash = '#' + tabName
    if (route.hash != hash) {
      router.push({ ...route, hash })
    }
  }
}

defineExpose({
  showEvent,
  showTask,
  deleteTask,
  updateTaskStatus,
  showNote,
  createCallLog,
})
</script>
