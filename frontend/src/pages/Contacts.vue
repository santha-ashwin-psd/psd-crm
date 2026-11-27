<template>
  <LayoutHeader>
    <template #left-header>
      <ViewBreadcrumbs v-model="viewControls" routeName="Contacts" />
    </template>
    <template #right-header>
      <CustomActions
        v-if="contactsListView?.customListActions"
        :actions="contactsListView.customListActions"
      />
    </template>
  </LayoutHeader>

  <StatusKpiBand
    class="mx-3 sm:mx-5 mt-3"
    doctype="Contact"
    :statuses="contactStatuses"
    totalLabel="Total Contacts"
    :activeStatus="activeStatus"
    :refreshToken="contacts?.data?.total_count"
    :show="showStatusBand"
    @filter="filterByStatus"
  />

  <ViewControls
    ref="viewControls"
    v-model="contacts"
    v-model:loadMore="loadMore"
    v-model:resizeColumn="triggerResize"
    v-model:updatedPageCount="updatedPageCount"
    doctype="Contact"
    :fieldLabels="{ company_name: __('Organization') }"
  />
  <ContactsListView
    v-if="contacts.data && rows.length"
    ref="contactsListView"
    v-model="contacts.data.page_length_count"
    v-model:list="contacts"
    :rows="rows"
    :columns="columns"
    :options="{
      showTooltip: false,
      resizeColumn: true,
      rowCount: contacts.data.row_count,
      totalCount: contacts.data.total_count,
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
  <!-- Skeleton: initial load before contacts.data resolves -->
  <div
    v-else-if="!contacts.data"
    class="flex flex-col mt-3"
    aria-busy="true"
    aria-label="Loading contacts"
  >
    <SkeletonLoader type="table" />
  </div>
  <EmptyState
    v-else-if="contacts.data && !rows.length"
    framed
    name="Contacts"
    :icon="ContactsIcon"
    :ctaLabel="__('Create Contact')"
    @ctaClick="showContactModal = true"
  />
  <ContactModal
    v-if="showContactModal"
    v-model="showContactModal"
    :contact="{}"
    :options="{ afterInsert: () => viewControls?.reload() }"
  />
</template>

<script setup>
import ViewBreadcrumbs from '@/components/ViewBreadcrumbs.vue'
import CustomActions from '@/components/CustomActions.vue'
import ContactsIcon from '@/components/Icons/ContactsIcon.vue'
import LayoutHeader from '@/components/LayoutHeader.vue'
import ContactModal from '@/components/Modals/ContactModal.vue'
import ContactsListView from '@/components/ListViews/ContactsListView.vue'
import StatusKpiBand from '@/components/StatusKpiBand.vue'
import EmptyState from '@/components/ListViews/EmptyState.vue'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import ViewControls from '@/components/ViewControls.vue'
import { getMeta } from '@/stores/meta'
import { organizationsStore } from '@/stores/organizations.js'
import { formatDate } from '@/utils'
import { pageCreateAction, pageReloadAction } from '@/composables/pageActions'
import { DEFAULT_PAGE_LENGTH } from '@/composables/pageLength'
import { timestampCell } from '@/composables/useTimelinePreferences'
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

const { getFormattedPercent, getFormattedFloat, getFormattedCurrency } =
  getMeta('Contact')
const { getOrganization } = organizationsStore()

const showContactModal = ref(false)

const contactsListView = ref(null)

// contacts data is loaded in the ViewControls component
const contacts = ref({})
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
  pageCreateAction.value = () => (showContactModal.value = true)
  pageReloadAction.value = () => viewControls.value?.reload()
})
onBeforeUnmount(() => {
  pageCreateAction.value = null
  pageReloadAction.value = null
})


// ---- Status KPI band (Contact status: Passive / Open / Replied) -----------
const contactStatuses = [
  { name: 'Passive', color: '!text-orange-600' },
  { name: 'Open', color: '!text-blue-600' },
  { name: 'Replied', color: '!text-green-600' },
]

const activeStatus = computed(
  () => contacts.value?.params?.filters?.status ?? null,
)

const showStatusBand = computed(() => {
  if (contacts.value?.data && !rows.value.length && !activeStatus.value) {
    return false
  }
  return true
})

function filterByStatus(status) {
  if (!viewControls.value) return
  const current = { ...(contacts.value?.params?.filters || {}) }
  if (!status || current.status === status) {
    delete current.status
  } else {
    current.status = status
  }
  viewControls.value.updateFilter(current)
}

const rows = computed(() => {
  if (
    !contacts.value?.data?.data ||
    !['list', 'group_by'].includes(contacts.value.data.view_type)
  )
    return []
  return contacts.value?.data.data.map((contact) => {
    let _rows = {}
    contacts.value?.data.rows.forEach((row) => {
      _rows[row] = contact[row]

      let fieldType = contacts.value?.data.columns?.find(
        (col) => (col.key || col.value) == row,
      )?.type

      if (
        fieldType &&
        ['Date', 'Datetime'].includes(fieldType) &&
        !['modified', 'creation'].includes(row)
      ) {
        _rows[row] = formatDate(contact[row], '', true, fieldType == 'Datetime')
      }

      if (fieldType && fieldType == 'Currency') {
        _rows[row] = getFormattedCurrency(row, contact)
      }

      if (fieldType && fieldType == 'Float') {
        _rows[row] = getFormattedFloat(row, contact)
      }

      if (fieldType && fieldType == 'Percent') {
        _rows[row] = getFormattedPercent(row, contact)
      }

      if (row == 'full_name') {
        _rows[row] = {
          label: contact.full_name,
          image_label: contact.full_name,
          image: contact.image,
        }
      } else if (row == 'company_name') {
        _rows[row] = {
          label: contact.company_name,
          logo: getOrganization(contact.company_name)?.organization_logo,
        }
      } else if (['modified', 'creation'].includes(row)) {
        _rows[row] = timestampCell(contact[row])
      }
    })
    return _rows
  })
})

const columns = computed(() => {
  let _columns = contacts.value?.data?.columns || []

  // Page-only wording: the company_name column header reads Organization.
  _columns = _columns.map((col) =>
    col.key === 'company_name'
      ? { ...col, label: __('Organization') }
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