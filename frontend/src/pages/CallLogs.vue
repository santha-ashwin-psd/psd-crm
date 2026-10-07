<template>
  <LayoutHeader>
    <template #left-header>
      <ViewBreadcrumbs v-model="viewControls" routeName="Call Logs" />
    </template>
    <template #right-header>
      <CustomActions
        v-if="callLogsListView?.customListActions"
        :actions="callLogsListView.customListActions"
      />
    </template>
  </LayoutHeader>

  <!-- Status KPI band -->
  <StatusKpiBand
    class="mx-3 sm:mx-5 mt-3"
    doctype="CRM Call Log"
    :statuses="callStatuses"
    totalLabel="Total Calls"
    totalIcon="phone"
    :maxStatuses="4"
    :activeStatus="activeStatus"
    :refreshToken="callLogs?.data?.total_count"
    :show="showStatusBand"
    @filter="filterByStatus"
  />

  <ViewControls
    ref="viewControls"
    v-model="callLogs"
    v-model:loadMore="loadMore"
    v-model:resizeColumn="triggerResize"
    v-model:updatedPageCount="updatedPageCount"
    doctype="CRM Call Log"
  />
  <CallLogsListView
    v-if="callLogs.data && rows.length"
    ref="callLogsListView"
    v-model="callLogs.data.page_length_count"
    v-model:list="callLogs"
    :rows="rows"
    :columns="columns"
    :options="{
      showTooltip: false,
      resizeColumn: true,
      rowCount: callLogs.data.row_count,
      totalCount: callLogs.data.total_count,
    }"
    @showCallLog="showCallLog"
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
  <EmptyState
    v-else-if="callLogs.data && !rows.length"
    framed
    name="Call Logs"
    :icon="PhoneIcon"
    :ctaLabel="__('Log a Call')"
    @ctaClick="createCallLog"
  />
  <CallLogDetailModal
    v-model="showCallLogDetailModal"
    v-model:callLog="callLog"
  />
</template>

<script setup>
import ViewBreadcrumbs from '@/components/ViewBreadcrumbs.vue'
import CustomActions from '@/components/CustomActions.vue'
import PhoneIcon from '@/components/Icons/PhoneIcon.vue'
import LayoutHeader from '@/components/LayoutHeader.vue'
import ViewControls from '@/components/ViewControls.vue'
import CallLogsListView from '@/components/ListViews/CallLogsListView.vue'
import StatusKpiBand from '@/components/StatusKpiBand.vue'
import EmptyState from '@/components/ListViews/EmptyState.vue'
import CallLogDetailModal from '@/components/Modals/CallLogDetailModal.vue'
import { DEFAULT_PAGE_LENGTH } from '@/composables/pageLength'
import { useDoctypeModal } from '@/composables/doctypeModal'
import { getCallLogDetail } from '@/utils/callLog'
import { useTelemetry } from 'frappe-ui/frappe'
import { createResource } from 'frappe-ui'
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { pageCreateAction } from '@/composables/pageActions'

const callLogsListView = ref(null)

// callLogs data is loaded in the ViewControls component
const callLogs = ref({})
const loadMore = ref(1)
const triggerResize = ref(1)
const updatedPageCount = ref(DEFAULT_PAGE_LENGTH)
const viewControls = ref(null)

// ---- Status KPI band -------------------------------------------------------
// Call Log status is a Select with 9 values; surface the 4 most meaningful as
// cards (label shown differs from the raw value the list filters/counts by).
const callStatuses = [
  { name: 'Completed', label: 'Completed', color: '!text-green-600' },
  { name: 'In Progress', label: 'In Progress', color: '!text-blue-600' },
  { name: 'No Answer', label: 'Missed', color: '!text-red-600' },
  { name: 'Busy', label: 'Declined', color: '!text-orange-600' },
]

const activeStatus = computed(
  () => callLogs.value?.params?.filters?.status ?? null,
)

const showStatusBand = computed(() => {
  if (callLogs.value?.data && !rows.value.length && !activeStatus.value) {
    return false
  }
  return true
})

function filterByStatus(status) {
  if (!viewControls.value) return
  const current = { ...(callLogs.value?.params?.filters || {}) }
  if (!status || current.status === status) {
    delete current.status
  } else {
    current.status = status
  }
  viewControls.value.updateFilter(current)
}

const rows = computed(() => {
  if (
    !callLogs.value?.data?.data ||
    !['list', 'group_by'].includes(callLogs.value.data.view_type)
  )
    return []
  return callLogs.value?.data.data.map((callLog) => {
    let _rows = {}
    callLogs.value?.data.rows.forEach((row) => {
      _rows[row] = getCallLogDetail(row, callLog, callLogs.value?.data.columns)
    })
    return _rows
  })
})

const columns = computed(() => {
  let _columns = callLogs.value?.data?.columns || []

  // Right-align the last column only when it's numeric — avatar/name/link
  // columns must stay left so the header and cells line up.
  if (_columns.length) {
    _columns = _columns.map((col, index) => {
      if (
        index === _columns.length - 1 &&
        ['Currency', 'Float', 'Int', 'Percent'].includes(col.type)
      ) {
        return { ...col, align: 'right' }
      }
      return col
    })
  }

  return _columns
})

const showCallLogDetailModal = ref(false)
const callLog = ref({})

function showCallLog(name) {
  showCallLogDetailModal.value = true
  callLog.value = createResource({
    url: 'crm.fcrm.doctype.crm_call_log.crm_call_log.get_call_log',
    params: { name },
    cache: ['call_log', name],
    auto: true,
  })
}

const { showModal } = useDoctypeModal()
const { capture } = useTelemetry()

function createCallLog() {
  showModal({
    doctype: 'CRM Call Log',
    title: 'Call Log',
    callbacks: {
      afterInsert: () => {
        capture('call_log_created')
        callLogs.value.reload()
      },
    },
  })
}

const openCallLogFromURL = () => {
  const searchParams = new URLSearchParams(window.location.search)
  const callLogName = searchParams.get('open')

  if (callLogName) {
    showCallLog(callLogName)
    // Drop only `open`. Replacing with the bare pathname discarded the whole
    // query string — including `view`, which selects the saved view.
    searchParams.delete('open')
    const rest = searchParams.toString()
    window.history.replaceState(
      null,
      '',
      window.location.pathname + (rest ? `?${rest}` : ''),
    )
  }
}

onMounted(() => {
  openCallLogFromURL()
  // Wire the header's +Create button to this page's create flow.
  pageCreateAction.value = createCallLog
})
onBeforeUnmount(() => (pageCreateAction.value = null))
</script>
