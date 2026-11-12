<template>
  <LayoutHeader>
    <template #left-header>
      <ViewBreadcrumbs
        v-model="viewControls"
        routeName="Organizations"
        :label="__('Institutions')"
      />
    </template>
    <template #right-header>
      <CustomActions
        v-if="organizationsListView?.customListActions"
        :actions="organizationsListView.customListActions"
      />
    </template>
  </LayoutHeader>

  <StatusKpiBand
    class="mx-3 sm:mx-5 mt-3"
    doctype="CRM Organization"
    :statuses="orgStatuses"
    totalLabel="Total Institutions"
    :activeStatus="activeStatus"
    :refreshToken="organizations?.data?.total_count"
    :show="showStatusBand"
    @filter="filterByStatus"
  />

  <ViewControls
    ref="viewControls"
    v-model="organizations"
    v-model:loadMore="loadMore"
    v-model:resizeColumn="triggerResize"
    v-model:updatedPageCount="updatedPageCount"
    doctype="CRM Organization"
    :fieldLabels="{ organization_name: __('Institution Name') }"
  />
  <OrganizationsListView
    v-if="organizations.data && rows.length"
    ref="organizationsListView"
    v-model="organizations.data.page_length_count"
    v-model:list="organizations"
    :rows="rows"
    :columns="columns"
    :options="{
      showTooltip: false,
      resizeColumn: true,
      rowCount: organizations.data.row_count,
      totalCount: organizations.data.total_count,
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
  <!-- Skeleton: initial load before organizations.data resolves -->
  <div
    v-else-if="!organizations.data"
    class="flex flex-col mt-3"
    aria-busy="true"
    aria-label="Loading institutions"
  >
    <SkeletonLoader type="table" />
  </div>
  <EmptyState
    v-else-if="organizations.data && !rows.length"
    framed
    name="Institutions"
    :icon="OrganizationsIcon"
    :ctaLabel="__('Create Institution')"
    @ctaClick="showOrganizationModal = true"
  />
  <OrganizationModal
    v-if="showOrganizationModal"
    v-model="showOrganizationModal"
    :options="{ afterInsert: () => viewControls?.reload() }"
  />
</template>
<script setup>
import ViewBreadcrumbs from '@/components/ViewBreadcrumbs.vue'
import CustomActions from '@/components/CustomActions.vue'
import OrganizationsIcon from '@/components/Icons/OrganizationsIcon.vue'
import LayoutHeader from '@/components/LayoutHeader.vue'
import OrganizationModal from '@/components/Modals/OrganizationModal.vue'
import OrganizationsListView from '@/components/ListViews/OrganizationsListView.vue'
import ViewControls from '@/components/ViewControls.vue'
import { getMeta } from '@/stores/meta'
import { formatDate, website } from '@/utils'
import { pageCreateAction, pageReloadAction } from '@/composables/pageActions'
import { DEFAULT_PAGE_LENGTH } from '@/composables/pageLength'
import { timestampCell } from '@/composables/useTimelinePreferences'
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import EmptyState from '../components/ListViews/EmptyState.vue'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import StatusKpiBand from '@/components/StatusKpiBand.vue'

const {
  doctypeMeta,
  getFormattedPercent,
  getFormattedFloat,
  getFormattedCurrency,
} = getMeta('CRM Organization')

const organizationsListView = ref(null)
const showOrganizationModal = ref(false)

// organizations data is loaded in the ViewControls component
const organizations = ref({})
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
  pageCreateAction.value = () => (showOrganizationModal.value = true)
  pageReloadAction.value = () => viewControls.value?.reload()
})
onBeforeUnmount(() => {
  pageCreateAction.value = null
  pageReloadAction.value = null
})

// ---- Status KPI band ---------------------------------------------------------
// CRM Organization has no status field of its own; some sites add one as a
// custom Select field. The cards come from that field's options; a site
// without it shows no band rather than counting a field that isn't there.
const orgStatuses = computed(() => {
  const field = doctypeMeta.value?.fields?.find(
    (f) => f.fieldname === 'status' && f.fieldtype === 'Select',
  )
  return (field?.options || '')
    .split('\n')
    .filter(Boolean)
    .map((name) => ({ name }))
})

const activeStatus = computed(
  () => organizations.value?.params?.filters?.status ?? null,
)

const showStatusBand = computed(() => {
  if (!orgStatuses.value.length) return false
  if (organizations.value?.data && !rows.value.length && !activeStatus.value) {
    return false
  }
  return true
})

function filterByStatus(status) {
  if (!viewControls.value) return
  const current = { ...(organizations.value?.params?.filters || {}) }
  if (!status || current.status === status) {
    delete current.status
  } else {
    current.status = status
  }
  viewControls.value.updateFilter(current)
}

const rows = computed(() => {
  if (
    !organizations.value?.data?.data ||
    !['list', 'group_by'].includes(organizations.value.data.view_type)
  )
    return []
  return organizations.value?.data.data.map((organization) => {
    let _rows = {}
    organizations.value?.data.rows.forEach((row) => {
      _rows[row] = organization[row]

      let fieldType = organizations.value?.data.columns?.find(
        (col) => (col.key || col.value) == row,
      )?.type

      if (
        fieldType &&
        ['Date', 'Datetime'].includes(fieldType) &&
        !['modified', 'creation'].includes(row)
      ) {
        _rows[row] = formatDate(
          organization[row],
          '',
          true,
          fieldType == 'Datetime',
        )
      }

      if (fieldType && fieldType == 'Currency') {
        _rows[row] = getFormattedCurrency(row, organization)
      }

      if (fieldType && fieldType == 'Float') {
        _rows[row] = getFormattedFloat(row, organization)
      }

      if (fieldType && fieldType == 'Percent') {
        _rows[row] = getFormattedPercent(row, organization)
      }

      if (row === 'organization_name') {
        _rows[row] = {
          label: organization.organization_name,
          logo: organization.organization_logo,
        }
      } else if (row === 'website') {
        _rows[row] = website(organization.website)
      } else if (['modified', 'creation'].includes(row)) {
        _rows[row] = timestampCell(organization[row])
      }
    })
    return _rows
  })
})

const columns = computed(() => {
  let _columns = organizations.value?.data?.columns || []

  // Page-only wording: the name column header reads Institution.
  _columns = _columns.map((col) =>
    col.key === 'organization_name'
      ? { ...col, label: __('Institution') }
      : col,
  )

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
</script>