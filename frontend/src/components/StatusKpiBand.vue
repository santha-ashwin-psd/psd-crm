<template>
  <!-- ONE surface, not one card per statistic.
       Five separately bordered, separately tinted cards read as five unrelated
       decorations sitting between the page header and the table — the
       card → card → card → table stack the brief calls out. The band is now a
       single `crm-card` whose segments are divided by 1px grid gaps, so the
       summary is one object and the table stays the only elevated surface. -->
  <div v-if="show" class="crm-stat-band crm-card">
    <!-- Skeletons on first load, in the same segmented shape so nothing jumps
         when the counts land. -->
    <template v-if="!countsLoaded">
      <div v-for="i in skeletonCount" :key="i" class="crm-stat-seg">
        <div class="crm-stat-seg-body">
          <div class="skeleton-shimmer h-2.5 w-20 rounded" />
          <div class="skeleton-shimmer mt-2 h-5 w-10 rounded" />
          <div class="skeleton-shimmer mt-2 h-2 w-24 rounded" />
        </div>
      </div>
    </template>
    <template v-else>
      <!-- Total — the headline figure, so it carries more weight than the
           status breakdown beside it. -->
      <button
        type="button"
        class="crm-stat-seg crm-stat-seg--primary crm-tone-info"
        :class="{ 'is-selected': !activeStatus }"
        :aria-pressed="!activeStatus"
        @click="$emit('filter', null)"
      >
        <span class="crm-stat-icon">
          <FeatherIcon :name="totalIcon" class="crm-stat-glyph" />
        </span>
        <span class="crm-stat-seg-body">
          <span class="crm-stat-label">{{ __(totalLabel) }}</span>
          <span class="crm-stat-value">{{ totalCount }}</span>
          <span class="crm-stat-trend" :class="trendClass('__total__')">
            {{ trendText('__total__') }}
          </span>
        </span>
      </button>
      <!-- Per status — secondary, so a smaller value and a lighter label. -->
      <button
        v-for="card in statusCards"
        :key="card.name"
        type="button"
        class="crm-stat-seg"
        :class="[
          toneClass(card.name),
          { 'is-selected': activeStatus === card.name },
        ]"
        :aria-pressed="activeStatus === card.name"
        @click="$emit('filter', card.name)"
      >
        <span class="crm-stat-icon">
          <FeatherIcon
            :name="iconForStatus(card.name)"
            class="crm-stat-glyph"
          />
        </span>
        <span class="crm-stat-seg-body">
          <Tooltip :text="__(card.label)">
            <span class="crm-stat-label">{{ __(card.label) }}</span>
          </Tooltip>
          <span class="crm-stat-value">{{ card.count }}</span>
          <span class="crm-stat-trend" :class="trendClass(card.name)">
            {{ trendText(card.name) }}
          </span>
        </span>
      </button>
    </template>
  </div>
</template>

<script setup>
import { toneClass, toneForStatus } from '@/utils/statusTheme'
import { call, FeatherIcon, Tooltip } from 'frappe-ui'
import { ref, computed, watch } from 'vue'

// The band is generic (Lead / Deal / Task), so pick an icon from the status
// wording rather than a fixed per-doctype list; unknown statuses fall back to a
// neutral dot-circle.
function iconForStatus(name) {
  const n = (name || '').toLowerCase()
  if (/junk|spam/.test(n)) return 'trash-2'
  if (/unqualif|disqualif|lost|reject/.test(n)) return 'x-circle'
  if (/convert|won/.test(n)) return 'award'
  if (/qualif/.test(n)) return 'check-circle'
  if (/nurtur|warm/.test(n)) return 'trending-up'
  if (/contact|replied|reach|call/.test(n)) return 'phone'
  if (/progress|working|ongoing|active/.test(n)) return 'loader'
  if (/complete|done|finish|closed/.test(n)) return 'check'
  if (/cancel|hold|paused/.test(n)) return 'pause-circle'
  if (/new|open|to ?do|backlog|lead/.test(n)) return 'plus-circle'
  return 'circle'
}

const props = defineProps({
  // Doctype to count (e.g. 'CRM Lead', 'CRM Deal').
  doctype: { type: String, required: true },
  // Ordered statuses to render, each { name, ... }. The card's colour is NOT
  // taken from the store's per-status hue any more — it is derived from the
  // status's meaning via utils/statusTheme, so "Won" is green and "Lost" is
  // red on every band regardless of what hue an admin picked for the status.
  statuses: { type: Array, default: () => [] },
  // Label for the "all" card.
  totalLabel: { type: String, default: 'Total' },
  // Icon (feather name) for the "all" card.
  totalIcon: { type: String, default: 'layers' },
  // Cap the number of per-status cards shown (0 = show all). With the Total
  // card this yields (maxStatuses + 1) cards in a single row.
  maxStatuses: { type: Number, default: 0 },
  // Currently applied status filter (for the active highlight); null = none.
  activeStatus: { type: [String, null], default: null },
  // Changes whenever the underlying list mutates (parent passes total_count)
  // so counts stay fresh after create/delete.
  refreshToken: { type: [Number, String, null], default: null },
  // Whether to render the band at all (parent controls empty/view-type cases).
  show: { type: Boolean, default: true },
})
defineEmits(['filter'])

const counts = ref({})
const totalCount = ref(0)
const trends = ref({}) // { __total__: {pct, up}, [status]: {pct, up} }
const countsLoaded = ref(false)

const skeletonCount = computed(() =>
  Math.min((props.statuses?.length || 4) + 1, 7),
)

// ---- Month boundaries (Books' _qtYM/_qtLYM analogue) ------------------------
// First day of the month `offset` months from now, as 'YYYY-MM-01'.
function monthStart(offset) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(1)
  d.setMonth(d.getMonth() + offset)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}-01`
}

// Books' _qtTr: % change this-vs-last month, with sign → up/down.
function computeTrend(a, b) {
  if (!b && !a) return { pct: 0, up: true }
  if (!b) return { pct: 100, up: true }
  const p = Math.round(((a - b) / b) * 100)
  return { pct: Math.abs(p), up: p >= 0 }
}

// Accurate, permission-scoped counts: one get_count per status (the whitelisted
// get_list rejects aggregate fields for non-admins). get_count applies the same
// permission query conditions the list does.
// The total is counted on its own rather than summed from the statuses, so
// records with no status (or one not shown as a card) are still included.
async function refreshCounts() {
  const statuses = props.statuses || []
  try {
    const [all, ...results] = await Promise.all([
      call('frappe.client.get_count', { doctype: props.doctype }),
      ...statuses.map((s) =>
        call('frappe.client.get_count', {
          doctype: props.doctype,
          filters: { status: s.name },
        }).then((c) => [s.name, c || 0]),
      ),
    ])
    const map = {}
    for (const [name, c] of results) map[name] = c
    counts.value = map
    totalCount.value = all || 0
  } catch (e) {
    console.error('Failed to load status counts for ' + props.doctype, e)
  } finally {
    countsLoaded.value = true
  }
  refreshTrends()
}

// Month-over-month trend per card (Total + each status), by `creation` date.
async function refreshTrends() {
  const thisStart = monthStart(0)
  const lastStart = monthStart(-1)
  const cards = [
    { key: '__total__', status: null },
    ...(props.statuses || []).map((s) => ({ key: s.name, status: s.name })),
  ]
  const countBetween = (status, from, to) => {
    const filters = []
    if (status) filters.push(['status', '=', status])
    filters.push(['creation', '>=', from])
    if (to) filters.push(['creation', '<', to])
    return call('frappe.client.get_count', {
      doctype: props.doctype,
      filters,
    }).then((c) => c || 0)
  }
  try {
    const results = await Promise.all(
      cards.map(async (c) => {
        const [thisM, lastM] = await Promise.all([
          countBetween(c.status, thisStart, null),
          countBetween(c.status, lastStart, thisStart),
        ])
        return [c.key, computeTrend(thisM, lastM)]
      }),
    )
    const map = {}
    for (const [key, t] of results) map[key] = t
    trends.value = map
  } catch (e) {
    console.error('Failed to load status trends for ' + props.doctype, e)
  }
}

// Colour says whether the change is good news, not which way it went: more
// Lost or Missed is bad, so a rise there is red. No change stays neutral.
function trendClass(key) {
  const t = trends.value[key]
  if (!t || !t.pct) return 'crm-stat-trend--muted'
  const good = toneForStatus(key) === 'danger' ? !t.up : t.up
  return good ? 'crm-stat-trend--good' : 'crm-stat-trend--bad'
}
function trendText(key) {
  const t = trends.value[key]
  if (!t) return '— vs last month'
  if (!t.pct) return __('No change vs last month')
  return `${t.up ? '↑' : '↓'} ${t.pct}% vs last month`
}

watch(() => props.statuses?.length, refreshCounts, { immediate: true })
watch(
  () => props.refreshToken,
  (next, prev) => {
    if (prev !== undefined && next !== prev) refreshCounts()
  },
)
const statusCards = computed(() => {
  let list = (props.statuses || []).map((s) => ({
    name: s.name,
    // Optional display label — counts/filters still key off `name` (the raw
    // status value). Falls back to the name when no label is provided.
    label: s.label || s.name,
    color: s.color,
    count: counts.value[s.name] || 0,
  }))
  if (props.maxStatuses > 0) list = list.slice(0, props.maxStatuses)
  return list
})
</script>

<style scoped>
/* One surface, divided into segments.
   The dividers are the grid's own 1px gaps showing the band's background
   through — which draws a hairline between every segment including wrapped
   rows, with none of the `:first-child` bookkeeping a per-segment border
   needs. The band itself supplies the border and radius via `.crm-card`, and
   clips its segments to that radius. */
.crm-stat-band {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(168px, 1fr));
  /* The pages stack the band in a full-height flex column above the table.
     Without this the column shrinks it to make room for the table, and
     `overflow: hidden` then clips the figures and trend line at the bottom. */
  flex-shrink: 0;
  background: var(--crm-surface);
  overflow: hidden;
}

.crm-stat-seg {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 11px 14px;
  text-align: left;
  background: var(--crm-surface);
  cursor: pointer;
  /* Dividers are drawn per segment rather than as grid gaps showing a coloured
     band background through. With an odd number of segments the last grid row
     has an empty cell, and a coloured band background rendered it as a grey
     block; a per-segment shadow leaves that cell as plain surface. The
     outermost lines fall outside the padding box and are clipped by the band's
     `overflow: hidden`, so the edges never double up with the card border. */
  box-shadow:
    1px 0 0 var(--crm-border),
    0 1px 0 var(--crm-border);
  transition:
    background-color 0.15s var(--crm-ease),
    box-shadow 0.15s var(--crm-ease);
}
.crm-stat-seg:hover {
  background: var(--crm-row-hover);
}
.crm-stat-seg:focus-visible {
  outline: 2px solid var(--crm-accent-primary);
  outline-offset: -2px;
}
/* Selected — a tone wash plus an underline in the tone, so the active filter
   is legible without a colour-only cue. */
.crm-stat-seg.is-selected {
  background: color-mix(in srgb, var(--tone) 8%, var(--crm-surface));
  /* Keeps the dividers, adds the tone underline. */
  box-shadow:
    1px 0 0 var(--crm-border),
    0 1px 0 var(--crm-border),
    inset 0 -2px 0 var(--tone);
}

.crm-stat-icon {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  border-radius: var(--crm-radius-sm);
  color: var(--tone);
  background: color-mix(in srgb, var(--tone) 13%, var(--crm-surface));
}
.crm-stat-glyph {
  width: 16px;
  height: 16px;
}

.crm-stat-seg-body {
  display: block;
  min-width: 0;
  flex: 1;
}

.crm-stat-label {
  display: block;
  font-size: var(--text-caption);
  font-weight: 600;
  letter-spacing: var(--tracking-overline);
  text-transform: uppercase;
  color: var(--crm-text-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.crm-stat-value {
  display: block;
  margin-top: 1px;
  font-size: 17px;
  font-weight: 700;
  line-height: 1.15;
  color: var(--tone);
  font-variant-numeric: tabular-nums;
}

.crm-stat-trend {
  display: block;
  font-size: var(--text-caption);
  font-weight: 500;
  margin-top: 1px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.crm-stat-trend--good {
  color: var(--crm-success);
}
.crm-stat-trend--bad {
  color: var(--crm-danger);
}
.crm-stat-trend--muted {
  color: var(--crm-text-4);
}

/* The headline figure outranks the status breakdown beside it. Weight comes
   from type size and a larger chip, not from a different colour or a border —
   the segments stay one family. */
.crm-stat-seg--primary {
  padding-block: 13px;
}
.crm-stat-seg--primary .crm-stat-icon {
  width: 38px;
  height: 38px;
  border-radius: var(--crm-radius-md);
}
.crm-stat-seg--primary .crm-stat-glyph {
  width: 19px;
  height: 19px;
}
.crm-stat-seg--primary .crm-stat-value {
  font-size: 23px;
}
.crm-stat-seg--primary .crm-stat-label {
  color: var(--crm-text-2);
}
</style>
