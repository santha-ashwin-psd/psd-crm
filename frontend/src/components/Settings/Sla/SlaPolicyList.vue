<template>
  <SettingsLayoutBase
    :title="__('SLA Policies')"
  >
    <template #title>
      <div class="flex items-center gap-3.5">
        <span
          class="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--crm-chip-blue)] text-[var(--crm-accent-primary)]"
        >
          <LucideShieldCheck class="size-5" />
        </span>
        <div class="flex flex-col gap-1">
          <h2 class="text-2xl font-semibold leading-none text-ink-gray-9">
            {{ __('SLA Policies') }}
          </h2>
          <p class="text-p-base text-ink-gray-6">
            {{ __('Manage your service level agreement policies.') }}
          </p>
        </div>
      </div>
    </template>
    <template #header-actions>
      <Button
        :label="__('New')"
        variant="solid"
        icon-left="lucide-plus"
        @click="createNewSlaPolicy"
      />
    </template>
    <template
      v-if="slaPolicyListResource.data?.length > 9 || slaSearchQuery.length"
      #header-bottom
    >
      <div class="relative">
        <Input
          :model-value="slaSearchQuery"
          :placeholder="__('Search')"
          type="text"
          class="sla-search"
          icon-left="search"
          debounce="300"
          inputClass="p-4 pr-12"
          @input="slaSearchQuery = $event"
        />
        <Button
          v-if="slaSearchQuery"
          icon="lucide-x"
          variant="ghost"
          class="absolute right-1 top-1/2 -translate-y-1/2"
          @click="slaSearchQuery = ''"
        />
      </div>
    </template>
    <template #content>
      <div
        v-if="
          slaPolicyListResource.list.loading && !slaPolicyListResource.list.data
        "
        class="flex items-center justify-center mt-12"
      >
        <LoadingIndicator class="w-4" />
      </div>
      <div v-else class="h-full">
        <EmptyState
          v-if="
            !slaPolicyListResource.list.loading &&
            !slaPolicyListResource.list.data?.length
          "
          title="No SLA Policies Found"
          description="Add one to get started."
          :icon="ShieldCheck"
        />
        <div v-else class="flex flex-col gap-3">
          <!-- Column labels -->
          <div class="crm-settings-collabels">
            <div class="flex-1">{{ __('Policy Name') }}</div>
            <div class="w-24 shrink-0">{{ __('Apply On') }}</div>
            <div class="crm-col-toggle">{{ __('Enabled') }}</div>
            <div class="crm-col-menu" />
          </div>
          <!-- Cards -->
          <div
            v-for="(sla) in slaPolicyListResource.data"
            :key="sla.name"
          >
            <div class="crm-settings-row cursor-pointer">
              <!-- Name + Default badge -->
              <div
                class="flex-1 flex items-center gap-2 min-w-0"
                @click="updateStep('view', sla, true)"
              >
                <div class="truncate text-base font-semibold text-ink-gray-9">
                  {{ sla.name }}
                </div>
                <Badge v-if="sla.default" color="gray" size="sm">Default</Badge>
              </div>

              <!-- Apply On -->
              <div class="w-24 shrink-0 text-sm text-ink-gray-6">
                {{ sla.apply_on == 'CRM Lead' ? __('Lead') : __('Deal') }}
              </div>

              <!-- Toggle + Dropdown -->
              <div class="crm-col-toggle">
                <Switch
                  size="sm"
                  :modelValue="sla.enabled"
                  @update:modelValue="onToggle(sla)"
                />
              </div>
              <div class="crm-col-menu">
                <Dropdown placement="right" :options="dropdownOptions(sla)">
                  <Button
                    icon="lucide-more-horizontal"
                    variant="ghost"
                    @click="isConfirmingDelete = false"
                  />
                </Dropdown>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </SettingsLayoutBase>

  <!-- One dialog for the page, not one per row. Inside the v-for above it
       rendered once per policy, all bound to the same `show`, so opening it
       stacked an identical dialog for every policy in the list. -->
  <CrmDialog
    v-model:open="duplicateDialog.show"
    size="sm"
    icon="copy"
    :title="__('Duplicate SLA Policy')"
  >
    <div class="flex flex-col gap-4">
      <FormControl
        v-model="duplicateDialog.name"
        :label="__('New SLA Policy Name')"
        type="text"
        maxlength="100"
      />
    </div>
    <template #footer>
      <Button
        variant="subtle"
        :label="__('Close')"
        @click="duplicateDialog.show = false"
      />
      <Button
        variant="solid"
        :label="__('Duplicate')"
        @click="() => duplicate(duplicateDialog.sla)"
      />
    </template>
  </CrmDialog>
</template>

<script setup>
import LucideShieldCheck from '~icons/lucide/shield-check'
import SettingsLayoutBase from '@/components/Layouts/SettingsLayoutBase.vue'
import EmptyState from '@/components/ListViews/EmptyState.vue'
import ShieldCheck from '~icons/lucide/shield-check'
import CrmDialog from '@/components/Modals/CrmDialog.vue'
import {
  Badge,
  Button,
  createResource,
  Dropdown,
  FormControl,
  LoadingIndicator,
  Switch,
  toast,
} from 'frappe-ui'
import { ConfirmDelete } from '@/utils'
import { formatError } from '@/utils/formatError'
import { resetSlaData } from './utils'
import { inject, ref, watch } from 'vue'

const slaPolicyListResource = inject('slaPolicyListResource')
const updateStep = inject('updateStep')
const slaSearchQuery = inject('slaSearchQuery')

function createNewSlaPolicy() {
  resetSlaData()
  updateStep('view', null)
}

const duplicateDialog = ref({
  show: false,
  name: '',
  // Which policy is being duplicated — the dialog lives outside the list now,
  // so the row can no longer supply it through the v-for scope.
  sla: null,
})

const isConfirmingDelete = ref(false)

const dropdownOptions = (sla) => [
  {
    label: __('Duplicate'),
    onClick: () => {
      duplicateDialog.value = {
        show: true,
        name: sla.name + ' (Copy)',
        sla,
      }
    },
    icon: 'copy',
  },
  ...ConfirmDelete({
    onConfirmDelete: () => deleteSla(sla),
    isConfirmingDelete,
  }),
]

const duplicate = (sla) => {
  createResource({
    url: 'frappe.client.get',
    params: {
      doctype: 'CRM Service Level Agreement',
      name: sla.name,
    },
    onSuccess: (data) => {
      createResource({
        url: 'frappe.client.insert',
        params: {
          doc: {
            ...data,
            default: false,
            sla_name: duplicateDialog.value.name,
          },
        },
        auto: true,
        onSuccess(newSlaData) {
          slaPolicyListResource.reload()
          toast.success(__('SLA Policy Duplicated'))
          duplicateDialog.value = {
            show: false,
            name: '',
            sla: null,
          }
          resetSlaData()
          setTimeout(() => {
            updateStep('view', newSlaData, true)
          }, 250)
        },
      })
    },
    auto: true,
  })
}

const deleteSla = (sla) => {
  if (!isConfirmingDelete.value) {
    isConfirmingDelete.value = true
    return
  }

  slaPolicyListResource.delete.submit(sla.name, {
    onSuccess: () => {
      toast.success(__('SLA Policy Deleted'))
    },
    onError: (err) => {
      // `messages` is the frappe API shape; a link-validation failure or a
      // dropped connection arrives as a plain Error and lost its reason here.
      toast.error(formatError(err, 'Something went wrong, try again later'))
    },
  })
}

const onToggle = (sla) => {
  if (sla.default) {
    toast.error(__('SLA set as default cannot be disabled'))
    return
  }
  slaPolicyListResource.setValue.submit(
    {
      name: sla.name,
      enabled: !sla.enabled,
    },
    {
      onSuccess: () => {
        toast.success(__('SLA Policy Status Updated'))
      },
    },
  )
}

watch(slaSearchQuery, (newValue) => {
  slaPolicyListResource.filters = {
    name: ['like', `%${newValue}%`],
  }
  if (!newValue) {
    // Only the offset resets. This used to set `pageLength = 10` as well, but
    // SlaConfig creates the resource with 999 — so clearing the search box
    // permanently shrank the list to ten policies, with no paging control to
    // get the rest back.
    slaPolicyListResource.start = 0
  }
  slaPolicyListResource.reload()
})
</script>

