<template>
  <div class="crm-pipeline" role="group" :aria-label="__('Deal stage')">
    <!-- Terminal outcome (Won / Lost). Once a deal is closed the progression
         is history, so the outcome is stated plainly rather than drawn as a
         track with five greyed-out steps behind it. -->
    <template v-if="outcome">
      <span class="crm-pipeline-outcome" :class="toneClass(current)">
        <FeatherIcon
          :name="outcome === 'Won' ? 'award' : 'x-circle'"
          class="size-4"
        />
        {{ statusLabel(current) }}
      </span>
      <span class="crm-pipeline-outcome-note">
        {{ __('Closed at stage {0} of {1}', [reachedIndex + 1, track.length]) }}
      </span>
      <button
        v-if="!readonly"
        type="button"
        class="crm-pipeline-reopen"
        @click="$emit('change', track[track.length - 1]?.name)"
      >
        {{ __('Reopen') }}
      </button>
    </template>

    <!-- Live progression. Each step is a button, so the pipeline is also how
         you move the deal — the dropdown is not the only way to change stage. -->
    <template v-else>
      <button
        v-for="(stage, i) in track"
        :key="stage.name"
        type="button"
        class="crm-pipeline-step"
        :class="{
          'is-done': i < reachedIndex,
          'is-current': i === reachedIndex,
          'is-readonly': readonly,
        }"
        :aria-current="i === reachedIndex ? 'step' : undefined"
        :disabled="readonly"
        :title="__('Move to {0}', [statusLabel(stage.name)])"
        @click="$emit('change', stage.name)"
      >
        <span class="crm-pipeline-step-label">{{
          statusLabel(stage.name)
        }}</span>
      </button>
    </template>
  </div>
</template>

<script setup>
/**
 * The stage progression for a record whose statuses form a pipeline.
 *
 * Reads the stages from the data rather than hardcoding them: `CRM Deal Status`
 * is a user-editable doctype ordered by `position`, and each row carries a
 * `type` of Open / Ongoing / Won / Lost. Only the non-terminal stages form the
 * track; Won and Lost are outcomes, not steps, so a closed deal shows its
 * outcome instead of a track with two extra boxes bolted on the end.
 *
 * On this site that yields:
 *   Qualification → Demo/Making → Proposal/Quotation → Negotiation →
 *   Ready to Close        (then Won or Lost as an outcome)
 *
 * Kept generic and free of Deal-specific imports so a second record type with
 * ordered statuses can use it, but it is deliberately NOT wired into Lead in
 * this pass — that page is not in scope.
 */
import { toneClass } from '@/utils/statusTheme'
import { FeatherIcon } from 'frappe-ui'
import { computed } from 'vue'

const props = defineProps({
  /** All statuses, each `{ name, position, type, color }`, any order. */
  statuses: { type: Array, default: () => [] },
  /** The record's current status value. */
  current: { type: String, default: '' },
  /** Translate a status name for display. */
  statusLabel: { type: Function, default: (s) => s },
  /** Render without click-to-change (no permission, or a read-only view). */
  readonly: { type: Boolean, default: false },
})

defineEmits(['change'])

/** Terminal types keep their own presentation. */
const TERMINAL = ['Won', 'Lost']

/** The ordered, non-terminal stages — the track itself. */
const track = computed(() =>
  [...(props.statuses || [])]
    .filter((s) => s?.name && !TERMINAL.includes(s.type))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
)

/** `'Won'` / `'Lost'` when the deal is closed, else `''`. */
const outcome = computed(() => {
  const type = (props.statuses || []).find(
    (s) => s.name === props.current,
  )?.type
  return TERMINAL.includes(type) ? type : ''
})

/**
 * How far along the track the record has got.
 *
 * A closed deal has no position on the track, so it reports the final step —
 * which is what the "closed at stage N of M" note reads. An unrecognised
 * status reports -1, leaving every step un-highlighted rather than wrongly
 * marking the first one as current.
 */
const reachedIndex = computed(() => {
  if (outcome.value) return track.value.length - 1
  return track.value.findIndex((s) => s.name === props.current)
})
</script>
