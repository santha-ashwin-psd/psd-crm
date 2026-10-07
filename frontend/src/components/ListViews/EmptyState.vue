<template>
  <!-- `framed` is for a list page whose table card unmounts when there are no
       rows. `h-full` there resolves against <main> (flex-1, not a flex column),
       so the box takes the full scroll height *below* the KPI band and filter
       bar — it overflows the page and drags the centred content below the
       optical centre. The framed variant is a bounded card reusing the same
       .crm-table-card frame the list itself uses, so the page keeps its shape.
       Nested uses (Contact, Organization, Notifications) want `h-full` and are
       left as they were. -->
  <div
    class="flex w-full items-center justify-center font-sans"
    :class="[
      compact ? 'p-4' : 'p-6',
      framed
        ? 'crm-table-card min-h-[420px]'
        : compact
          ? 'h-full min-h-0'
          : 'h-full min-h-[300px]',
    ]"
  >
    <div
      class="flex flex-col items-center text-center w-full"
      :class="compact ? 'gap-2 max-w-xs' : 'gap-4 max-w-sm'"
    >
      <!-- The icon sits in a tinted disc with a few sparks around it, so an
           empty screen reads as illustrated rather than as a missing state. -->
      <div
        class="empty-illustration"
        :class="{ 'empty-illustration--compact': compact }"
      >
        <span class="empty-disc" aria-hidden="true" />
        <span class="empty-disc-inner" aria-hidden="true" />
        <span class="empty-spark empty-spark--1" aria-hidden="true" />
        <span class="empty-spark empty-spark--2" aria-hidden="true" />
        <span class="empty-spark empty-spark--3" aria-hidden="true" />
        <!-- Global utilities, not scoped CSS: the class lands on a nested
             component's root, so a scoped selector would depend on the scope
             id propagating through Icon down to the svg. -->
        <Icon
          :icon="icon"
          class="relative text-[var(--crm-accent-primary)]"
          :class="compact ? 'size-5' : 'size-9'"
        />
      </div>
      <div
        class="flex flex-col items-center"
        :class="compact ? 'gap-1' : 'gap-1.5'"
      >
        <span
          class="tracking-tight text-[var(--crm-text)]"
          :class="compact ? 'crm-section-title' : 'text-2xl font-bold'"
        >
          {{ computedTitle }}
        </span>
        <span
          v-for="line in descriptionLines"
          :key="line"
          class="text-center text-[var(--crm-text-3)] max-w-xs leading-relaxed"
          :class="compact ? 'text-[length:var(--text-secondary)]' : 'text-sm'"
        >
          {{ line }}
        </span>
      </div>
      <div v-if="ctaLabel" class="mt-2">
        <Button
          variant="solid"
          class="bg-brand-500 hover:bg-brand-600 text-white font-semibold px-4 py-2 rounded-xl text-xs shadow-sm hover:shadow transition-all"
          :label="ctaLabel"
          @click="emit('ctaClick')"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import Icon from '@/components/Icon.vue'
import { splitDescriptionLines } from '@/utils/emptyState'
import { computed } from 'vue'

const props = defineProps({
  name: { type: String, required: true },
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  icon: {
    type: [String, Object],
    default: 'file-text',
  },
  ctaLabel: { type: String, default: '' },
  // Opt in on list pages; leave off where EmptyState fills an existing panel.
  framed: { type: Boolean, default: false },
  /**
   * Dense variant for small containers — a chart panel, a side-panel section,
   * a kanban column. Same component and same copy, but the illustration and
   * type step down so the empty state fits the box it is filling instead of
   * overflowing it or dwarfing the panel it sits in.
   */
  compact: { type: Boolean, default: false },
})

const emit = defineEmits(['ctaClick'])

const computedTitle = computed(() => {
  return props.title ? props.title : __('No {0} Found', [__(props.name)])
})

const computedDescription = computed(() => {
  return props.description
    ? props.description
    : __(
        'It appears that there are currently no {0} available. Get started by creating your first {1}.',
        [__(props.name), __(props.name).toLowerCase().slice(0, -1) || 'record'],
      )
})

// Descriptions are written as a short pair of sentences ("No emails found in
// your inbox. New messages will appear here soon."). Setting each on its own
// line keeps the break where the author put it instead of wherever the box
// happens to wrap. See utils/emptyState.
const descriptionLines = computed(() =>
  splitDescriptionLines(computedDescription.value),
)
</script>

<style scoped>
.empty-illustration {
  position: relative;
  width: 132px;
  height: 132px;
  display: grid;
  place-items: center;
  animation: pulse-subtle 3s infinite ease-in-out;
}
.empty-disc,
.empty-disc-inner {
  position: absolute;
  border-radius: 50%;
}
.empty-disc {
  width: 112px;
  height: 112px;
  background: var(--crm-accent-soft);
}
.empty-disc-inner {
  width: 82px;
  height: 82px;
  background: var(--crm-info-soft);
}
.empty-spark {
  position: absolute;
  border-radius: 50%;
  background: #93c5fd;
}
.empty-spark--1 {
  width: 7px;
  height: 7px;
  top: 14px;
  right: 15px;
}
.empty-spark--2 {
  width: 5px;
  height: 5px;
  bottom: 26px;
  left: 12px;
}
.empty-spark--3 {
  width: 4px;
  height: 4px;
  top: 32px;
  left: 22px;
}
[data-theme='dark'] .empty-spark {
  background: #3b82f6;
}

/* Compact: the disc shrinks with the icon so the proportions hold. */
.empty-illustration--compact {
  width: 56px;
  height: 56px;
}
.empty-illustration--compact .empty-disc {
  width: 48px;
  height: 48px;
}
.empty-illustration--compact .empty-disc-inner {
  width: 34px;
  height: 34px;
}
.empty-illustration--compact .empty-spark {
  display: none;
}

@keyframes pulse-subtle {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.03);
  }
}
@media (prefers-reduced-motion: reduce) {
  .empty-illustration {
    animation: none;
  }
}
</style>
