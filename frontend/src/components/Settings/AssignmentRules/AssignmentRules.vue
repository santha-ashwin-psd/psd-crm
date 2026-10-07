<template>
  <div class="flex h-full flex-col gap-6 p-6 text-ink-gray-8">
    <!-- Header -->
    <div class="flex items-start justify-between gap-4">
      <div class="flex items-center gap-3.5">
        <span
          class="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--crm-chip-blue)] text-[var(--crm-accent-primary)]"
        >
          <LucideSlidersHorizontal class="size-5" />
        </span>
        <div class="flex flex-col gap-1">
          <div class="flex items-center gap-2">
            <h2 class="text-2xl font-semibold leading-none text-ink-gray-9">
              {{ __('Assignment Rules') }}
            </h2>
          </div>
          <p class="text-p-base text-ink-gray-6">
            {{
              __(
                'Auto-assign leads/deals to the right sales user based on predefined conditions.',
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
        @click="goToNew()"
      />
    </div>

    <!-- Assignment rules list -->
    <div class="flex h-full overflow-y-auto">
      <AssignmentRulesList />
    </div>
  </div>
</template>

<script setup>
import AssignmentRulesList from './AssignmentRulesList.vue'
import LucideSlidersHorizontal from '~icons/lucide/sliders-horizontal'
import { createResource } from 'frappe-ui'
import { inject, provide } from 'vue'

const updateStep = inject('updateStep')

const assignmentRulesListData = createResource({
  url: 'xbr_crm.api.assignment_rule.get_assignment_rules_list',
  cache: ['assignmentRules', 'get_assignment_rules_list'],
  auto: true,
})

provide('assignmentRulesList', assignmentRulesListData)

const goToNew = () => {
  updateStep('view', null)
}
</script>
