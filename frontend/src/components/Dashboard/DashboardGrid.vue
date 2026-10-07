<template>
  <div class="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-4 pt-1 sm:px-4">
    <GridLayout
      v-if="items.length > 0"
      :key="columns"
      class="h-fit w-full"
      :class="[editing ? 'mb-[20rem] !select-none' : '']"
      :cols="columns"
      :rowHeight="36"
      :disabled="!editing || !isDesktop"
      :modelValue="activeLayout"
      @update:modelValue="onLayoutUpdate"
    >
      <template #item="{ index }">
        <div class="group relative flex h-full w-full p-1.5 text-ink-gray-8">
          <div
            class="flex h-full w-full items-center justify-center"
            :class="
              editing && isDesktop
                ? 'pointer-events-none  [&>div:first-child]:rounded [&>div:first-child]:group-hover:ring-2 [&>div:first-child]:group-hover:ring-outline-gray-2'
                : ''
            "
          >
            <DashboardItem
              :index="index"
              :item="items[index]"
              :editing="editing && isDesktop"
            />
          </div>
          <div
            v-if="editing && isDesktop"
            class="flex absolute right-0 top-0 bg-surface-gray-9 rounded cursor-pointer opacity-0 group-hover:opacity-100"
          >
            <div
              class="rounded p-1 hover:bg-surface-gray-8"
              @click="items.splice(index, 1)"
            >
              <span
                class="lucide-trash-2 size-3 text-ink-base"
                aria-hidden="true"
              />
            </div>
          </div>
        </div>
      </template>
    </GridLayout>
  </div>
</template>
<script setup>
/**
 * The dashboard's layout surface.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS COMPONENT IS RESPONSIVE BY HAND
 * ---------------------------------------------------------------------------
 * frappe-ui's GridLayout wraps grid-layout-plus and hardcodes its responsive
 * column map to `{ lg: cols, md: cols, sm: cols, xs: 1, xxs: 1 }`. Because
 * lg/md/sm all resolve to the same number, EVERY width down to 768px kept all
 * 20 columns and simply made each one narrower — which is exactly why a KPI
 * card at `w: 4` was ~148px wide at an 820px viewport, clipping its value and
 * truncating two different titles to the same "Avg. d…".
 *
 * We cannot pass a column map through (the prop is `cols?: number`), so the
 * breakpoint logic lives here:
 *
 *   >= 1024px   the saved 20-column layout, unchanged. This is the editing
 *               surface: drag, resize, delete and save behave exactly as
 *               before, and the persisted geometry is what renders.
 *
 *   <  1024px   a layout DERIVED from the items by type — KPIs two-up, charts
 *               full width — rather than the saved geometry scaled down.
 *               Deriving beats scaling here: proportional scaling of a 20-col
 *               arrangement is what produced the squeezing in the first place.
 *               Below 768px grid-layout-plus's own `xs` breakpoint forces a
 *               single column, which stacks everything.
 *
 * The derived layout is display-only and is never written back — see
 * `onLayoutUpdate`. Dragging is also disabled below the desktop breakpoint, so
 * a narrow viewport cannot overwrite the arrangement a user set on a wide one.
 */
import { GridLayout } from 'frappe-ui'
import DashboardItem from '@/components/Dashboard/DashboardItem.vue'
import { useWindowSize } from '@vueuse/core'
import { computed } from 'vue'

defineProps({
  editing: { type: Boolean, default: false },
})

const items = defineModel({ type: Array, default: () => [] })

/** Width at and above which the saved 20-column layout is used verbatim. */
const DESKTOP_MIN_WIDTH = 1024
/**
 * grid-layout-plus switches to its own `xs` breakpoint at 768px and below, and
 * frappe-ui hardcodes `xs: 1` — so the grid is single-column there no matter
 * what `cols` we pass. The derived layout MUST agree with that: deriving two
 * columns below 768 places items at `x: 1` which the grid then collapses onto
 * `x: 0`, stacking cards on top of each other so only every other one is
 * visible. (Found exactly that way — the geometry audit reported no clipping
 * and no overflow because nothing was clipped; three KPI cards were simply
 * hidden underneath their neighbours.)
 */
const TWO_COLUMN_MIN_WIDTH = 768

const { width } = useWindowSize()
const isDesktop = computed(() => width.value >= DESKTOP_MIN_WIDTH)

/** Columns the grid will actually render at this width. */
const columns = computed(() => {
  if (isDesktop.value) return 20
  return width.value > TWO_COLUMN_MIN_WIDTH ? 2 : 1
})

/**
 * Pack the items into `cols` columns, keeping their order.
 *
 * Heights come from the item's own saved `h` for charts, so a panel a user
 * made taller stays taller; KPI cards get a fixed three rows because their
 * content is a fixed three lines. A spacer is layout-only and collapses to a
 * single row rather than reserving a whole block of empty space.
 */
function deriveNarrowLayout(list, cols) {
  const derived = []
  let x = 0
  let y = 0
  let rowHeight = 0

  for (const [index, item] of list.entries()) {
    let w
    let h
    if (item.type === 'number_chart') {
      // Two KPIs share a row where there are two columns; one per row below.
      w = 1
      h = 3
    } else if (item.type === 'spacer') {
      w = cols
      h = 1
    } else {
      w = cols
      h = item.layout?.h || 9
    }

    // Wrap before placing if this item cannot finish the current row.
    if (x + w > cols) {
      y += rowHeight
      x = 0
      rowHeight = 0
    }

    derived.push({
      x,
      y,
      w,
      h,
      i: item.layout?.i ?? item.name ?? String(index),
    })

    x += w
    rowHeight = Math.max(rowHeight, h)
    if (x >= cols) {
      y += rowHeight
      x = 0
      rowHeight = 0
    }
  }
  return derived
}

const activeLayout = computed(() =>
  isDesktop.value
    ? items.value.map((item) => item.layout)
    : deriveNarrowLayout(items.value, columns.value),
)

/**
 * Persist geometry back onto the items — desktop only.
 *
 * grid-layout-plus emits an update whenever it recalculates, including on its
 * own responsive re-layout. Accepting those below the desktop breakpoint would
 * write the derived two-column geometry over the user's saved arrangement, and
 * a subsequent Save would make that permanent.
 */
function onLayoutUpdate(newLayout) {
  if (!isDesktop.value) return
  items.value.forEach((item, idx) => {
    item.layout = newLayout[idx]
  })
}
</script>
