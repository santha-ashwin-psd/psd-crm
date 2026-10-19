<template>
  <CrmDialog
    v-model:open="show"
    size="sm"
    icon="lucide-circle-x"
    theme="red"
    footer-align="between"
    :title="__('Lost Reason')"
    :subtitle="
      __('Please provide a reason for marking this {0} as lost', [
        doctype.toLowerCase().replace('crm ', ''),
      ])
    "
    @close="cancel"
  >
    <template #default>
      <div class="flex flex-col gap-3">
        <div>
          <div class="crm-field-label">
            {{ __('Lost Reason') }}
            <span class="text-[var(--crm-danger-text)]">*</span>
          </div>
          <Link
            ref="linkRef"
            class="form-control flex-1 truncate"
            :value="lostReason"
            doctype="CRM Lost Reason"
            :onCreate="onCreate"
            @change="(v) => (lostReason = v)"
          />
        </div>
        <div>
          <div class="crm-field-label">
            {{ __('Lost Notes') }}
            <span v-if="lostReason == 'Other'" class="text-[var(--crm-danger-text)]">*</span>
          </div>
          <FormControl
            class="form-control flex-1 truncate"
            type="textarea"
            :value="lostNotes"
            @change="(e) => (lostNotes = e.target.value)"
          />
        </div>
      </div>
    </template>
    <template #footer>
      <ErrorMessage :message="error" />
      <div class="flex gap-2">
        <Button :label="__('Cancel')" @click="cancel" />
        <Button variant="solid" :label="__('Save')" @click="save" />
      </div>
    </template>
  </CrmDialog>
</template>
<script setup>
import CrmDialog from '@/components/Modals/CrmDialog.vue'
import Link from '@/components/Controls/Link.vue'
import { createDocument } from '@/composables/document'
import { ref } from 'vue'

const props = defineProps({
  doctype: { type: String, default: 'CRM Lead' },
  document: { type: Object, required: true },
})

const show = defineModel({ type: Boolean })

const linkRef = ref(null)
const doc = props.document.doc
const lostReason = ref(doc.lost_reason || '')
const lostNotes = ref(doc.lost_notes || '')
const error = ref('')

function cancel() {
  show.value = false
  error.value = ''
  lostReason.value = ''
  lostNotes.value = ''
  doc.status = props.document.originalDoc.status
}

function save() {
  if (!lostReason.value) {
    error.value = __('Lost Reason is required')
    return
  }
  if (lostReason.value === 'Other' && !lostNotes.value) {
    error.value = __('Lost Notes are required when Lost Reason is "Other"')
    return
  }

  error.value = ''
  show.value = false

  doc.lost_reason = lostReason.value
  doc.lost_notes = lostNotes.value
  props.document.save.submit()
}

function onCreate(value, close) {
  let doc = { lost_reason: value }
  createDocument('CRM Lost Reason', doc, close, (doc) => {
    lostReason.value = doc.name
    linkRef.value?.reload('', true)
  })
}
</script>
