<template>
  <!-- One line of a kanban card.
       Every line is the same two-column grid: a fixed 16px gutter, then the
       text. That is the whole point of this component — before it, a row with
       an avatar indented its text by 24px and a row without started flush at
       the card's padding, so a card with a name, an organisation, an email and
       a phone number had its text on two different left edges. The gutter is
       claimed whether or not there is a glyph to put in it, so the column of
       values is straight no matter which fields a view happens to show. -->
  <div v-if="hasValue || title" class="kb-card-row">
    <span class="kb-card-row-icon" aria-hidden="true">
      <IndicatorIcon v-if="fieldName === 'status'" :class="field.color" />
      <Avatar
        v-else-if="fieldName === 'organization' && field.label"
        :image="field.logo"
        :label="field.label"
        size="xs"
      />
      <Avatar
        v-else-if="isPerson && (field.image_label || field.full_name)"
        :image="field.image || field.user_image"
        :label="field.image_label || field.full_name"
        size="xs"
      />
      <EmailAtIcon v-else-if="glyph === 'email'" class="size-4" />
      <PhoneIcon v-else-if="glyph === 'phone'" class="size-4" />
      <DurationIcon v-else-if="glyph === 'time'" class="size-3" />
      <!-- Assignees are an avatar GROUP, so they cannot sit in a 16px gutter
           the way a single avatar does. The gutter names the row instead, and
           the group stays in the value column where it lines up with every
           other value. -->
      <AvatarIcon v-else-if="fieldName === '_assign'" class="size-4" />
    </span>

    <span class="kb-card-row-text" :class="{ 'kb-card-name': title }">
      <Tooltip v-if="glyph === 'time'" :text="field.label">
        <span class="truncate">{{ field.timeAgo }}</span>
      </Tooltip>
      <StatusBadge
        v-else-if="fieldName === 'sla_status'"
        :status="field.value"
        :label="field.value"
      />
      <MultipleAvatar
        v-else-if="fieldName === '_assign'"
        :avatars="field.label"
        size="xs"
      />
      <span v-else-if="hasValue" class="truncate">{{ field.label }}</span>
      <span v-else class="truncate text-ink-gray-4">{{ __('No Title') }}</span>
    </span>
  </div>
</template>

<script setup>
import StatusBadge from '@/components/StatusBadge.vue'
import MultipleAvatar from '@/components/MultipleAvatar.vue'
import IndicatorIcon from '@/components/Icons/IndicatorIcon.vue'
import EmailAtIcon from '@/components/Icons/EmailAtIcon.vue'
import PhoneIcon from '@/components/Icons/PhoneIcon.vue'
import DurationIcon from '@/components/Icons/DurationIcon.vue'
import AvatarIcon from '@/components/Icons/AvatarIcon.vue'
import { Avatar, Tooltip } from 'frappe-ui'
import { computed } from 'vue'

const props = defineProps({
  // The parsed row value: { label, color, logo, image, full_name, timeAgo, … }
  field: { type: Object, default: () => ({}) },
  fieldName: { type: String, required: true },
  // The card's heading line. It renders larger and keeps the "No Title"
  // fallback, which only makes sense for the field a card is named by.
  title: { type: Boolean, default: false },
})

// Fields whose value is a timestamp shown as "2 hours ago", with the real date
// on the tooltip.
const TIME_FIELDS = [
  'modified',
  'creation',
  'first_response_time',
  'first_responded_on',
  'response_by',
]

// The three link fields that carry a person, across Leads and Deals.
const PERSON_FIELDS = ['lead_name', 'lead_owner', 'deal_owner']

const isPerson = computed(() => PERSON_FIELDS.includes(props.fieldName))

const glyph = computed(() => {
  if (TIME_FIELDS.includes(props.fieldName)) return 'time'
  // Matched on the name rather than on a fixed list: a site can add
  // `company_email` or `work_phone` to a kanban view, and the gutter should
  // still say what the value is instead of leaving a hole.
  if (/email/i.test(props.fieldName)) return 'email'
  if (/mobile|phone/i.test(props.fieldName)) return 'phone'
  return ''
})

const hasValue = computed(() => {
  const field = props.field || {}
  // `_assign` is the one field whose label is an ARRAY, and `[]` is truthy —
  // so an unassigned record used to render a row containing nothing at all:
  // zero height, but still claiming the card's row gap, which is why two
  // otherwise identical cards came out 4px different in height.
  if (props.fieldName === '_assign')
    return Array.isArray(field.label) && field.label.length > 0
  if (props.fieldName === 'sla_status') return Boolean(field.value)
  return Boolean(field.label)
})
</script>
