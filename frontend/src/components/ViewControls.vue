<template>
  <div
    v-if="isMobileView"
    class="flex flex-col justify-between gap-2 sm:px-5 px-3 py-4"
  >
    <div class="flex flex-col gap-2">
      <div class="flex items-center justify-between gap-2 overflow-x-auto">
        <div class="flex gap-2">
          <Filter
            v-model="list"
            :doctype="doctype"
            :default_filters="filters"
            @update="updateFilter"
          />
          <GroupBy
            v-if="route.params.viewType === 'group_by'"
            v-model="list"
            :doctype="doctype"
            :hideLabel="isMobileView"
            @update="updateGroupBy"
          />
        </div>

        <div class="flex gap-2">
          <Button
            :tooltip="__('Refresh')"
            :label="__('Refresh')"
            :icon="RefreshIcon"
            :loading="isLoading"
            @click="reload()"
          />
          <SortBy
            v-if="route.params.viewType !== 'kanban'"
            v-model="list"
            :doctype="doctype"
            :hideLabel="isMobileView"
            @update="updateSort"
          />
          <KanbanSettings
            v-if="route.params.viewType === 'kanban'"
            v-model="list"
            :doctype="doctype"
            @update="updateKanbanSettings"
          />
          <ColumnSettings
            v-else-if="!options.hideColumnsButton"
            v-model="list"
            :doctype="doctype"
            :hideLabel="isMobileView"
            @update="(isDefault) => updateColumns(isDefault)"
          />
        </div>
      </div>
      <div
        v-if="viewUpdated && route.query.view && (!view.public || isManager())"
        class="flex flex-row-reverse items-center gap-2 border-r pr-2"
      >
        <Button :label="__('Cancel')" @click="cancelChanges" />
        <Button :label="__('Save Changes')" @click="saveView" />
      </div>
    </div>
  </div>
  <div
    v-else-if="customizeQuickFilter"
    class="flex items-center justify-between gap-2 p-5"
  >
    <div class="flex flex-1 items-center overflow-hidden pl-1 gap-2">
      <FadedScrollableDiv
        class="flex overflow-x-auto -ml-1"
        orientation="horizontal"
      >
        <Draggable
          class="flex w-full gap-2 items-center"
          :list="newQuickFilters"
          group="filters"
          item-key="fieldname"
        >
          <template #item="{ element: filter }">
            <div class="group whitespace-nowrap cursor-grab">
              <Button class="cursor-grab">
                <template #default>
                  <Tooltip :text="filter.fieldname">
                    <span>{{ filter.label }}</span>
                  </Tooltip>
                </template>
                <template #suffix>
                  <span
                    class="lucide-x h-3.5 cursor-pointer group-hover:flex hidden"
                    aria-hidden="true"
                    @click.stop="removeQuickFilter(filter)"
                  />
                </template>
              </Button>
            </div>
          </template>
        </Draggable>
      </FadedScrollableDiv>
      <div>
        <Autocomplete
          value=""
          :options="quickFilterOptions"
          @change="(e) => addQuickFilter(e)"
        >
          <template #target="{ togglePopover }">
            <Button
              class="whitespace-nowrap mr-2"
              variant="ghost"
              :label="__('Add Filter')"
              iconLeft="plus"
              @click="togglePopover()"
            />
          </template>
          <template #item-label="{ option }">
            <Tooltip :text="option.value" :hover-delay="1">
              <div class="flex-1 truncate text-ink-gray-7">
                {{ option.label }}
              </div>
            </Tooltip>
          </template>
        </Autocomplete>
      </div>
    </div>
    <div class="-ml-2 h-[70%] border-l" />
    <div class="flex gap-1">
      <Button
        :label="__('Save')"
        :loading="updateQuickFilters.loading"
        @click="saveQuickFilters"
      />
      <Button icon="lucide-x" @click="customizeQuickFilter = false" />
    </div>
  </div>
  <!-- Toolbar, not a card. This used to be a full surface — rounded, bordered,
       shadowed — which put a card between the KPI band's cards and the table's
       card. It now sits directly on the page background, the way it already
       did below the `sm` breakpoint, so the table is the only card on the page.
       Insets match .crm-table-card's margins so the controls line up with the
       columns beneath them. -->
  <div
    v-else
    class="flex items-center justify-between gap-3 mx-3 sm:mx-5 mt-3 py-1"
  >
    <FadedScrollableDiv
      class="crm-quick-filters flex flex-1 items-center gap-2 overflow-x-auto"
      orientation="horizontal"
    >
      <div
        v-for="filter in quickFilterList"
        :key="filter.fieldname"
        class="min-w-36 shrink-0"
      >
        <QuickFilterField
          :filter="filter"
          @applyQuickFilter="(f, v) => applyQuickFilter(f, v)"
        />
      </div>
    </FadedScrollableDiv>
    <div class="h-6 w-px shrink-0 bg-[var(--crm-border)]" />
    <div class="flex items-center gap-2">
      <div
        v-if="viewUpdated && route.query.view && (!view.public || isManager())"
        class="flex items-center gap-2 border-r pr-2"
      >
        <Button :label="__('Cancel')" @click="cancelChanges" />
        <Button :label="__('Save Changes')" @click="saveView" />
      </div>
      <div class="crm-toolbar-actions flex items-center gap-2">
        <Button
          :tooltip="__('Refresh')"
          :label="__('Refresh')"
          :icon="RefreshIcon"
          :loading="isLoading"
          @click="reload()"
        />
        <GroupBy
          v-if="route.params.viewType === 'group_by'"
          v-model="list"
          :doctype="doctype"
          @update="updateGroupBy"
        />
        <Filter
          v-model="list"
          :doctype="doctype"
          :default_filters="filters"
          @update="updateFilter"
        />
        <SortBy
          v-if="route.params.viewType !== 'kanban'"
          v-model="list"
          :doctype="doctype"
          @update="updateSort"
        />
        <KanbanSettings
          v-if="route.params.viewType === 'kanban'"
          v-model="list"
          :doctype="doctype"
          @update="updateKanbanSettings"
        />
        <ColumnSettings
          v-else-if="!options.hideColumnsButton"
          v-model="list"
          :doctype="doctype"
          @update="(isDefault) => updateColumns(isDefault)"
        />
        <Dropdown
          v-if="route.params.viewType !== 'kanban' || isManager()"
          placement="right"
          :options="[
            {
              group: __('Options'),
              hideLabel: true,
              items: [
                {
                  label: __('Import'),
                  icon: () => h(ImportIcon, { class: 'h-4 w-4' }),
                  onClick: () =>
                    router.push({
                      name: 'NewDataImport',
                      params: { doctype: doctype },
                    }),
                  condition: () =>
                    !options.hideColumnsButton &&
                    route.params.viewType !== 'kanban',
                },
                {
                  label: __('Export'),
                  icon: () => h(ExportIcon, { class: 'h-4 w-4' }),
                  onClick: () => (showExportDialog = true),
                  condition: () =>
                    !options.hideColumnsButton &&
                    route.params.viewType !== 'kanban',
                },
                {
                  label: __('Customize Quick Filters'),
                  icon: () => h(QuickFilterIcon, { class: 'h-4 w-4' }),
                  onClick: () => showCustomizeQuickFilter(),
                  condition: () => isManager(),
                },
              ],
            },
          ]"
        >
          <template #default>
            <Button
              :tooltip="__('More Options')"
              :label="__('More Options')"
              icon="lucide-more-horizontal"
            />
          </template>
        </Dropdown>
      </div>
    </div>
  </div>
  <div
    v-if="appliedFilterChips.length"
    class="flex flex-wrap items-center gap-2 px-5 py-2.5 bg-[var(--crm-surface-2)] border-b border-[var(--crm-border)]"
  >
    <span
      class="text-xs font-semibold text-[var(--crm-text-3)] font-sans uppercase tracking-wider mr-1"
      >{{ __('Active Filters:') }}</span
    >
    <div
      v-for="chip in appliedFilterChips"
      :key="chip.fieldname"
      class="flex items-center gap-1.5 px-2.5 py-1 bg-brand-50 border border-brand-100 hover:border-brand-200 text-brand-700 hover:text-brand-800 rounded-full text-xs font-medium transition-all duration-150"
    >
      <span>{{ chip.label }}: {{ chip.displayValue }}</span>
      <button
        class="hover:bg-brand-100 rounded-full p-0.5 transition-colors focus:outline-none"
        @click="removeFilterField(chip.fieldname)"
      >
        <FeatherIcon name="x" class="size-3" />
      </button>
    </div>
    <button
      class="text-xs text-[var(--crm-text-3)] hover:text-brand-600 font-medium ml-2 transition-colors focus:outline-none"
      @click="clearAllCustomFilters"
    >
      {{ __('Clear all') }}
    </button>
  </div>
  <ViewModal
    v-model="showViewModal"
    v-model:view="viewModalObj"
    :doctype="doctype"
    :options="{
      afterCreate: async (v) => {
        await reloadView()
        viewUpdated = false
        router.push({
          name: route.name,
          params: { viewType: v.type || 'list' },
          query: { view: v.name },
        })
      },
      afterUpdate: () => {
        viewUpdated = false
        reloadView()
        list.reload()
      },
    }"
  />
  <CrmDialog
    v-model:open="showExportDialog"
    size="sm"
    icon="download"
    :title="__('Export')"
    :subtitle="__('Choose a format and how much to include')"
  >
    <template #default>
      <FormControl
        v-model="export_type"
        variant="outline"
        :label="__('Export Type')"
        type="select"
        :options="[
          {
            label: __('Excel'),
            value: 'Excel',
          },
          {
            label: __('CSV'),
            value: 'CSV',
          },
        ]"
        :placeholder="__('Excel')"
      />
      <div class="mt-3">
        <FormControl
          v-model="export_all"
          type="checkbox"
          :label="__('Export all {0} record(s)', [list.data?.total_count ?? 0])"
        />
      </div>
    </template>
    <template #footer>
      <Button
        variant="solid"
        :label="__('Download')"
        @click="() => exportRows()"
      />
    </template>
  </CrmDialog>
</template>
<script setup>
import CrmDialog from '@/components/Modals/CrmDialog.vue'
import ListIcon from '@/components/Icons/ListIcon.vue'
import KanbanIcon from '@/components/Icons/KanbanIcon.vue'
import GroupByIcon from '@/components/Icons/GroupByIcon.vue'
import QuickFilterField from '@/components/QuickFilterField.vue'
import RefreshIcon from '@/components/Icons/RefreshIcon.vue'
import EditIcon from '@/components/Icons/EditIcon.vue'
import DuplicateIcon from '@/components/Icons/DuplicateIcon.vue'
import CheckIcon from '@/components/Icons/CheckIcon.vue'
import PinIcon from '@/components/Icons/PinIcon.vue'
import UnpinIcon from '@/components/Icons/UnpinIcon.vue'
import ExportIcon from '@/components/Icons/ExportIcon.vue'
import QuickFilterIcon from '@/components/Icons/QuickFilterIcon.vue'
import ViewModal from '@/components/Modals/ViewModal.vue'
import Autocomplete from '@/components/frappe-ui/Autocomplete.vue'
import SortBy from '@/components/SortBy.vue'
import Filter from '@/components/Filter.vue'
import GroupBy from '@/components/GroupBy.vue'
import FadedScrollableDiv from '@/components/FadedScrollableDiv.vue'
import ColumnSettings from '@/components/ColumnSettings.vue'
import KanbanSettings from '@/components/Kanban/KanbanSettings.vue'
import { getSettings } from '@/stores/settings'
import { globalStore } from '@/stores/global'
import { viewsStore } from '@/stores/views'
import { usersStore } from '@/stores/users'
import { getMeta } from '@/stores/meta'
import { isEmoji } from '@/utils'
import {
  Tooltip,
  createResource,
  Dropdown,
  toast,
  call,
  FeatherIcon,
  usePageMeta,
} from 'frappe-ui'
import { computed, ref, watch, h, markRaw } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { DEFAULT_PAGE_LENGTH, usePageLength } from '@/composables/pageLength'
import { formatError } from '@/utils/formatError'
import { isMobileView } from '@/composables/settings'
import Draggable from 'vuedraggable'
// Only isEqual: importing all of lodash added ~500 KB to every list page.
import isEqual from 'lodash/isEqual'
import { askFollowUp, isFollowUpStage } from '@/composables/followUp'
import ImportIcon from '~icons/lucide/import'

const props = defineProps({
  doctype: { type: String, required: true },
  filters: { type: Object, default: () => ({}) },
  options: {
    type: Object,
    default: () => ({
      hideColumnsButton: false,
      defaultViewName: '',
      allowedViews: ['list'],
    }),
  },
})

const { brand } = getSettings()
const { $dialog } = globalStore()
const { reload: reloadView, getDefaultView, getView } = viewsStore()
const { isManager } = usersStore()

const list = defineModel({ type: Object, default: () => ({}) })
const loadMore = defineModel('loadMore', { type: Boolean })
const resizeColumn = defineModel('resizeColumn', { type: Boolean })
const updatedPageCount = defineModel('updatedPageCount', { type: Boolean })

const route = useRoute()
const router = useRouter()

const defaultParams = ref('')

const viewUpdated = ref(false)
const showViewModal = ref(false)

function getViewType() {
  let viewType = route.params.viewType || 'list'
  let types = {
    list: {
      name: 'list',
      label: __('List'),
      icon: markRaw(ListIcon),
    },
    group_by: {
      name: 'group_by',
      label: __('Group By'),
      icon: markRaw(GroupByIcon),
    },
    kanban: {
      name: 'kanban',
      label: __('Kanban'),
      icon: markRaw(KanbanIcon),
    },
  }

  return types[viewType]
}

const currentView = computed(() => {
  let _view = getView(route.query.view, route.params.viewType, props.doctype)
  return {
    name: _view?.name || getViewType().name,
    label:
      _view?.label || props.options?.defaultViewName || getViewType().label,
    icon: _view?.icon || getViewType().icon,
    is_standard: !_view || _view.is_standard,
  }
})

usePageMeta(() => {
  let label = currentView.value.label
  if (currentView.value.is_standard) {
    let routeName = route.name
    label = `${__(routeName)} - ${__(label)}`
  }
  return {
    title: label,
    emoji: isEmoji(currentView.value.icon) ? currentView.value.icon : '',
    icon: brand.favicon,
  }
})

const view = ref({
  name: '',
  label: '',
  type: 'list',
  icon: '',
  filters: {},
  order_by: 'modified desc',
  column_field: 'status',
  title_field: '',
  kanban_columns: '',
  kanban_fields: '',
  columns: '',
  rows: '',
  load_default_columns: false,
  pinned: false,
  public: false,
})

// Persisted per device (not on CRM View Settings — those rows can be public,
// so one user picking 100 would change the page size for everyone).
const storedPageLength = usePageLength(
  props.doctype,
  route.query.view || route.params.viewType || 'default',
)

const pageLength = computed(
  () => list.value?.data?.page_length || storedPageLength.value,
)
const pageLengthCount = computed(
  () => list.value?.data?.page_length_count || storedPageLength.value,
)

// Offset-based numbered pagination. `start` is the row offset of the current
// page; page size is page_length_count. Any filter/sort/view change resets to
// page 1 (see resetPage()).
const paginationStart = ref(0)

function resetPage() {
  paginationStart.value = 0
  if (list.value?.params) list.value.params.start = 0
}

const paginationInfo = computed(() => {
  const size = pageLengthCount.value || DEFAULT_PAGE_LENGTH
  const total = list.value?.data?.total_count || 0
  const rowCount = list.value?.data?.row_count || 0
  const start = paginationStart.value || 0
  return {
    total,
    pageSize: size,
    currentPage: Math.floor(start / size) + 1,
    totalPages: Math.max(1, Math.ceil(total / size)),
    from: total === 0 ? 0 : start + 1,
    to: start + rowCount,
    loading: !!list.value?.loading,
  }
})

function goToPage(page) {
  if (list.value?.loading) return
  const size = pageLengthCount.value || DEFAULT_PAGE_LENGTH
  const maxPage = Math.max(
    1,
    Math.ceil((list.value?.data?.total_count || 0) / size),
  )
  const p = Math.min(Math.max(1, page), maxPage)
  paginationStart.value = (p - 1) * size
  list.value.params = {
    ...(list.value.params || getParams()),
    start: paginationStart.value,
    page_length: size,
  }
  list.value.reload()
}

// Books-style "Show N entries": change the page size and jump back to page 1.
function setPageSize(size) {
  if (list.value?.loading) return
  storedPageLength.value = size
  paginationStart.value = 0
  list.value.params = {
    ...(list.value.params || getParams()),
    start: 0,
    page_length: size,
    page_length_count: size,
  }
  list.value.reload()
}

watch(loadMore, (value) => {
  if (!value) return
  updatePageLength(value, true)
})

watch(resizeColumn, (value) => {
  if (!value) return
  updateColumns()
})

watch(updatedPageCount, (value) => {
  if (!value) return
  updatePageLength(value)
})

function getParams() {
  let _view = getView(route.query.view, route.params.viewType, props.doctype)
  const view_name = _view?.name || ''
  const view_type = _view?.type || route.params.viewType || 'list'
  const filters = (_view?.filters && JSON.parse(_view.filters)) || {}
  const order_by = _view?.order_by || 'modified desc'
  const group_by_field = _view?.group_by_field || 'owner'
  const columns = _view?.columns || ''
  const rows = _view?.rows || ''
  const column_field = _view?.column_field || 'status'
  const title_field = _view?.title_field || ''
  const kanban_columns = _view?.kanban_columns || ''
  const kanban_fields = _view?.kanban_fields || ''

  view.value = {
    name: view_name,
    label: _view?.label || getViewType().label,
    type: view_type,
    icon: _view?.icon || '',
    filters: filters,
    order_by: order_by,
    group_by_field: group_by_field,
    column_field: column_field,
    title_field: title_field,
    kanban_columns: kanban_columns,
    kanban_fields: kanban_fields,
    columns: columns,
    rows: rows,
    route_name: _view?.route_name || route.name,
    // `_view?.row || true` before: `row` is not a field on a view (it is
    // `rows`), and `|| true` made the result true regardless. `view.value` is
    // what gets saved, so changing a filter or a sort on a view with custom
    // columns wrote load_default_columns=1 back and the server then served
    // the doctype defaults — the user's column layout was gone.
    load_default_columns: _view?.load_default_columns || false,
    pinned: _view?.pinned || false,
    public: _view?.public || false,
  }

  return {
    doctype: props.doctype,
    filters: filters,
    order_by: order_by,
    default_filters: props.filters,
    view: {
      custom_view_name: view_name,
      view_type: view_type,
      group_by_field: group_by_field,
    },
    column_field: column_field,
    title_field: title_field,
    kanban_columns: kanban_columns,
    kanban_fields: kanban_fields,
    columns: columns,
    rows: rows,
    page_length: pageLength.value,
    page_length_count: pageLengthCount.value,
    start: paginationStart.value,
  }
}

const initialParams = getParams()

const listResource = createResource({
  url: 'xbr_crm.api.doc.get_data',
  params: initialParams,
  cache: [props.doctype, route.query.view, route.params.viewType],
  auto: true,
  onSuccess(data) {
    let cv = getView(route.query.view, route.params.viewType, props.doctype)
    let params = list.value.params ? list.value.params : getParams()
    defaultParams.value = {
      doctype: props.doctype,
      filters: params.filters,
      order_by: params.order_by,
      default_filters: props.filters,
      view: {
        custom_view_name: cv?.name || '',
        view_type: cv?.type || route.params.viewType || 'list',
        group_by_field: params?.view?.group_by_field || 'owner',
      },
      column_field: data.column_field,
      title_field: data.title_field,
      kanban_columns: data.kanban_columns,
      kanban_fields: data.kanban_fields,
      columns: data.columns,
      rows: data.rows,
      page_length: params.page_length,
      page_length_count: params.page_length_count,
    }
  },
})

/* frappe-ui initialises a resource with `params: null` and only ever passes
   `options.params` to the request — it never writes them back onto the resource
   (resources.js:46,63,67). So after the `auto` fetch `list.value.params` is
   still null, and every handler that spreads `list.value.params.filters` throws
   into Vue's error handler: the quick filters, the filter chips, sort, export
   and the kanban "+" all silently do nothing on a fresh page load.

   `setPageSize()` below is the only handler written with a `|| getParams()`
   guard, which is exactly why changing the page size "unblocks" filtering.
   Seeding the same object here fixes all of them at once, and the request is
   unchanged — `fetch()` already falls back to `options.params`.

   Seed the resource object itself, before handing it to the model. `list` is a
   defineModel (line ~403), so `list.value = x` round-trips through the parent
   and `list.value.params = …` immediately afterwards is not guaranteed to land
   on the resource everything else holds a reference to.

   The `if` matters on a cache hit: createResource returns the previous
   instance's resource, which already has real params from its own fetch. */
if (!listResource.params) listResource.params = initialParams

list.value = listResource

const isLoading = computed(() => list.value?.loading)

function reload() {
  if (isLoading.value) return
  paginationStart.value = 0
  list.value.params = getParams()
  list.value.reload()
}

const showExportDialog = ref(false)
const export_type = ref('Excel')
const export_all = ref(false)
const selectedRows = ref([])

function updateSelections(selections) {
  selectedRows.value = Array.from(selections)
}

async function exportRows() {
  let fields = JSON.stringify(list.value.data.columns.map((f) => f.key))

  let filters = JSON.stringify({
    ...props.filters,
    ...list.value.params.filters,
  })

  let order_by = list.value.params.order_by
  // `params.page_length` is only filled in once something rebuilds the params
  // (a reload, a page-size change). Straight after the first load it is still
  // undefined, and the export URL went out with `page_length=undefined`.
  // `data.page_length` is what the server actually applied.
  let page_length =
    list.value.params.page_length ?? list.value.data?.page_length ?? 20
  if (export_all.value) {
    page_length = list.value.data.total_count
  }

  let url = `/api/method/frappe.desk.reportview.export_query?file_format_type=${export_type.value}&title=${props.doctype}&doctype=${props.doctype}&fields=${fields}&filters=${encodeURIComponent(filters)}&order_by=${order_by}&page_length=${page_length}&start=0&view=Report&with_comment_count=1`

  // Add selected items parameter if rows are selected
  if (selectedRows.value?.length && !export_all.value) {
    url += `&selected_items=${JSON.stringify(selectedRows.value)}`
  }

  window.location.href = url

  showExportDialog.value = false
  export_all.value = false
  export_type.value = 'Excel'
}

let standardViews = []
let allowedViews = props.options.allowedViews || ['list']

if (allowedViews.includes('list')) {
  standardViews.push({
    name: 'list',
    label: __(props.options?.defaultViewName) || __('List'),
    icon: markRaw(ListIcon),
    onClick() {
      viewUpdated.value = false
      router.push({ name: route.name, params: { viewType: 'list' } })
    },
  })
}
if (allowedViews.includes('kanban')) {
  standardViews.push({
    name: 'kanban',
    label: __(props.options?.defaultViewName) || __('Kanban'),
    icon: markRaw(KanbanIcon),
    onClick() {
      viewUpdated.value = false
      router.push({ name: route.name, params: { viewType: 'kanban' } })
    },
  })
}
if (allowedViews.includes('group_by')) {
  standardViews.push({
    name: 'group_by',
    label: __(props.options?.defaultViewName) || __('Group By'),
    icon: markRaw(GroupByIcon),
    onClick() {
      viewUpdated.value = false
      router.push({ name: route.name, params: { viewType: 'group_by' } })
    },
  })
}

function getIcon(icon, type) {
  if (isEmoji(icon)) {
    return h('div', icon)
  } else if (!icon && type === 'group_by') {
    return markRaw(GroupByIcon)
  } else if (!icon && type === 'kanban') {
    return markRaw(KanbanIcon)
  }
  return icon || markRaw(ListIcon)
}

const viewsDropdownOptions = computed(() => {
  let _views = [
    {
      group: __('Standard Views'),
      hideLabel: true,
      items: standardViews.map((item) => ({
        ...item,
        selected: item.name === currentView.value.name,
      })),
    },
  ]

  if (list.value?.data?.views) {
    list.value.data.views.forEach((view) => {
      view.label = __(view.label)
      view.type = view.type || 'list'
      view.icon = getIcon(view.icon, view.type)
      view.selected = view.name === currentView.value.name
      view.filters =
        typeof view.filters == 'string'
          ? JSON.parse(view.filters)
          : view.filters
      view.onClick = () => {
        viewUpdated.value = false
        router.push({
          name: route.name,
          params: { viewType: view.type },
          query: { view: view.name },
        })
      }
    })
    let publicViews = list.value.data.views.filter((v) => v.public)
    let savedViews = list.value.data.views.filter(
      (v) => !v.pinned && !v.public && !v.is_standard,
    )
    let pinnedViews = list.value.data.views.filter((v) => v.pinned)

    if (savedViews.length) {
      _views.push({
        group: __('Saved Views'),
        items: savedViews,
      })
    }
    if (publicViews.length) {
      _views.push({
        group: __('Public Views'),
        items: publicViews,
      })
    }
    if (pinnedViews.length) {
      _views.push({
        group: __('Pinned Views'),
        items: pinnedViews,
      })
    }
  }

  _views.push({
    group: __('Actions'),
    hideLabel: true,
    items: [
      {
        label: __('Create View'),
        icon: 'plus',
        onClick: () => createView(),
      },
    ],
  })

  return _views
})

const { getFields } = getMeta(props.doctype)

const customizeQuickFilter = ref(false)

function showCustomizeQuickFilter() {
  customizeQuickFilter.value = true
  setupNewQuickFilters(quickFilters.data)
}

const newQuickFilters = ref([])

function addQuickFilter(f) {
  if (!newQuickFilters.value.some((filter) => filter.fieldname === f.value)) {
    newQuickFilters.value.push({
      label: f.label,
      fieldname: f.value,
      fieldtype: f.fieldtype,
    })
  }
}

function removeQuickFilter(f) {
  newQuickFilters.value = newQuickFilters.value.filter(
    (filter) => filter.fieldname !== f.fieldname,
  )
}

const updateQuickFilters = createResource({
  url: 'xbr_crm.api.doc.update_quick_filters',
  onSuccess() {
    customizeQuickFilter.value = false

    quickFilters.update({ params: { doctype: props.doctype, cached: false } })
    quickFilters.reload()
    toast.success(__('Quick filters updated successfully'))
  },
})

function saveQuickFilters() {
  let new_filters =
    newQuickFilters.value?.map((filter) => filter.fieldname) || []
  let old_filters = quickFilters.data?.map((filter) => filter.fieldname) || []

  updateQuickFilters.update({
    params: {
      quick_filters: JSON.stringify(new_filters),
      old_filters: JSON.stringify(old_filters),
      doctype: props.doctype,
    },
  })

  updateQuickFilters.fetch()
}

const quickFilterOptions = computed(() => {
  let fields = getFields()
  if (!fields) return []

  let existingQuickFilters = newQuickFilters.value.map((f) => f.fieldname)
  let options = fields
    .filter((f) => f.label)
    .filter((f) => !existingQuickFilters.includes(f.fieldname))
    .map((field) => ({
      label: field.label,
      value: field.fieldname,
      fieldtype: field.fieldtype,
    }))

  // `f.value`, not `f.fieldname`: the mapped options carry `value`, so this
  // test was always false and "Name" was appended every time — including when
  // the doctype already had a Name field, and when Name was already a chosen
  // quick filter.
  const nameTaken =
    options.some((f) => f.value === 'name') ||
    existingQuickFilters.includes('name')
  if (!nameTaken) {
    options.push({
      label: __('Name'),
      value: 'name',
      fieldtype: 'Data',
    })
  }

  return options
})

const quickFilterList = computed(() => {
  let filters = quickFilters.data || []

  filters.forEach((filter) => {
    filter['value'] = filter.fieldtype == 'Check' ? false : ''
    if (list.value.params?.filters?.[filter.fieldname]) {
      let value = list.value.params.filters[filter.fieldname]
      if (Array.isArray(value)) {
        if (
          (['Check', 'Select', 'Link', 'Date', 'Datetime'].includes(
            filter.fieldtype,
          ) &&
            value[0]?.toLowerCase() == 'like') ||
          value[0]?.toLowerCase() != 'like'
        )
          return
        filter['value'] = value[1]?.replace(/%/g, '')
      } else if (typeof value == 'boolean') {
        filter['value'] = value
      } else {
        filter['value'] = value?.replace(/%/g, '')
      }
    }
  })

  return filters
})

const quickFilters = createResource({
  url: 'xbr_crm.api.doc.get_quick_filters',
  params: { doctype: props.doctype },
  cache: ['Quick Filters', props.doctype],
  onSuccess(filters) {
    setupNewQuickFilters(filters)
  },
})

if (!quickFilters.data) quickFilters.fetch()

function setupNewQuickFilters(filters) {
  newQuickFilters.value = filters.map((f) => ({
    label: f.label,
    fieldname: f.fieldname,
    fieldtype: f.fieldtype,
  }))
}

function applyQuickFilter(filter, value) {
  let filters = { ...list.value.params.filters }
  let field = filter.fieldname
  if (value) {
    if (
      ['Check', 'Select', 'Link', 'Date', 'Datetime'].includes(filter.fieldtype)
    ) {
      filters[field] = value
    } else {
      filters[field] = ['LIKE', `%${value}%`]
    }
    filter['value'] = value
  } else {
    delete filters[field]
    filter['value'] = ''
  }
  updateFilter(filters)
}

function updateFilter(filters) {
  viewUpdated.value = true
  if (!defaultParams.value) {
    defaultParams.value = getParams()
  }
  list.value.params = defaultParams.value
  list.value.params.filters = filters
  view.value.filters = filters
  resetPage()
  list.value.reload()

  if (!route.query.view) {
    createOrUpdateStandardView()
  }
}

function updateSort(order_by) {
  viewUpdated.value = true
  if (!defaultParams.value) {
    defaultParams.value = getParams()
  }
  list.value.params = defaultParams.value
  list.value.params.order_by = order_by
  view.value.order_by = order_by
  resetPage()
  list.value.reload()

  if (!route.query.view) {
    createOrUpdateStandardView()
  }
}

function updateGroupBy(group_by_field) {
  viewUpdated.value = true
  if (!defaultParams.value) {
    defaultParams.value = getParams()
  }
  list.value.params = defaultParams.value
  list.value.params.view.group_by_field = group_by_field
  view.value.group_by_field = group_by_field
  list.value.reload()

  if (!route.query.view) {
    createOrUpdateStandardView()
  }
}

function updateColumns(obj) {
  if (!obj) {
    obj = {
      columns: list.value.data.columns,
      rows: list.value.data.rows,
      isDefault: false,
    }
  }

  if (!defaultParams.value) {
    defaultParams.value = getParams()
  }
  defaultParams.value.columns = view.value.columns = obj.isDefault
    ? ''
    : obj.columns
  defaultParams.value.rows = view.value.rows = obj.isDefault ? '' : obj.rows
  view.value.load_default_columns = obj.isDefault

  if (obj.reset) {
    defaultParams.value.columns = getParams().columns
    defaultParams.value.rows = getParams().rows
  }

  if (obj.reload) {
    list.value.params = defaultParams.value
    list.value.reload()
  }
  viewUpdated.value = true

  if (!route.query.view) {
    createOrUpdateStandardView()
  } else if (!view.value.public) {
    persistCustomView()
  }
}

function persistCustomView() {
  view.value.doctype = props.doctype
  call('xbr_crm.fcrm.doctype.crm_view_settings.crm_view_settings.update', {
    view: view.value,
  }).then(() => {
    reloadView()
    viewUpdated.value = false
  })
}

async function updateKanbanSettings(data) {
  if (data.item && data.to) {
    // Dropping a pipeline into the follow-up stage asks for the follow-up date
    // first; cancelling puts the card back.
    let values = { [view.value.column_field]: data.to }
    if (
      props.doctype === 'CRM Deal' &&
      view.value.column_field === 'status' &&
      isFollowUpStage(data.to)
    ) {
      const followUp = await askFollowUp()
      if (!followUp) {
        reload()
        return
      }
      values = { ...values, ...followUp }
    }
    // The card moves optimistically as you drag, but nothing re-read the list
    // afterwards, so the status counts in the KPI band above the board went
    // stale — and a rejected write (permissions, a validation hook) left the
    // card sitting in a column the server never accepted, with no message.
    call('frappe.client.set_value', {
      doctype: props.doctype,
      name: data.item,
      fieldname: values,
    })
      .then(() => reload())
      .catch((e) => {
        toast.error(formatError(e, __('Could not move the card')))
        reload()
      })
    return
  }

  if (data.fetchNewColumns) {
    fetchAndUpdateKanbanColumns(view.value)
    return
  }

  viewUpdated.value = true

  if (!defaultParams.value) {
    defaultParams.value = getParams()
  }
  list.value.params = defaultParams.value
  if (data.kanban_columns) {
    list.value.params.kanban_columns = data.kanban_columns
    view.value.kanban_columns = data.kanban_columns
  }
  if (data.kanban_fields) {
    list.value.params.kanban_fields = data.kanban_fields
    view.value.kanban_fields = data.kanban_fields
  }
  if (data.column_field && data.column_field != view.value.column_field) {
    list.value.params.column_field = data.column_field
    view.value.column_field = data.column_field
    list.value.params.kanban_columns = ''
    view.value.kanban_columns = ''
  }
  if (data.title_field && data.title_field != view.value.title_field) {
    list.value.params.title_field = data.title_field
    view.value.title_field = data.title_field
  }

  list.value.reload()

  if (!route.query.view) {
    createOrUpdateStandardView()
  }
}

function loadMoreKanban(columnName) {
  let columns = list.value.data.kanban_columns || '[]'

  if (typeof columns === 'string') {
    columns = JSON.parse(columns)
  }

  let column = columns.find((c) => c.name == columnName)

  if (!column.page_length) {
    column.page_length = 40
  } else {
    column.page_length += 20
  }
  list.value.params.kanban_columns = columns
  view.value.kanban_columns = columns
  list.value.reload()
}

function createOrUpdateStandardView() {
  if (route.query.view) return
  view.value.doctype = props.doctype
  call(
    'xbr_crm.fcrm.doctype.crm_view_settings.crm_view_settings.create_or_update_standard_view',
    {
      view: view.value,
    },
  ).then(() => {
    reloadView()
    view.value = {
      label: view.value.label,
      type: view.value.type || 'list',
      icon: view.value.icon,
      name: view.value.name,
      filters: defaultParams.value.filters,
      order_by: defaultParams.value.order_by,
      group_by_field: defaultParams.value.view?.group_by_field,
      column_field: defaultParams.value.column_field,
      title_field: defaultParams.value.title_field,
      kanban_columns: defaultParams.value.kanban_columns,
      kanban_fields: defaultParams.value.kanban_fields,
      columns: defaultParams.value.columns,
      rows: defaultParams.value.rows,
      route_name: route.name,
      load_default_columns: view.value.load_default_columns,
    }
    viewUpdated.value = false
  })
}

function updatePageLength(value, loadMore = false) {
  if (list.value.loading) return
  if (!defaultParams.value) {
    defaultParams.value = getParams()
  }
  list.value.params = defaultParams.value
  if (loadMore) {
    list.value.params.page_length += list.value.params.page_length_count
  } else {
    if (
      value == list.value.params.page_length &&
      value == list.value.params.page_length_count
    )
      return
    list.value.params.page_length = value
    list.value.params.page_length_count = value
  }
  list.value.reload()
}

// View Actions
const viewActions = (view, close) => {
  let isStandard = typeof view.name === 'string'
  let _view = getView(view.name)

  if (isStandard) {
    _view = getView(null, view.name, props.doctype)
  }

  if (!_view) {
    _view = {
      label: view.label,
      type: view.name,
      dt: props.doctype,
    }
  }

  let actions = [
    {
      group: __('Actions'),
      hideLabel: true,
      items: [
        {
          label: __('Duplicate'),
          icon: () => h(DuplicateIcon, { class: 'h-4 w-4' }),
          onClick: () => duplicateView(_view, close),
        },
      ],
    },
  ]

  if (isStandard && !isDefaultView(_view)) {
    actions[0].items.unshift({
      label: __('Set As Default'),
      icon: () => h(CheckIcon, { class: 'h-4 w-4' }),
      onClick: () => setAsDefault(_view),
    })
  }

  if (!isStandard && (!_view.public || isManager())) {
    actions[0].items.push({
      label: __('Edit'),
      icon: () => h(EditIcon, { class: 'h-4 w-4' }),
      onClick: () => editView(_view, close),
    })

    if (!_view.public) {
      actions[0].items.push({
        label: _view.pinned ? __('Unpin View') : __('Pin View'),
        icon: () => h(_view.pinned ? UnpinIcon : PinIcon, { class: 'h-4 w-4' }),
        onClick: () => pinView(_view),
      })
    }

    if (isManager()) {
      actions[0].items.push({
        label: _view.public ? __('Make Private') : __('Make Public'),
        icon: () =>
          h(FeatherIcon, {
            name: _view.public ? 'lock' : 'unlock',
            class: 'h-4 w-4',
          }),
        onClick: () => publicView(_view),
      })
    }

    actions.push({
      group: __('Delete View'),
      hideLabel: true,
      items: [
        {
          label: __('Delete'),
          icon: 'trash-2',
          onClick: () =>
            $dialog({
              title: __('Delete View'),
              message: __('Are you sure you want to delete "{0}" view?', [
                _view.label,
              ]),
              variant: 'danger',
              actions: [
                {
                  label: __('Delete'),
                  variant: 'solid',
                  theme: 'red',
                  onClick: (close) => deleteView(_view, close),
                },
              ],
            }),
        },
      ],
    })
  }
  return actions
}

function isDefaultView(v) {
  let defaultView = getDefaultView()

  if (!defaultView || !v.name) return false

  return defaultView.name == v.name
}

const viewModalObj = ref({})

function createView() {
  view.value.name = ''
  view.value.label = ''
  view.value.icon = ''
  viewModalObj.value = view.value
  viewModalObj.value.mode = 'create'
  showViewModal.value = true
}

function setAsDefault(v) {
  call(
    'xbr_crm.fcrm.doctype.crm_view_settings.crm_view_settings.set_as_default',
    {
      name: v.name,
      type: v.type,
      doctype: v.dt,
    },
  ).then(() => {
    reloadView()
    list.value.reload()
  })
}

function duplicateView(v, close) {
  // A copy: this used to rename `v` itself, which is the object the views
  // dropdown renders. The original view visibly became "Sales (New)" the
  // moment the menu item was clicked — and stayed renamed if the modal was
  // cancelled, gaining another " (New)" on each attempt.
  viewModalObj.value = {
    ...v,
    label: v.label + __(' (New)'),
    mode: 'duplicate',
  }
  showViewModal.value = true
  close()
}

function editView(v, close) {
  viewModalObj.value = v
  viewModalObj.value.mode = 'edit'
  showViewModal.value = true
  close()
}

function publicView(v) {
  call('xbr_crm.fcrm.doctype.crm_view_settings.crm_view_settings.public', {
    name: v.name,
    value: !v.public,
  }).then(() => {
    v.public = !v.public
    reloadView()
    list.value.reload()
  })
}

function pinView(v) {
  call('xbr_crm.fcrm.doctype.crm_view_settings.crm_view_settings.pin', {
    name: v.name,
    value: !v.pinned,
  }).then(() => {
    v.pinned = !v.pinned
    reloadView()
    list.value.reload()
  })
}

function deleteView(v, close) {
  call('xbr_crm.fcrm.doctype.crm_view_settings.crm_view_settings.delete', {
    name: v.name,
  }).then(() => {
    router.push({ name: route.name, params: { viewType: 'list' } })
    reloadView()
    list.value.reload()
  })
  close()
}

function fetchAndUpdateKanbanColumns(v) {
  call(
    'xbr_crm.fcrm.doctype.crm_view_settings.crm_view_settings.fetch_and_update_kanban_columns',
    {
      name: v.name,
    },
  ).then((columns) => {
    list.value.params.kanban_columns = columns
    view.value.kanban_columns = columns
    list.value.reload()
  })
}

function cancelChanges() {
  reload()
  viewUpdated.value = false
}

function saveView() {
  view.value = {
    label: view.value.label,
    type: view.value.type || 'list',
    icon: view.value.icon,
    name: view.value.name,
    filters: defaultParams.value.filters,
    order_by: defaultParams.value.order_by,
    group_by_field: defaultParams.value.view.group_by_field,
    column_field: defaultParams.value.column_field,
    title_field: defaultParams.value.title_field,
    kanban_columns: defaultParams.value.kanban_columns,
    kanban_fields: defaultParams.value.kanban_fields,
    columns: defaultParams.value.columns,
    rows: defaultParams.value.rows,
    route_name: route.name,
    load_default_columns: view.value.load_default_columns,
  }
  viewModalObj.value = view.value
  viewModalObj.value.mode = 'edit'
  showViewModal.value = true
}

function applyFilter({ event, idx, column, item, firstColumn }) {
  let restrictedFieldtypes = ['Datetime', 'Time']
  if (restrictedFieldtypes.includes(column.type) || idx === 0) return
  if (idx === 1 && firstColumn.key == '_liked_by') return

  event.stopPropagation()
  event.preventDefault()

  let filters = { ...list.value.params.filters }

  let value = item.name ?? item.label ?? item

  if (value !== null && value !== undefined && value !== '') {
    filters[column.key] = value
  } else {
    delete filters[column.key]
  }

  if (column.key == '_assign') {
    if (item?.length > 1) {
      let target = event.target.closest('.user-avatar')
      if (target) {
        let name = target.getAttribute('data-name')
        filters['_assign'] = ['LIKE', `%${name}%`]
      }
    } else if (item?.[0]?.name) {
      filters['_assign'] = ['LIKE', `%${item[0].name}%`]
    } else {
      // Unassigned: `item` is an empty array, and reading `item[0].name`
      // threw — clicking the Assigned To cell of an unassigned row took the
      // list down instead of doing nothing.
      delete filters['_assign']
    }
  }
  updateFilter(filters)
}

function applyLikeFilter() {
  let filters = { ...list.value.params.filters }
  if (!filters._liked_by) {
    filters['_liked_by'] = ['LIKE', '%@me%']
  } else {
    delete filters['_liked_by']
  }
  updateFilter(filters)
}

function likeDoc({ name, liked }) {
  createResource({
    url: 'frappe.desk.like.toggle_like',
    params: { doctype: props.doctype, name: name, add: liked ? 'No' : 'Yes' },
    auto: true,
    onSuccess: () => reload(),
  })
}

defineExpose({
  reload,
  applyFilter,
  applyLikeFilter,
  updateFilter,
  likeDoc,
  updateKanbanSettings,
  fetchAndUpdateKanbanColumns,
  loadMoreKanban,
  viewActions,
  viewsDropdownOptions,
  currentView,
  updateSelections,
  goToPage,
  setPageSize,
  paginationInfo,
})

// Watchers
watch(
  () => getView(route.query.view, route.params.viewType, props.doctype),
  (value, old_value) => {
    if (isEqual(value, old_value)) return
    reload()
  },
  { deep: true },
)

watch([() => route, () => route.params.viewType], (value, old_value) => {
  if (value[0] === old_value[0] && value[1] === value[0]) return
  reload()
})

const appliedFilterChips = computed(() => {
  if (!list.value?.params?.filters) return []
  let allFilters = list.value.params.filters
  let fields = getFields() || []
  let chips = []

  for (let [key, val] of Object.entries(allFilters)) {
    if (props.filters && props.filters[key] === val) continue

    let field = fields.find((f) => f.fieldname === key)
    let label = field?.label || key

    let displayValue
    if (Array.isArray(val)) {
      let value = val[1]
      if (Array.isArray(value)) {
        displayValue = value.join(' to ')
      } else {
        displayValue =
          typeof value === 'string' ? value.replace(/%/g, '') : value
      }
    } else {
      displayValue = val === true ? 'Yes' : val === false ? 'No' : val
    }

    chips.push({
      fieldname: key,
      label,
      displayValue,
    })
  }
  return chips
})

function removeFilterField(fieldname) {
  let filters = { ...list.value.params.filters }
  delete filters[fieldname]
  updateFilter(filters)
}

function clearAllCustomFilters() {
  let filters = {}
  if (props.filters) {
    filters = { ...props.filters }
  }
  updateFilter(filters)
}
</script>
