<template>
  <LayoutHeader>
    <template #left-header>
      <div class="flex min-w-0 items-center gap-1.5">
        <Tooltip :text="__('Back to Leads')">
          <button
            class="grid size-7 shrink-0 place-items-center rounded-lg text-ink-gray-6 transition-colors hover:bg-[var(--crm-surface-2)] hover:text-ink-gray-9"
            :aria-label="__('Back to Leads')"
            @click="router.push({ name: 'Leads' })"
          >
            <FeatherIcon name="arrow-left" class="size-4" />
          </button>
        </Tooltip>
        <button
          class="shrink-0 text-sm font-medium text-ink-gray-5 transition-colors hover:text-ink-gray-8"
          @click="router.push({ name: 'Leads' })"
        >
          {{ __('Leads') }}
        </button>
        <span class="shrink-0 text-ink-gray-4">/</span>
        <span class="truncate text-sm font-semibold text-ink-gray-9">
          {{ title }}
        </span>
      </div>
    </template>
    <template v-if="!errorTitle" #right-header>
      <!-- Admin-configured custom actions (status + record actions live on the
           record hero now, not the top bar). -->
      <CustomActions
        v-if="document._actions?.length"
        :actions="document._actions"
      />
      <CustomActions
        v-if="document.actions?.length"
        :actions="document.actions"
      />
    </template>
    <!-- Primary action, placed beside the avatar in the global header -->
    <template v-if="!errorTitle" #primary-action>
      <Button
        :label="__('Convert to Deal')"
        variant="solid"
        class="shrink-0 bg-brand-500 text-white hover:bg-brand-600"
        @click="showConvertToDealModal = true"
      />
    </template>
  </LayoutHeader>
  <div
    v-if="doc.name"
    class="flex h-full flex-col overflow-hidden bg-[var(--crm-bg)]"
  >
    <!-- Identity + key facts (fixed bands above the working area) -->
    <div class="flex shrink-0 flex-col gap-3 px-4 pt-4">
      <!-- HERO -->
      <section
        class="overflow-hidden rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-surface)] shadow-sm"
      >
        <div
          class="h-14 border-b border-[var(--crm-border)]"
          style="
            background:
              radial-gradient(
                120% 180% at 0% 0%,
                rgba(37, 99, 235, 0.1),
                transparent 60%
              ),
              linear-gradient(180deg, var(--crm-surface-2), var(--crm-surface));
          "
        />
        <div class="-mt-8 flex flex-wrap items-end gap-4 px-6 pb-4">
          <!-- avatar + inline image upload -->
          <FileUploader
            :validateFile="validateIsImageFile"
            @success="(file) => updateField('image', file.file_url)"
          >
            <template #default="{ openFileSelector }">
              <div
                class="group relative size-[68px] shrink-0 overflow-hidden !rounded-2xl"
              >
                <Avatar
                  size="3xl"
                  class="!size-[68px] !rounded-2xl"
                  :label="title"
                  :image="doc.image || doc.organization_logo"
                />
                <!-- image present → change / remove menu -->
                <Dropdown
                  v-if="doc.image"
                  :options="[
                    {
                      icon: 'upload',
                      label: __('Change Image'),
                      onClick: openFileSelector,
                    },
                    {
                      icon: 'trash-2',
                      label: __('Remove Image'),
                      onClick: () => updateField('image', ''),
                    },
                  ]"
                >
                  <button
                    type="button"
                    class="absolute inset-x-0 bottom-0 z-10 flex h-6 cursor-pointer items-center justify-center bg-black/45 opacity-0 duration-200 ease-in-out group-hover:opacity-100"
                  >
                    <CameraIcon class="size-3.5 text-white" />
                  </button>
                </Dropdown>
                <!-- no image → click to upload -->
                <button
                  v-else
                  type="button"
                  class="absolute inset-x-0 bottom-0 z-10 flex h-6 cursor-pointer items-center justify-center bg-black/45 opacity-0 duration-200 ease-in-out group-hover:opacity-100"
                  @click="openFileSelector"
                >
                  <CameraIcon class="size-3.5 text-white" />
                </button>
              </div>
            </template>
          </FileUploader>

          <!-- identity -->
          <div class="min-w-0 flex-1 pb-0.5">
            <Tooltip :text="doc.lead_name || __('Set First Name')">
              <div class="truncate text-xl font-semibold text-ink-gray-9">
                {{ title }}
              </div>
            </Tooltip>
            <div
              class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-5 text-ink-gray-5"
            >
              <span
                v-if="doc.organization"
                class="inline-flex h-5 items-center gap-1.5 rounded-md border border-[var(--crm-border)] bg-[var(--crm-surface-2)] px-2 font-medium text-ink-gray-7"
              >
                <img
                  v-if="doc.organization_logo"
                  :src="doc.organization_logo"
                  class="size-3 shrink-0 rounded-sm object-cover"
                />
                <span
                  v-else
                  class="size-3 shrink-0 rounded-sm bg-gradient-to-br from-indigo-400 to-indigo-600"
                />
                {{ doc.organization }}
              </span>
              <template v-if="doc.industry">
                <span class="text-ink-gray-4">·</span>
                <span>{{ doc.industry }}</span>
              </template>
              <span class="text-ink-gray-4">·</span>
              <span
                class="inline-flex cursor-copy items-center gap-1 hover:text-ink-gray-7"
                @click="copyToClipboard(leadId)"
              >
                {{ leadId }}
                <span
                  class="lucide-copy size-3 opacity-50"
                  aria-hidden="true"
                />
              </span>
              <template v-if="ownerName">
                <span class="text-ink-gray-4">·</span>
                <span
                  >{{ __('Owner') }}
                  <span class="font-medium text-ink-gray-7">{{
                    ownerName
                  }}</span></span
                >
              </template>
            </div>
          </div>

          <!-- status + record actions -->
          <div class="flex shrink-0 flex-col items-end gap-2.5 pb-0.5">
            <Dropdown
              v-if="doc && document.statuses"
              :options="statuses"
              placement="right"
            >
              <template #default="{ open }">
                <Button
                  v-if="doc.status"
                  :label="statusLabel(doc.status)"
                  :iconRight="open ? 'chevron-up' : 'chevron-down'"
                >
                  <template #prefix>
                    <IndicatorIcon :class="getLeadStatus(doc.status)?.color" />
                  </template>
                </Button>
              </template>
            </Dropdown>
            <div class="flex items-center gap-1.5">
              <Button
                v-if="callEnabled"
                :tooltip="
                  isPhoneInCall ? __('Call In Progress') : __('Make a Call')
                "
                :icon="PhoneIcon"
                :class="{
                  '!bg-emerald-600 hover:!bg-emerald-700 text-white animate-pulse shadow-glow-emerald':
                    isPhoneInCall,
                }"
                @click="
                  () =>
                    doc.mobile_no
                      ? makeCall(doc.mobile_no)
                      : toast.error(
                          __('Please set a mobile number to make calls'),
                        )
                "
              />
              <Button
                :tooltip="__('Send an Email')"
                :icon="Email2Icon"
                @click="
                  doc.email
                    ? openEmailBox()
                    : toast.error(
                        __('Please set an email address to send emails'),
                      )
                "
              />
              <Button
                :tooltip="__('Go to Website')"
                :icon="LinkIcon"
                @click="
                  doc.website
                    ? openWebsite(doc.website)
                    : toast.error(__('Please set a website to visit'))
                "
              />
              <Button
                :tooltip="__('Attach a File')"
                :icon="AttachmentIcon"
                @click="showFilesUploader = true"
              />
              <AssignTo
                v-model="assignees.data"
                doctype="CRM Lead"
                :docname="leadId"
              />
              <Button
                v-if="canDelete"
                :tooltip="__('Delete')"
                variant="subtle"
                theme="red"
                icon="lucide-trash-2"
                @click="deleteLead"
              />
            </div>
          </div>
        </div>
        <ErrorMessage class="px-6 pb-3" :message="__(error)" />
      </section>

      <!-- KEY FACTS -->
      <section class="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <div class="fact-tile">
          <span class="fact-k"
            ><FeatherIcon name="mail" class="size-3.5" />{{ __('Email') }}</span
          >
          <span class="fact-v" :class="{ 'fact-empty': !doc.email }">{{
            doc.email || __('Add email…')
          }}</span>
        </div>
        <div class="fact-tile">
          <span class="fact-k"
            ><FeatherIcon name="phone" class="size-3.5" />{{
              __('Phone')
            }}</span
          >
          <span class="fact-v" :class="{ 'fact-empty': !doc.mobile_no }">{{
            doc.mobile_no || __('Add phone…')
          }}</span>
        </div>
        <div class="fact-tile">
          <span class="fact-k"
            ><FeatherIcon name="globe" class="size-3.5" />{{
              __('Website')
            }}</span
          >
          <span
            class="fact-v"
            :class="
              doc.website ? 'text-[var(--crm-accent-primary)]' : 'fact-empty'
            "
            >{{ doc.website || __('Add website…') }}</span
          >
        </div>
        <div class="fact-tile">
          <span class="fact-k"
            ><FeatherIcon name="briefcase" class="size-3.5" />{{
              __('Industry')
            }}</span
          >
          <span class="fact-v" :class="{ 'fact-empty': !doc.industry }">{{
            doc.industry || __('—')
          }}</span>
        </div>
        <div class="fact-tile">
          <span class="fact-k"
            ><FeatherIcon name="users" class="size-3.5" />{{
              __('Company size')
            }}</span
          >
          <span
            class="fact-v"
            :class="{ 'fact-empty': !doc.no_of_employees }"
            >{{ doc.no_of_employees || __('—') }}</span
          >
        </div>
        <div class="fact-tile">
          <span class="fact-k"
            ><FeatherIcon name="map-pin" class="size-3.5" />{{
              __('Territory')
            }}</span
          >
          <span class="fact-v" :class="{ 'fact-empty': !doc.territory }">{{
            doc.territory || __('—')
          }}</span>
        </div>
      </section>
    </div>

    <!-- WORKING AREA: timeline (left) + contextual panel (right) -->
    <div
      class="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden p-4 lg:grid-cols-[minmax(0,1fr)_340px]"
    >
      <!-- left: tabs + activities -->
      <div
        class="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-surface)]"
      >
        <Tabs
          v-model="tabIndex"
          :tabs="tabs"
          class="crm-record-tabs flex flex-col flex-1 overflow-hidden [&_[role='tab']]:px-0 [&_[role='tab']]:shrink-0 [&_[role='tablist']]:px-5 [&_[role='tablist']]:overflow-x-auto [&_[role='tablist']::-webkit-scrollbar]:h-0 [&_[role='tablist']]:min-h-[45px] [&_[role='tablist']]:gap-2 [&_[role='tablist']]:justify-between [&_[role='tablist']_.bg-surface-gray-10]:hidden [&_[role='tablist']]:border-b [&_[role='tablist']]:border-[var(--crm-border)] [&_[role='tabpanel']:not([hidden])]:flex [&_[role='tabpanel']:not([hidden])]:grow"
        >
          <template #tab-item="{ tab, selected }">
            <button
              class="group -mb-px flex items-center gap-2 border-b-2 border-transparent py-3 text-[length:var(--text-section-title)] font-medium text-ink-gray-5 duration-200 ease-in-out hover:text-ink-gray-8"
              :class="{
                '!border-brand-500 !text-brand-600 !font-semibold': selected,
              }"
            >
              <component :is="tab.icon" v-if="tab.icon" class="h-4.5" />
              {{ __(tab.label) }}
            </button>
          </template>
          <template #tab-panel>
            <Activities
              ref="activities"
              v-model:reload="reload"
              v-model:tabIndex="tabIndex"
              doctype="CRM Lead"
              :docname="leadId"
              :tabs="tabs"
              @beforeSave="beforeStatusChange"
              @afterSave="reloadResources"
            />
          </template>
        </Tabs>
      </div>

      <!-- right: SLA + dynamic side-panel field sections -->
      <aside class="flex min-h-0 flex-col gap-3 overflow-y-auto pb-1">
        <!-- shrink-0: as a flex child this card would otherwise be squeezed by
             the sections panel below and clip its own rows under overflow-hidden. -->
        <div
          v-if="doc.sla_status"
          class="shrink-0 overflow-hidden rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-surface)] shadow-[var(--crm-shadow-sm)]"
        >
          <SLASection v-model="doc" @updateField="updateField" />
        </div>
        <div
          v-if="sections.data"
          class="shrink-0 lead-side-accent overflow-hidden rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-surface)] shadow-[var(--crm-shadow-sm)]"
        >
          <SidePanelLayout
            :sections="sections.data"
            doctype="CRM Lead"
            :docname="leadId"
            @reload="sections.reload"
            @beforeFieldChange="beforeStatusChange"
            @afterFieldChange="reloadResources"
          />
        </div>
      </aside>
    </div>
  </div>
  <!-- Skeleton: doc loading (neither doc.name nor error yet) -->
  <SkeletonLoader
    v-else-if="!errorTitle"
    type="detail-page"
    aria-label="Loading lead details"
  />
  <ErrorPage
    v-else-if="errorTitle"
    :errorTitle="errorTitle"
    :errorMessage="errorMessage"
  />
  <ConvertToDealModal
    v-if="showConvertToDealModal"
    v-model="showConvertToDealModal"
    :lead="doc"
  />
  <FilesUploader
    v-model="showFilesUploader"
    doctype="CRM Lead"
    :docname="leadId"
    @after="
      () => {
        activities?.all_activities?.reload()
        changeTabTo('attachments')
      }
    "
  />
  <DeleteLinkedDocModal
    v-if="showDeleteLinkedDocModal"
    v-model="showDeleteLinkedDocModal"
    :doctype="'CRM Lead'"
    :docname="leadId"
    name="Leads"
  />
  <LostReasonModal
    v-if="showLostReasonModal"
    v-model="showLostReasonModal"
    doctype="CRM Lead"
    :document="document"
  />
</template>
<script setup>
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import DeleteLinkedDocModal from '@/components/DeleteLinkedDocModal.vue'
import ErrorPage from '@/components/ErrorPage.vue'
import ActivityIcon from '@/components/Icons/ActivityIcon.vue'
import EmailIcon from '@/components/Icons/EmailIcon.vue'
import Email2Icon from '@/components/Icons/Email2Icon.vue'
import CommentIcon from '@/components/Icons/CommentIcon.vue'
import DetailsIcon from '@/components/Icons/DetailsIcon.vue'
import EventIcon from '@/components/Icons/EventIcon.vue'
import PhoneIcon from '@/components/Icons/PhoneIcon.vue'
import TaskIcon from '@/components/Icons/TaskIcon.vue'
import NoteIcon from '@/components/Icons/NoteIcon.vue'
import WhatsAppIcon from '@/components/Icons/WhatsAppIcon.vue'
import IndicatorIcon from '@/components/Icons/IndicatorIcon.vue'
import CameraIcon from '@/components/Icons/CameraIcon.vue'
import LinkIcon from '@/components/Icons/LinkIcon.vue'
import AttachmentIcon from '@/components/Icons/AttachmentIcon.vue'
import LostReasonModal from '@/components/Modals/LostReasonModal.vue'
import LayoutHeader from '@/components/LayoutHeader.vue'
import Activities from '@/components/Activities/Activities.vue'
import AssignTo from '@/components/AssignTo.vue'
import FilesUploader from '@/components/FilesUploader/FilesUploader.vue'
import SidePanelLayout from '@/components/SidePanelLayout.vue'
import SLASection from '@/components/SLASection.vue'
import CustomActions from '@/components/CustomActions.vue'
import ConvertToDealModal from '@/components/Modals/ConvertToDealModal.vue'
import {
  openWebsite,
  setupCustomizations,
  copyToClipboard,
  validateIsImageFile,
  isTranslatable,
} from '@/utils'
import { formatError } from '@/utils/formatError'
import { getSettings } from '@/stores/settings'
import { globalStore } from '@/stores/global'
import { usersStore } from '@/stores/users'
import { statusesStore } from '@/stores/statuses'
import { getMeta } from '@/stores/meta'
import { useDocument } from '@/data/document'
import { whatsappEnabled } from '@/composables/whatsapp'
import { callEnabled } from '@/composables/telephony'
import {
  createResource,
  FileUploader,
  Dropdown,
  FeatherIcon,
  Tooltip,
  Avatar,
  Tabs,
  call,
  usePageMeta,
  toast,
} from 'frappe-ui'
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useActiveTabManager } from '@/composables/useActiveTabManager'

const { brand } = getSettings()
const store = globalStore()
const { $dialog, $socket, makeCall } = store
const { statusOptions, getLeadStatus } = statusesStore()
const { getUser } = usersStore()

// Resolve the lead owner (a user id/email) to a display name for the hero.
const ownerName = computed(() => {
  const o = doc.value?.lead_owner
  if (!o) return ''
  return getUser(o)?.full_name || o
})

const isPhoneInCall = computed(() => {
  return (
    (store.onCall || store.calling) &&
    store.activeNumber === doc.value.mobile_no
  )
})
const { doctypeMeta } = getMeta('CRM Lead')

const router = useRouter()

const props = defineProps({
  leadId: { type: String, required: true },
})

const reload = ref(false)
const activities = ref(null)
const errorTitle = ref('')
const errorMessage = ref('')
const showDeleteLinkedDocModal = ref(false)
const showConvertToDealModal = ref(false)
const showFilesUploader = ref(false)

const {
  triggerOnChange,
  triggerOnRender,
  assignees,
  permissions,
  document,
  scripts,
  error,
} = useDocument('CRM Lead', props.leadId)

const canDelete = computed(() => permissions.data?.permissions?.delete || false)

const doc = computed(() => document.doc || {})

onMounted(async () => {
  if (document.doc) await triggerOnRender()
})

watch(error, (err) => {
  if (err) {
    errorTitle.value = __(
      err.exc_type == 'DoesNotExistError'
        ? 'Document not found'
        : 'Error occurred',
    )
    errorMessage.value = __(err.messages?.[0] || 'An error occurred')
  } else {
    errorTitle.value = ''
    errorMessage.value = ''
  }
})

watch(
  () => document.doc,
  async (_doc) => {
    if (scripts.data?.length) {
      let s = await setupCustomizations(scripts.data, {
        doc: _doc,
        $dialog,
        $socket,
        router,
        toast,
        updateField,
        createToast: toast.create,
        deleteDoc: deleteLead,
        call,
      })
      document._actions = s.actions || []
      document._statuses = s.statuses || []
    }
  },
  { once: true },
)

const title = computed(() => {
  let t = doctypeMeta.value?.title_field || 'name'
  return doc.value?.[t] || props.leadId
})

const statuses = computed(() => {
  let customStatuses = document.statuses?.length
    ? document.statuses
    : document._statuses || []
  return statusOptions('lead', customStatuses, triggerStatusChange)
})

usePageMeta(() => {
  return { title: title.value, icon: brand.favicon }
})

const tabs = computed(() => {
  let tabOptions = [
    {
      name: 'Activity',
      label: __('Activity'),
      icon: ActivityIcon,
    },
    {
      name: 'Emails',
      label: __('Emails'),
      icon: EmailIcon,
    },
    {
      name: 'Comments',
      label: __('Comments'),
      icon: CommentIcon,
    },
    {
      name: 'Events',
      label: __('Events'),
      icon: EventIcon,
    },
    {
      name: 'Calls',
      label: __('Calls'),
      icon: PhoneIcon,
    },
    {
      name: 'Tasks',
      label: __('Tasks'),
      icon: TaskIcon,
    },
    {
      name: 'Notes',
      label: __('Notes'),
      icon: NoteIcon,
    },
    {
      name: 'Attachments',
      label: __('Attachments'),
      icon: AttachmentIcon,
    },
    {
      name: 'WhatsApp',
      label: __('WhatsApp'),
      icon: WhatsAppIcon,
      condition: () => whatsappEnabled.value,
    },
    // Last on purpose: every other tab is a conversation or a related
    // record, Data is the record's own form. It reads as the odd one out
    // wedged between Comments and Events, and it is the tab you reach for
    // least often.
    {
      name: 'Data',
      label: __('Data'),
      icon: DetailsIcon,
    },
  ]
  return tabOptions.filter((tab) => (tab.condition ? tab.condition() : true))
})

const { tabIndex, changeTabTo } = useActiveTabManager(tabs, 'lastLeadTab')

const sections = createResource({
  url: 'xbr_crm.fcrm.doctype.crm_fields_layout.crm_fields_layout.get_sidepanel_sections',
  cache: ['sidePanelSections', 'CRM Lead'],
  params: { doctype: 'CRM Lead' },
  auto: true,
})

async function triggerStatusChange(value) {
  await triggerOnChange('status', value)
  setLostReason()
}

function updateField(name, value) {
  value = Array.isArray(name) ? '' : value
  // Capture what each field actually held. This used to be a bare `{}`, so the
  // rollback below wrote `undefined` over every field instead of restoring it —
  // leaving the doc dirtier than before the failed save, and letting the next
  // successful save persist a clearing the user never confirmed.
  let oldValues = Array.isArray(name)
    ? Object.fromEntries(name.map((field) => [field, doc.value[field]]))
    : doc.value[name]

  if (Array.isArray(name)) {
    name.forEach((field) => (doc.value[field] = value))
  } else {
    doc.value[name] = value
  }

  document.save.submit(null, {
    onSuccess: () => (reload.value = true),
    onError: (err) => {
      if (Array.isArray(name)) {
        name.forEach((field) => (doc.value[field] = oldValues[field]))
      } else {
        doc.value[name] = oldValues
      }
      // formatError also reads `.message`, which a plain Error carries and
      // `.messages` does not — without it a genuine failure reached the user
      // as the generic fallback, with the server's reason thrown away.
      toast.error(formatError(err, 'Error updating field'))
    },
  })
}

function deleteLead() {
  showDeleteLinkedDocModal.value = true
}

function openEmailBox() {
  let currentTab = tabs.value[tabIndex.value]
  if (!['Emails', 'Comments', 'Activities'].includes(currentTab.name)) {
    activities.value.changeTabTo('emails')
  }
  nextTick(() => (activities.value.emailBox.show = true))
}

function statusLabel(status) {
  if (isTranslatable('CRM Lead Status')) return __(status)
  return status
}

const showLostReasonModal = ref(false)

function setLostReason() {
  if (
    getLeadStatus(document.doc.status)?.type !== 'Lost' ||
    (document.doc.lost_reason && document.doc.lost_reason !== 'Other') ||
    (document.doc.lost_reason === 'Other' && document.doc.lost_notes)
  ) {
    document.save.submit(null, {
      onSuccess: () => sections.reload(),
    })
    return
  }

  showLostReasonModal.value = true
}

function beforeStatusChange(data) {
  if (
    Object.hasOwn(data ?? {}, 'status') &&
    getLeadStatus(data.status)?.type == 'Lost'
  ) {
    setLostReason()
  } else {
    document.save.submit(null, {
      onSuccess: () => reloadResources(data),
    })
  }
}

function reloadResources(data) {
  if (Object.hasOwn(data ?? {}, 'lead_owner')) {
    assignees.reload()
  }
  if (
    Object.hasOwn(data ?? {}, 'status') &&
    getLeadStatus(data.status)?.type != 'Lost'
  ) {
    sections.reload()
  }
}
</script>

<style scoped>
/* Toned-down "Studio" accent — Lead detail only. Subtle blue section-header
   chevrons + tighter label tracking read as "designed" without a loud gradient. */
.lead-side-accent :deep(.section-header [class*='lucide-chevron']) {
  color: var(--crm-accent-primary);
  opacity: 0.9;
}
.lead-side-accent :deep(.section-header .font-semibold) {
  letter-spacing: -0.01em;
}

/* Key-facts strip — .fact-tile / .fact-k / .fact-v / .fact-empty now live in
   styles/design-system.css: the same four rules were duplicated byte-for-byte
   across the Lead, Deal, Contact and Organization pages. */
</style>
