<template>
  <div class="h-full w-full">
    <!-- KPI ----------------------------------------------------------------
         `hueFor` returns a `.crm-tone-*` class derived from what the metric
         means, so the border and icon chip agree with the number's sense
         rather than with the card's position in the grid.

         The card is a container query context (see index.css): its type scale
         responds to its OWN width, so a card given more columns reads as a
         primary metric and a narrow one steps down without ever clipping. -->
    <div
      v-if="item.type == 'number_chart'"
      class="dash-kpi-card crm-card crm-card--contain flex h-full w-full items-center gap-3 px-4"
      :class="hueFor(item.name)"
    >
      <span class="dash-kpi-icon">
        <FeatherIcon :name="iconFor(item.name)" class="dash-kpi-glyph" />
      </span>
      <!-- min-w-0 lets the text block shrink beside the icon; without it the
           flex child keeps its content width and the value clips. -->
      <div class="dash-kpi-body min-w-0 flex-1">
        <Tooltip :text="__(item.data.tooltip || item.data.title)">
          <NumberChart
            v-if="item.data"
            :key="index"
            class="!items-start font-sans"
            :config="compactConfig(item)"
          />
        </Tooltip>
        <div v-if="captionFor(item.name)" class="dash-kpi-caption">
          {{ captionFor(item.name) }}
        </div>
      </div>
    </div>

    <!-- A spacer is layout-only, so it stays invisible outside edit mode;
         while editing it shows a dashed outline so it can still be grabbed. -->
    <div
      v-else-if="item.type == 'spacer'"
      class="h-full flex items-center justify-center overflow-hidden rounded-xl text-ink-gray-5"
      :class="
        editing
          ? 'bg-[var(--crm-surface-2)] border border-dashed border-[var(--crm-border-strong)]'
          : 'bg-transparent'
      "
    >
      {{ editing ? __('Spacer') : '' }}
    </div>

    <!-- Axis chart ---------------------------------------------------------
         `crm-card--contain` is what stops ECharts painting its axis labels and
         gridlines outside the rounded edge at narrow widths. -->
    <div
      v-else-if="item.type == 'axis_chart'"
      class="crm-card crm-card--contain flex h-full w-full flex-col p-4"
    >
      <div class="dash-panel-head">
        <div class="flex min-w-0 items-start gap-2.5">
          <span class="dash-panel-icon">
            <FeatherIcon :name="iconFor(item.name)" class="h-[18px] w-[18px]" />
          </span>
          <div class="min-w-0">
            <div class="dash-panel-title truncate">{{ item.data?.title }}</div>
            <div
              v-if="item.data?.subtitle"
              class="dash-panel-subtitle truncate"
            >
              {{ item.data.subtitle }}
            </div>
          </div>
        </div>
        <span v-if="measureFor(item)" class="dash-panel-measure">
          {{ measureFor(item) }}
        </span>
      </div>
      <div class="dash-panel-body">
        <AxisChart
          v-if="item.data && hasChartData(item)"
          :config="headlessConfig(item)"
        />
        <EmptyState
          v-else
          compact
          :name="item.data?.title || 'Data'"
          :icon="iconFor(item.name)"
          :title="emptyChartCopy(item).title"
          :description="emptyChartCopy(item).description"
        />
      </div>
    </div>

    <!-- Donut chart ---------------------------------------------------------
         Three states, because a ring is the right shape for only one of them:
         several segments -> the donut; exactly one -> a compact summary, since
         a circle drawn to say "100%" is the least informative use of a panel;
         none -> the shared empty state. -->
    <div
      v-else-if="item.type == 'donut_chart'"
      class="crm-card crm-card--contain flex h-full w-full flex-col p-4"
    >
      <div class="dash-panel-head">
        <div class="flex min-w-0 items-start gap-2.5">
          <span class="dash-panel-icon">
            <FeatherIcon :name="iconFor(item.name)" class="h-[18px] w-[18px]" />
          </span>
          <div class="min-w-0">
            <div class="dash-panel-title truncate">{{ item.data?.title }}</div>
            <div
              v-if="item.data?.subtitle"
              class="dash-panel-subtitle truncate"
            >
              {{ item.data.subtitle }}
            </div>
          </div>
        </div>
      </div>
      <div class="dash-panel-body">
        <!-- One segment: state the fact plainly rather than ringing it. -->
        <div v-if="isSingleSegment(item)" class="dash-solo">
          <div class="dash-solo-bar" aria-hidden="true" />
          <div class="dash-solo-text">
            <div class="dash-solo-value">{{ soloSegment(item).value }}</div>
            <div class="dash-solo-label">{{ soloSegment(item).label }}</div>
            <div class="dash-solo-note">
              {{
                __('All {0} in this period sit in a single group.', [
                  segmentTotal(item),
                ])
              }}
            </div>
          </div>
        </div>
        <DonutChart
          v-else-if="item.data && hasChartData(item)"
          :config="item.data"
        />
        <EmptyState
          v-else
          compact
          :name="item.data?.title || 'Data'"
          :icon="iconFor(item.name)"
          :title="emptyChartCopy(item).title"
          :description="emptyChartCopy(item).description"
        />
      </div>
    </div>
  </div>
</template>
<script setup>
import {
  AxisChart,
  DonutChart,
  NumberChart,
  Tooltip,
  FeatherIcon,
} from 'frappe-ui'
import EmptyState from '@/components/ListViews/EmptyState.vue'
import {
  iconFor,
  hueFor,
  captionFor,
  compactConfig,
  measureFor,
  headlessConfig,
  hasChartData,
  emptyChartCopy,
  donutSegments,
  isSingleSegment,
  segmentTotal,
} from '@/utils/dashboardCards'

defineProps({
  index: { type: Number, required: true },
  item: { type: Object, required: true },
  editing: { type: Boolean, default: false },
})

/** The lone segment of a single-segment donut. */
const soloSegment = (item) => donutSegments(item)[0] || { label: '', value: 0 }

// All card/panel presentation logic lives in utils so it can be unit tested;
// this component is left as the template that consumes it.
</script>
