<template>
  <!-- row: single list-table row shimmer (checkbox + avatar + cells) -->
  <div
    v-if="type === 'row'"
    class="flex items-center gap-4 border-b border-[var(--crm-row-border)] px-3.5 py-3 last:border-b-0"
  >
    <div class="skeleton-shimmer size-4 rounded shrink-0" />
    <div class="skeleton-shimmer size-6 rounded-md shrink-0" />
    <div class="skeleton-shimmer h-3 w-32 rounded" />
    <div class="skeleton-shimmer h-3 w-24 rounded hidden sm:block" />
    <div class="skeleton-shimmer h-5 w-16 rounded shrink-0 hidden sm:block" />
    <div class="skeleton-shimmer h-3 w-40 rounded hidden md:block" />
    <div class="skeleton-shimmer h-3 w-28 rounded ml-auto hidden lg:block" />
  </div>

  <!-- table: full list-table card (header band + rows), matches .crm-table-card -->
  <div v-else-if="type === 'table'" class="crm-table-card flex flex-col" aria-busy="true">
    <div
      class="flex items-center gap-4 border-b-2 border-[var(--crm-list-header-border)] bg-[var(--crm-list-header-bg)] px-3.5 py-2.5"
    >
      <div class="skeleton-shimmer size-3.5 rounded shrink-0" />
      <div class="skeleton-shimmer h-2.5 w-24 rounded" />
      <div class="skeleton-shimmer h-2.5 w-20 rounded hidden sm:block" />
      <div class="skeleton-shimmer h-2.5 w-16 rounded hidden md:block" />
      <div class="skeleton-shimmer h-2.5 w-24 rounded hidden lg:block" />
      <div class="skeleton-shimmer h-2.5 w-20 rounded ml-auto hidden lg:block" />
    </div>
    <SkeletonLoader v-for="i in rows" :key="i" type="row" />
  </div>

  <!-- card: kanban card shape -->
  <div
    v-else-if="type === 'card'"
    class="flex flex-col gap-2.5 rounded-xl border border-[var(--crm-border)] bg-[var(--crm-surface)] p-3 shadow-sm"
  >
    <div class="flex items-center gap-2">
      <div class="skeleton-shimmer size-6 rounded-full shrink-0" />
      <div class="skeleton-shimmer h-3.5 rounded flex-1" />
    </div>
    <div class="skeleton-shimmer h-3 rounded w-3/4" />
    <div class="flex gap-2 mt-0.5">
      <div class="skeleton-shimmer h-4 w-12 rounded-full" />
      <div class="skeleton-shimmer h-4 w-14 rounded-full" />
    </div>
  </div>

  <!-- detail: side-panel field skeleton (label + value pairs) -->
  <div v-else-if="type === 'detail'" class="flex flex-col gap-0 px-1 sm:px-3 pt-3">
    <div
      v-for="i in 7"
      :key="i"
      class="flex items-center gap-3 px-3 py-2.5 border-b border-[var(--crm-row-border)] last:border-b-0"
    >
      <div class="skeleton-shimmer h-3 rounded w-[35%] min-w-20 shrink-0" />
      <div class="skeleton-shimmer h-3.5 rounded flex-1" />
    </div>
  </div>

  <!-- activity: timeline entry (avatar + text blocks) -->
  <div
    v-else-if="type === 'activity'"
    class="flex items-start gap-3 px-3 sm:px-6 py-3"
  >
    <div class="skeleton-shimmer size-7 rounded-full shrink-0 mt-0.5" />
    <div class="flex-1 flex flex-col gap-2">
      <div class="skeleton-shimmer h-3 rounded w-1/3" />
      <div class="skeleton-shimmer h-12 rounded-xl w-full" />
    </div>
  </div>

  <!-- detail-page: full record page (hero + fact tiles + two-column body) -->
  <div
    v-else-if="type === 'detail-page'"
    class="flex h-full flex-col overflow-hidden bg-[var(--crm-bg)]"
    aria-busy="true"
  >
    <div class="flex shrink-0 flex-col gap-3 px-4 pt-4">
      <div
        class="overflow-hidden rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-surface)] shadow-sm"
      >
        <div class="skeleton-shimmer h-14 opacity-60" />
        <div class="-mt-8 flex flex-wrap items-end gap-4 px-6 pb-4">
          <div
            class="skeleton-shimmer size-[68px] shrink-0 rounded-2xl ring-4 ring-[var(--crm-surface)]"
          />
          <div class="flex min-w-0 flex-1 flex-col gap-2 pb-1">
            <div class="skeleton-shimmer h-5 w-44 rounded" />
            <div class="skeleton-shimmer h-3.5 w-64 max-w-full rounded" />
          </div>
          <div class="flex gap-1.5 pb-1">
            <div class="skeleton-shimmer size-8 rounded-lg" />
            <div class="skeleton-shimmer size-8 rounded-lg" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-2.5 px-6 pb-5 sm:grid-cols-3 lg:grid-cols-6">
          <div
            v-for="i in 6"
            :key="i"
            class="flex flex-col gap-2 rounded-xl border border-[var(--crm-border)] p-3"
          >
            <div class="skeleton-shimmer h-2.5 w-14 rounded" />
            <div class="skeleton-shimmer h-3.5 w-full rounded" />
          </div>
        </div>
      </div>
    </div>
    <div
      class="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_340px]"
    >
      <div
        class="flex flex-col gap-4 overflow-hidden rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-surface)] p-4"
      >
        <div class="flex gap-6 border-b border-[var(--crm-border)] pb-3">
          <div class="skeleton-shimmer h-4 w-16 rounded" />
          <div class="skeleton-shimmer h-4 w-16 rounded" />
        </div>
        <div v-for="i in 4" :key="i" class="flex gap-3">
          <div class="skeleton-shimmer size-7 shrink-0 rounded-full" />
          <div class="flex flex-1 flex-col gap-2">
            <div class="skeleton-shimmer h-3 w-1/3 rounded" />
            <div class="skeleton-shimmer h-12 w-full rounded-xl" />
          </div>
        </div>
      </div>
      <div
        class="hidden flex-col gap-3 rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-surface)] p-4 lg:flex"
      >
        <div v-for="i in 7" :key="i" class="flex items-center gap-3">
          <div class="skeleton-shimmer h-3 w-20 shrink-0 rounded" />
          <div class="skeleton-shimmer h-3.5 flex-1 rounded" />
        </div>
      </div>
    </div>
  </div>

  <!-- settings-row: label left + control placeholder right -->
  <div
    v-else-if="type === 'settings-row'"
    class="flex items-center justify-between rounded-xl border border-[var(--crm-border)] bg-[var(--crm-surface)] px-4 py-3.5 shadow-sm gap-4"
  >
    <div class="flex flex-col gap-1.5 flex-1 min-w-0">
      <div class="skeleton-shimmer h-3.5 rounded w-2/5" />
      <div class="skeleton-shimmer h-3 rounded w-3/5" />
    </div>
    <div class="skeleton-shimmer h-8 w-28 rounded-lg shrink-0" />
  </div>
</template>

<script setup>
defineProps({
  type: {
    type: String,
    default: 'row',
    validator: (v) =>
      [
        'row',
        'table',
        'card',
        'detail',
        'detail-page',
        'activity',
        'settings-row',
      ].includes(v),
  },
  // Number of rows for the composite `table` type.
  rows: {
    type: Number,
    default: 8,
  },
})
</script>
