<template>
  <CrmDialog
    v-model:open="show"
    size="4xl"
    icon="lucide-panel-right"
    :title="__('Edit Field Layout')"
    :subtitle="__('Arrange the sections shown in the detail side panel')"
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
    <template #default>
      <div class="flex flex-col gap-5.5">
        <div v-if="tabs.data?.[0]?.sections" class="flex gap-4">
          <SidePanelLayoutEditor
            v-model="tabs.data[0].sections"
            class="flex flex-1 flex-col pr-2"
            :doctype="_doctype"
          />
          <div v-if="preview" class="flex flex-1 flex-col border rounded">
            <SidePanelLayout
              v-slot="{ section }"
              :sections="tabs.data[0].sections"
              :doctype="_doctype"
              docname=""
              :preview="true"
            >
              <div
                v-if="section.name == 'contacts_section'"
                class="flex h-16 items-center justify-center text-base text-ink-gray-5"
              >
                {{ __('No Contacts Added') }}
              </div>
            </SidePanelLayout>
          </div>
          <div
            v-else
            class="flex flex-1 justify-center items-center text-ink-gray-5 bg-surface-gray-2 rounded"
          >
            {{ __('Toggle on for Preview') }}
          </div>
        </div>
      </div>
    </template>

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
import SidePanelLayout from '@/components/SidePanelLayout.vue'
import SidePanelLayoutEditor from '@/components/SidePanelLayoutEditor.vue'
import { useDebounceFn } from '@vueuse/core'
import { useTelemetry } from 'frappe-ui/frappe'
import { Badge, call, createResource } from 'frappe-ui'
import { ref, watch, onMounted, nextTick } from 'vue'

const props = defineProps({
  doctype: { type: String, default: 'CRM Lead' },
})

const emit = defineEmits(['reload'])

const { capture } = useTelemetry()

const show = defineModel({ type: Boolean })
const _doctype = ref(props.doctype)
const loading = ref(false)
const dirty = ref(false)
const preview = ref(false)

function getParams() {
  return { doctype: _doctype.value, type: 'Side Panel' }
}

const tabs = createResource({
  url: 'crm.fcrm.doctype.crm_fields_layout.crm_fields_layout.get_fields_layout',
  cache: ['SidePanel', _doctype.value],
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
  // Save carries no :disabled binding, so an unconfigured doctype can reach
  // here with an empty layout. Every level is guarded, matching DataFieldsModal
  // and QuickEntryModal.
  if (!_tabs?.length) return
  _tabs.forEach((tab) => {
    if (!tab.sections) return
    tab.sections.forEach((section) => {
      if (!section.columns) return
      section.columns.forEach((column) => {
        if (!column.fields) return
        column.fields = column.fields
          .map((field) => field.fieldname)
          .filter(Boolean)
      })
    })
  })
  loading.value = true
  call(
    'crm.fcrm.doctype.crm_fields_layout.crm_fields_layout.save_fields_layout',
    {
      doctype: _doctype.value,
      type: 'Side Panel',
      layout: JSON.stringify(_tabs[0].sections),
    },
  ).then(() => {
    loading.value = false
    show.value = false
    capture('side_panel_layout_builder', { doctype: _doctype.value })
    emit('reload')
  })
}
</script>
