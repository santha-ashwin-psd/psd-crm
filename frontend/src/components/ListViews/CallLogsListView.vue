<template>
  <div class="crm-table-card flex flex-col">
    <ListView
      :columns="columns"
      :rows="rows"
      :options="{
        onRowClick: (row) => emit('showCallLog', row.name),
        selectable: options.selectable,
        showTooltip: options.showTooltip,
        resizeColumn: options.resizeColumn,
      }"
      row-key="name"
      v-bind="$attrs"
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
      <ListRows
        v-slot="{ idx, column, item }"
        :rows="rows"
        doctype="CRM Call Log"
      >
        <ListRowItem :item="item" :align="column.align" class="overflow-hidden">
          <template #prefix>
            <div v-if="['caller', 'receiver'].includes(column.key)">
              <Avatar
                v-if="item.label"
                class="crm-name-avatar flex items-center"
                :image="item.image"
                :label="item.label"
                size="sm"
              />
            </div>
            <div v-else-if="['type', 'duration'].includes(column.key)">
              <FeatherIcon :name="item.icon" class="h-3 w-3" />
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
            <div v-else-if="column.key === 'status'">
              <StatusBadge
                :status="item.label"
                :label="__(item.label)"
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
            <div
              v-else-if="column.key === 'duration'"
              class="truncate text-base"
            >
              {{ label }}
            </div>
            <div
              v-else-if="['caller', 'receiver'].includes(column.key)"
              class="truncate text-base font-semibold text-ink-gray-9"
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
      :label="__('call logs')"
      @pageChange="(p) => emit('pageChange', p)"
      @pageSizeChange="(s) => emit('pageSizeChange', s)"
    />
  </div>
  <ListBulkActions
    ref="listBulkActionsRef"
    v-model="list"
    doctype="CRM Call Log"
    :options="{
      hideEdit: true,
      hideAssign: true,
    }"
  />
</template>
<script setup>
import StatusBadge from '@/components/StatusBadge.vue'
import HeartIcon from '@/components/Icons/HeartIcon.vue'
import ListBulkActions from '@/components/ListBulkActions.vue'
import ListPagination from '@/components/ListViews/ListPagination.vue'
import ListRows from '@/components/ListViews/ListRows.vue'
import RatingInput from '@/components/Controls/RatingInput.vue'
import { isTranslatable } from '@/utils'
import {
  Avatar,
  ListView,
  ListHeader,
  ListHeaderItem,
  ListSelectBanner,
  ListRowItem,
  Tooltip,
  Dropdown,
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
  'showCallLog',
  'loadMore',
  'updatePageCount',
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
  if (column.options && isTranslatable(column.options)) return __(label)
  return label
}

// Call-log status color comes through as a plain theme name ('green', 'red',
// …). Map it to the `!text-<color>-600` class the status pill drives its
// currentColor tint from (kept literal so Tailwind's safelist retains them).

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
