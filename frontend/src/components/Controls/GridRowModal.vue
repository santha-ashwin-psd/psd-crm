<template>
  <CrmDialog
    v-model:open="show"
    size="4xl"
    icon="lucide-table"
    :title="__('Editing Row {0}', [index + 1])"
    body-class="crm-doc-modal"
  >
    <template #header-actions>
      <Button
        v-if="isManager()"
        :tooltip="__('Edit Fields Layout')"
        variant="ghost"
        :icon="EditIcon"
        @click="openGridRowFieldsModal"
      />
    </template>

    <FieldLayout
      v-if="tabs.data"
      :tabs="tabs.data"
      :data="data"
      :doctype="doctype"
      :isGridRow="true"
    />
  </CrmDialog>
</template>

<script setup>
import CrmDialog from '@/components/Modals/CrmDialog.vue'
import EditIcon from '@/components/Icons/EditIcon.vue'
import FieldLayout from '@/components/FieldLayout/FieldLayout.vue'
import { usersStore } from '@/stores/users'
import { createResource } from 'frappe-ui'
import { nextTick, provide } from 'vue'

const props = defineProps({
  index: { type: Number, default: 0 },
  data: { type: Object, default: () => ({}) },
  doctype: { type: String, default: '' },
  parentDoctype: { type: String, default: '' },
  parentFieldname: { type: String, default: '' },
})

const { isManager } = usersStore()

provide('parentFieldname', props.parentFieldname)

const show = defineModel({ type: Boolean })
const showGridRowFieldsModal = defineModel('showGridRowFieldsModal', {
  type: Boolean,
})

const tabs = createResource({
  url: 'crm.fcrm.doctype.crm_fields_layout.crm_fields_layout.get_fields_layout',
  cache: ['Grid Row', props.doctype, props.parentDoctype],
  params: {
    doctype: props.doctype,
    type: 'Grid Row',
    parent_doctype: props.parentDoctype,
  },
  auto: true,
})

function openGridRowFieldsModal() {
  showGridRowFieldsModal.value = true
  nextTick(() => (show.value = false))
}
</script>
