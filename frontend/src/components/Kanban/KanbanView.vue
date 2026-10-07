<template>
  <!-- The board is ONE horizontal scroller. Every lane is a tinted surface in
       its own status colour — the tint IS the status, so the colour carries
       meaning rather than decorating five unrelated panels. `parseColor()`
       hands back a Tailwind *text* colour, so the lane sets `color` once here
       and every tint below is mixed from `currentColor`; anything inside that
       must not pick up the hue sets its own colour explicitly.
       `kb-board` carries scroll shadows, so a board wider than the viewport
       says so at its edge instead of just ending. -->
  <div class="kb-board" :class="{ 'is-editing': false }">
    <template v-if="columns">
      <div
        v-for="column in columns"
        :key="column.column.name"
        class="kb-col"
        :class="[
          parseColor(column.column.color),
          { 'kb-col--collapsed': isCollapsed(column.column.name) },
        ]"
      >
        <!-- Collapsed rail -->
        <template
          v-if="!column.column.delete && isCollapsed(column.column.name)"
        >
          <button
            type="button"
            class="kb-col-rail"
            :title="__('Expand {0}', [column.column.name])"
            :aria-label="__('Expand {0}', [column.column.name])"
            @click="toggleCollapse(column.column.name)"
          >
            <span class="kb-count">{{ column.column.count }}</span>
            <span class="kb-col-rail-label">{{ column.column.name }}</span>
          </button>
        </template>

        <!-- Expanded column -->
        <template v-else-if="!column.column.delete">
          <div class="kb-col-head group">
            <div class="flex min-w-0 items-center gap-2">
              <Popover>
                <template #target="{ togglePopover }">
                  <button
                    type="button"
                    class="kb-dot-btn"
                    :title="__('Change colour')"
                    :aria-label="__('Change column colour')"
                    @click="togglePopover"
                  >
                    <IndicatorIcon :class="parseColor(column.column.color)" />
                  </button>
                </template>
                <template #body>
                  <div class="kb-color-pop">
                    <div class="flex gap-1">
                      <Button
                        v-for="color in colors"
                        :key="color"
                        variant="ghost"
                        :aria-label="color"
                        @click="() => (column.column.color = color)"
                      >
                        <IndicatorIcon :class="parseColor(color)" />
                      </Button>
                    </div>
                    <div class="flex flex-row-reverse">
                      <Button
                        variant="solid"
                        :label="__('Apply')"
                        @click="updateColumn"
                      />
                    </div>
                  </div>
                </template>
              </Popover>
              <h3 class="kb-col-title" :title="column.column.name">
                {{ column.column.name }}
              </h3>
              <span class="kb-count">{{ column.column.count }}</span>
              <span v-if="sumField" class="kb-col-sum">
                {{ getFormattedSum(column) }}
              </span>
            </div>

            <div class="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                class="kb-icon-btn opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                :title="__('Collapse column')"
                :aria-label="__('Collapse {0}', [column.column.name])"
                @click="toggleCollapse(column.column.name)"
              >
                <FeatherIcon name="minus" class="size-3.5" />
              </button>
              <Dropdown :options="actions(column)">
                <template #default>
                  <button
                    type="button"
                    class="kb-icon-btn opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
                    :title="__('Column options')"
                  >
                    <FeatherIcon name="more-horizontal" class="size-3.5" />
                    <span class="sr-only">{{ __('Column options') }}</span>
                  </button>
                </template>
              </Dropdown>
              <!-- Always visible, and painted in the lane's own colour: it is
                   the one action in the header that is not a view control. -->
              <button
                type="button"
                class="kb-icon-btn kb-add-btn"
                :title="__('Add to {0}', [column.column.name])"
                :aria-label="__('Add to {0}', [column.column.name])"
                @click="options.onNewClick(column)"
              >
                <FeatherIcon name="plus" class="size-3.5" />
              </button>
            </div>
          </div>

          <!-- Cards -->
          <div class="kb-col-body">
            <Draggable
              :list="column.data"
              group="fields"
              item-key="name"
              class="kb-drop"
              :delay="isTouchScreenDevice() ? 200 : 0"
              :data-column="column.column.name"
              ghost-class="kanban-ghost-card"
              chosen-class="kanban-chosen-card"
              @end="updateColumn"
            >
              <template #item="{ element: fields }">
                <component
                  :is="options.getRoute ? 'router-link' : 'div'"
                  class="kb-card group/card"
                  :data-name="fields.name"
                  :tabindex="options.getRoute ? undefined : 0"
                  role="button"
                  v-bind="{
                    to: options.getRoute ? options.getRoute(fields) : undefined,
                    onClick: options.onClick
                      ? () => options.onClick(fields)
                      : undefined,
                    onKeydown: options.onClick
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            options.onClick(fields)
                          }
                        }
                      : undefined,
                  }"
                >
                  <slot
                    name="title"
                    v-bind="{ fields, titleField, itemName: fields.name }"
                  >
                    <div class="kb-card-title">
                      {{ fields[titleField] || __('No Title') }}
                    </div>
                  </slot>

                  <div class="kb-card-fields">
                    <template
                      v-for="value in visibleFields(column)"
                      :key="value"
                    >
                      <slot
                        name="fields"
                        v-bind="{
                          fields,
                          fieldName: value,
                          itemName: fields.name,
                        }"
                      >
                        <div v-if="fields[value]" class="kb-card-meta">
                          {{ fields[value] }}
                        </div>
                      </slot>
                    </template>
                  </div>

                  <slot name="actions" v-bind="{ itemName: fields.name }" />

                  <!-- Move-to-stage stays keyboard reachable; it is the
                       non-drag path for changing a card's column. -->
                  <div class="kb-card-move">
                    <Dropdown :options="getStageMoveOptions(fields)">
                      <template #default>
                        <button
                          type="button"
                          class="kb-icon-btn"
                          :title="__('Move to stage')"
                          @click.stop.prevent
                        >
                          <FeatherIcon name="repeat" class="size-3.5" />
                          <span class="sr-only">{{ __('Move to stage') }}</span>
                        </button>
                      </template>
                    </Dropdown>
                  </div>
                </component>
              </template>

              <!-- The empty state lives INSIDE the drop container, in the
                   footer slot. As a sibling below it, it sat on top of the
                   column's whole height while the drop zone itself collapsed
                   to 8px — so a card could be picked up but not dropped into
                   an empty column except by hitting an 8px sliver. It is
                   pointer-events:none as well, so it can never swallow a drag
                   that lands on top of it. -->
              <template #footer>
                <div v-if="!column.data?.length" class="kb-empty">
                  <span class="kb-empty-icon" aria-hidden="true">
                    <FeatherIcon :name="emptyIcon(column)" class="size-8" />
                  </span>
                  <p class="kb-empty-title">
                    {{ __('No {0} yet', [__(itemLabel)]) }}
                  </p>
                  <p class="kb-empty-hint">
                    {{
                      __('Drag and drop {0} here to mark them as {1}.', [
                        __(itemLabel),
                        column.column.name.toLowerCase(),
                      ])
                    }}
                  </p>
                </div>
              </template>
            </Draggable>

            <div
              v-if="column.column.count < column.column.all_count"
              class="px-1 pt-1"
            >
              <Button
                class="w-full"
                variant="subtle"
                :label="__('Load More')"
                @click="emit('loadMore', column.column.name)"
              />
            </div>
          </div>
        </template>
      </div>

      <!-- Add column -->
      <div class="kb-col kb-col--add">
        <Autocomplete
          value=""
          :options="deletedColumns"
          @change="(e) => addColumn(e)"
        >
          <template #target="{ togglePopover }">
            <Button
              class="w-full"
              variant="subtle"
              :label="__('Add Column')"
              iconLeft="plus"
              @click="togglePopover()"
            />
          </template>
          <template #footer>
            <Button
              class="mt-1 w-full"
              variant="ghost"
              :label="__('Reload Columns')"
              :iconLeft="RefreshIcon"
              @click="updateColumn(null, true)"
            />
          </template>
        </Autocomplete>
      </div>
    </template>

    <!-- Loading skeleton, in the same column shape so nothing jumps. -->
    <template v-else>
      <div
        v-for="i in 4"
        :key="i"
        class="kb-col"
        aria-busy="true"
        aria-label="Loading board"
      >
        <div class="kb-col-head">
          <div class="skeleton-shimmer size-3 rounded-full" />
          <div class="skeleton-shimmer h-3.5 w-24 rounded" />
        </div>
        <div class="kb-col-body">
          <SkeletonLoader v-for="j in 2" :key="j" type="card" />
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import RefreshIcon from '@/components/Icons/RefreshIcon.vue'
import Autocomplete from '@/components/frappe-ui/Autocomplete.vue'
import IndicatorIcon from '@/components/Icons/IndicatorIcon.vue'
import { isTouchScreenDevice, colors, parseColor } from '@/utils'
import { toneForStatus } from '@/utils/statusTheme'
import Draggable from 'vuedraggable'
import { Dropdown, Popover, FeatherIcon } from 'frappe-ui'
import { computed, ref } from 'vue'

const props = defineProps({
  options: {
    type: Object,
    default: () => ({
      getRoute: null,
      onClick: null,
      onNewClick: null,
      // Fieldnames the caller renders itself (e.g. promoted next to the title).
      hideFields: [],
    }),
  },
  sumField: { type: String, default: '' },
  formatValue: { type: Function, default: (val) => val },
  // Plural noun for the records on this board, used by the empty state
  // ("No tasks yet", "Drag and drop deals here…"). Passed through `__()` at
  // the call site, so it is a translation key like any other label.
  itemLabel: { type: String, default: 'items' },
})

const emit = defineEmits(['update', 'loadMore'])

const kanban = defineModel({ type: Object })

const collapsedColumns = ref([])

function isCollapsed(columnName) {
  return collapsedColumns.value.includes(columnName)
}

function toggleCollapse(columnName) {
  if (collapsedColumns.value.includes(columnName)) {
    collapsedColumns.value = collapsedColumns.value.filter(
      (name) => name !== columnName,
    )
  } else {
    collapsedColumns.value.push(columnName)
  }
}

/**
 * Fields to render on a card.
 *
 * A caller that wants to promote a field into its own `#title` slot must have
 * it removed HERE rather than `v-if`-ing it away inside `#fields`: Vue treats
 * a slot that renders only a comment (a false `v-if`) as empty and falls back
 * to this component's default renderer, so the field reappeared as raw text.
 * `options.hideFields` is the supported way to suppress one.
 */
function visibleFields(column) {
  const hidden = props.options?.hideFields || []
  return (column.fields || []).filter((f) => !hidden.includes(f))
}

function getColumnSum(column) {
  if (!props.sumField || !column.data) return 0
  return column.data.reduce((acc, row) => {
    let val = row[props.sumField]
    if (val && typeof val === 'object' && 'value' in val) {
      val = val.value
    } else if (val && typeof val === 'object' && 'label' in val) {
      val = val.label
    }
    if (typeof val === 'string') {
      val = val.replace(/,/g, '')
    }
    let num = parseFloat(val)
    return acc + (isNaN(num) ? 0 : num)
  }, 0)
}

function getFormattedSum(column) {
  const sum = getColumnSum(column)
  return props.formatValue(sum)
}

/**
 * The five semantic tones expressed in the vocabulary `parseColor()` speaks.
 * Keeping the bridge here rather than in statusTheme.js is deliberate: the
 * tone table is about meaning, and this Tailwind-colour-name alphabet is a
 * detail of how the kanban dot happens to be painted.
 */
const TONE_COLOR = {
  success: 'green',
  danger: 'red',
  warning: 'orange',
  info: 'blue',
  neutral: 'gray',
}

/**
 * Glyph for an empty lane, chosen from the same tone table rather than from a
 * status→icon list of its own: a board with custom statuses still gets an icon
 * that agrees with what the lane means, and there is nothing extra to keep in
 * sync when a status is added.
 */
const TONE_EMPTY_ICON = {
  success: 'check-circle',
  danger: 'slash',
  warning: 'clock',
  info: 'file-text',
  neutral: 'inbox',
}

function emptyIcon(column) {
  return TONE_EMPTY_ICON[toneForStatus(column.column.name)] || 'inbox'
}

const titleField = computed(() => {
  return kanban.value?.data?.title_field
})

const columns = computed(() => {
  if (!kanban.value?.data?.data || kanban.value.data.view_type != 'kanban')
    return []
  let _columns = kanban.value.data.data

  // Default colour comes from what the column MEANS, not from where it sits.
  // The old rule was `colors[i % colors.length]`, and since that array runs
  // gray, blue, green, red, pink… the fourth column was always red — which on
  // the task board is "Done". A completed column painted as an error state is
  // the exact failure the shared tone table exists to prevent, so the default
  // goes through toneForStatus() like every other status in the product.
  //
  // Changing the default is not enough on its own. `updateColumn()` persists
  // whatever colours are in memory on any column change, so every board that
  // was ever dragged has the old positional palette BAKED INTO its saved view
  // — and a plain `some(color)` check would treat that as a deliberate choice
  // and keep showing a red "Done" forever.
  //
  // A board whose colours are exactly `colors[i % colors.length]` was never
  // chosen by anyone; that sequence is the fingerprint of the old auto-fill.
  // Treat it as unset and re-derive. A board where someone actually picked a
  // colour will not match the sequence, so their choice still wins.
  const isLegacyAutoPalette =
    _columns.length > 0 &&
    _columns.every(
      (column, i) => column.column?.color === colors[i % colors.length],
    )
  let has_color =
    _columns.some((column) => column.column?.color) && !isLegacyAutoPalette
  if (!has_color) {
    _columns.forEach((column) => {
      column.column['color'] = TONE_COLOR[toneForStatus(column.column.name)]
    })
  }
  return _columns
})

const deletedColumns = computed(() => {
  const _columns = kanban.value?.data?.kanban_columns || []
  return _columns
    ?.filter((col) => col['delete'])
    .map((col) => {
      return { label: col.name, value: col.name }
    })
})

function actions(column) {
  return [
    {
      group: __('Options'),
      hideLabel: true,
      items: [
        {
          label: __('Delete'),
          icon: 'trash-2',
          onClick: () => {
            column.column['delete'] = true
            updateColumn()
          },
        },
      ],
    },
  ]
}

function getStageMoveOptions(card) {
  let colField = kanban.value.data.column_field
  let currentStage = card[colField]
  if (
    currentStage &&
    typeof currentStage === 'object' &&
    'label' in currentStage
  ) {
    currentStage = currentStage.label
  }

  let otherStages = (kanban.value.data.kanban_columns || []).filter(
    (col) => !col.delete && col.name !== currentStage,
  )

  return [
    {
      group: __('Move to Stage'),
      hideLabel: true,
      items: otherStages.map((stage) => ({
        label: stage.name,
        onClick: () => {
          emit('update', {
            item: card.name,
            to: stage.name,
            kanban_columns: kanban.value.data.kanban_columns,
          })
        },
      })),
    },
  ]
}

function addColumn(e) {
  let column = columns.value.find((col) => col.column.name == e.value)
  // Unguarded before: a name with no matching column dereferenced `undefined`,
  // and `indexOf` returning -1 fed a negative index to splice, which would
  // have deleted the *last* column instead.
  if (!column) return
  columns.value.splice(columns.value.indexOf(column), 1)
  column.column['delete'] = false
  columns.value.push(column)
  updateColumn()
}

function updateColumn(d, fetchNewColumns = false) {
  let toColumn = d?.to?.dataset.column
  let fromColumn = d?.from?.dataset.column
  let itemName = d?.item?.dataset.name

  let _columns = []
  columns.value.forEach((col) => {
    col.column['order'] = (col.data || []).map((d) => d.name)
    if (col.column.page_length) {
      delete col.column.page_length
    }
    _columns.push(col.column)
  })

  let data = { kanban_columns: _columns, fetchNewColumns }

  if (toColumn != fromColumn) {
    data = { item: itemName, to: toColumn, kanban_columns: _columns }
  }

  emit('update', data)
}
</script>
