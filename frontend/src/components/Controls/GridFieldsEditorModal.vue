<template>
  <CrmDialog
    v-model:open="show"
    size="xl"
    icon="lucide-list-ordered"
    :title="__('Edit Grid Fields Layout')"
    :subtitle="__('Reorder the columns and set their widths')"
  >
    <!-- The unsaved marker sits opposite the title rather than beside it: the
         shell's title truncates, so a badge inline with it would be clipped. -->
    <template #header-actions>
      <Badge
        v-if="dirty"
        :label="__('Not Saved')"
        variant="subtle"
        theme="orange"
      />
    </template>
    <template #default>
      <div>
        <div class="crm-field-label">
          {{ __('Fields Order') }}
        </div>
        <Draggable
          v-if="oldFields?.length"
          :list="fields"
          group="fields"
          item-key="fieldname"
          class="flex flex-col gap-1"
        >
          <template #item="{ element: field }">
            <div
              class="px-1 py-0.5 bg-surface-gray-2 border border-outline-elevation-2 rounded text-base text-ink-gray-8 flex items-center justify-between gap-2"
            >
              <div class="flex items-center gap-2">
                <DragVerticalIcon class="h-3.5 cursor-grab" />
                <div>{{ field.label }}</div>
              </div>
              <div class="flex items-center gap-2">
                <TextInput
                  v-model="field.columns"
                  variant="outline"
                  type="number"
                  class="w-20"
                />
                <Button
                  variant="ghost"
                  icon="lucide-x"
                  @click="removeField(field)"
                />
              </div>
            </div>
          </template>
        </Draggable>
        <Autocomplete
          v-if="dropdownFields?.length"
          value=""
          :options="dropdownFields"
          @change="(e) => addField(e)"
        >
          <template #target="{ togglePopover }">
            <Button
              class="w-full mt-2"
              :label="__('Add Field')"
              iconLeft="plus"
              @click="togglePopover()"
            />
          </template>
          <template #item-label="{ option }">
            <div class="flex flex-col gap-1 text-ink-gray-9">
              <div>{{ option.label }}</div>
              <div class="text-ink-gray-4 text-sm">
                {{ `${option.fieldname} - ${option.fieldtype}` }}
              </div>
            </div>
          </template>
        </Autocomplete>
        <ErrorMessage v-if="error" class="mt-3" :message="error" />
      </div>
    </template>
    <template #footer>
      <Button v-if="dirty" :label="__('Reset')" @click="reset" />
      <Button
        :label="__('Save')"
        variant="solid"
        :loading="loading"
        :disabled="!dirty"
        @click="update"
      />
    </template>
  </CrmDialog>
</template>
<script setup>
import CrmDialog from '@/components/Modals/CrmDialog.vue'
import DragVerticalIcon from '@/components/Icons/DragVerticalIcon.vue'
import Autocomplete from '@/components/frappe-ui/Autocomplete.vue'
import { getMeta } from '@/stores/meta'
import Draggable from 'vuedraggable'
import { ErrorMessage } from 'frappe-ui'
import { ref, computed } from 'vue'

const props = defineProps({
  doctype: { type: String, default: '' },
  parentDoctype: { type: String, default: '' },
})

const restrictedFieldTypes = [
  'Section Break',
  'Column Break',
  'Tab Break',
  'Table',
  'Table MultiSelect',
  'Image',
]

const { getFields, getGridViewSettings, saveUserSettings } = getMeta(
  props.doctype,
)

const show = defineModel({ type: Boolean })

const loading = ref(false)
const error = ref(null)

const dirty = computed(() => {
  return JSON.stringify(fields.value) !== JSON.stringify(oldFields.value)
})

const oldFields = computed(() => {
  let _fields =
    getFields({ restrictNoValueFields: false, restrictedFieldTypes }) || []
  if (!_fields.length) return []

  let gridViewSettings = getGridViewSettings(props.parentDoctype)

  if (gridViewSettings.length) {
    // A saved grid view can name a field that no longer exists — renamed or
    // deleted since. The map yields `undefined` for those, and every later
    // consumer reads `.fieldname` off the entry, so one stale name took the
    // whole modal down. Drop them instead.
    return gridViewSettings
      .map((field) => {
        let f = _fields.find((f) => f.fieldname === field.fieldname)
        if (f) {
          f.columns = field.columns
          return fieldObj(f)
        }
      })
      .filter(Boolean)
  }
  return _fields?.filter((field) => field.in_list_view).map((f) => fieldObj(f))
})

const fields = ref(JSON.parse(JSON.stringify(oldFields.value || [])))

const dropdownFields = computed(() => {
  const _fields =
    getFields({ restrictNoValueFields: false, restrictedFieldTypes }) || []
  if (!_fields.length) return []

  return _fields.filter(
    (field) => !fields.value.find((f) => f.fieldname === field.fieldname),
  )
})

function reset() {
  fields.value = JSON.parse(JSON.stringify(oldFields.value || []))
}

function addField(field) {
  fields.value.push(fieldObj(field))
}

function removeField(field) {
  const index = fields.value.findIndex((f) => f.fieldname === field.fieldname)
  fields.value.splice(index, 1)
}

function update() {
  let updateFields = fields.value.map((field) => {
    return {
      fieldname: field.fieldname,
      columns: field.columns,
    }
  })

  if (updateFields.length === 0) {
    error.value = __('At least one field is required')
    return
  }

  // Set after the guard, not before it: the early return above left the Save
  // button spinning for good, with no way to dismiss it but reopening.
  loading.value = true

  saveUserSettings(props.parentDoctype, 'GridView', updateFields, () => {
    loading.value = false
    show.value = false
  })
}

function fieldObj(field) {
  return {
    label: field.label,
    fieldname: field.fieldname,
    fieldtype: field.fieldtype,
    options: field.options,
    in_list_view: field.in_list_view,
    columns: field.columns || 2,
  }
}
</script>
