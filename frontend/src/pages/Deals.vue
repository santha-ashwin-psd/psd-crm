<template>
  <LayoutHeader>
    <template #left-header>
      <ViewBreadcrumbs v-model="viewControls" routeName="Deals" />
    </template>
    <template #right-header>
      <CustomActions
        v-if="dealsListView?.customListActions"
        :actions="dealsListView.customListActions"
      />
    </template>
  </LayoutHeader>

  <!-- The page is a flex column so the table can claim the height that is
       left after the summary and toolbar, rather than sizing to its rows and
       leaving a few hundred pixels of empty page beneath it. Rows scroll
       inside the table card; the pager stays pinned to its foot. -->
  <div class="flex h-full min-h-0 flex-col">
    <!-- Status KPI band -->
    <StatusKpiBand
      v-if="route.params.viewType !== 'kanban'"
      class="mx-3 sm:mx-5 mt-3"
      doctype="CRM Deal"
      :statuses="dealStatuses.data"
      :maxStatuses="4"
      :totalLabel="__('Total Deals')"
      :activeStatus="activeStatus"
      :refreshToken="deals?.data?.total_count"
      :show="showStatusBand"
      @filter="filterByStatus"
    />

    <ViewControls
      ref="viewControls"
      v-model="deals"
      v-model:loadMore="loadMore"
      v-model:resizeColumn="triggerResize"
      v-model:updatedPageCount="updatedPageCount"
      doctype="CRM Deal"
      :options="{
        allowedViews: ['kanban', 'list'],
      }"
    />
    <KanbanView
      v-if="route.params.viewType == 'kanban'"
      v-model="deals"
      class="min-h-0 flex-1"
      itemLabel="deals"
      sumField="deal_value"
      :formatValue="
        (val) => getFormattedCurrency('deal_value', { deal_value: val })
      "
      :options="{
        getRoute: (row) => ({
          name: 'Deal',
          params: { dealId: row.name },
          query: { view: route.query.view, viewType: route.params.viewType },
        }),
        onNewClick: (column) => onNewClick(column),
      }"
      @update="(data) => viewControls.updateKanbanSettings(data)"
      @loadMore="(columnName) => viewControls.loadMoreKanban(columnName)"
    >
      <template #title="{ titleField, itemName }">
        <KanbanCardField
          :field="getRow(itemName, titleField)"
          :fieldName="titleField"
          title
        />
        <div
          v-if="followUpFor(itemName)"
          class="mt-1 inline-flex items-center gap-1 rounded bg-[var(--tone-soft)] px-1.5 py-0.5 text-xs font-medium text-[var(--tone-text)]"
          :class="
            followUpFor(itemName).overdue ? 'crm-tone-danger' : 'crm-tone-info'
          "
          :title="__('Next follow-up')"
        >
          <span class="lucide-calendar-clock size-3.5" />
          {{
            followUpFor(itemName).overdue
              ? __('Overdue · {0}', [followUpFor(itemName).label])
              : __('Follow-up · {0}', [followUpFor(itemName).label])
          }}
        </div>
      </template>
      <template #fields="{ fieldName, itemName }">
        <KanbanCardField
          :field="getRow(itemName, fieldName)"
          :fieldName="fieldName"
        />
      </template>
      <template #actions="{ itemName }">
        <div class="kb-card-actions">
          <div class="text-ink-gray-5 flex items-center gap-1.5">
            <EmailAtIcon class="h-4 w-4" />
            <span v-if="getRow(itemName, '_email_count').label">
              {{ getRow(itemName, '_email_count').label }}
            </span>
            <span class="text-4xl leading-[0]"> &middot; </span>
            <NoteIcon class="h-4 w-4" />
            <span v-if="getRow(itemName, '_note_count').label">
              {{ getRow(itemName, '_note_count').label }}
            </span>
            <span class="text-4xl leading-[0]"> &middot; </span>
            <TaskIcon class="h-4 w-4" />
            <span v-if="getRow(itemName, '_task_count').label">
              {{ getRow(itemName, '_task_count').label }}
            </span>
            <span class="text-4xl leading-[0]"> &middot; </span>
            <CommentIcon class="h-4 w-4" />
            <span v-if="getRow(itemName, '_comment_count').label">
              {{ getRow(itemName, '_comment_count').label }}
            </span>
          </div>
          <Dropdown
            class="flex items-center gap-2"
            :options="actions(itemName)"
            variant="ghost"
            @click.stop.prevent
          >
            <Button icon="lucide-plus" variant="ghost" />
          </Dropdown>
        </div>
      </template>
    </KanbanView>
    <DealsListView
      v-else-if="deals.data && rows.length"
      ref="dealsListView"
      v-model="deals.data.page_length_count"
      v-model:list="deals"
      :rows="rows"
      :columns="columns"
      :options="{
        showTooltip: true,
        resizeColumn: true,
        rowCount: deals.data.row_count,
        totalCount: deals.data.total_count,
      }"
      @loadMore="() => loadMore++"
      @columnWidthUpdated="() => triggerResize++"
      @updatePageCount="(count) => (updatedPageCount = count)"
      @applyFilter="(data) => viewControls.applyFilter(data)"
      @applyLikeFilter="(data) => viewControls.applyLikeFilter(data)"
      @likeDoc="(data) => viewControls.likeDoc(data)"
      @selectionsChanged="
        (selections) => viewControls.updateSelections(selections)
      "
      @pageChange="(page) => viewControls.goToPage(page)"
      @pageSizeChange="(size) => viewControls.setPageSize(size)"
    />
    <!-- Skeleton: initial load before deals.data resolves -->
    <div
      v-else-if="!deals.data"
      class="flex min-h-0 flex-1 flex-col mt-3"
      aria-busy="true"
      :aria-label="__('Loading deals')"
    >
      <SkeletonLoader type="table" />
    </div>
    <!-- Two different empty states, because they mean different things.
         "No deals exist yet" invites you to create one; "your filters matched
         nothing" should say so and offer to clear them — telling a user with
         four deals that there are "currently no Deals available" is simply
         untrue, and offering Create Deal is the wrong way out. -->
    <EmptyState
      v-else-if="deals.data && !rows.length"
      class="min-h-0 flex-1"
      framed
      name="Deals"
      :icon="DealsIcon"
      :title="hasActiveFilters ? __('No deals match these filters') : ''"
      :description="
        hasActiveFilters
          ? __('Try changing or clearing the filters to see more deals.')
          : ''
      "
      :ctaLabel="hasActiveFilters ? __('Clear filters') : __('Create Deal')"
      @ctaClick="hasActiveFilters ? clearFilters() : (showDealModal = true)"
    />
  </div>
  <DealModal
    v-if="showDealModal"
    v-model="showDealModal"
    :defaults="defaults"
  />
</template>

<script setup>
import ViewBreadcrumbs from '@/components/ViewBreadcrumbs.vue'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import CustomActions from '@/components/CustomActions.vue'
import EmailAtIcon from '@/components/Icons/EmailAtIcon.vue'
import PhoneIcon from '@/components/Icons/PhoneIcon.vue'
import NoteIcon from '@/components/Icons/NoteIcon.vue'
import TaskIcon from '@/components/Icons/TaskIcon.vue'
import CommentIcon from '@/components/Icons/CommentIcon.vue'
import KanbanCardField from '@/components/Kanban/KanbanCardField.vue'
import IndicatorIcon from '@/components/Icons/IndicatorIcon.vue'
import DealsIcon from '@/components/Icons/DealsIcon.vue'
import LayoutHeader from '@/components/LayoutHeader.vue'
import DealsListView from '@/components/ListViews/DealsListView.vue'
import StatusKpiBand from '@/components/StatusKpiBand.vue'
import EmptyState from '@/components/ListViews/EmptyState.vue'
import KanbanView from '@/components/Kanban/KanbanView.vue'
import DealModal from '@/components/Modals/DealModal.vue'
import ViewControls from '@/components/ViewControls.vue'
import { pageCreateAction, pageReloadAction } from '@/composables/pageActions'
import { DEFAULT_PAGE_LENGTH } from '@/composables/pageLength'
import { useDoctypeModal } from '@/composables/doctypeModal'
import { getMeta } from '@/stores/meta'
import { globalStore } from '@/stores/global'
import { usersStore } from '@/stores/users'
import { organizationsStore } from '@/stores/organizations'
import { statusesStore } from '@/stores/statuses'
import { callEnabled } from '@/composables/telephony'
import { formatDate, timeAgo, website, formatTime } from '@/utils'
import { isFollowUpOverdue, isFollowUpStage } from '@/composables/followUp'
import { timestampCell } from '@/composables/useTimelinePreferences'
import { useOnboarding, useTelemetry } from 'frappe-ui/frappe'
import { Dropdown } from 'frappe-ui'
import { useRoute } from 'vue-router'
import { ref, reactive, computed, h, onMounted, onBeforeUnmount } from 'vue'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'

const { getFormattedPercent, getFormattedFloat, getFormattedCurrency } =
  getMeta('CRM Deal')
const { makeCall } = globalStore()
const { getUser } = usersStore()
const { getOrganization } = organizationsStore()
const { getDealStatus, dealStatuses } = statusesStore()
const { updateOnboardingStep } = useOnboarding('frappecrm')
const { capture } = useTelemetry()
const { showModal } = useDoctypeModal()

const route = useRoute()

const dealsListView = ref(null)
const showDealModal = ref(false)

// Phase 6: 'n' shortcut to quick-create a new Deal from the list
useKeyboardShortcuts({
  shortcuts: [
    {
      keys: 'n',
      guard: () => route.params.viewType !== 'kanban',
      action: () => {
        showDealModal.value = true
      },
    },
  ],
})

const defaults = reactive({})

// deals data is loaded in the ViewControls component
const deals = ref({})
const loadMore = ref(1)
const triggerResize = ref(1)
const updatedPageCount = ref(DEFAULT_PAGE_LENGTH)
const viewControls = ref(null)

// The global header's +Create goes through createDocument(), which has no
// reference to the list resource ViewControls owns — so a new record used to
// appear only after a manual refresh.
// The header's +Create must open THIS page's create modal. Without
// registering here it fell through to the generic route->doctype modal, which
// knows nothing of the flow this page owns — on Deals that meant the
// "Choose Existing Organization/Contact" toggles, and with them the only way
// to link a deal to an existing organization or contact, were simply absent.
onMounted(() => {
  pageCreateAction.value = () => (showDealModal.value = true)
  pageReloadAction.value = () => viewControls.value?.reload()
})
onBeforeUnmount(() => {
  pageCreateAction.value = null
  pageReloadAction.value = null
})

// ---- Status KPI band (rendered via <StatusKpiBand>) ------------------------
const activeStatus = computed(
  () => deals.value?.params?.filters?.status ?? null,
)

// Show the band while loading, when deals exist, or when a filter is active
// (so it can be cleared). Hidden only when the list resolves to zero unfiltered.
const showStatusBand = computed(() => {
  if (deals.value?.data && !rows.value.length && !activeStatus.value) {
    return false
  }
  return true
})

// Any user-applied filter (the status band writes into the same bag, so this
// covers both the band and the Filter popover).
const hasActiveFilters = computed(
  () => Object.keys(deals.value?.params?.filters || {}).length > 0,
)

function clearFilters() {
  if (!viewControls.value) return
  viewControls.value.updateFilter({})
}

function filterByStatus(status) {
  if (!viewControls.value) return
  const current = { ...(deals.value?.params?.filters || {}) }
  if (!status || current.status === status) {
    delete current.status
  } else {
    current.status = status
  }
  viewControls.value.updateFilter(current)
}

function getRow(name, field) {
  function getValue(value) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value
    }
    return { label: value }
  }
  return getValue(rows.value?.find((row) => row.name == name)[field])
}

// Rows
const rows = computed(() => {
  if (!deals.value?.data?.data) return []
  if (deals.value.data.view_type === 'group_by') {
    if (!deals.value?.data.group_by_field?.fieldname) return []
    return getGroupedByRows(
      deals.value?.data.data,
      deals.value?.data.group_by_field,
      deals.value.data.columns,
    )
  } else if (deals.value.data.view_type === 'kanban') {
    return getKanbanRows(deals.value.data.data, deals.value.data.fields)
  } else {
    return parseRows(deals.value?.data.data, deals.value.data.columns)
  }
})

const columns = computed(() => {
  let _columns = deals.value?.data?.columns || []

  if (_columns.length) {
    _columns = _columns.map((col, index) => {
      // Saved views may still carry the old "Organization" header.
      if (col.key === 'organization') {
        col = { ...col, label: __('Institution') }
      }
      if (index === _columns.length - 1) {
        return { ...col, align: 'right' }
      }
      return col
    })
  }

  return _columns
})

function getGroupedByRows(listRows, groupByField, columns) {
  let groupedRows = []

  groupByField.options?.forEach((option) => {
    let filteredRows

    if (!option) {
      filteredRows = listRows.filter((row) => !row[groupByField.fieldname])
    } else {
      filteredRows = listRows.filter(
        (row) => row[groupByField.fieldname] == option,
      )
    }

    let groupDetail = {
      label: groupByField.label,
      group: option || __(' '),
      collapsed: false,
      rows: parseRows(filteredRows, columns),
    }
    if (groupByField.fieldname == 'status') {
      groupDetail.icon = () =>
        h(IndicatorIcon, {
          class: getDealStatus(option)?.color,
        })
    }
    groupedRows.push(groupDetail)
  })

  return groupedRows || listRows
}

// The next follow-up on a kanban card in the follow-up stage: its date and
// time, and whether it has passed. The card's stage is its column, and the
// date is read unformatted from the board data.
function followUpFor(name) {
  for (const column of deals.value?.data?.data || []) {
    const row = column.data?.find((r) => r.name == name)
    if (!row) continue
    if (!isFollowUpStage(column.column?.name) || !row.next_follow_up)
      return null
    return {
      label: formatDate(row.next_follow_up, 'D MMM, h:mm a'),
      overdue: isFollowUpOverdue(column.column?.name, row.next_follow_up),
    }
  }
  return null
}

function getKanbanRows(data, columns) {
  let _rows = []
  data.forEach((column) => {
    column.data?.forEach((row) => {
      _rows.push(row)
    })
  })
  return parseRows(_rows, columns)
}

function parseRows(rows, columns = []) {
  let view_type = deals.value.data.view_type
  let key = view_type === 'kanban' ? 'fieldname' : 'key'
  let type = view_type === 'kanban' ? 'fieldtype' : 'type'

  return rows.map((deal) => {
    let _rows = {}
    deals.value.data.rows.forEach((row) => {
      _rows[row] = deal[row]

      let fieldType = columns?.find((col) => (col[key] || col.value) == row)?.[
        type
      ]

      if (
        fieldType &&
        ['Date', 'Datetime'].includes(fieldType) &&
        !['modified', 'creation'].includes(row)
      ) {
        _rows[row] = formatDate(deal[row], '', true, fieldType == 'Datetime')
      }

      if (fieldType && fieldType == 'Currency') {
        _rows[row] = getFormattedCurrency(row, deal)
      }

      if (fieldType && fieldType == 'Float') {
        _rows[row] = getFormattedFloat(row, deal)
      }

      if (fieldType && fieldType == 'Percent') {
        _rows[row] = getFormattedPercent(row, deal)
      }

      if (row == 'organization') {
        _rows[row] = {
          label: deal.organization,
          logo: getOrganization(deal.organization)?.organization_logo,
        }
      } else if (row === 'website') {
        _rows[row] = website(deal.website)
      } else if (row == 'status') {
        _rows[row] = {
          label: deal.status,
          color: getDealStatus(deal.status)?.color,
        }
      } else if (row == 'sla_status') {
        let value = deal.sla_status
        let tooltipText = value
        let color =
          deal.sla_status == 'Failed'
            ? 'red'
            : deal.sla_status == 'Fulfilled'
              ? 'green'
              : 'orange'
        if (value == 'First Response Due' || value == 'Rolling Response Due') {
          value = __(timeAgo(deal.response_by))
          tooltipText = formatDate(deal.response_by)
          if (new Date(deal.response_by) < new Date()) {
            color = 'red'
          }
        }
        _rows[row] = {
          label: tooltipText,
          value: value,
          color: color,
        }
      } else if (row == 'deal_owner') {
        _rows[row] = {
          label: deal.deal_owner && getUser(deal.deal_owner).full_name,
          ...(deal.deal_owner && getUser(deal.deal_owner)),
        }
      } else if (row == '_assign') {
        let assignees = JSON.parse(deal._assign || '[]')
        _rows[row] = assignees.map((user) => ({
          name: user,
          image: getUser(user).user_image,
          label: getUser(user).full_name,
        }))
      } else if (['modified', 'creation'].includes(row)) {
        _rows[row] = timestampCell(deal[row])
      } else if (
        ['first_response_time', 'first_responded_on', 'response_by'].includes(
          row,
        )
      ) {
        let field = row == 'response_by' ? 'response_by' : 'first_responded_on'
        _rows[row] = {
          label: deal[field] ? formatDate(deal[field]) : '',
          timeAgo: deal[row]
            ? row == 'first_response_time'
              ? formatTime(deal[row])
              : __(timeAgo(deal[row]))
            : '',
        }
      }
    })
    _rows['_email_count'] = deal._email_count
    _rows['_note_count'] = deal._note_count
    _rows['_task_count'] = deal._task_count
    _rows['_comment_count'] = deal._comment_count
    return _rows
  })
}

function onNewClick(column) {
  let column_field = deals.value.params.column_field

  if (column_field) {
    defaults[column_field] = column.column.name
  }

  showDealModal.value = true
}

function actions(itemName) {
  let mobile_no = getRow(itemName, 'mobile_no')?.label || ''
  let actions = [
    {
      icon: h(PhoneIcon, { class: 'h-4 w-4' }),
      label: __('Make a Call'),
      onClick: () => makeCall(mobile_no),
      condition: () => mobile_no && callEnabled.value,
    },
    {
      icon: h(NoteIcon, { class: 'h-4 w-4' }),
      label: __('New Note'),
      onClick: () => showNote(itemName),
    },
    {
      icon: h(TaskIcon, { class: 'h-4 w-4' }),
      label: __('New Task'),
      onClick: () => showTask(itemName),
    },
  ]
  return actions.filter((action) =>
    action.condition ? action.condition() : true,
  )
}

function showNote(name) {
  showModal({
    doctype: 'FCRM Note',
    title: 'Note',
    defaults: {
      reference_doctype: 'CRM Deal',
      reference_docname: name,
    },
    callbacks: {
      afterInsert: (d) => after(d, true),
      afterUpdate: after,
    },
  })
}

function showTask(name) {
  showModal({
    doctype: 'CRM Task',
    title: 'Task',
    defaults: {
      reference_doctype: 'CRM Deal',
      reference_docname: name,
    },
    callbacks: {
      afterInsert: (d) => after(d, true),
      afterUpdate: after,
    },
  })
}

function after(d, isNew = false) {
  let a = d.doctype == 'CRM Task' ? 'task' : 'note'
  if (isNew) {
    updateOnboardingStep('create_first_' + a)
    capture(a + '_created')
  } else {
    capture(a + '_updated')
  }
}
</script>