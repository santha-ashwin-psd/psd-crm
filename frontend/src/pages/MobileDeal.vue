<template>
  <LayoutHeader>
    <!-- The status control used to be `absolute right-0`, so it sat outside the
         flow and a long status name could ride over the breadcrumb. Both items
         are now flex children: the breadcrumb takes the slack and truncates,
         the status keeps its intrinsic width and never overlaps. -->
    <header class="flex h-10.5 items-center justify-between gap-2 py-2.5 pl-2">
      <Breadcrumbs class="min-w-0 flex-1 overflow-hidden" :items="breadcrumbs">
        <template #prefix="{ item }">
          <Icon v-if="item.icon" :icon="item.icon" class="mr-2 h-4" />
        </template>
      </Breadcrumbs>
      <div class="mdeal-status shrink-0">
        <Dropdown
          v-if="doc"
          :options="
            statusOptions(
              'deal',
              document.statuses?.length
                ? document.statuses
                : document._statuses,
              triggerStatusChange,
            )
          "
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
      </div>
    </header>
  </LayoutHeader>
  <!-- Flex column: without one, the tabs wrapper's `h-full` resolved to the
       full height of the scrolling page, so identity + action bar + tabs
       overflowed it. Activities then called scrollIntoView on the newest
       entry, which scrolled the PAGE and carried the identity header off the
       top — you opened a deal and could not see which deal it was. With the
       column, only the activity list scrolls. -->
  <div v-if="doc.name" class="flex h-full min-h-0 flex-col">
    <!-- Identity. The page previously opened straight onto a tab strip, so the
       only thing naming the record was the breadcrumb — the deal ID. The
       customer leads here, the ID appears once beneath it as a copy control,
       and the owner follows. Same facts as the desktop header, laid out for a
       narrow screen rather than copied from it. -->
    <div class="border-b border-[var(--crm-border)] px-3 pt-3">
      <div class="flex items-start gap-3">
        <!-- A deal with no organization has no initial to show, and an empty
             Avatar left a blank indent beside the title. Fall back to a
             neutral glyph so the row still reads as an identity block. -->
        <Avatar
          v-if="dealName || doc.organization_logo"
          size="lg"
          class="!rounded-xl"
          :label="dealName"
          :image="doc.organization_logo"
        />
        <span v-else class="mdeal-avatar-placeholder" aria-hidden="true">
          <FeatherIcon name="briefcase" class="size-5" />
        </span>
        <div class="min-w-0 flex-1">
          <div
            class="truncate text-base font-semibold"
            :class="dealName ? 'text-ink-gray-9' : 'text-ink-gray-5'"
          >
            {{ dealName || __('Untitled deal') }}
          </div>
          <div
            class="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] leading-4 text-ink-gray-5"
          >
            <span
              class="inline-flex cursor-copy items-center gap-1"
              :title="__('Copy deal ID')"
              @click="copyToClipboard(dealId)"
            >
              {{ dealId }}
              <span class="lucide-copy size-3 opacity-50" aria-hidden="true" />
            </span>
            <template v-if="ownerName">
              <span class="text-ink-gray-4">·</span>
              <span class="truncate">{{ ownerName }}</span>
            </template>
          </div>
        </div>
      </div>

      <!-- Stage progression. The shared component already scrolls sideways
         below 768px rather than wrapping each stage onto its own line. -->
      <div v-if="pipelineStages.length" class="mt-3">
        <StatusPipeline
          :statuses="pipelineStages"
          :current="doc.status"
          :statusLabel="statusLabel"
          @change="triggerStatusChange"
        />
      </div>

      <!-- Four facts, not the desktop's six: value, probability and close date
         are what a deal is judged on, and two columns is what fits a phone
         without shrinking the numbers. The rest stay in Details. -->
      <dl class="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 pb-3">
        <div class="min-w-0">
          <dt class="crm-overline">{{ __('Deal value') }}</dt>
          <dd class="mdeal-fact">{{ dealValue }}</dd>
        </div>
        <div class="min-w-0">
          <dt class="crm-overline">{{ __('Probability') }}</dt>
          <dd class="mdeal-fact">{{ probabilityLabel }}</dd>
        </div>
        <div class="min-w-0">
          <dt class="crm-overline">{{ __('Expected close') }}</dt>
          <dd class="mdeal-fact">{{ expectedCloseLabel }}</dd>
        </div>
        <div class="min-w-0">
          <dt class="crm-overline">{{ __('Expected value') }}</dt>
          <dd class="mdeal-fact">{{ expectedValue }}</dd>
        </div>
      </dl>
    </div>

    <div
      class="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-[var(--crm-border)] px-3 py-2.5"
    >
      <AssignTo v-model="assignees.data" doctype="CRM Deal" :docname="dealId" />
      <div class="flex items-center gap-2">
        <CustomActions
          v-if="document._actions?.length"
          :actions="document._actions"
        />
        <CustomActions
          v-if="document.actions?.length"
          :actions="document.actions"
        />
      </div>
    </div>
    <div class="flex min-h-0 flex-1 overflow-hidden">
      <Tabs
        v-model="tabIndex"
        as="div"
        :tabs="tabs"
        class="flex flex-1 overflow-auto flex-col [&_[role='tab']]:px-0 [&_[role='tab']]:shrink-0 [&_[role='tablist']]:px-3 [&_[role='tablist']]:min-h-[45px] [&_[role='tablist']]:gap-7.5 [&_[role='tabpanel']:not([hidden])]:flex [&_[role='tabpanel']:not([hidden])]:grow"
      >
        <template #tab-panel="{ tab }">
          <div v-if="tab.name == 'Details'">
            <SLASection
              v-if="doc.sla_status"
              v-model="doc"
              @updateField="updateField"
            />
            <div
              v-if="parsedSections.length"
              class="flex flex-1 flex-col justify-between overflow-hidden"
            >
              <SidePanelLayout
                :sections="parsedSections"
                doctype="CRM Deal"
                :docname="dealId"
                @reload="sections.reload"
                @beforeFieldChange="beforeStatusChange"
                @afterFieldChange="reloadAssignees"
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
                      v-for="(contact, i) in section.contacts"
                      v-else-if="section.contacts.length"
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
                                <Dropdown
                                  :options="contactOptions(contact.name)"
                                >
                                  <Button
                                    icon="lucide-more-horizontal"
                                    class="text-ink-gray-5"
                                    variant="ghost"
                                  />
                                </Dropdown>
                                <Button
                                  variant="ghost"
                                  @click="
                                    router.push({
                                      name: 'Contact',
                                      params: { contactId: contact.name },
                                    })
                                  "
                                >
                                  <ArrowUpRightIcon class="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" @click="toggle()">
                                  <span
                                    class="lucide-chevron-right h-4 w-4 text-ink-gray-9 transition-all duration-300 ease-in-out"
                                    :class="{ 'rotate-90': opened }"
                                    aria-hidden="true"
                                  />
                                </Button>
                              </div>
                            </div>
                          </template>
                          <div
                            class="flex flex-col gap-1.5 text-base text-ink-gray-8"
                          >
                            <div
                              class="flex items-center gap-3 pb-1.5 pl-1 pt-4"
                            >
                              <Email2Icon class="h-4 w-4" />
                              {{ contact.email }}
                            </div>
                            <div class="flex items-center gap-3 p-1 py-1.5">
                              <PhoneIcon class="h-4 w-4" />
                              {{ contact.mobile_no }}
                            </div>
                          </div>
                        </CollapsibleSection>
                      </div>
                      <div
                        v-if="i != section.contacts.length - 1"
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
          </div>
          <Activities
            v-else
            v-model:reload="reload"
            v-model:tabIndex="tabIndex"
            doctype="CRM Deal"
            :docname="dealId"
            :tabs="tabs"
            @beforeSave="beforeStatusChange"
            @afterSave="reloadAssignees"
          />
        </template>
      </Tabs>
    </div>
  </div>
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
import DeleteLinkedDocModal from '@/components/DeleteLinkedDocModal.vue'
import ErrorPage from '@/components/ErrorPage.vue'
import Icon from '@/components/Icon.vue'
import DetailsIcon from '@/components/Icons/DetailsIcon.vue'
import LoadingIndicator from '@/components/Icons/LoadingIndicator.vue'
import ActivityIcon from '@/components/Icons/ActivityIcon.vue'
import EmailIcon from '@/components/Icons/EmailIcon.vue'
import Email2Icon from '@/components/Icons/Email2Icon.vue'
import CommentIcon from '@/components/Icons/CommentIcon.vue'
import PhoneIcon from '@/components/Icons/PhoneIcon.vue'
import TaskIcon from '@/components/Icons/TaskIcon.vue'
import NoteIcon from '@/components/Icons/NoteIcon.vue'
import AttachmentIcon from '@/components/Icons/AttachmentIcon.vue'
import WhatsAppIcon from '@/components/Icons/WhatsAppIcon.vue'
import IndicatorIcon from '@/components/Icons/IndicatorIcon.vue'
import ArrowUpRightIcon from '@/components/Icons/ArrowUpRightIcon.vue'
import SuccessIcon from '@/components/Icons/SuccessIcon.vue'
import LayoutHeader from '@/components/LayoutHeader.vue'
import Activities from '@/components/Activities/Activities.vue'
import OrganizationModal from '@/components/Modals/OrganizationModal.vue'
import LostReasonModal from '@/components/Modals/LostReasonModal.vue'
import AssignTo from '@/components/AssignTo.vue'
import ContactModal from '@/components/Modals/ContactModal.vue'
import CollapsibleSection from '@/components/CollapsibleSection.vue'
import Link from '@/components/Controls/Link.vue'
import SidePanelLayout from '@/components/SidePanelLayout.vue'
import StatusPipeline from '@/components/StatusPipeline.vue'
import { useDealFacts } from '@/composables/dealFacts'
import SLASection from '@/components/SLASection.vue'
import CustomActions from '@/components/CustomActions.vue'
import { setupCustomizations, isTranslatable, copyToClipboard } from '@/utils'
import { getView } from '@/utils/view'
import { formatError } from '@/utils/formatError'
import { getSettings } from '@/stores/settings'
import { globalStore } from '@/stores/global'
import { statusesStore } from '@/stores/statuses'
import { getMeta } from '@/stores/meta'
import { useDocument } from '@/data/document'
import { isMobileView } from '@/composables/settings'
import { whatsappEnabled } from '@/composables/whatsapp'
import { callEnabled } from '@/composables/telephony'
import { useActiveTabManager } from '@/composables/useActiveTabManager'
import {
  createResource,
  Dropdown,
  Avatar,
  FeatherIcon,
  Tabs,
  Breadcrumbs,
  call,
  usePageMeta,
  toast,
} from 'frappe-ui'
import { ref, computed, h, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const { brand } = getSettings()
const { $dialog, $socket } = globalStore()
const { statusOptions, getDealStatus } = statusesStore()

const { doctypeMeta } = getMeta('CRM Deal')

const route = useRoute()
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
  document,
  scripts,
  error,
} = useDocument('CRM Deal', props.dealId)

const doc = computed(() => document.doc || {})

// Same figures as the desktop detail page, by construction — see
// composables/dealFacts.js. Declared after `doc`: the composable reads it
// immediately, so calling it earlier hit the temporal dead zone.
const {
  dealName,
  dealValue,
  expectedValue,
  probabilityLabel,
  expectedCloseLabel,
  ownerName,
  pipelineStages,
} = useDealFacts(doc)

onMounted(async () => {
  if (document.doc) await triggerOnRender()
})

watch(error, (err) => {
  if (err) {
    errorTitle.value = __(
      err.exc_type == 'DoesNotExistError'
        ? __('Document not found')
        : __('Error occurred'),
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
        deleteDoc: deleteDeal,
        call,
      })
      document._actions = s.actions || []
      document._statuses = s.statuses || []
    }
  },
  { once: true },
)

const reload = ref(false)
const showOrganizationModal = ref(false)
const _organization = ref({})

const breadcrumbs = computed(() => {
  let items = [{ label: __('Deals'), route: { name: 'Deals' } }]

  if (route.query.view || route.query.viewType) {
    let view = getView(route.query.view, route.query.viewType, 'CRM Deal')
    if (view) {
      items.push({
        label: __(view.label),
        icon: view.icon,
        route: {
          name: 'Deals',
          params: { viewType: route.query.viewType },
          query: { view: route.query.view },
        },
      })
    }
  }

  items.push({
    label: title.value,
    route: { name: 'Deal', params: { dealId: props.dealId } },
  })
  return items
})

const title = computed(() => {
  let t = doctypeMeta.value?.title_field || 'name'
  return doc.value?.[t] || props.dealId
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
      name: 'Details',
      label: __('Details'),
      icon: DetailsIcon,
      condition: () => isMobileView.value,
    },
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
      name: 'Data',
      label: __('Data'),
      icon: DetailsIcon,
    },
    {
      name: 'Calls',
      label: __('Calls'),
      icon: PhoneIcon,
      condition: () => callEnabled.value,
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
  ]
  return tabOptions.filter((tab) => (tab.condition ? tab.condition() : true))
})
const { tabIndex } = useActiveTabManager(tabs, 'lastDealTab')

const sections = createResource({
  url: 'crm.fcrm.doctype.crm_fields_layout.crm_fields_layout.get_sidepanel_sections',
  cache: ['sidePanelSections', 'CRM Deal'],
  params: { doctype: 'CRM Deal' },
  auto: true,
  // No `transform`. On a cache hit frappe-ui hands back the previously created
  // resource and drops these options (resources.js:9-21), so these handlers
  // stayed bound to the first Deal mounted in the session. Rebuilding them in a
  // computed gives every component instance its own.
})

const parsedSections = computed(() => {
  if (!sections.data) return []
  // Spread rather than mutate: `sections.data` is the shared cache entry.
  return sections.data.map((section) => {
    if (section.name == 'contacts_section')
      return { ...section, contacts: contactRows.value }
    return {
      ...section,
      columns: (section.columns || []).map((column, i) =>
        i !== 0
          ? column
          : {
              ...column,
              fields: (column.fields || []).map((field) =>
                field.name !== 'organization'
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
      label: __('Delete'),
      icon: 'trash-2',
      onClick: () => removeContact(contact),
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

  let d = await call('crm.fcrm.doctype.crm_deal.crm_deal.add_contact', {
    deal: props.dealId,
    contact,
  })
  if (d) {
    dealContacts.reload()
    toast.success(__('Contact Added'))
  }
}

async function removeContact(contact) {
  let d = await call('crm.fcrm.doctype.crm_deal.crm_deal.remove_contact', {
    deal: props.dealId,
    contact,
  })
  if (d) {
    dealContacts.reload()
    toast.success(__('Contact Removed'))
  }
}

async function setPrimaryContact(contact) {
  let d = await call('crm.fcrm.doctype.crm_deal.crm_deal.set_primary_contact', {
    deal: props.dealId,
    contact,
  })
  if (d) {
    dealContacts.reload()
    toast.success(__('Primary Contact Set'))
  }
}

const dealContacts = createResource({
  url: 'crm.fcrm.doctype.crm_deal.api.get_deal_contacts',
  params: { name: props.dealId },
  cache: ['deal_contacts', props.dealId],
  auto: true,
})

// These used to be written straight onto `sections.data`'s contacts_section.
// That object is the shared sidepanel cache entry, so one deal's contacts stayed
// on it and the next deal showed them until its own fetch landed. Keeping them
// in local state and merging in the computed below keeps the cache clean.
const contactRows = computed(() =>
  (dealContacts.data || []).map((contact) => ({
    name: contact.name,
    full_name: contact.full_name,
    email: contact.email,
    mobile_no: contact.mobile_no,
    image: contact.image,
    is_primary: contact.is_primary,
    opened: false,
  })),
)

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

function deleteDeal() {
  showDeleteLinkedDocModal.value = true
}

function statusLabel(status) {
  if (isTranslatable('CRM Deal Status')) return __(status)
  return status
}

async function triggerStatusChange(value) {
  await triggerOnChange('status', value)
  setLostReason()
}

const showLostReasonModal = ref(false)

function setLostReason() {
  if (
    getDealStatus(doc.value.status)?.type !== 'Lost' ||
    (doc.value.lost_reason && doc.value.lost_reason !== 'Other') ||
    (doc.value.lost_reason === 'Other' && doc.value.lost_notes)
  ) {
    document.save.submit()
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
      onSuccess: () => reloadAssignees(data),
    })
  }
}

function reloadAssignees(data) {
  if (Object.hasOwn(data ?? {}, 'deal_owner')) {
    assignees.reload()
  }
}
</script>
