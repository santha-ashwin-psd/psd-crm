<template>
  <CrmDialog
    v-model:open="show"
    :size="dialogSize"
    icon="lucide-square-pen"
    :title="__(title)"
    body-class="crm-doc-modal"
    @close="handleCancel"
  >
    <div v-if="resolvedTabs">
      <FieldLayout
        :tabs="resolvedTabs"
        :data="localDoc"
        :doctype="doctype || ''"
        :context="fieldLayoutContext"
      />
      <ErrorMessage class="mt-2" :message="error" />
    </div>
    <div v-else-if="loading" class="py-8 text-center text-ink-gray-5">
      {{ __('Loading...') }}
    </div>

    <template #footer>
      <!-- Reversed so the first action (Submit) lands rightmost, as before. -->
      <div class="flex flex-row-reverse gap-3">
        <Button
          v-for="(action, idx) in resolvedActions"
          :key="action.label + idx"
          class="min-w-28"
          :label="__(action.label)"
          :variant="action.variant"
          :theme="action.theme"
          :icon="action.icon"
          :loading="action.loading"
          @click="action.onClick"
        />
      </div>
    </template>
  </CrmDialog>
</template>

<script setup>
import CrmDialog from '@/components/Modals/CrmDialog.vue'
import FieldLayout from '@/components/FieldLayout/FieldLayout.vue'
import { clampDialogSize } from '@/components/Modals/crmDialogTheme'
import { findMissingMandatory } from '@/utils/fieldTransforms'
import { getMeta } from '@/stores/meta'
import { ErrorMessage, createResource } from 'frappe-ui'
import { ref, reactive, computed, watch } from 'vue'

const props = defineProps({
  title: { type: String, default: 'Dialog' },
  doctype: { type: String, default: '' },
  tabs: { type: Array, default: null },
  fields: { type: Array, default: null },
  fieldnames: { type: Array, default: null },
  defaults: { type: Object, default: () => ({}) },
  required: { type: Array, default: () => [] },
  size: { type: String, default: 'xl' },
  actions: { type: Array, default: null },
  onSubmit: { type: Function, default: null },
  onCancel: { type: Function, default: null },
  submitLabel: { type: String, default: 'Submit' },
  cancelLabel: { type: String, default: null },
})

const emit = defineEmits(['resolve'])

const show = ref(true)
const error = ref('')
const loading = ref(false)
let resolved = false

// Callers hand this any frappe-ui size, so it has to be pulled onto the
// 3-step scale rather than passed through.
const dialogSize = computed(() => clampDialogSize(props.size))

function submit(result) {
  if (resolved) return
  resolved = true
  emit('resolve', result)
}

function cancel() {
  if (resolved) return
  resolved = true
  props.onCancel?.()
  emit('resolve', null)
}

const localDoc = reactive({ ...props.defaults })

const fieldLayoutContext = reactive({
  fieldPropertyOverrides: {},
  fieldHtmlMap: {},
})

// ── Layout resolution ──
// Priority: tabs > fields > doctype+fieldnames > doctype (Quick Entry)

function wrapFieldsInTab(fields) {
  return [
    {
      name: '_tab',
      label: '',
      sections: [
        {
          name: '_section',
          label: '',
          columns: [{ name: '_column', fields }],
        },
      ],
    },
  ]
}

function applyRequiredFlags(tabs, requiredFieldnames) {
  if (!requiredFieldnames || requiredFieldnames.length === 0) return tabs
  const reqSet = new Set(requiredFieldnames)
  return tabs.map((tab) => ({
    ...tab,
    sections: (tab.sections || []).map((section) => ({
      ...section,
      columns: (section.columns || []).map((column) => ({
        ...column,
        fields: (column.fields || []).map((field) =>
          reqSet.has(field.fieldname) ? { ...field, reqd: 1 } : field,
        ),
      })),
    })),
  }))
}

const fetchedTabs = ref(null)

if (props.tabs || props.fields) {
  // Static layout — nothing to fetch
} else if (props.doctype && props.fieldnames) {
  loading.value = true
  const { doctypeMeta } = getMeta(props.doctype)
  watch(
    doctypeMeta,
    (meta) => {
      if (!meta) return
      const fields = props.fieldnames
        .map((fn) => {
          const f = meta.fields.find((field) => field.fieldname === fn)
          return f ? { ...f } : null
        })
        .filter(Boolean)
      fetchedTabs.value = wrapFieldsInTab(fields)
      loading.value = false
    },
    { immediate: true },
  )
} else if (props.doctype) {
  loading.value = true
  createResource({
    url: 'crm.fcrm.doctype.crm_fields_layout.crm_fields_layout.get_fields_layout',
    params: { doctype: props.doctype, type: 'Quick Entry' },
    auto: true,
    onSuccess: (data) => {
      fetchedTabs.value = data
      loading.value = false
    },
    onError: () => {
      loading.value = false
      error.value = __('Failed to load fields layout')
    },
  })
}

const resolvedTabs = computed(() => {
  let tabs = props.tabs || (props.fields ? wrapFieldsInTab(props.fields) : null)
  if (!tabs) tabs = fetchedTabs.value
  if (!tabs) return null
  return applyRequiredFlags(tabs, props.required)
})

// ── Validation ──

function validate() {
  error.value = ''
  const allFields = []
  for (const tab of resolvedTabs.value || []) {
    for (const sec of tab.sections || []) {
      for (const col of sec.columns || []) {
        for (const f of col.fields || []) allFields.push(f)
      }
    }
  }

  let doctypesMeta = {}
  if (props.doctype) {
    doctypesMeta = getMeta(props.doctype)?.doctypesMeta || {}
  }

  const missing = findMissingMandatory(allFields, localDoc, {
    propertyOverrides: fieldLayoutContext.fieldPropertyOverrides,
    doctypesMeta,
  })
  if (missing.length > 0) {
    error.value = __('Mandatory fields required: {0}', [missing.join(', ')])
    return false
  }
  return true
}

// ── Close handlers ──

function handleCancel() {
  show.value = false
  cancel()
}

// Catches overlay click / escape key close
watch(show, (val) => {
  if (!val) cancel()
})

// ── Actions ──

const actionLoadingMap = reactive({})

const resolvedActions = computed(() => {
  // Custom actions — full control, onSubmit ignored
  if (props.actions) {
    return props.actions.map((action, idx) => ({
      label: action.label || '',
      variant: action.variant,
      theme: action.theme,
      icon: action.icon,
      loading: actionLoadingMap[idx] || false,
      onClick: async () => {
        if (action.onClick) {
          actionLoadingMap[idx] = true
          try {
            await action.onClick({
              data: { ...localDoc },
              close: (result) => {
                show.value = false
                submit(result !== undefined ? result : { ...localDoc })
              },
              validate,
            })
          } finally {
            actionLoadingMap[idx] = false
          }
        } else {
          // Action without onClick — default: validate + close
          if (!validate()) return
          show.value = false
          submit({ ...localDoc })
        }
      },
    }))
  }

  // Default buttons — Submit (always) + Cancel (if cancelLabel provided)
  const buttons = [
    {
      label: props.submitLabel,
      variant: 'solid',
      loading: actionLoadingMap[0] || false,
      onClick: async () => {
        if (!validate()) return
        const data = { ...localDoc }
        if (props.onSubmit) {
          actionLoadingMap[0] = true
          try {
            await props.onSubmit(data)
          } catch (e) {
            error.value = e.message || __('An error occurred')
            return // stay open
          } finally {
            actionLoadingMap[0] = false
          }
        }
        show.value = false
        submit(data)
      },
    },
  ]

  if (props.cancelLabel) {
    buttons.push({
      label: props.cancelLabel,
      loading: false,
      onClick: () => {
        show.value = false
        cancel()
      },
    })
  }

  return buttons
})
</script>
