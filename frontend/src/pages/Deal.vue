<template>
  <LayoutHeader>
    <template #left-header>
      <div class="flex min-w-0 items-center gap-1.5">
        <Tooltip :text="__('Back to Deals')">
          <button
            class="grid size-7 shrink-0 place-items-center rounded-lg text-ink-gray-6 transition-colors hover:bg-[var(--crm-surface-2)] hover:text-ink-gray-9"
            :aria-label="__('Back to Deals')"
            @click="router.push({ name: 'Deals' })"
          >
            <FeatherIcon name="arrow-left" class="size-4" />
          </button>
        </Tooltip>
        <button
          class="shrink-0 text-sm font-medium text-ink-gray-5 transition-colors hover:text-ink-gray-8"
          @click="router.push({ name: 'Deals' })"
        >
          {{ __('Deals') }}
        </button>
        <span class="shrink-0 text-ink-gray-4">/</span>
        <span class="truncate text-sm font-semibold text-ink-gray-9">
          {{ title }}
        </span>
      </div>
    </template>
    <template v-if="!errorTitle" #right-header>
      <!-- Status + record actions live on the record hero now, not the top bar. -->
      <CustomActions
        v-if="document._actions?.length"
        :actions="document._actions"
      />
      <CustomActions
        v-if="document.actions?.length"
        :actions="document.actions"
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
          <Tooltip :text="__('Organization Logo')">
            <Avatar
              size="3xl"
              class="!size-[68px] !rounded-2xl ring-4 ring-[var(--crm-surface)]"
              :label="dealName"
              :image="doc.organization_logo || organization?.organization_logo"
            />
          </Tooltip>

          <div class="min-w-0 flex-1 pb-0.5">
            <!-- The customer is the deal's identity. `title` falls back to the
                 record name when no organization is set, which is why the page
                 showed the deal ID as BOTH the heading and the line underneath
                 it. The ID now appears exactly once, in the meta line, and an
                 unnamed deal says so plainly instead of echoing its key. -->
            <Tooltip :text="dealName || __('Set an Organization')">
              <div
                class="truncate text-xl font-semibold"
                :class="dealName ? 'text-ink-gray-9' : 'text-ink-gray-5'"
              >
                {{ dealName || __('Untitled deal') }}
              </div>
            </Tooltip>
            <div
              class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-gray-5"
            >
              <span
                class="inline-flex cursor-copy items-center gap-1 hover:text-ink-gray-7"
                :title="__('Copy deal ID')"
                @click="copyToClipboard(dealId)"
              >
                {{ dealId }}
                <span
                  class="lucide-copy size-3 opacity-50"
                  aria-hidden="true"
                />
              </span>
              <template v-if="doc.industry">
                <span class="text-ink-gray-4">·</span>
                <span>{{ doc.industry }}</span>
              </template>
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
                    <IndicatorIcon :class="getDealStatus(doc.status)?.color" />
                  </template>
                </Button>
              </template>
            </Dropdown>
            <Button
              v-if="isFollowUpStage(doc.status) && doc.next_follow_up"
              size="sm"
              :variant="followUpOverdue ? 'subtle' : 'ghost'"
              :theme="followUpOverdue ? 'red' : 'gray'"
              :tooltip="__('Change the follow-up date')"
              :label="
                followUpOverdue
                  ? __('Follow-up overdue · {0}', [
                      formatDate(doc.next_follow_up, 'D MMM, h:mm a'),
                    ])
                  : __('Follow-up · {0}', [
                      formatDate(doc.next_follow_up, 'D MMM, h:mm a'),
                    ])
              "
              icon-left="lucide-calendar-clock"
              @click="rescheduleFollowUp"
            />
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
                @click="triggerCall"
              />
              <Button
                :tooltip="__('Send an Email')"
                :label="__('Send an Email')"
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
                :label="__('Go to Website')"
                :icon="LinkIcon"
                @click="
                  doc.website
                    ? openWebsite(doc.website)
                    : toast.error(__('Please set a website to visit'))
                "
              />
              <Button
                :tooltip="__('Attach a File')"
                :label="__('Attach a File')"
                :icon="AttachmentIcon"
                @click="showFilesUploader = true"
              />
              <AssignTo
                v-model="assignees.data"
                doctype="CRM Deal"
                :docname="dealId"
              />
              <Button
                v-if="canDelete"
                :tooltip="__('Delete')"
                :label="__('Delete deal')"
                variant="subtle"
                theme="red"
                icon="lucide-trash-2"
                @click="deleteDeal"
              />
            </div>
          </div>
        </div>
        <!-- Stage progression. Built from the site's own CRM Deal Status rows,
             so the steps are whatever this site configured rather than a
             hardcoded list; clicking one goes through the same
             `triggerStatusChange` the dropdown uses, so the lost-reason prompt
             and any script hooks still fire. -->
        <div
          v-if="pipelineStages.length"
          class="border-t border-[var(--crm-border)] px-6 py-3"
        >
          <StatusPipeline
            :statuses="pipelineStages"
            :current="doc.status"
            :statusLabel="statusLabel"
            @change="triggerStatusChange"
          />
        </div>
      </section>
    </div>

    <!-- WORKING AREA: timeline (left) + contextual panel (right) -->
    <div
      class="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden p-4 lg:grid-cols-[minmax(0,1fr)_340px]"
    >
      <div
        class="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-surface)]"
      >
        <Tabs
          v-model="tabIndex"
          as="div"
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
              doctype="CRM Deal"
              :docname="dealId"
              :tabs="tabs"
              @beforeSave="beforeStatusChange"
              @afterSave="reloadResources"
            />
          </template>
        </Tabs>
      </div>

      <!-- right: SLA + dynamic side-panel (includes Deal contacts) -->
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
          v-if="parsedSections.length"
          class="shrink-0 overflow-hidden rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-surface)] shadow-[var(--crm-shadow-sm)]"
        >
          <SidePanelLayout
            :sections="parsedSections"
            :addContact="addContact"
            doctype="CRM Deal"
            :docname="dealId"
            @reload="sections.reload"
            @beforeFieldChange="beforeStatusChange"
            @afterFieldChange="reloadResources"
          >
            <template #actions="{ section }">
              <div v-if="section.name == 'contacts_section'" class="pr-2">
                <Link
                  value=""
                  doctype="Contact"
                  :onCreate="
                    (value, close) => {
                      _contact = {
                        first_name: value,
                        company_name: doc.organization,
                      }
                      showContactModal = true
                      close()
                    }
                  "
                  @change="(e) => addContact(e)"
                >
                  <template #target="{ togglePopover }">
                    <Button
                      class="h-7 px-3"
                      variant="ghost"
                      :label="__('Add contact')"
                      icon="lucide-plus"
                      @click="togglePopover()"
                    />
                  </template>
                </Link>
              </div>
            </template>
            <template #default="{ section }">
              <div
                v-if="section.name == 'contacts_section'"
                class="contacts-area"
              >
                <div
                  v-if="
                    dealContacts?.loading && dealContacts?.data?.length == 0
                  "
                  class="flex min-h-20 flex-1 items-center justify-center gap-3 text-base text-ink-gray-4"
                >
                  <LoadingIndicator class="h-4 w-4" />
                  <span>{{ __('Loading...') }}</span>
                </div>
                <div
                  v-for="(contact, i) in dealContacts.data"
                  v-else-if="dealContacts?.data?.length"
                  :key="contact.name"
                >
                  <div
                    class="px-2 pb-2.5"
                    :class="[i == 0 ? 'pt-5' : 'pt-2.5']"
                  >
                    <CollapsibleSection :opened="contact.opened">
                      <template #header="{ opened, toggle }">
                        <div
                          class="flex cursor-pointer items-center justify-between gap-2 pr-1 text-base leading-5 text-ink-gray-7"
                        >
                          <div
                            class="flex h-7 items-center gap-2 truncate"
                            @click="toggle()"
                          >
                            <Avatar
                              :label="contact.full_name"
                              :image="contact.image"
                              size="md"
                            />
                            <div class="truncate">
                              {{ contact.full_name }}
                            </div>
                            <Badge
                              v-if="contact.is_primary"
                              class="ml-2"
                              variant="outline"
                              :label="__('Primary')"
                              theme="green"
                            />
                          </div>
                          <div class="flex items-center">
                            <Dropdown :options="contactOptions(contact)">
                              <Button
                                icon="lucide-more-horizontal"
                                class="text-ink-gray-5"
                                variant="ghost"
                              />
                            </Dropdown>
                            <Button
                              variant="ghost"
                              :tooltip="__('View Contact')"
                              :icon="ArrowUpRightIcon"
                              @click="
                                router.push({
                                  name: 'Contact',
                                  params: { contactId: contact.name },
                                })
                              "
                            />
                            <Button
                              variant="ghost"
                              class="transition-all duration-300 ease-in-out"
                              :class="{ 'rotate-90': opened }"
                              icon="lucide-chevron-right"
                              @click="toggle()"
                            />
                          </div>
                        </div>
                      </template>
                      <div class="flex flex-col gap-1.5 text-base">
                        <div
                          v-if="contact.email"
                          class="flex items-center gap-3 pb-1.5 pl-1 pt-4 text-ink-gray-8"
                        >
                          <Email2Icon class="h-4 w-4" />
                          {{ contact.email }}
                        </div>
                        <div
                          v-if="contact.mobile_no"
                          class="flex items-center gap-3 p-1 py-1.5 text-ink-gray-8"
                        >
                          <PhoneIcon class="h-4 w-4" />
                          {{ contact.mobile_no }}
                        </div>
                        <div
                          v-if="!contact.email && !contact.mobile_no"
                          class="flex items-center justify-center py-4 text-sm text-ink-gray-4"
                        >
                          {{ __('No Details Added') }}
                        </div>
                      </div>
                    </CollapsibleSection>
                  </div>
                  <div
                    v-if="i != dealContacts.data.length - 1"
                    class="mx-2 h-px border-t border-outline-elevation-2"
                  />
                </div>
                <div
                  v-else
                  class="flex h-20 items-center justify-center text-base text-ink-gray-5"
                >
                  {{ __('No Contacts Added') }}
                </div>
              </div>
            </template>
          </SidePanelLayout>
        </div>
      </aside>
    </div>
  </div>
  <!-- Skeleton: doc loading (neither doc.name nor error yet) -->
  <SkeletonLoader
    v-else-if="!errorTitle"
    type="detail-page"
    :aria-label="__('Loading deal details')"
  />
  <ErrorPage
    v-else-if="errorTitle"
    :errorTitle="errorTitle"
    :errorMessage="errorMessage"
  />
  <OrganizationModal
    v-if="showOrganizationModal"
    v-model="showOrganizationModal"
    :data="_organization"
    :options="{
      redirect: false,
      afterInsert: (_doc) => updateField('organization', _doc.name),
    }"
  />
  <ContactModal
    v-if="showContactModal"
    v-model="showContactModal"
    :contact="_contact"
    :options="{
      redirect: false,
      afterInsert: (_doc) => addContact(_doc.name),
    }"
  />
  <FilesUploader
    v-model="showFilesUploader"
    doctype="CRM Deal"
    :docname="dealId"
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
    :doctype="'CRM Deal'"
    :docname="dealId"
    name="Deals"
  />
  <LostReasonModal
    v-if="showLostReasonModal"
    v-model="showLostReasonModal"
    doctype="CRM Deal"
    :document="document"
  />
</template>
<script setup>
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import DeleteLinkedDocModal from '@/components/DeleteLinkedDocModal.vue'
import ErrorPage from '@/components/ErrorPage.vue'
import LoadingIndicator from '@/components/Icons/LoadingIndicator.vue'
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
import LinkIcon from '@/components/Icons/LinkIcon.vue'
import ArrowUpRightIcon from '@/components/Icons/ArrowUpRightIcon.vue'
import SuccessIcon from '@/components/Icons/SuccessIcon.vue'
import AttachmentIcon from '@/components/Icons/AttachmentIcon.vue'
import LayoutHeader from '@/components/LayoutHeader.vue'
import Activities from '@/components/Activities/Activities.vue'
import OrganizationModal from '@/components/Modals/OrganizationModal.vue'
import LostReasonModal from '@/components/Modals/LostReasonModal.vue'
import AssignTo from '@/components/AssignTo.vue'
import FilesUploader from '@/components/FilesUploader/FilesUploader.vue'
import ContactModal from '@/components/Modals/ContactModal.vue'
import Link from '@/components/Controls/Link.vue'
import CollapsibleSection from '@/components/CollapsibleSection.vue'
import SidePanelLayout from '@/components/SidePanelLayout.vue'
import StatusPipeline from '@/components/StatusPipeline.vue'
import { useDealFacts } from '@/composables/dealFacts'
import SLASection from '@/components/SLASection.vue'
import CustomActions from '@/components/CustomActions.vue'
import {
  openWebsite,
  setupCustomizations,
  copyToClipboard,
  isTranslatable,
  formatDate,
} from '@/utils'
import {
  askFollowUp,
  isFollowUpStage,
  isFollowUpOverdue,
} from '@/composables/followUp'
import { formatError } from '@/utils/formatError'
import { getSettings } from '@/stores/settings'
import { globalStore } from '@/stores/global'
import { statusesStore } from '@/stores/statuses'
import { getMeta } from '@/stores/meta'
import { useDocument } from '@/data/document'
import { whatsappEnabled } from '@/composables/whatsapp'
import { callEnabled } from '@/composables/telephony'
import { useBroadcast } from '@/composables/useBroadcast'
import {
  createResource,
  Dropdown,
  FeatherIcon,
  Tooltip,
  Avatar,
  Tabs,
  call,
  usePageMeta,
  toast,
} from 'frappe-ui'
import { useOnboarding } from 'frappe-ui/frappe'
import {
  ref,
  computed,
  h,
  onMounted,
  onBeforeUnmount,
  nextTick,
  watch,
} from 'vue'
import { useRouter } from 'vue-router'
import { useActiveTabManager } from '@/composables/useActiveTabManager'

const { on } = useBroadcast()
const { brand } = getSettings()
const store = globalStore()
const { $dialog, $socket, makeCall } = store
const { statusOptions, getDealStatus } = statusesStore()

// Resolve the deal owner (user id/email) to a display name for the hero.

const isPhoneInCall = computed(() => {
  return (
    (store.onCall || store.calling) &&
    store.activeNumber === doc.value.mobile_no
  )
})
const { doctypeMeta } = getMeta('CRM Deal')

const { updateOnboardingStep, isOnboardingStepsCompleted } =
  useOnboarding('frappecrm')

const router = useRouter()

const props = defineProps({
  dealId: { type: String, required: true },
})

const errorTitle = ref('')
const errorMessage = ref('')
const showDeleteLinkedDocModal = ref(false)

const {
  triggerOnChange,
  triggerOnRender,
  assignees,
  permissions,
  document,
  scripts,
  error,
} = useDocument('CRM Deal', props.dealId)

const canDelete = computed(() => permissions.data?.permissions?.delete || false)

const doc = computed(() => document.doc || {})

watch(error, (err) => {
  if (err) {
    errorTitle.value = __(
      err.exc_type == 'DoesNotExistError'
        ? 'Document Not Found'
        : 'Error Occurred',
    )
    errorMessage.value = __(err.messages?.[0] || 'An Error Occurred')
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
        deleteDoc: deleteDeal,
        call,
      })
      document._actions = s.actions || []
      document._statuses = s.statuses || []
    }
  },
  { once: true },
)

const organizationDocument = ref(null)

watch(
  () => doc.value.organization,
  (org) => {
    if (org && !organizationDocument.value?.doc) {
      let { document: _organizationDocument } = useDocument(
        'CRM Organization',
        org,
      )
      organizationDocument.value = _organizationDocument
    }
  },
  { immediate: true },
)

const organization = computed(() => organizationDocument.value?.doc || {})

// Header facts (name, owner, stages) come from the shared composable so the
// mobile detail page shows exactly the same figures — see composables/dealFacts.js.
const { dealName, ownerName, pipelineStages } = useDealFacts(doc, organization)
// NB: declared AFTER `doc` and `organization`. The composable receives the
// bindings themselves, so calling it earlier hits the temporal dead zone and
// the whole page fails to set up.

onMounted(async () => {
  $socket.on('crm_customer_created', () => {
    toast.success(__('Customer Created Successfully'))
  })
  if (document.doc) await triggerOnRender()
})

onBeforeUnmount(() => {
  $socket.off('crm_customer_created')
})

const reload = ref(false)
const showOrganizationModal = ref(false)
const showFilesUploader = ref(false)
const _organization = ref({})

const title = computed(() => {
  let t = doctypeMeta.value?.title_field || 'name'
  return doc.value?.[t] || props.dealId
})

const statuses = computed(() => {
  let customStatuses = document.statuses?.length
    ? document.statuses
    : document._statuses || []
  return statusOptions('deal', customStatuses, triggerStatusChange)
})

usePageMeta(() => {
  return {
    title: title.value,
    icon: brand.favicon,
  }
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

const { tabIndex } = useActiveTabManager(tabs, 'lastDealTab')

const sections = createResource({
  url: 'xbr_crm.fcrm.doctype.crm_fields_layout.crm_fields_layout.get_sidepanel_sections',
  // The cache key is back. It was dropped to dodge the stale-closure bug —
  // frappe-ui returns the cached resource and discards the new options, so a
  // `transform` installed by the first Deal was reused for every later one.
  // With the per-record handlers moved into the computed below, the cached
  // data is identical for every Deal and caching it is correct again.
  cache: ['sidePanelSections', 'CRM Deal'],
  params: { doctype: 'CRM Deal' },
})

on('reload-deal-sections', () => sections.reload())

if (!sections.data) sections.fetch()

const parsedSections = computed(() => {
  if (!sections.data) return []
  // Spread rather than mutate: `sections.data` is now a shared cache entry.
  return sections.data.map((section) => {
    if (section.name == 'contacts_section') return section
    return {
      ...section,
      columns: (section.columns || []).map((column, i) =>
        i !== 0
          ? column
          : {
              ...column,
              fields: (column.fields || []).map((field) =>
                field.fieldname !== 'organization'
                  ? field
                  : {
                      ...field,
                      create: (value, close) => {
                        _organization.value.organization_name = value
                        showOrganizationModal.value = true
                        close()
                      },
                      link: (org) =>
                        router.push({
                          name: 'Organization',
                          params: { organizationId: org },
                        }),
                    },
              ),
            },
      ),
    }
  })
})

const showContactModal = ref(false)
const _contact = ref({})

function contactOptions(contact) {
  let options = [
    {
      label: __('Remove'),
      icon: 'trash-2',
      onClick: () => removeContact(contact.name),
    },
  ]

  if (!contact.is_primary) {
    options.push({
      label: __('Set as Primary Contact'),
      icon: h(SuccessIcon, { class: 'h-4 w-4' }),
      onClick: () => setPrimaryContact(contact.name),
    })
  }

  return options
}

async function addContact(contact) {
  if (dealContacts.data?.find((c) => c.name === contact)) {
    toast.error(__('Contact Already Added'))
    return
  }

  let d = await call('xbr_crm.fcrm.doctype.crm_deal.crm_deal.add_contact', {
    deal: props.dealId,
    contact,
  })
  if (d) {
    dealContacts.reload()
    toast.success(__('Contact Added'))
  }
}

async function removeContact(contact) {
  let d = await call('xbr_crm.fcrm.doctype.crm_deal.crm_deal.remove_contact', {
    deal: props.dealId,
    contact,
  })
  if (d) {
    dealContacts.reload()
    toast.success(__('Contact Removed'))
  }
}

async function setPrimaryContact(contact) {
  let d = await call(
    'xbr_crm.fcrm.doctype.crm_deal.crm_deal.set_primary_contact',
    {
      deal: props.dealId,
      contact,
    },
  )
  if (d) {
    dealContacts.reload()
    toast.success(__('Primary Contact Set'))
  }
}

const dealContacts = createResource({
  url: 'xbr_crm.fcrm.doctype.crm_deal.api.get_deal_contacts',
  params: { name: props.dealId },
  cache: ['deal_contacts', props.dealId],
  transform: (data) => {
    data.forEach((contact) => {
      contact.opened = false
    })
    return data
  },
})

if (!dealContacts.data) dealContacts.fetch()

function triggerCall() {
  let primaryContact = dealContacts.data?.find((c) => c.is_primary)

  // The check has to come before the read. `mobile_no` was taken off
  // `primaryContact` on the line above this guard, so a deal with no primary
  // contact — precisely the case the guard exists for — threw instead of
  // showing the message.
  if (!primaryContact) {
    toast.error(__('No Primary Contact Set'))
    return
  }

  let mobile_no = primaryContact.mobile_no || null
  if (!mobile_no) {
    toast.error(__('No Mobile Number Set'))
    return
  }

  makeCall(mobile_no)
}

async function triggerStatusChange(value) {
  // Moving into the follow-up stage needs a follow-up date (a task with a
  // reminder is created from it). Cancelling leaves the stage as it was.
  if (isFollowUpStage(value) && value !== doc.value.status) {
    const followUp = await askFollowUp({
      next_follow_up: doc.value.next_follow_up,
      follow_up_note: doc.value.follow_up_note,
    })
    if (!followUp) return
    Object.assign(doc.value, followUp)
  }
  await triggerOnChange('status', value)
  setLostReason()
}

async function rescheduleFollowUp() {
  const followUp = await askFollowUp({
    next_follow_up: doc.value.next_follow_up,
    follow_up_note: doc.value.follow_up_note,
  })
  if (!followUp) return
  Object.assign(doc.value, followUp)
  document.save.submit(null, { onSuccess: () => (reload.value = true) })
}

const followUpOverdue = computed(() =>
  isFollowUpOverdue(doc.value?.status, doc.value?.next_follow_up),
)

function updateField(name, value) {
  if (name == 'status' && !isOnboardingStepsCompleted.value) {
    updateOnboardingStep('change_deal_status')
  }

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

function deleteDeal() {
  showDeleteLinkedDocModal.value = true
}

const activities = ref(null)

function openEmailBox() {
  let currentTab = tabs.value[tabIndex.value]
  if (!['Emails', 'Comments', 'Activities'].includes(currentTab.name)) {
    activities.value.changeTabTo('emails')
  }
  nextTick(() => (activities.value.emailBox.show = true))
}

function statusLabel(status) {
  if (isTranslatable('CRM Deal Status')) return __(status)
  return status
}

const showLostReasonModal = ref(false)

function setLostReason() {
  if (
    getDealStatus(document.doc.status)?.type !== 'Lost' ||
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
    getDealStatus(data.status)?.type == 'Lost'
  ) {
    setLostReason()
  } else {
    document.save.submit(null, {
      onSuccess: () => reloadResources(data),
    })
  }
}

function reloadResources(data) {
  if (Object.hasOwn(data ?? {}, 'deal_owner')) {
    assignees.reload()
  }
  if (
    Object.hasOwn(data ?? {}, 'status') &&
    getDealStatus(data.status)?.type != 'Lost'
  ) {
    sections.reload()
  }
}
</script>
