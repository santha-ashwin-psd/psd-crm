<!-- eslint-disable vue/no-v-html -->
<template>
  <div class="crm-table-card flex flex-col">
    <ListView
      :columns="columns"
      :rows="rows"
      :options="{
        onRowClick: (row) => emit('showTask', row.name),
        selectable: options.selectable,
        showTooltip: options.showTooltip,
        resizeColumn: options.resizeColumn,
      }"
      row-key="name"
      @update:selections="(selections) => emit('selectionsChanged', selections)"
    >
      <ListHeader @columnWidthUpdated="emit('columnWidthUpdated')">
        <ListHeaderItem
          v-for="column in columns"
          :key="column.key"
          :item="column"
          @columnWidthUpdated="(e) => onColumnWidthUpdated(e, column)"
        >
          <Button
            v-if="column.key == '_liked_by'"
            variant="ghost"
            class="!h-4"
            :class="isLikeFilterApplied ? 'fill-red-500' : 'fill-white'"
            @click="() => emit('applyLikeFilter')"
          >
            <HeartIcon class="h-4 w-4" />
          </Button>
        </ListHeaderItem>
      </ListHeader>
      <ListRows v-slot="{ idx, column, item }" :rows="rows" doctype="CRM Task">
        <div v-if="column.key === 'due_date' && item">
          <Tooltip
            :text="item && formatDate(item, 'ddd, MMM D, YYYY | hh:mm a')"
          >
            <div class="flex items-center gap-2 truncate text-base">
              <div><CalendarIcon /></div>
              <div class="truncate">
                {{ formatDate(item, 'D MMM, hh:mm a') }}
              </div>
            </div>
          </Tooltip>
        </div>
        <ListRowItem
          v-else
          :item="item"
          :align="column.align"
          class="overflow-hidden"
        >
          <template #prefix>
            <div v-if="column.key === 'priority'">
              <TaskPriorityIcon :priority="item" />
            </div>
            <div v-else-if="column.key === 'assigned_to'">
              <Avatar
                v-if="item.full_name"
                class="flex items-center"
                :image="item.user_image"
                :label="item.full_name"
                size="sm"
              />
            </div>
          </template>
          <template #default="{ label }">
            <div
              v-if="['modified', 'creation'].includes(column.key)"
              class="truncate text-base"
              @click="
                (event) =>
                  emit('applyFilter', {
                    event,
                    idx,
                    column,
                    item,
                    firstColumn: columns[0],
                  })
              "
            >
              <Tooltip :text="item.label">
                <div>{{ item.timeAgo }}</div>
              </Tooltip>
            </div>
            <div
              v-else-if="column.type === 'Text Editor'"
              class="truncate text-base h-4 [&>p]:truncate"
              v-html="sanitizeHTML(item)"
            />
            <div v-else-if="column.type === 'Check'">
              <FormControl
                type="checkbox"
                :modelValue="item"
                :disabled="true"
                class="text-ink-gray-9"
              />
            </div>
            <div v-else-if="column.key === '_liked_by'">
              <Button
                v-if="column.key == '_liked_by'"
                variant="ghost"
                :class="isLiked(item) ? 'fill-red-500' : 'fill-white'"
                @click.stop.prevent="
                  () =>
                    emit('likeDoc', { name: row.name, liked: isLiked(item) })
                "
              >
                <HeartIcon class="h-4 w-4" />
              </Button>
            </div>
            <RatingInput
              v-else-if="column.type === 'Rating'"
              :value="item"
              class="!opacity-100 flex-nowrap overflow-auto"
              :disabled="true"
              :max="column.options || 5"
              @click="
                (event) =>
                  emit('applyFilter', {
                    event,
                    idx,
                    column,
                    item,
                    firstColumn: columns[0],
                  })
              "
            />
            <div v-else-if="column.key === 'status'">
              <StatusBadge
                :status="item"
                :label="getLabel(label, column)"
                @click="
                  (event) =>
                    emit('applyFilter', {
                      event,
                      idx,
                      column,
                      item,
                      firstColumn: columns[0],
                    })
                "
              />
            </div>
            <div
              v-else-if="label"
              class="truncate text-base"
              @click="
                (event) =>
                  emit('applyFilter', {
                    event,
                    idx,
                    column,
                    item,
                    firstColumn: columns[0],
                  })
              "
            >
              {{ getLabel(label, column) }}
            </div>
          </template>
        </ListRowItem>
      </ListRows>
      <ListSelectBanner class="custom-select-banner">
        <template #actions="{ selections, unselectAll }">
          <div class="flex items-center gap-2">
            <!-- Desktop & Tablet Horizontal Actions List -->
            <Button
              v-for="action in listBulkActionsRef.bulkActions(
                selections,
                unselectAll,
              )"
              :key="action.label"
              variant="ghost"
              class="hover:bg-[var(--crm-surface)]/10 text-white font-medium text-xs hidden sm:inline-flex rounded-lg px-2.5 py-1.5"
              @click="action.onClick"
            >
              {{ action.label }}
            </Button>
            <!-- Mobile Dropdown Trigger -->
            <Dropdown
              :options="listBulkActionsRef.bulkActions(selections, unselectAll)"
              class="sm:hidden"
            >
              <template #default>
                <Button
                  icon="lucide-more-horizontal"
                  variant="ghost"
                  class="text-white hover:bg-[var(--crm-surface)]/10"
                />
              </template>
            </Dropdown>
          </div>
        </template>
      </ListSelectBanner>
    </ListView>
    <ListPagination
      v-if="list?.data?.total_count"
      :list="list"
      :label="__('tasks')"
      @pageChange="(p) => emit('pageChange', p)"
      @pageSizeChange="(s) => emit('pageSizeChange', s)"
    />
  </div>
  <ListBulkActions
    ref="listBulkActionsRef"
    v-model="list"
    doctype="CRM Task"
    :options="{
      hideAssign: true,
    }"
  />
</template>
<script setup>
import StatusBadge from '@/components/StatusBadge.vue'
import HeartIcon from '@/components/Icons/HeartIcon.vue'
import TaskPriorityIcon from '@/components/Icons/TaskPriorityIcon.vue'
import CalendarIcon from '@/components/Icons/CalendarIcon.vue'
import RatingInput from '@/components/Controls/RatingInput.vue'
import ListBulkActions from '@/components/ListBulkActions.vue'
import ListPagination from '@/components/ListViews/ListPagination.vue'
import ListRows from '@/components/ListViews/ListRows.vue'
import {
  formatDate,
  isTranslatable,
  formatDuration,
  sanitizeHTML,
} from '@/utils'
import {
  Avatar,
  ListView,
  ListHeader,
  ListHeaderItem,
  ListSelectBanner,
  ListRowItem,
  Dropdown,
  Tooltip,
} from 'frappe-ui'
import { sessionStore } from '@/stores/session'
import { ref, computed, watch } from 'vue'

defineProps({
  rows: { type: Array, required: true },
  columns: { type: Array, required: true },
  options: {
    type: Object,
    default: () => ({
      selectable: true,
      showTooltip: true,
      resizeColumn: false,
      totalCount: 0,
      rowCount: 0,
    }),
  },
})

const emit = defineEmits([
  'loadMore',
  'updatePageCount',
  'showTask',
  'columnWidthUpdated',
  'applyFilter',
  'applyLikeFilter',
  'likeDoc',
  'selectionsChanged',
  'pageChange',
  'pageSizeChange',
])

const pageLengthCount = defineModel({ type: Number })
const list = defineModel('list', { type: Object })

function onColumnWidthUpdated({ width, save }, column) {
  column.width = width
  if (save) emit('columnWidthUpdated', column)
}

function getLabel(label, column) {
  if (column.type === 'Duration') return formatDuration(label)
  if (column.options && isTranslatable(column.options)) return __(label)
  return label
}

// Task status is a Select value string; map it to the `!text-<color>-600`
// class the status pill tints from (kept literal for Tailwind's safelist).

const isLikeFilterApplied = computed(() => {
  return list.value.params?.filters?._liked_by ? true : false
})

const { user } = sessionStore()

function isLiked(item) {
  if (item) {
    let likedByMe = JSON.parse(item)
    return likedByMe.includes(user)
  }
}

watch(pageLengthCount, (val, old_value) => {
  if (val === old_value) return
  emit('updatePageCount', val)
})

const listBulkActionsRef = ref(null)

defineExpose({
  customListActions: computed(
    () => listBulkActionsRef.value?.customListActions,
  ),
})
</script>
