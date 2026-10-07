<template>
  <!-- Matched to Books' Pagination.vue: "Show N entries" selector on the left,
       "Showing X to Y of Z" + first/prev/pages/next/last nav on the right. -->
  <div class="crm-list-pagination" :class="{ 'pg-card': card }">
    <!-- Left: Show N entries -->
    <div class="pg-left">
      <span class="pg-label">{{ __('Show') }}</span>
      <div class="pg-select-wrap">
        <!-- `name` keeps Chrome's autofill heuristics quiet (it reports a form
             field with neither id nor name as an issue), and the aria-label
             names the control on its own: its meaning currently comes from the
             "Show"/"entries" text either side of it, which a screen reader
             reaching the select directly never sees. -->
        <select
          class="pg-select"
          name="page-size"
          :aria-label="__('Entries per page')"
          :value="pageSize"
          :disabled="loading"
          @change="onSizeChange"
        >
          <option v-for="s in sizeOptions" :key="s" :value="s">{{ s }}</option>
        </select>
        <FeatherIcon name="chevron-down" class="pg-select-chevron" />
      </div>
      <span class="pg-label">{{ __('entries') }}</span>
    </div>

    <!-- Right: range summary + nav -->
    <div class="pg-right">
      <span class="pg-summary">
        {{ __('Showing') }} {{ from }} {{ __('to') }} {{ to }} {{ __('of') }}
        {{ total }} {{ label }}
      </span>

      <!-- Hidden on a single page: first/prev/next/last are all permanently
           disabled there, and a lone "1" button navigates to where you already
           are. The range summary and the page-size selector stay, because both
           still tell you something. -->
      <div v-if="totalPages > 1" class="pg-nav">
        <button
          class="pg-btn pg-icon-btn"
          :disabled="currentPage <= 1 || loading"
          :aria-label="__('First page')"
          @click="go(1)"
        >
          <FeatherIcon name="chevrons-left" class="size-3.5" />
        </button>
        <button
          class="pg-btn pg-icon-btn"
          :disabled="currentPage <= 1 || loading"
          :aria-label="__('Previous page')"
          @click="go(currentPage - 1)"
        >
          <FeatherIcon name="chevron-left" class="size-3.5" />
        </button>

        <template v-for="(p, i) in pages" :key="i">
          <span v-if="p === '…'" class="pg-ellipsis">…</span>
          <button
            v-else
            class="pg-btn pg-page"
            :class="{ 'pg-page-active': p === currentPage }"
            :disabled="loading"
            @click="go(p)"
          >
            {{ p }}
          </button>
        </template>

        <button
          class="pg-btn pg-icon-btn"
          :disabled="currentPage >= totalPages || loading"
          :aria-label="__('Next page')"
          @click="go(currentPage + 1)"
        >
          <FeatherIcon name="chevron-right" class="size-3.5" />
        </button>
        <button
          class="pg-btn pg-icon-btn"
          :disabled="currentPage >= totalPages || loading"
          :aria-label="__('Last page')"
          @click="go(totalPages)"
        >
          <FeatherIcon name="chevrons-right" class="size-3.5" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import {
  DEFAULT_PAGE_LENGTH,
  PAGE_SIZE_OPTIONS,
} from '@/composables/pageLength'
import { FeatherIcon } from 'frappe-ui'
import { computed } from 'vue'

const props = defineProps({
  // The list resource (reads data.total_count / page_length_count / start,
  // all echoed by crm.api.doc.get_data).
  list: { type: Object, required: true },
  label: { type: String, default: '' },
  // Must contain DEFAULT_PAGE_LENGTH — a native <select> whose value matches
  // no <option> renders blank, which is what the empty size control was.
  sizeOptions: { type: Array, default: () => PAGE_SIZE_OPTIONS },
  // Standalone rounded-card look (e.g. Notes) vs the default table-attached bar.
  card: { type: Boolean, default: false },
})

const emit = defineEmits(['pageChange', 'pageSizeChange'])

const total = computed(() => props.list?.data?.total_count || 0)
const pageSize = computed(
  () => props.list?.data?.page_length_count || DEFAULT_PAGE_LENGTH,
)
const start = computed(() => props.list?.data?.start || 0)
const rowCount = computed(() => props.list?.data?.row_count || 0)
const loading = computed(() => !!props.list?.loading)

const currentPage = computed(() => Math.floor(start.value / pageSize.value) + 1)
const totalPages = computed(() =>
  Math.max(1, Math.ceil(total.value / pageSize.value)),
)
const from = computed(() => (total.value === 0 ? 0 : start.value + 1))
const to = computed(() => start.value + rowCount.value)

// Compact page list: 1 … (c-1) c (c+1) … last
const pages = computed(() => {
  const tp = totalPages.value
  const c = currentPage.value
  if (tp <= 7) return Array.from({ length: tp }, (_, i) => i + 1)
  const out = [1]
  const lo = Math.max(2, c - 1)
  const hi = Math.min(tp - 1, c + 1)
  if (lo > 2) out.push('…')
  for (let i = lo; i <= hi; i++) out.push(i)
  if (hi < tp - 1) out.push('…')
  out.push(tp)
  return out
})

function go(page) {
  if (loading.value) return
  if (page < 1 || page > totalPages.value || page === currentPage.value) return
  emit('pageChange', page)
}

function onSizeChange(e) {
  const size = Number(e.target.value)
  if (size && size !== pageSize.value) emit('pageSizeChange', size)
}
</script>

<style scoped>
.crm-list-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding: 10px 16px;
  background: var(--crm-surface);
  border-top: 1px solid var(--crm-border);
  font-size: 13px;
  color: var(--crm-text-2);
}

/* Standalone card (Notes) — soft border, very light shadow.
   --crm-radius-md, not -lg: this sits directly under the note cards, which are
   the 10px card step. At 14px it was visibly rounder than the cards it belongs
   to, which is the only place in the app two card radii meet on one screen. */
.crm-list-pagination.pg-card {
  margin: var(--space-4) var(--space-6) var(--space-5);
  padding: var(--space-4) var(--space-5);
  border: 1px solid var(--crm-border);
  border-radius: var(--crm-radius-md);
  box-shadow: var(--crm-shadow-sm);
}

/* ── Left: Show N entries ── */
.pg-left {
  display: flex;
  align-items: center;
  gap: 6px;
}
.pg-label {
  font-size: 13px;
  color: var(--crm-text-2);
}
.pg-select-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
}
.pg-select {
  appearance: none;
  -webkit-appearance: none;
  height: 40px;
  border: 1px solid var(--crm-border);
  border-radius: var(--crm-radius-md);
  padding: 0 30px 0 12px;
  font-size: 13px;
  color: var(--crm-text-2);
  background: var(--crm-surface);
  cursor: pointer;
  outline: none;
  line-height: 1.4;
}
.pg-select:focus {
  border-color: var(--crm-accent-primary);
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
}
.pg-select-chevron {
  position: absolute;
  right: 7px;
  width: 12px;
  height: 12px;
  color: var(--crm-text-3);
  pointer-events: none;
}

/* ── Right: summary + nav ── */
.pg-right {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}
.pg-summary {
  font-size: 13px;
  color: var(--crm-text-2);
  white-space: nowrap;
}

.pg-nav {
  display: flex;
  align-items: center;
  gap: 2px;
}
.pg-btn {
  min-width: 40px;
  height: 40px;
  padding: 0;
  background: var(--crm-surface);
  border: 1px solid var(--crm-border);
  border-radius: var(--crm-radius-md);
  font-size: 13px;
  font-weight: 500;
  color: var(--crm-text-2);
  cursor: pointer;
  transition:
    border-color 0.15s,
    background 0.15s,
    color 0.15s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.pg-icon-btn {
  color: var(--crm-text-3);
}
.pg-btn:hover:not(:disabled) {
  background: var(--crm-surface-2);
  border-color: var(--crm-text-4);
  color: var(--crm-text);
}
.pg-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.pg-page {
  min-width: 40px;
  padding: 0 8px;
  font-variant-numeric: tabular-nums;
}
/* Blue accent reserved for the active page only. */
.pg-page-active,
.pg-page-active:hover {
  background: var(--crm-accent-primary);
  color: #ffffff;
  border-color: var(--crm-accent-primary);
  font-weight: 600;
}
.pg-ellipsis {
  padding: 0 4px;
  color: var(--crm-text-4);
  font-weight: 600;
  user-select: none;
  font-size: 13px;
}

@media (max-width: 720px) {
  .crm-list-pagination {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }
  .pg-right {
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
  .pg-nav {
    justify-content: center;
  }
}
</style>
