<template>
  <CrmDialog
    v-model:open="show"
    size="4xl"
    icon="lucide-layout-list"
    :title="__('Edit Quick Entry Layout')"
    :subtitle="__('Choose which fields appear on the quick create form')"
    footer-align="between"
  >
    <template #header-actions>
      <Badge
        v-if="dirty"
        :label="__('Not Saved')"
        variant="subtle"
        theme="orange"
      />
    </template>

    <div v-if="tabs?.data">
      <FieldLayoutEditor
        v-if="!preview"
        v-model="tabs.data"
        :doctype="_doctype"
        :onlyRequired="onlyRequired"
      />
      <FieldLayout v-else :tabs="tabs.data" :data="{}" :preview="true" />
    </div>

    <!-- Save/Reset used to sit at the top of the body and scroll away with the
         layout; the shell's footer keeps them in reach. -->
    <template #footer>
      <Button
        :label="preview ? __('Hide Preview') : __('Show Preview')"
        @click="preview = !preview"
      />
      <div class="flex gap-2">
        <Button :label="__('Reset')" @click="reload" />
        <Button
          :loading="loading"
          :label="__('Save')"
          variant="solid"
          @click="saveChanges"
        />
      </div>
    </template>
  </CrmDialog>
</template>
<script setup>
import CrmDialog from '@/components/Modals/CrmDialog.vue'
import FieldLayout from '@/components/FieldLayout/FieldLayout.vue'
import FieldLayoutEditor from '@/components/FieldLayoutEditor.vue'
import { useDebounceFn } from '@vueuse/core'
import { useTelemetry } from 'frappe-ui/frappe'
import { Badge, call, createResource } from 'frappe-ui'
import { ref, watch, onMounted, nextTick } from 'vue'

const props = defineProps({
  doctype: { type: String, default: 'CRM Lead' },
  onlyRequired: { type: Boolean, default: false },
})

const { capture } = useTelemetry()

const show = defineModel({ type: Boolean })
const _doctype = ref(props.doctype)
const loading = ref(false)
const dirty = ref(false)
const preview = ref(false)

function getParams() {
  let type = props.onlyRequired ? 'Required Fields' : 'Quick Entry'
  return { doctype: _doctype.value, type }
}

const tabs = createResource({
  url: 'xbr_crm.fcrm.doctype.crm_fields_layout.crm_fields_layout.get_fields_layout',
  cache: ['QuickEntryModal', _doctype.value, props.onlyRequired],
  params: getParams(),
  onSuccess(data) {
    tabs.originalData = JSON.parse(JSON.stringify(data))
  },
})

watch(
  () => tabs?.data,
  () => {
    dirty.value =
      JSON.stringify(tabs?.data) !== JSON.stringify(tabs?.originalData)
  },
  { deep: true },
)

onMounted(() => useDebounceFn(reload, 100)())

function reload() {
  nextTick(() => {
    tabs.params = getParams()
    tabs.reload()
  })
}

function saveChanges() {
  let _tabs = JSON.parse(JSON.stringify(tabs.data))
  _tabs.forEach((tab) => {
    if (!tab.sections) return
    tab.sections.forEach((section) => {
      if (!section.columns) return
      section.columns.forEach((column) => {
        if (!column.fields) return
        column.fields = column.fields.map((field) => field.fieldname)
      })
    })
  })
  loading.value = true
  let type = props.onlyRequired ? 'Required Fields' : 'Quick Entry'
  call(
    'xbr_crm.fcrm.doctype.crm_fields_layout.crm_fields_layout.save_fields_layout',
    {
      doctype: _doctype.value,
      type: type,
      layout: JSON.stringify(_tabs),
    },
  ).then(() => {
    loading.value = false
    show.value = false
    capture('quick_entry_layout_builder', { doctype: _doctype.value })
  })
}
</script>
