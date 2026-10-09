// The follow-up stage (FCRM Settings → Follow-ups): asking for the follow-up
// date when a pipeline moves into it, and spotting overdue ones.
import { getSettings } from '@/stores/settings'
import { dayjs } from 'frappe-ui'
import { ref } from 'vue'

const DEFAULT_STAGE = 'Followup'
const DEFAULT_HOUR = 10

// The open prompt, if any: { initial, resolve }. Rendered by FollowUpModal,
// which GlobalModals mounts once for the whole app.
export const followUpPrompt = ref(null)

export function followUpStage() {
  return getSettings().settings?.value?.follow_up_stage || DEFAULT_STAGE
}

export function isFollowUpStage(status) {
  return Boolean(status) && status === followUpStage()
}

// Tomorrow at 10:00, the same default the server uses.
export function defaultFollowUp(now = dayjs()) {
  return now
    .add(1, 'day')
    .hour(DEFAULT_HOUR)
    .minute(0)
    .second(0)
    .format('YYYY-MM-DD HH:mm:ss')
}

export function isFollowUpOverdue(status, nextFollowUp, now = dayjs()) {
  return (
    isFollowUpStage(status) &&
    Boolean(nextFollowUp) &&
    dayjs(nextFollowUp).isBefore(now)
  )
}

// Ask for a follow-up date and note. Resolves with
// { next_follow_up, follow_up_note }, or null if the user cancels.
export function askFollowUp(initial = {}) {
  return new Promise((resolve) => {
    followUpPrompt.value = { initial, resolve }
  })
}
