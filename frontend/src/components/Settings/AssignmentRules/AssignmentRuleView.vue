<template>
  <div
    v-if="!getAssignmentRuleData.loading"
    class="flex flex-col h-full gap-6 px-6 py-8 text-ink-gray-8"
  >
    <div class="flex justify-between px-2 w-full">
      <div class="flex items-center gap-2">
        <div class="flex min-w-0 items-start gap-3">
          <button
            class="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg text-ink-gray-7 transition hover:bg-[var(--crm-surface-2)]"
            :aria-label="__('Go back')"
            @click="goBack()"
          >
            <FeatherIcon name="arrow-left" class="size-4" />
          </button>
          <div class="flex min-w-0 flex-col gap-1">
            <h2 class="truncate text-2xl font-semibold leading-none text-ink-gray-9">
              {{ 
            assignmentRuleData.assignmentRuleName || __('New Assignment Rule')
           }}
            </h2>
            <p class="text-p-base text-ink-gray-6">{{ __('Assignment rule details and conditions.') }}</p>
          </div>
        </div>
        <Badge
          v-if="isDirty"
          :variant="'subtle'"
          :theme="'orange'"
          size="sm"
          :label="__('Not Saved')"
        />
      </div>
      <div class="flex gap-4">
        <div
          class="flex items-center justify-between gap-2 h-7"
          @click="assignmentRuleData.disabled = !assignmentRuleData.disabled"
        >
          <Switch size="sm" :model-value="!assignmentRuleData.disabled" />
          <span class="text-sm text-ink-gray-7">{{ __('Enabled') }}</span>
        </div>
        <Button
          :disabled="Boolean(!isDirty && step.data)"
          :label="__('Save')"
          theme="gray"
          variant="solid"
          :loading="isLoading || getAssignmentRuleData.loading"
          @click="saveAssignmentRule()"
        />
      </div>
    </div>
    <div class="overflow-y-auto px-2">
      <div class="grid grid-cols-2 gap-5">
        <div>
          <FormControl
            v-model="assignmentRuleData.assignmentRuleName"
            :type="'text'"
            size="sm"
            variant="subtle"
            :placeholder="__('Name')"
            :label="__('Name')"
            required
            maxlength="50"
            @change="validateAssignmentRule('assignmentRuleName')"
          />
          <ErrorMessage
            :message="assignmentRuleErrors.assignmentRuleName"
            class="mt-2"
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <FormLabel :label="__('Priority')" />
          <Popover>
            <template #target="{ togglePopover }">
              <div
                data-slot="trigger"
                class="flex items-center justify-between text-base rounded h-7 py-1.5 pl-2 pr-2 border border-outline-gray-2 bg-surface-gray-2 placeholder-ink-gray-4 hover:border-outline-elevation-2 hover:bg-surface-gray-3 focus:bg-surface-base focus:border-outline-gray-4 focus:shadow-sm focus:ring-0 focus-visible:ring-2 focus-visible:ring-outline-gray-3 text-ink-gray-8 transition-colors w-full dark:[color-scheme:dark] cursor-default"
                @click="togglePopover()"
              >
                <div>
                  {{
                    priorityOptions.find(
                      (option) => option.value == assignmentRuleData.priority,
                    )?.label
                  }}
                </div>
                <span class="lucide-chevron-down size-4" aria-hidden="true" />
              </div>
            </template>
            <template #body="{ togglePopover }">
              <div
                class="p-1 text-ink-gray-6 top-1 absolute bg-[var(--crm-surface)] shadow-2xl rounded w-[--reka-popper-anchor-width]"
              >
                <div
                  v-for="option in priorityOptions"
                  :key="option.value"
                  class="p-2 cursor-pointer hover:bg-surface-gray-1 text-base flex items-center justify-between rounded"
                  @click="
                    () => {
                      assignmentRuleData.priority = option.value
                      togglePopover()
                    }
                  "
                >
                  {{ option.label }}
                  <span
                    v-if="assignmentRuleData.priority == option.value"
                    class="lucide-check size-4"
                    aria-hidden="true"
                  />
                </div>
              </div>
            </template>
          </Popover>
        </div>
        <div>
          <FormControl
            v-model="assignmentRuleData.description"
            :type="'textarea'"
            size="sm"
            variant="subtle"
            :placeholder="__('Description')"
            :label="__('Description')"
            required
            maxlength="250"
            @change="validateAssignmentRule('description')"
          />
          <ErrorMessage
            :message="assignmentRuleErrors.description"
            class="mt-2"
          />
        </div>
        <div class="flex flex-col gap-1.5">
          <FormLabel :label="__('Apply On')" />
          <Select
            v-model="assignmentRuleData.documentType"
            :options="[
              {
                label: 'Lead',
                value: 'CRM Lead',
              },
              {
                label: 'Deal',
                value: 'CRM Deal',
              },
            ]"
          />
        </div>
      </div>
      <hr class="my-8" />
      <div>
        <div class="flex flex-col gap-1">
          <span class="text-lg-semibold text-ink-gray-8">{{
            __('Assignment Condition')
          }}</span>
          <div class="flex items-center justify-between gap-6">
            <span class="text-p-sm text-ink-gray-6">
              {{
                __('Choose which {0} are affected by this assignment rule.', [
                  documentType,
                ])
              }}
              <a
                class="font-medium underline"
                href="https://docs.frappe.io/crm/assignment-rule"
                target="_blank"
                >{{ __('Learn about conditions') }}</a
              >
            </span>
            <div v-if="isOldSla && step.data">
              <Popover trigger="hover" :hoverDelay="0.25" placement="top-end">
                <template #target>
                  <div
                    class="text-sm text-ink-gray-6 flex gap-1 cursor-default text-nowrap items-center"
                  >
                    <span>{{ __('Old Condition') }}</span>
                    <span class="lucide-info size-4" aria-hidden="true" />
                  </div>
                </template>
                <template #body-main>
                  <div
                    class="text-sm text-ink-gray-6 p-2 bg-[var(--crm-surface)] rounded-md max-w-96 text-wrap whitespace-pre-wrap leading-5"
                  >
                    <code>{{ assignmentRuleData.assignCondition }}</code>
                  </div>
                </template>
              </Popover>
            </div>
          </div>
        </div>
        <div class="mt-5">
          <div
            v-if="!useNewUI && assignmentRuleData.assignCondition"
            class="flex flex-col gap-3 items-center text-center text-ink-gray-7 text-sm mb-2 border border-outline-gray-2 rounded-md p-3 py-4"
          >
            <span class="text-p-sm">
              {{ __('Conditions for this rule were created from') }}
              <a :href="deskUrl" target="_blank" class="underline">{{
                __('desk')
              }}</a>
              {{
                __(
                  'which are not compatible with this UI, you will need to recreate the conditions here if you want to manage and add new conditions from this UI.',
                )
              }}
            </span>
            <Button
              :label="__('I understand, Add Conditions')"
              variant="subtle"
              theme="gray"
              @click="useNewUI = true"
            />
          </div>
          <AssignmentRulesSection
            v-else
            :conditions="assignmentRuleData.assignConditionJson"
            name="assignCondition"
            :errors="assignmentRuleErrors.assignConditionError"
            :doctype="assignmentRuleData.documentType"
          />
          <div class="flex justify-end">
            <ErrorMessage
              :message="assignmentRuleErrors.assignCondition"
              class="mt-2"
            />
          </div>
        </div>
      </div>
      <hr class="my-8" />
      <div>
        <div class="flex flex-col gap-1">
          <span class="text-lg-semibold text-ink-gray-8">{{
            __('Unassignment Condition')
          }}</span>
          <div class="flex items-center justify-between gap-6">
            <span class="text-p-sm text-ink-gray-6">
              {{
                __(
                  'Choose which {0} are affected by this un-assignment rule.',
                  [documentType],
                )
              }}
              <a
                class="font-medium underline"
                href="https://docs.frappe.io/crm/assignment-rule"
                target="_blank"
                >{{ __('Learn about conditions') }}</a
              >
            </span>
            <div
              v-if="
                isOldSla && step.data && assignmentRuleData.unassignCondition
              "
            >
              <Popover trigger="hover" :hoverDelay="0.25" placement="top-end">
                <template #target>
                  <div
                    class="text-sm text-ink-gray-6 flex gap-1 cursor-default text-nowrap items-center"
                  >
                    <span> {{ __('Old Condition') }} </span>
                    <span class="lucide-info size-4" aria-hidden="true" />
                  </div>
                </template>
                <template #body-main>
                  <div
                    class="text-sm text-ink-gray-6 p-2 bg-[var(--crm-surface)] rounded-md max-w-96 text-wrap whitespace-pre-wrap leading-5"
                  >
                    <code>{{ assignmentRuleData.unassignCondition }}</code>
                  </div>
                </template>
              </Popover>
            </div>
          </div>
        </div>
        <div class="mt-5">
          <div
            v-if="!useNewUI && assignmentRuleData.unassignCondition"
            class="flex flex-col gap-3 items-center text-center text-ink-gray-7 text-sm mb-2 border border-outline-gray-2 rounded-md p-3 py-4"
          >
            <span class="text-p-sm">
              {{ __('Conditions for this rule were created from') }}
              <a :href="deskUrl" target="_blank" class="underline">
                {{ __('desk') }}
              </a>
              {{
                __(
                  'which are not compatible with this UI, you will need to recreate the conditions here if you want to manage and add new conditions from this UI.',
                )
              }}
            </span>
            <Button
              :label="__('I understand, Add Conditions')"
              variant="subtle"
              theme="gray"
              @click="useNewUI = true"
            />
          </div>
          <AssignmentRulesSection
            v-else
            :conditions="assignmentRuleData.unassignConditionJson"
            name="unassignCondition"
            :errors="assignmentRuleErrors.unassignConditionError"
            :doctype="assignmentRuleData.documentType"
          />
        </div>
      </div>
      <hr class="my-8" />
      <div>
        <div class="flex flex-col gap-1">
          <span class="text-lg-semibold text-ink-gray-8">{{
            __('Assignment Schedule')
          }}</span>
          <span class="text-p-sm text-ink-gray-6">
            {{
              __('Choose the days of the week when this rule should be active.')
            }}
          </span>
        </div>
        <div class="mt-6">
          <AssignmentSchedule />
        </div>
      </div>
      <hr class="my-8" />
      <AssigneeRules />
    </div>
  </div>
  <div v-else class="flex items-center h-full justify-center">
    <LoadingIndicator class="w-4" />
  </div>
  <!-- Was frappe-ui's ConfirmDialog, which renders a single full-width confirm
       button and leaves cancelling to the corner X. Both prompts here are
       warnings the user should be able to back out of deliberately. -->
  <CrmDialog
    v-model:open="showConfirmDialog.show"
    size="sm"
    icon="lucide-triangle-alert"
    theme="amber"
    :title="showConfirmDialog.title"
  >
    <p class="text-p-base text-ink-gray-7">{{ showConfirmDialog.message }}</p>
    <template #footer>
      <Button
        :label="__('Cancel')"
        @click="showConfirmDialog.show = false"
      />
      <Button
        variant="solid"
        :label="__('Confirm')"
        @click="showConfirmDialog.onConfirm"
      />
    </template>
  </CrmDialog>
</template>

<script setup>
import {
  FeatherIcon,
  Badge,
  Button,
  call,
  createResource,
  ErrorMessage,
  FormControl,
  FormLabel,
  LoadingIndicator,
  Popover,
  Select,
  Switch,
  toast,
} from 'frappe-ui'
import { useTelemetry } from 'frappe-ui/frappe'
import {
  onMounted,
  onUnmounted,
  ref,
  inject,
  watch,
  provide,
  computed,
} from 'vue'
import CrmDialog from '@/components/Modals/CrmDialog.vue'
import AssignmentRulesSection from './AssignmentRulesSection.vue'
import AssignmentSchedule from './AssignmentSchedule.vue'
import AssigneeRules from './AssigneeRules.vue'
import { globalStore } from '@/stores/global'
import { disableSettingModalOutsideClick } from '@/composables/settings'
import { convertToConditions, validateConditions } from '@/utils'
import { formatError } from '@/utils/formatError'

const isDirty = ref(false)
const initialData = ref(null)
const isLoading = ref(false)
const updateStep = inject('updateStep')
const { capture } = useTelemetry()
const step = inject('step')
const { $dialog } = globalStore()

const showConfirmDialog = ref({
  show: false,
  title: '',
  message: '',
  onConfirm: () => {},
})
const useNewUI = ref(true)
const isOldSla = ref(false)
const documentType = computed(() =>
  assignmentRuleData.value.documentType == 'CRM Lead'
    ? __('leads')
    : __('deals'),
)
const deskUrl = `${window.location.origin}/app/assignment-rule/${step.value.data?.name}`

const defaultAssignmentDays = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]

const assignmentRuleData = ref({
  assignCondition: '',
  unassignCondition: '',
  assignConditionJson: [],
  unassignConditionJson: [],
  rule: 'Round Robin',
  priority: 1,
  users: [],
  disabled: false,
  description: '',
  name: '',
  assignmentRuleName: '',
  assignmentDays: defaultAssignmentDays,
  documentType: 'CRM Lead',
})

const validateAssignmentRule = (key, skipConditionCheck = false) => {
  const validateField = (field) => {
    if (key && field !== key) return

    switch (field) {
      case 'assignmentRuleName':
        // `?.length == 0` is only true for an empty string: a null or missing
        // name gives `undefined == 0`, which is false, so the rule validated
        // clean and could be saved with no name at all. The `?.` shows null was
        // expected here; the comparison just did not act on it.
        if (!assignmentRuleData.value.assignmentRuleName?.length) {
          assignmentRuleErrors.value.assignmentRuleName = __('Name is required')
        } else {
          assignmentRuleErrors.value.assignmentRuleName = ''
        }
        break
      case 'description':
        assignmentRuleErrors.value.description =
          assignmentRuleData.value.description?.length > 0
            ? ''
            : __('Description is required')
        break
      case 'assignCondition':
        if (skipConditionCheck) {
          break
        }
        assignmentRuleErrors.value.assignCondition =
          assignmentRuleData.value.assignConditionJson?.length > 0
            ? ''
            : __('Assign Condition is required')

        if (!validateConditions(assignmentRuleData.value.assignConditionJson)) {
          assignmentRuleErrors.value.assignConditionError = __(
            'Assign Conditions are invalid',
          )
        } else {
          assignmentRuleErrors.value.assignConditionError = ''
        }

        break
      case 'unassignCondition':
        if (skipConditionCheck) {
          break
        }
        if (
          assignmentRuleData.value.unassignConditionJson?.length > 0 &&
          !validateConditions(assignmentRuleData.value.unassignConditionJson)
        ) {
          assignmentRuleErrors.value.unassignConditionError = __(
            'Unassign Conditions are invalid',
          )
        } else {
          assignmentRuleErrors.value.unassignConditionError = ''
        }
        break
      case 'users':
        assignmentRuleErrors.value.users =
          assignmentRuleData.value.users?.length > 0
            ? ''
            : __('Users are required')
        break
      case 'assignmentDays':
        assignmentRuleErrors.value.assignmentDays =
          assignmentRuleData.value.assignmentDays?.length > 0
            ? ''
            : __('Assignment Days are required')
        break
      default:
        break
    }
  }

  if (key) {
    validateField(key)
  } else {
    Object.keys(assignmentRuleErrors.value).forEach(validateField)
  }

  return assignmentRuleErrors.value
}

const resetAssignmentRuleData = () => {
  assignmentRuleData.value = {
    assignCondition: '',
    unassignCondition: '',
    assignConditionJson: [],
    unassignConditionJson: [],
    rule: 'Round Robin',
    priority: 1,
    users: [],
    disabled: false,
    description: '',
    name: '',
    assignmentRuleName: '',
    assignmentDays: defaultAssignmentDays,
    documentType: 'CRM Lead',
  }
}

const assignmentRuleErrors = ref({
  assignmentRuleName: '',
  assignCondition: '',
  assignConditionError: '',
  unassignConditionError: '',
  users: '',
  description: '',
  assignmentDays: '',
})

const resetAssignmentRuleErrors = () => {
  Object.keys(assignmentRuleErrors.value).forEach((key) => {
    assignmentRuleErrors.value[key] = ''
  })
}

provide('assignmentRuleData', assignmentRuleData)
provide('assignmentRuleErrors', assignmentRuleErrors)
provide('validateAssignmentRule', validateAssignmentRule)
provide('resetAssignmentRuleData', resetAssignmentRuleData)
provide('resetAssignmentRuleErrors', resetAssignmentRuleErrors)

const getAssignmentRuleData = createResource({
  url: 'frappe.client.get',
  params: {
    doctype: 'Assignment Rule',
    name: step.value.data?.name,
  },
  auto: Boolean(step.value.data),
  onSuccess(data) {
    assignmentRuleData.value = {
      assignCondition: data.assign_condition,
      unassignCondition: data.unassign_condition,
      assignConditionJson: JSON.parse(data.assign_condition_json || '[]'),
      unassignConditionJson: JSON.parse(data.unassign_condition_json || '[]'),
      rule: data.rule,
      priority: data.priority,
      users: data.users,
      disabled: data.disabled,
      description: data.description,
      name: data.name,
      assignmentRuleName: data.name,
      assignmentDays: data.assignment_days.map((day) => day.day),
      documentType: data.document_type,
    }

    initialData.value = JSON.stringify(assignmentRuleData.value)

    const conditionsAvailable =
      assignmentRuleData.value.assignCondition?.length > 0
    const conditionsJsonAvailable =
      assignmentRuleData.value.assignConditionJson?.length > 0

    if (conditionsAvailable && !conditionsJsonAvailable) {
      useNewUI.value = false
      isOldSla.value = true
    } else {
      useNewUI.value = true
      isOldSla.value = false
    }
  },
})

if (!step.value.data) {
  initialData.value = JSON.stringify(assignmentRuleData.value)
}

const goBack = () => {
  if (isDirty.value && !showConfirmDialog.value.show) {
    $dialog({
      title: __('Unsaved Changes'),
      message: __(
        'Are you sure you want to go back? Unsaved changes will be lost.',
      ),
      variant: 'solid',
      actions: [
        {
          label: __('Go Back'),
          variant: 'solid',
          onClick: (close) => {
            updateStep('list', null)
            close()
          },
        },
      ],
    })
    return
  }
  updateStep('list', null)
  showConfirmDialog.value.show = false
}

const saveAssignmentRule = () => {
  const validationErrors = validateAssignmentRule(undefined, !useNewUI.value)
  const expandedErrors = Object.keys(validationErrors)
    .filter((key) => validationErrors[key])
    .map((key) => {
      const fieldLabels = {
        assignmentRuleName: __('Name'),
        description: __('Description'),
        assignCondition: __('Assignment Condition'),
        assignConditionError: __('Assignment Condition'),
        unassignConditionError: __('Unassignment Condition'),
        users: __('Users'),
        assignmentDays: __('Assignment Days'),
      }
      return {
        key,
        message: validationErrors[key],
        label: fieldLabels[key] || key,
      }
    })

  if (expandedErrors.length > 0) {
    let missingFields = expandedErrors
      .filter((e) => e.message.toLowerCase().includes('required'))
      .map((e) => e.label)
    let invalidFields = expandedErrors
      .filter((e) => !e.message.toLowerCase().includes('required'))
      .map((e) => e.label)

    let message = ''
    if (missingFields.length > 0) {
      message = __('Missing mandatory fields: {0}', [missingFields.join(', ')])
    }
    if (!missingFields.length && invalidFields.length > 0) {
      message = __('Invalid fields: {0}', [invalidFields.join(', ')])
    }
    toast.error(message)
    return
  }
  if (step.value.data) {
    if (isOldSla.value && useNewUI.value) {
      showConfirmDialog.value = {
        show: true,
        title: __('Confirm Overwrite'),
        message: __(
          'Your old condition will be overwritten. Are you sure you want to save?',
        ),
        onConfirm: () => {
          updateAssignmentRule()
          showConfirmDialog.value.show = false
        },
      }
      return
    }
    updateAssignmentRule()
  } else {
    createAssignmentRule()
  }
}

const createAssignmentRule = () => {
  isLoading.value = true
  createResource({
    url: 'frappe.client.insert',
    params: {
      doc: {
        doctype: 'Assignment Rule',
        document_type: assignmentRuleData.value.documentType,
        rule: assignmentRuleData.value.rule,
        priority: assignmentRuleData.value.priority,
        users: assignmentRuleData.value.users,
        disabled: assignmentRuleData.value.disabled,
        description: assignmentRuleData.value.description,
        assignment_days: assignmentRuleData.value.assignmentDays.map((day) => ({
          day: day,
        })),
        name: assignmentRuleData.value.assignmentRuleName,
        assignment_rule_name: assignmentRuleData.value.assignmentRuleName,
        assign_condition: convertToConditions({
          conditions: assignmentRuleData.value.assignConditionJson,
        }),
        unassign_condition: convertToConditions({
          conditions: assignmentRuleData.value.unassignConditionJson,
        }),
        assign_condition_json: JSON.stringify(
          assignmentRuleData.value.assignConditionJson,
        ),
        unassign_condition_json: JSON.stringify(
          assignmentRuleData.value.unassignConditionJson,
        ),
      },
    },
    auto: true,
    onSuccess(data) {
      getAssignmentRuleData
        .submit({
          doctype: 'Assignment Rule',
          name: data.name,
        })
        .then(() => {
          isLoading.value = false
          capture('assignment_rule_created', {
            doctype: assignmentRuleData.value.documentType,
          })
          toast.success(__('Assignment Rule Created'))
        })
      updateStep('view', data)
    },
    onError: () => {
      isLoading.value = false
    },
  })
}

const priorityOptions = [
  { label: 'Low', value: '0' },
  { label: 'Low-Medium', value: '1' },
  { label: 'Medium', value: '2' },
  { label: 'Medium-High', value: '3' },
  { label: 'High', value: '4' },
]

const updateAssignmentRule = async () => {
  isLoading.value = true
  // The catch blocks below handle their errors but do not stop the function, so
  // a refused save used to run on and report "Assignment Rule Updated"
  // underneath the error it had just shown.
  let updateFailed = false
  let renameFailed = false

  await call('frappe.client.set_value', {
    doctype: 'Assignment Rule',
    name: assignmentRuleData.value.name,
    fieldname: {
      rule: assignmentRuleData.value.rule,
      priority: assignmentRuleData.value.priority,
      users: assignmentRuleData.value.users,
      disabled: assignmentRuleData.value.disabled,
      description: assignmentRuleData.value.description,
      document_type: assignmentRuleData.value.documentType,
      assignment_days: assignmentRuleData.value.assignmentDays.map((day) => ({
        day: day,
      })),
      assign_condition: useNewUI.value
        ? convertToConditions({
            conditions: assignmentRuleData.value.assignConditionJson,
          })
        : assignmentRuleData.value.assignCondition,
      unassign_condition: useNewUI.value
        ? convertToConditions({
            conditions: assignmentRuleData.value.unassignConditionJson,
          })
        : assignmentRuleData.value.unassignCondition,
      assign_condition_json: useNewUI.value
        ? JSON.stringify(assignmentRuleData.value.assignConditionJson)
        : null,
      unassign_condition_json: useNewUI.value
        ? JSON.stringify(assignmentRuleData.value.unassignConditionJson)
        : null,
    },
  }).catch((er) => {
    updateFailed = true
    toast.error(
      formatError(er, 'Some error occurred while updating assignment rule'),
    )
    isLoading.value = false
  })

  if (updateFailed) return

  if (
    assignmentRuleData.value.name !==
    assignmentRuleData.value.assignmentRuleName
  ) {
    await call('frappe.client.rename_doc', {
      doctype: 'Assignment Rule',
      old_name: assignmentRuleData.value.name,
      new_name: assignmentRuleData.value.assignmentRuleName,
    }).catch(async (er) => {
      renameFailed = true
      toast.error(
        formatError(er, 'Some error occurred while renaming assignment rule'),
      )
      // Reset assignment rule to previous state
      await getAssignmentRuleData.reload()
      isLoading.value = false
    })

    // Refetching under the new name would ask for a document that does not
    // exist, since the rename is what failed.
    if (renameFailed) return

    await getAssignmentRuleData.submit({
      doctype: 'Assignment Rule',
      name: assignmentRuleData.value.assignmentRuleName,
    })
  } else {
    getAssignmentRuleData.reload()
  }
  isLoading.value = false
  toast.success(__('Assignment Rule Updated'))
}

watch(
  assignmentRuleData,
  (newVal) => {
    if (!initialData.value) return
    isDirty.value = JSON.stringify(newVal) != initialData.value
    if (isDirty.value) {
      disableSettingModalOutsideClick.value = true
    } else {
      disableSettingModalOutsideClick.value = false
    }
  },
  { deep: true },
)

const beforeUnloadHandler = (event) => {
  if (!isDirty.value) return
  event.preventDefault()
  event.returnValue = true
}

onMounted(() => {
  addEventListener('beforeunload', beforeUnloadHandler)
})

onUnmounted(() => {
  resetAssignmentRuleErrors()
  resetAssignmentRuleData()
  removeEventListener('beforeunload', beforeUnloadHandler)
  disableSettingModalOutsideClick.value = false
})
</script>
