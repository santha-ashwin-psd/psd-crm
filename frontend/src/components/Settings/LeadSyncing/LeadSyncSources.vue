<template>
  <div class="flex h-full flex-col gap-6 text-ink-gray-8">
    <!-- Header -->
    <div class="flex items-start justify-between gap-4">
      <div class="flex items-center gap-3.5">
        <span
          class="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--crm-chip-blue)] text-[var(--crm-accent-primary)]"
        >
          <LucideRefreshCw class="size-5" />
        </span>
        <div class="flex flex-col gap-1">
          <div class="flex items-center gap-2">
            <h2 class="text-2xl font-semibold leading-none text-ink-gray-9">
              {{ __('Lead Sources') }}
            </h2>
            <Badge theme="orange" size="sm">Beta</Badge>
          </div>
          <p class="text-p-base text-ink-gray-6">
            {{
              __(
                'Add, edit, and manage sources for automatic lead syncing to your CRM.',
              )
            }}
          </p>
        </div>
      </div>
      <Button
        class="shrink-0"
        :label="__('New')"
        icon-left="lucide-plus"
        variant="solid"
        @click="emit('updateStep', 'new-source')"
      />
    </div>

    <!-- loading state -->
    <div
      v-if="sources.loading"
      class="flex mt-28 justify-between w-full h-full"
    >
      <Button
        :loading="sources.loading"
        variant="ghost"
        class="w-full"
        size="2xl"
      />
    </div>

    <!-- Empty State -->
    <EmptyState
      v-if="!sources.loading && !sources.data?.length"
      name="Lead Sources"
      description="Manage your lead sources here. Add new sources to start syncing leads automatically."
      icon="refresh-cw"
    />

    <!-- Lead source list -->
    <div
      v-if="!sources.loading && sources.data?.length"
      class="flex flex-col overflow-hidden"
    >
      <div class="flex items-center py-2 px-4 text-sm text-ink-gray-5">
        <div class="w-4/6">{{ __('Name') }}</div>
        <div class="w-1/6">{{ __('Source') }}</div>
        <div class="w-1/6">{{ __('Enabled') }}</div>
      </div>
      <div class="h-px border-t mx-4 border-outline-elevation-2" />
      <ul class="overflow-y-auto px-2">
        <template v-for="(source, i) in sourcesList" :key="source.name">
          <li
            class="flex items-center justify-between p-3 cursor-pointer hover:bg-surface-sidebar rounded"
            @click="() => emit('updateStep', 'edit-source', { ...source })"
          >
            <div class="flex flex-col w-4/6 pr-5">
              <div class="text-p-base-medium text-ink-gray-7 truncate">
                {{ source.name }}
              </div>
            </div>

            <div class="flex flex-col w-1/6 pr-5">
              <div class="text-p-base-medium text-ink-gray-7 truncate">
                {{ source.type }}
              </div>
            </div>

            <div class="flex items-center justify-between w-1/6">
              <Switch
                v-model="source.enabled"
                size="sm"
                @update:model-value="toggleLeadSyncSourceEnabled(source)"
                @click.stop
              />
              <Dropdown
                class=""
                :options="getDropdownOptions(source)"
                placement="right"
                :button="{
                  icon: 'more-horizontal',
                  variant: 'ghost',
                  onblur: (e) => {
                    e.stopPropagation()
                    confirmDelete = false
                  },
                }"
                @click.stop
              />
            </div>
          </li>
          <div
            v-if="sourcesList.length !== i + 1"
            class="h-px border-t mx-2 border-outline-elevation-2"
          />
        </template>
        <!-- Load More Button -->
        <div
          v-if="!sources.loading && sources.hasNextPage"
          class="flex justify-center"
        >
          <Button
            class="mt-3.5 p-2"
            :loading="sources.loading"
            :label="__('Load More')"
            icon-left="lucide-refresh-cw"
            @click="() => sources.next()"
          />
        </div>
      </ul>
    </div>
  </div>
</template>
<script setup>
import { formatError } from '@/utils/formatError'
import LucideRefreshCw from '~icons/lucide/refresh-cw'
import { Switch, Dropdown, toast, Badge } from 'frappe-ui'
import { useTelemetry } from 'frappe-ui/frappe'
import { ref, computed, inject } from 'vue'
import EmptyState from '../../ListViews/EmptyState.vue'
import { ConfirmDelete } from '../../../utils'

const emit = defineEmits(['updateStep'])

const sources = inject('sources')
const { capture } = useTelemetry()

const search = ref('')
const confirmDelete = ref(false)

const sourcesList = computed(() => {
  let list = sources.data || []
  if (search.value) {
    // Was `source.name… || source.subject.toLowerCase()…`. There is no
    // `subject` field on Lead Sync Source and the list resource never fetched
    // one, so the second clause threw for every source the name did not match
    // — which is most of them on most keystrokes, blanking the panel. `type`
    // is the other column actually shown, and is what the pair evidently meant.
    const q = search.value.toLowerCase()
    list = list.filter((source) =>
      [source.name, source.type].some((v) => v?.toLowerCase().includes(q)),
    )
  }
  return list
})

function toggleLeadSyncSourceEnabled(source) {
  sources.setValue.submit(
    {
      name: source.name,
      enabled: source.enabled ? 1 : 0,
    },
    {
      onSuccess: () => {
        capture('lead_sync_source_toggled', {
          enabled: Boolean(source.enabled),
          source_type: source.type,
        })
        toast.success(
          source.enabled
            ? __('Source enabled successfully')
            : __('Source disabled successfully'),
        )
      },
      onError: (error) => {
        toast.error(formatError(error, 'Failed to update source'))
        // Revert the change if there was an error
        source.enabled = !source.enabled
      },
    },
  )
}

function deleteLeadSource(source) {
  confirmDelete.value = false
  sources.delete.submit(source.name, {
    onSuccess: () => {
      toast.success(__('Lead sync source deleted successfully'))
    },
    onError: (error) => {
      toast.error(formatError(error, 'Failed to delete lead sync source'))
    },
  })
}

function getDropdownOptions(source) {
  let options = [
    {
      label: __('Duplicate'),
      icon: 'copy',
      onClick: () => emit('updateStep', 'new-source', { ...source }),
    },
    ...ConfirmDelete({
      onConfirmDelete: () => deleteLeadSource(source),
      isConfirmingDelete: confirmDelete,
    }),
  ]

  return options
}
</script>
