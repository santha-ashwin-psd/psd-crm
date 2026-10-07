<template>
  <div
    v-if="assignmentRulesList.loading && !assignmentRulesList.data"
    class="w-full flex flex-col gap-2"
    aria-busy="true"
    aria-label="Loading assignment rules"
  >
    <SkeletonLoader v-for="i in 4" :key="i" type="settings-row" />
  </div>
  <EmptyState
    v-else-if="assignmentRulesList.data?.length === 0"
    title="No Assignment Rules Found"
    :description="__('Add one to get started.')"
    :icon="h(SettingsIcon2, { class: 'rotate-90' })"
  />
  <div v-else class="w-full flex flex-col gap-3">
    <!-- Column labels -->
    <div class="crm-settings-collabels">
      <div class="flex-1">{{ __('Assignment Rule') }}</div>
      <div class="w-36 shrink-0">{{ __('Priority') }}</div>
      <div class="crm-col-toggle">{{ __('Enabled') }}</div>
      <div class="crm-col-menu" />
    </div>
    <!-- Cards -->
    <div class="overflow-y-auto flex flex-col gap-3">
      <AssignmentRuleListItem
        v-for="assignmentRule in assignmentRulesList.data"
        :key="assignmentRule.name"
        :data="assignmentRule"
      />
    </div>
  </div>
</template>

<script setup>
import SettingsIcon2 from '@/components/Icons/SettingsIcon2.vue'
import AssignmentRuleListItem from './AssignmentRuleListItem.vue'
import EmptyState from '@/components/ListViews/EmptyState.vue'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import { inject, h } from 'vue'

const assignmentRulesList = inject('assignmentRulesList')
</script>
