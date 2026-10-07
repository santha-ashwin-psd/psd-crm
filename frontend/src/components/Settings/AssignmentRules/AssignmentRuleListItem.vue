<template>
  <div class="crm-settings-row cursor-pointer">
    <!-- Name + Description -->
    <div class="flex-1 min-w-0" @click="updateStep('view', data)">
      <div class="truncate text-base font-semibold text-ink-gray-9">
        {{ data.name }}
      </div>
      <div
        v-if="data.description && data.description.length > 0"
        class="mt-0.5 truncate text-sm text-ink-gray-6"
      >
        {{ data.description }}
      </div>
    </div>

    <!-- Priority picker -->
    <div class="w-36 shrink-0">
      <select
        v-model="localData.priority"
        class="rule-select"
        @update:modelValue="onPriorityChange"
        @change="onPriorityChange"
      >
        <option
          v-for="option in priorityOptions"
          :key="option.value"
          :value="option.value"
        >
          {{ option.label }}
        </option>
      </select>
    </div>

    <!-- Enabled toggle + overflow menu -->
    <div class="crm-col-toggle">
      <Switch
        size="sm"
        :modelValue="!data.disabled"
        @update:modelValue="onToggle"
      />
    </div>
    <div class="crm-col-menu">
      <Dropdown placement="right" :options="dropdownOptions">
        <Button
          icon="lucide-more-horizontal"
          variant="ghost"
          @click="isConfirmingDelete = false"
        />
      </Dropdown>
    </div>
  </div>
  <CrmDialog
    v-model:open="duplicateDialog.show"
    size="sm"
    icon="copy"
    :title="__('Duplicate Assignment Rule')"
  >
    <div class="flex flex-col gap-4">
      <FormControl
        v-model="duplicateDialog.name"
        :label="__('New Assignment Rule Name')"
        type="text"
      />
    </div>
    <template #footer>
      <Button
        variant="subtle"
        :label="__('Close')"
        @click="duplicateDialog.show = false"
      />
      <Button variant="solid" :label="__('Duplicate')" @click="duplicate()" />
    </template>
  </CrmDialog>
</template>

<script setup>
import CrmDialog from '@/components/Modals/CrmDialog.vue'
import {
  Button,
  createResource,
  Dropdown,
  FormControl,
  Switch,
  toast,
} from 'frappe-ui'
import { useTelemetry } from 'frappe-ui/frappe'
import { inject, ref, reactive, watch } from 'vue'
import { ConfirmDelete } from '../../../utils'

const { capture } = useTelemetry()

const assignmentRulesList = inject('assignmentRulesList')
const updateStep = inject('updateStep')

const props = defineProps({
  data: { type: Object, required: true },
})

const localData = reactive({ ...props.data })
watch(
  () => props.data,
  (val) => Object.assign(localData, val),
  { deep: true },
)

const priorityOptions = [
  { label: 'Low', value: '0' },
  { label: 'Low-Medium', value: '1' },
  { label: 'Medium', value: '2' },
  { label: 'Medium-High', value: '3' },
  { label: 'High', value: '4' },
]

const duplicateDialog = ref({
  show: false,
  name: '',
})

const isConfirmingDelete = ref(false)

const deleteAssignmentRule = () => {
  createResource({
    url: 'frappe.client.delete',
    params: {
      doctype: 'Assignment Rule',
      name: props.data.name,
    },
    onSuccess: () => {
      assignmentRulesList.reload()
      isConfirmingDelete.value = false
      toast.success(__('Assignment Rule Deleted'))
    },
    auto: true,
  })
}

const dropdownOptions = [
  {
    label: __('Duplicate'),
    onClick: () => {
      duplicateDialog.value = {
        show: true,
        name: props.data.name + ' (Copy)',
      }
    },
    icon: 'copy',
  },
  ...ConfirmDelete({
    onConfirmDelete: () => deleteAssignmentRule(),
    isConfirmingDelete,
  }),
]

const duplicate = () => {
  createResource({
    url: 'xbr_crm.api.assignment_rule.duplicate_assignment_rule',
    params: {
      docname: props.data.name,
      new_name: duplicateDialog.value.name,
    },
    onSuccess: (data) => {
      assignmentRulesList.reload()
      toast.success(__('Assignment Rule Duplicated'))
      duplicateDialog.value.show = false
      duplicateDialog.value.name = ''
      updateStep('view', data)
    },
    auto: true,
  })
}

const onPriorityChange = () => {
  setAssignmentRuleValue('priority', localData.priority)
}

const onToggle = () => {
  if (!props.data.users_exists && props.data.disabled) {
    toast.error(__('Cannot enable rule without adding users in it'))
    return
  }
  capture('assignment_rule_toggled', { enabled: Boolean(props.data.disabled) })
  setAssignmentRuleValue('disabled', !props.data.disabled, 'status')
}

const setAssignmentRuleValue = (key, value, fieldName = undefined) => {
  createResource({
    url: 'frappe.client.set_value',
    params: {
      doctype: 'Assignment Rule',
      name: props.data.name,
      fieldname: key,
      value: value,
    },
    onSuccess: () => {
      assignmentRulesList.reload()
      toast.success(__('Assignment Rule {0} Updated', [fieldName || key]))
    },
    auto: true,
  })
}
</script>

<style scoped>
.rule-select {
  width: 100%;
  height: 38px;
  padding: 0 8px;
  border-radius: var(--crm-radius-md);
  border: 1px solid var(--crm-settings-border);
  background: var(--crm-surface);
  font-size: 13px;
  font-weight: 500;
  color: var(--crm-text-2);
  outline: none;
  transition: border-color 0.15s var(--crm-ease);
}
.rule-select:hover {
  border-color: var(--crm-border-strong);
}
.rule-select:focus {
  border-color: var(--crm-accent-primary);
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
}
:deep([data-slot='control'][data-state='checked']) {
  background-color: var(--crm-accent-primary) !important;
}
</style>
