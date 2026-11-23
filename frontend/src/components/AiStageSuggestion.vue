<template>
  <div
    v-if="suggested"
    class="crm-ai-suggestion"
    role="status"
    data-testid="ai-suggestion"
  >
    <span class="lucide-sparkles crm-ai-suggestion-icon" aria-hidden="true" />
    <div class="min-w-0 flex-1">
      <div class="crm-ai-suggestion-title">
        {{ __('AI suggests moving to') }}
        <span class="font-semibold text-ink-gray-9">{{
          statusLabel(suggested)
        }}</span>
        <span v-if="confidence" class="crm-ai-suggestion-meta">
          · {{ __('{0}% sure', [confidence]) }}
        </span>
      </div>
      <p
        v-if="doc.ai_suggestion_reason"
        class="crm-ai-suggestion-reason"
        :title="doc.ai_suggestion_reason"
      >
        {{ doc.ai_suggestion_reason }}
      </p>
    </div>
    <div class="flex shrink-0 items-center gap-1.5">
      <Button
        size="sm"
        variant="solid"
        :label="__('Move')"
        :disabled="readonly"
        @click="$emit('accept', suggested)"
      />
      <Button
        size="sm"
        variant="ghost"
        :label="__('Dismiss')"
        :loading="dismissing"
        :disabled="readonly"
        @click="dismiss"
      />
    </div>
  </div>
</template>

<script setup>
/**
 * The stage the AI assistant suggests for a pipeline (xbr_crm/ai/pipeline.py).
 *
 * "Move" hands the stage back to the page, which changes it the same way the
 * stage dropdown does (follow-up date and lost-reason prompts included); the
 * server then records the suggestion as accepted. "Dismiss" settles it here.
 */
import { formatError } from '@/utils/formatError'
import { Button, call, toast } from 'frappe-ui'
import { computed, ref } from 'vue'

const props = defineProps({
  doc: { type: Object, required: true },
  statusLabel: { type: Function, default: (s) => s },
  readonly: { type: Boolean, default: false },
})

const emit = defineEmits(['accept', 'dismissed'])

const suggested = computed(() => {
  const status = props.doc?.ai_suggested_status
  return status && status !== props.doc.status ? status : ''
})

const confidence = computed(() => props.doc?.ai_suggestion_confidence || 0)

const dismissing = ref(false)

async function dismiss() {
  dismissing.value = true
  try {
    await call('xbr_crm.ai.pipeline.dismiss_suggestion', { deal: props.doc.name })
    emit('dismissed')
  } catch (error) {
    toast.error(formatError(error, __('Could not dismiss the suggestion')))
  } finally {
    dismissing.value = false
  }
}
</script>
