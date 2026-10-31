<template>
  <LayoutHeader>
    <template #left-header>
      <ViewBreadcrumbs v-model="viewControls" routeName="Tasks" />
    </template>
    <template #right-header>
      <CustomActions
        v-if="tasksListView?.customListActions"
        :actions="tasksListView.customListActions"
      />
    </template>
  </LayoutHeader>

  <!-- Flex column: the board needs a definite height to scroll inside, and
       without one its `height: 100%` resolved against the wrong box and let it
       ride up under the filter toolbar. -->
  <div class="flex h-full min-h-0 flex-col">
    <!-- Status KPI band -->
    <StatusKpiBand
      v-if="$route.params.viewType !== 'kanban'"
      class="mx-3 sm:mx-5 mt-3"
      doctype="CRM Task"
      :statuses="taskStatuses"
      totalLabel="Total Tasks"
      :activeStatus="activeStatus"
      :refreshToken="tasks?.data?.total_count"
      :show="showStatusBand"
      @filter="filterByStatus"
    />

    <ViewControls
      ref="viewControls"
      v-model="tasks"
      v-model:loadMore="loadMore"
      v-model:resizeColumn="triggerResize"
      v-model:updatedPageCount="updatedPageCount"
      doctype="CRM Task"
      :options="{
        allowedViews: ['list', 'kanban'],
      }"
    />
    <KanbanView
      v-if="$route.params.viewType == 'kanban' && rows.length"
      v-model="tasks"
      class="min-h-0 flex-1"
      itemLabel="tasks"
      :options="{
        onClick: (row) => showTask(row.name),
        onNewClick: (column) => createTask(column),
        // Rendered under the title instead — see the #title slot. They must be
        // removed from the field list here rather than v-if'd away inside
        // #fields, or Vue falls back to KanbanView's default renderer.
        hideFields: ['priority', 'due_date', 'title'],
      }"
      @update="(data) => viewControls.updateKanbanSettings(data)"
      @loadMore="(columnName) => viewControls.loadMoreKanban(columnName)"
    >
      <!-- Title carries the task, and the two things you act on — priority and
         due date — sit directly beneath it. They used to appear below the
         description, several lines down the card. The kanban field list stays
         user-configurable; these two are simply promoted out of it (and
         skipped in #fields below) so they cannot be scrolled past. -->
      <template #title="{ itemName }">
        <div class="kb-task-title">
          {{ getRow(itemName, 'title').label || __('Untitled task') }}
        </div>
        <div class="kb-task-meta">
          <span
            v-if="getRow(itemName, 'priority').label"
            class="crm-badge"
            :class="priorityToneClass(getRow(itemName, 'priority').label)"
          >
            <TaskPriorityIcon
              class="size-2"
              :priority="getRow(itemName, 'priority').label"
            />
            {{ __(getRow(itemName, 'priority').label) }}
          </span>
          <span
            v-if="rawDue(itemName)"
            class="crm-badge"
            :class="dueClass(itemName)"
            :title="getRow(itemName, 'due_date').label"
          >
            <FeatherIcon name="calendar" class="size-3" />
            {{ dueText(itemName) }}
          </span>
        </div>
      </template>
      <template #fields="{ fieldName, itemName }">
        <div
          v-if="getRow(itemName, fieldName).label"
          class="truncate flex items-center gap-2"
        >
          <div v-if="fieldName === 'status'">
            <TaskStatusIcon
              class="size-3"
              :status="getRow(itemName, fieldName).label"
            />
          </div>
          <div v-else-if="fieldName === 'priority'">
            <TaskPriorityIcon :priority="getRow(itemName, fieldName).label" />
          </div>
          <div v-else-if="fieldName === 'assigned_to'">
            <Avatar
              v-if="getRow(itemName, fieldName).full_name"
              class="flex items-center"
              :image="getRow(itemName, fieldName).user_image"
              :label="getRow(itemName, fieldName).full_name"
              size="sm"
            />
          </div>
          <div
            v-if="['modified', 'creation'].includes(fieldName)"
            class="truncate text-base"
          >
            <Tooltip :text="getRow(itemName, fieldName).label">
              <div>{{ getRow(itemName, fieldName).timeAgo }}</div>
            </Tooltip>
          </div>
          <div
            v-else-if="fieldName == 'description'"
            class="truncate text-base max-h-44"
          >
            <TextEditor
              v-if="getRow(itemName, fieldName).label"
              :content="getRow(itemName, fieldName).label"
              :editable="false"
              editor-class="!prose-sm max-w-none focus:outline-none"
              class="flex-1 overflow-hidden"
            />
          </div>
          <div v-else class="truncate text-base">
            {{ getRow(itemName, fieldName).label }}
          </div>
        </div>
      </template>
      <template #actions="{ itemName }">
        <div class="flex gap-2 items-center justify-between">
          <div>
            <Button
              v-if="
                getRow(itemName, 'reference_docname').label &&
                (getRow(itemName, 'reference_doctype').label == 'CRM Deal' ||
                  isLeadsEnabled())
              "
              class="-ml-2"
              variant="ghost"
              size="sm"
              :label="
                getRow(itemName, 'reference_doctype').label == 'CRM Deal'
                  ? __('Deal')
                  : __('Lead')
              "
              :iconRight="ArrowUpRightIcon"
              @click.stop="
                redirect(
                  getRow(itemName, 'reference_doctype').label,
                  getRow(itemName, 'reference_docname').label,
                )
              "
            />
          </div>
          <Dropdown
            class="flex items-center gap-2"
            :options="actions(itemName)"
            variant="ghost"
            @click.stop.prevent
          >
            <Button
              icon="lucide-more-horizontal"
              variant="ghost"
              :label="__('Task actions')"
            />
          </Dropdown>
        </div>
      </template>
    </KanbanView>
    <TasksListView
      v-else-if="tasks.data && rows.length"
      ref="tasksListView"
      v-model="tasks.data.page_length_count"
      v-model:list="tasks"
      :rows="rows"
      :columns="columns"
      :options="{
        showTooltip: false,
        resizeColumn: true,
        rowCount: tasks.data.row_count,
        totalCount: tasks.data.total_count,
      }"
      @loadMore="() => loadMore++"
      @columnWidthUpdated="() => triggerResize++"
      @updatePageCount="(count) => (updatedPageCount = count)"
      @showTask="showTask"
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
      v-else-if="tasks.data && !rows.length"
      class="min-h-0 flex-1"
      framed
      name="Tasks"
      :icon="Email2Icon"
      :ctaLabel="__('Create Task')"
      @ctaClick="createTask()"
    />
  </div>
</template>

<script setup>
import ViewBreadcrumbs from '@/components/ViewBreadcrumbs.vue'
import CustomActions from '@/components/CustomActions.vue'
import ArrowUpRightIcon from '@/components/Icons/ArrowUpRightIcon.vue'
import TaskStatusIcon from '@/components/Icons/TaskStatusIcon.vue'
import TaskPriorityIcon from '@/components/Icons/TaskPriorityIcon.vue'
import {
  priorityToneClass,
  dueToneClass,
  dueState,
  isClosedTask,
} from '@/utils/taskMeta'
import Email2Icon from '@/components/Icons/Email2Icon.vue'
import LayoutHeader from '@/components/LayoutHeader.vue'
import ViewControls from '@/components/ViewControls.vue'
import TasksListView from '@/components/ListViews/TasksListView.vue'
import StatusKpiBand from '@/components/StatusKpiBand.vue'
import EmptyState from '@/components/ListViews/EmptyState.vue'
import KanbanView from '@/components/Kanban/KanbanView.vue'
import { pageReloadAction } from '@/composables/pageActions'
import { DEFAULT_PAGE_LENGTH } from '@/composables/pageLength'
import { useDoctypeModal } from '@/composables/doctypeModal'
import { getMeta } from '@/stores/meta'
import { usersStore } from '@/stores/users'
import { formatDate } from '@/utils'
import { timestampCell } from '@/composables/useTimelinePreferences'
import { useOnboarding, useTelemetry } from 'frappe-ui/frappe'
import {
  Tooltip,
  Avatar,
  TextEditor,
  Dropdown,
  FeatherIcon,
  call,
} from 'frappe-ui'
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { isLeadsEnabled } from '@/utils/leads'

const { getFormattedPercent, getFormattedFloat, getFormattedCurrency } =
  getMeta('CRM Task')
const { getUser } = usersStore()
const { updateOnboardingStep } = useOnboarding('frappecrm')
const { capture } = useTelemetry()

const router = useRouter()

const tasksListView = ref(null)

// tasks data is loaded in the ViewControls component
const tasks = ref({})
const loadMore = ref(1)
const triggerResize = ref(1)
const updatedPageCount = ref(DEFAULT_PAGE_LENGTH)
const viewControls = ref(null)

// The global header's +Create goes through createDocument(), which has no
// reference to the list resource ViewControls owns — so a new record used to
// appear only after a manual refresh.
onMounted(() => (pageReloadAction.value = () => viewControls.value?.reload()))
onBeforeUnmount(() => (pageReloadAction.value = null))

// ---- Status KPI band (rendered via <StatusKpiBand>) ------------------------
// Task status is a Select field (no status doctype), so map its options to
// band tint colors here.
const taskStatusColors = {
  Backlog: '!text-gray-600',
  Todo: '!text-blue-600',
  'In Progress': '!text-amber-600',
  Done: '!text-green-600',
  Canceled: '!text-red-600',
}
const taskStatuses = computed(() => {
  const statusField = getMeta('CRM Task')
    .getFields?.()
    ?.find((f) => f.fieldname === 'status')
  const options = statusField?.options?.map((o) => o.value).filter(Boolean) || [
    'Backlog',
    'Todo',
    'In Progress',
    'Done',
    'Canceled',
  ]
  return options.map((name) => ({
    name,
    color: taskStatusColors[name] || '!text-gray-600',
  }))
})

const activeStatus = computed(
  () => tasks.value?.params?.filters?.status ?? null,
)

const showStatusBand = computed(() => {
  if (tasks.value?.data && !rows.value.length && !activeStatus.value) {
    return false
  }
  return true
})

function filterByStatus(status) {
  if (!viewControls.value) return
  const current = { ...(tasks.value?.params?.filters || {}) }
  if (!status || current.status === status) {
    delete current.status
  } else {
    current.status = status
  }
  viewControls.value.updateFilter(current)
}

// ---- Card meta ------------------------------------------------------------
// `getRow` returns the display-formatted value; the tone has to be computed
// from the RAW datetime, so it is read off the underlying row.
function rawDue(name) {
  return getRow(name, 'due_date')?.label || null
}

// Short, human due label. States come from utils/taskMeta so "overdue" means
// the same thing here as anywhere else it is shown.
// A Done or Canceled task is never overdue: its date is shown plainly.
function cardDueState(name) {
  if (isClosedTask(getRow(name, 'status').label)) return 'none'
  return dueState(rawDue(name))
}

function dueClass(name) {
  if (cardDueState(name) === 'none') return 'crm-tone-neutral'
  return dueToneClass(rawDue(name))
}

function dueText(name) {
  const raw = rawDue(name)
  const state = cardDueState(name)
  if (state === 'overdue') return __('Overdue')
  if (state === 'today') return __('Due today')
  return formatDate(raw, '', true)
}

function getRow(name, field) {
  function getValue(value) {
    if (value && typeof value === 'object') {
      return value
    }
    return { label: value }
  }
  return getValue(rows.value?.find((row) => row.name == name)[field])
}

const rows = computed(() => {
  if (!tasks.value?.data?.data) return []

  if (tasks.value.data.view_type === 'kanban') {
    return getKanbanRows(tasks.value.data.data, tasks.value.data.fields)
  }

  openTaskFromURL()
  return parseRows(tasks.value?.data.data, tasks.value?.data.columns)
})

const columns = computed(() => {
  let _columns = tasks.value?.data?.columns || []

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
  let view_type = tasks.value.data.view_type
  let key = view_type === 'kanban' ? 'fieldname' : 'key'
  let type = view_type === 'kanban' ? 'fieldtype' : 'type'

  return rows.map((task) => {
    let _rows = {}
    tasks.value?.data.rows.forEach((row) => {
      _rows[row] = task[row]

      let fieldType = columns?.find((col) => (col[key] || col.value) == row)?.[
        type
      ]

      if (
        fieldType &&
        ['Date', 'Datetime'].includes(fieldType) &&
        !['modified', 'creation', 'due_date'].includes(row)
      ) {
        _rows[row] = formatDate(task[row], '', true, fieldType == 'Datetime')
      }

      if (fieldType && fieldType == 'Currency') {
        _rows[row] = getFormattedCurrency(row, task)
      }

      if (fieldType && fieldType == 'Float') {
        _rows[row] = getFormattedFloat(row, task)
      }

      if (fieldType && fieldType == 'Percent') {
        _rows[row] = getFormattedPercent(row, task)
      }

      if (['modified', 'creation'].includes(row)) {
        _rows[row] = timestampCell(task[row])
      } else if (row == 'assigned_to') {
        _rows[row] = {
          label: task.assigned_to && getUser(task.assigned_to).full_name,
          ...(task.assigned_to && getUser(task.assigned_to)),
        }
      }
    })
    return _rows
  })
}

const { showModal } = useDoctypeModal()

const taskCallbacks = {
  afterInsert: () => {
    tasks.value.reload()
    updateOnboardingStep('create_first_task')
    capture('task_created')
  },
  afterUpdate: () => {
    tasks.value.reload()
    capture('task_updated')
  },
}

function showTask(name) {
  showModal({
    name,
    doctype: 'CRM Task',
    title: 'Task',
    callbacks: taskCallbacks,
  })
}

function createTask(column) {
  const defaults = { status: 'Backlog', priority: 'Low' }

  if (column?.column?.name) {
    let column_field = tasks.value.params.column_field
    if (column_field) {
      defaults[column_field] = column.column.name
    }
  }

  showModal({
    doctype: 'CRM Task',
    title: 'Task',
    defaults: defaults,
    callbacks: taskCallbacks,
  })
}

function actions(name) {
  return [
    {
      label: __('Delete'),
      icon: 'trash-2',
      onClick: () => {
        deleteTask(name)
        tasks.value.reload()
      },
    },
  ]
}

async function deleteTask(name) {
  await call('frappe.client.delete', {
    doctype: 'CRM Task',
    name,
  })
}

function redirect(doctype, docname) {
  if (!docname) return
  let name = doctype == 'CRM Deal' ? 'Deal' : 'Lead'
  let params = { leadId: docname }
  if (name == 'Deal') {
    params = { dealId: docname }
  }
  router.push({ name: name, params: params })
}

const openTaskFromURL = () => {
  const searchParams = new URLSearchParams(window.location.search)
  const taskName = searchParams.get('open')

  // Guard on the source data, not on `rows`. This runs *from inside* the
  // `rows` computed, so reading `rows.value` here re-enters it and yields
  // undefined on the first pass — the deep link never opened.
  if (taskName && tasks.value?.data?.data?.length) {
    showTask(parseInt(taskName))
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
</script>
