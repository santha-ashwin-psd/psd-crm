<template>
  <!-- Local replacement for frappe-ui's GettingStartedBanner. Same data (the
       shared `useOnboarding` store) and the same actions, but with the design's
       progress bar, the "X / Y steps completed" wording and a sparkle mark.
       The stock banner ships none of those and lives in node_modules. -->
  <div
    v-if="!isSidebarCollapsed"
    class="flex flex-col gap-3 shadow-sm rounded-lg py-2.5 px-3 bg-surface-elevation-2 text-base"
  >
    <template v-if="stepsCompleted != totalSteps">
      <div class="flex flex-col gap-2">
        <div class="inline-flex gap-2 text-ink-gray-9">
          <SparklesIcon class="h-4 my-0.5 shrink-0" />
          <div class="flex flex-col text-p-sm gap-0.5">
            <div class="font-medium">{{ __('Getting started') }}</div>
            <div class="text-ink-gray-7">
              {{ `${stepsCompleted} / ${totalSteps} ` }}{{ __('steps completed') }}
            </div>
          </div>
        </div>
        <div
          class="onboarding-track"
          role="progressbar"
          :aria-valuenow="completedPercentage"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-label="__('Getting started')"
        >
          <div
            class="onboarding-fill"
            :style="{ width: `${completedPercentage}%` }"
          />
        </div>
      </div>
      <Button :label="continueLabel" theme="blue" @click="openOnboarding">
        <template #prefix>
          <FeatherIcon name="chevrons-right" class="size-4" />
        </template>
      </Button>
    </template>

    <div v-else class="flex flex-col gap-1">
      <div class="flex items-center justify-between gap-1">
        <div class="flex shrink-0 items-center gap-2">
          <SparklesIcon class="h-4 my-0.5" />
          <div class="font-medium text-ink-gray-9">{{ __('You are all set') }}</div>
        </div>
        <FeatherIcon
          name="x"
          class="h-4 cursor-pointer"
          @click="dismiss"
        />
      </div>
      <div class="text-p-sm text-ink-gray-7">
        {{ __('All steps are completed successfully') }}
      </div>
    </div>
  </div>

  <Button v-else-if="stepsCompleted != totalSteps" @click="openOnboarding">
    <SparklesIcon class="h-4 my-0.5 shrink-0" />
  </Button>
</template>

<script setup>
import SparklesIcon from '~icons/lucide/sparkles'
import { Button, FeatherIcon } from 'frappe-ui'
import {
  useOnboarding,
  showHelpCenter,
  showHelpModal,
  minimize,
} from 'frappe-ui/frappe'
import { computed } from 'vue'

const props = defineProps({
  isSidebarCollapsed: { type: Boolean, default: false },
  appName: { type: String, default: 'frappecrm' },
})

const {
  stepsCompleted,
  totalSteps,
  completedPercentage,
  isOnboardingStepsCompleted,
} = useOnboarding(props.appName)

const continueLabel = computed(() =>
  stepsCompleted.value == 0 ? __('Start now') : __('Continue'),
)

function openOnboarding() {
  minimize.value = false
  showHelpModal.value = true
}

function dismiss() {
  showHelpCenter.value = true
  isOnboardingStepsCompleted.value = true
}
</script>

<style scoped>
/* Sits on the re-skinned navy banner card (index.css `.crm-sidebar-banners`),
   so the track is a lifted navy rather than a light grey. */
.onboarding-track {
  height: 4px;
  width: 100%;
  border-radius: var(--crm-radius-pill);
  background: var(--nav-border-raised);
  overflow: hidden;
}
.onboarding-fill {
  height: 100%;
  border-radius: var(--crm-radius-pill);
  background: var(--crm-accent-primary);
  transition: width 0.3s var(--crm-ease);
}
</style>
