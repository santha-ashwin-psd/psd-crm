<template>
  <SettingsLayoutBase :title="__('Email Templates')">
    <template #title>
      <div class="flex items-center gap-3.5">
        <span
          class="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--crm-chip-blue)] text-[var(--crm-accent-primary)]"
        >
          <LucideMailOpen class="size-5" />
        </span>
        <div class="flex flex-col gap-1">
          <h2 class="text-2xl font-semibold leading-none text-ink-gray-9">
            {{ __('Email Templates') }}
          </h2>
          <p class="text-p-base text-ink-gray-6">
            {{
              __(
                'Add, edit, and manage email templates for various CRM communications.',
              )
            }}
          </p>
        </div>
      </div>
    </template>

    <template #header-actions>
      <Button
        :label="__('New')"
        icon-left="lucide-plus"
        variant="solid"
        @click="emit('updateStep', 'new-template')"
      />
    </template>

    <template #content>
      <div class="flex flex-col gap-4">
        <!-- Search + doctype filter -->
        <div
          v-if="!templates.loading && templates.data?.length"
          class="template-filters flex items-center gap-3"
        >
          <TextInput
            ref="searchRef"
            v-model="search"
            :placeholder="__('Search templates...')"
            class="flex-1"
            :debounce="300"
          >
            <template #prefix>
              <span
                class="lucide-search h-4 w-4 text-ink-gray-5"
                aria-hidden="true"
              />
            </template>
          </TextInput>
          <FormControl
            v-model="currentDoctype"
            type="select"
            class="w-44"
            :options="doctypeOptions"
          />
        </div>

        <!-- Loading -->
        <div
          v-if="templates.loading"
          class="flex flex-col gap-4"
          aria-busy="true"
          :aria-label="__('Loading email templates')"
        >
          <SkeletonLoader v-for="i in 4" :key="i" type="settings-row" />
        </div>

        <!-- Empty -->
        <EmptyState
          v-else-if="!templates.data?.length"
          name="Email Templates"
          :description="__('Add one to get started.')"
          :icon="EmailTemplateIcon"
        />

        <!-- Templates -->
        <template v-else>
          <div
            v-for="template in templatesList"
            :key="template.name"
            class="crm-settings-row cursor-pointer"
            @click="() => emit('updateStep', 'edit-template', { ...template })"
          >
            <span class="template-chip">
              {{ template.name.charAt(0).toUpperCase() }}
            </span>

            <div class="min-w-0 flex-1">
              <div class="truncate text-base font-semibold text-ink-gray-9">
                {{ template.name }}
              </div>
              <div class="mt-0.5 truncate text-sm text-ink-gray-6">
                {{ __('Subject') }}: {{ template.subject }}
              </div>
            </div>

            <div
              class="flex shrink-0 items-center gap-3"
              @click.stop
            >
              <span class="template-badge">
                {{ template.reference_doctype.replace('CRM ', '') }}
              </span>
              <Switch
                v-model="template.enabled"
                size="sm"
                @update:model-value="(val) => toggleEmailTemplate(template, val)"
              />
              <Dropdown
                :options="getDropdownOptions(template)"
                placement="right"
                :button="{
                  icon: 'more-horizontal',
                  variant: 'ghost',
                  onblur: (e) => {
                    e.stopPropagation()
                    confirmDelete = false
                  },
                }"
              />
            </div>
          </div>

          <div v-if="templates.hasNextPage" class="flex justify-center">
            <Button
              class="crm-settings-action"
              :loading="templates.loading"
              :label="__('Load More')"
              icon-left="lucide-refresh-cw"
              @click="() => templates.next()"
            />
          </div>
        </template>
      </div>
    </template>
  </SettingsLayoutBase>
</template>

<script setup>
import { formatError } from '@/utils/formatError'
import SettingsLayoutBase from '@/components/Layouts/SettingsLayoutBase.vue'
import EmailTemplateIcon from '@/components/Icons/EmailTemplateIcon.vue'
import EmptyState from '../../ListViews/EmptyState.vue'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import LucideMailOpen from '~icons/lucide/mail-open'
import { useBroadcast } from '@/composables/useBroadcast'
import { TextInput, FormControl, Switch, Dropdown, toast } from 'frappe-ui'
import { ref, computed, inject } from 'vue'
import { ConfirmDelete } from '../../../utils'
import { leadDealDoctypeOptions } from '@/utils/leads'

const emit = defineEmits(['updateStep'])

const { send } = useBroadcast()

const templates = inject('templates')

const search = ref('')
const currentDoctype = ref('All')
const confirmDelete = ref(false)

const doctypeOptions = [
  { label: __('All Types'), value: 'All' },
  ...leadDealDoctypeOptions(),
]

const templatesList = computed(() => {
  let list = templates.data || []
  if (search.value) {
    list = list.filter(
      (template) =>
        template.name.toLowerCase().includes(search.value.toLowerCase()) ||
        template.subject?.toLowerCase().includes(search.value.toLowerCase()),
    )
  }
  if (currentDoctype.value !== 'All') {
    list = list.filter(
      (template) => template.reference_doctype === currentDoctype.value,
    )
  }
  return list
})

function toggleEmailTemplate(template, enabledVal) {
  templates.setValue.submit(
    {
      name: template.name,
      enabled: enabledVal ? 1 : 0,
    },
    {
      onSuccess: () => {
        toast.success(
          enabledVal
            ? __('Template enabled successfully')
            : __('Template disabled successfully'),
        )
        send('refresh-email-templates')
      },
      onError: (error) => {
        toast.error(formatError(error, 'Failed to update template'))
        // Revert the change if there was an error
        template.enabled = !enabledVal
      },
    },
  )
}

function deleteTemplate(template) {
  confirmDelete.value = false
  templates.delete.submit(template.name, {
    onSuccess: () => {
      toast.success(__('Template Deleted Successfully'))
    },
    onError: (error) => {
      toast.error(formatError(error, 'Failed to delete template'))
    },
  })
}

function getDropdownOptions(template) {
  let options = [
    {
      label: __('Duplicate'),
      icon: 'copy',
      onClick: () => emit('updateStep', 'new-template', { ...template }),
    },
    ...ConfirmDelete({
      onConfirmDelete: () => deleteTemplate(template),
      isConfirmingDelete: confirmDelete,
    }),
  ]

  return options
}
</script>

<style scoped>

.template-badge {
  padding: 3px 10px;
  border-radius: var(--crm-radius-pill);
  background: var(--crm-surface-2);
  color: var(--crm-text-2);
  font-size: 12px;
  font-weight: 500;
}

/* Initial-letter chip standing in for a template thumbnail. */
.template-chip {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: var(--crm-radius);
  background: var(--crm-chip-blue);
  color: var(--crm-accent-primary);
  font-size: 17px;
  font-weight: 600;
}
</style>
