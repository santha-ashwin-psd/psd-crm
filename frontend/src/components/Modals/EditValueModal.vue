<template>
  <CrmDialog
    v-model:open="show"
    size="xl"
    icon="edit-3"
    :title="__('Bulk Edit')"
    :subtitle="__('Set one field across {0} selected records', [recordCount])"
  >
    <div class="mb-4">
      <div class="crm-field-label">{{ __('Field') }}</div>
      <Autocomplete
        :value="field.label"
        :options="fields.data"
        :placeholder="__('Source')"
        @change="(e) => changeField(e)"
      />
    </div>
    <div>
      <div class="crm-field-label">{{ __('Value') }}</div>
      <component
        :is="getValueComponent(field)"
        :value="newValue"
        size="md"
        :placeholder="__('Contact Us')"
        @change="(v) => updateValue(v)"
      />
    </div>

    <template #footer>
      <Button
        variant="solid"
        :loading="loading"
        :label="__('Update {0} Records', [recordCount])"
        @click="updateValues"
      />
    </template>
  </CrmDialog>
</template>

<script setup>
import CrmDialog from '@/components/Modals/CrmDialog.vue'
import Link from '@/components/Controls/Link.vue'
import Autocomplete from '@/components/frappe-ui/Autocomplete.vue'
import { useTelemetry } from 'frappe-ui/frappe'
import {
  FormControl,
  call,
  createResource,
  TextEditor,
  DatePicker,
} from 'frappe-ui'
import { ref, computed, onMounted, h } from 'vue'

const typeCheck = ['Check']
const typeLink = ['Link', 'Dynamic Link']
const typeNumber = ['Float', 'Int', 'Currency', 'Percent']
const typeSelect = ['Select']
const typeEditor = ['Text Editor']
const typeDate = ['Date', 'Datetime']

const props = defineProps({
  doctype: { type: String, required: true },
  selectedValues: { type: Set, required: true },
})

const show = defineModel({ type: Boolean })

const emit = defineEmits(['reload'])

const { capture } = useTelemetry()

const fields = createResource({
  url: 'xbr_crm.api.doc.get_fields',
  cache: ['fields', props.doctype],
  params: {
    doctype: props.doctype,
  },
  transform: (data) => {
    return data.filter((f) => f.hidden == 0 && f.read_only == 0)
  },
})

onMounted(() => {
  if (fields.data?.length) return
  fields.fetch()
})

const recordCount = computed(() => props.selectedValues?.size || 0)

const field = ref({
  label: '',
  fieldtype: '',
  fieldname: '',
  options: '',
})

const newValue = ref('')
const loading = ref(false)

/** Blank means the user left the control empty — not that they entered 0. */
function isBlank(value) {
  return value === '' || value === null || value === undefined
}

function updateValues() {
  let fieldVal = newValue.value
  if (field.value.fieldtype == 'Check') {
    fieldVal = fieldVal == 'Yes' ? 1 : 0
  }
  loading.value = true
  call(
    'frappe.desk.doctype.bulk_update.bulk_update.submit_cancel_or_update_docs',
    {
      doctype: props.doctype,
      docnames: Array.from(props.selectedValues),
      action: 'update',
      data: {
        // Only a genuinely blank entry means "clear this field". `|| null`
        // also swallowed 0 and an unticked checkbox, so neither could be set.
        [field.value.fieldname]: isBlank(fieldVal) ? null : fieldVal,
      },
    },
  ).then(() => {
    field.value = {
      label: '',
      fieldtype: '',
      fieldname: '',
      options: '',
    }
    newValue.value = ''
    loading.value = false
    show.value = false
    capture('bulk_update', { doctype: props.doctype })
    emit('reload')
  })
}

function changeField(f) {
  newValue.value = ''
  if (!f) return
  field.value = f
}

function updateValue(v) {
  let value = v.target ? v.target.value : v
  newValue.value = value
}

function getSelectOptions(options) {
  // A Select whose options come from a script has none stored on the field.
  // The third copy of this helper; the other two are in Filter.vue and
  // ConditionsFilter/CFCondition.vue.
  return (options || '').split('\n')
}

function getValueComponent(f) {
  const { fieldtype, options } = f
  if (typeSelect.includes(fieldtype) || typeCheck.includes(fieldtype)) {
    const _options =
      fieldtype == 'Check' ? ['Yes', 'No'] : getSelectOptions(options)
    return h(FormControl, {
      type: 'select',
      options: _options.map((o) => ({
        label: o,
        value: o,
      })),
      modelValue: newValue.value,
    })
  } else if (typeLink.includes(fieldtype)) {
    if (fieldtype == 'Dynamic Link') {
      return h(FormControl, { type: 'text' })
    }
    return h(Link, { class: 'form-control', doctype: options })
  } else if (typeNumber.includes(fieldtype)) {
    return h(FormControl, { type: 'number' })
  } else if (typeDate.includes(fieldtype)) {
    return h(DatePicker)
  } else if (typeEditor.includes(fieldtype)) {
    return h(TextEditor, {
      variant: 'outline',
      editorClass:
        '!prose-sm overflow-auto min-h-[80px] max-h-80 py-1.5 px-2 rounded border border-outline-gray-2 bg-surface-base hover:border-outline-gray-3 hover:shadow-sm focus:bg-surface-base focus:border-outline-gray-4 focus:shadow-sm focus:ring-0 focus-visible:ring-2 focus-visible:ring-outline-gray-3 text-ink-gray-8 transition-colors',
      bubbleMenu: true,
      content: newValue.value,
    })
  } else {
    return h(FormControl, { type: 'text' })
  }
}
</script>
