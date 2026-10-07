<template>
  <LayoutHeader v-if="contact.doc">
    <template #left-header>
      <Breadcrumbs :items="breadcrumbs">
        <template #prefix="{ item }">
          <Icon v-if="item.icon" :icon="item.icon" class="mr-2 h-4" />
        </template>
      </Breadcrumbs>
    </template>
    <template #right-header>
      <CustomActions
        v-if="contact._actions?.length"
        :actions="contact._actions"
      />
    </template>
  </LayoutHeader>
  <div
    v-if="contact.doc"
    class="flex h-full flex-col overflow-hidden bg-[var(--crm-bg)]"
  >
    <!-- Identity + key facts -->
    <div class="flex shrink-0 flex-col gap-3 px-4 pt-4">
      <section
        class="overflow-hidden rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-surface)] shadow-sm"
      >
        <div
          class="h-14 border-b border-[var(--crm-border)]"
          style="
            background:
              radial-gradient(120% 180% at 0% 0%, rgba(37, 99, 235, 0.1), transparent 60%),
              linear-gradient(180deg, var(--crm-surface-2), var(--crm-surface));
          "
        />
        <div class="-mt-8 flex flex-wrap items-end gap-4 px-6 pb-4">
          <!-- avatar (editable) -->
          <FileUploader
            :validateFile="validateIsImageFile"
            @success="changeContactImage"
          >
            <template #default="{ openFileSelector }">
              <div
                class="group relative size-[68px] shrink-0 overflow-hidden !rounded-2xl"
              >
                <Avatar
                  size="3xl"
                  class="!size-[68px] !rounded-2xl"
                  :label="contact.doc.full_name"
                  :image="contact.doc.image"
                />
                <Dropdown
                  v-if="contact.doc.image"
                  :options="[
                    {
                      icon: 'upload',
                      label: __('Change Image'),
                      onClick: openFileSelector,
                    },
                    {
                      icon: 'trash-2',
                      label: __('Remove Image'),
                      onClick: () => changeContactImage(''),
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
            <div class="truncate text-xl font-semibold text-ink-gray-9">
              {{ contact.doc.full_name }}
            </div>
            <div
              class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-5 text-ink-gray-5"
            >
              <span
                v-if="contact.doc.company_name"
                class="inline-flex h-5 items-center gap-1.5 rounded-md border border-[var(--crm-border)] bg-[var(--crm-surface-2)] px-2 font-medium text-ink-gray-7"
              >
                <OrganizationsIcon class="size-3.5 shrink-0 opacity-70" />
                {{ contact.doc.company_name }}
              </span>
              <template v-if="contact.doc.designation">
                <span class="text-ink-gray-4">·</span>
                <span>{{ contact.doc.designation }}</span>
              </template>
              <span class="text-ink-gray-4">·</span>
              <span
                class="inline-flex cursor-copy items-center gap-1 hover:text-ink-gray-7"
                @click="copyToClipboard(contact.doc.name)"
              >
                {{ contact.doc.name }}
                <span class="lucide-copy size-3 opacity-50" aria-hidden="true" />
              </span>
            </div>
          </div>

          <!-- record actions -->
          <div class="flex shrink-0 items-center gap-1.5 pb-0.5">
            <Button
              v-if="callEnabled && contact.doc.mobile_no"
              :tooltip="isPhoneInCall ? __('Call In Progress') : __('Make a Call')"
              :icon="PhoneIcon"
              :class="{ '!bg-emerald-600 hover:!bg-emerald-700 text-white animate-pulse shadow-glow-emerald': isPhoneInCall }"
              @click="makeCall(contact.doc.mobile_no)"
            />
            <Button
              v-if="canDelete"
              :tooltip="__('Delete')"
              variant="subtle"
              theme="red"
              icon="lucide-trash-2"
              @click="deleteContact"
            />
          </div>
        </div>

        <!-- KEY FACTS -->
        <section
          class="grid grid-cols-2 gap-2.5 px-6 pb-5 sm:grid-cols-3 lg:grid-cols-6"
        >
          <div class="fact-tile">
            <span class="fact-k"
              ><FeatherIcon name="mail" class="size-3.5" />{{ __('Email') }}</span
            >
            <span
              class="fact-v"
              :class="{ 'fact-empty': !contact.doc.email_id }"
              >{{ contact.doc.email_id || __('—') }}</span
            >
          </div>
          <div class="fact-tile">
            <span class="fact-k"
              ><FeatherIcon name="phone" class="size-3.5" />{{ __('Phone') }}</span
            >
            <span
              class="fact-v"
              :class="{ 'fact-empty': !contact.doc.mobile_no }"
              >{{ contact.doc.mobile_no || __('—') }}</span
            >
          </div>
          <div class="fact-tile">
            <span class="fact-k"
              ><FeatherIcon name="briefcase" class="size-3.5" />{{
                __('Organization')
              }}</span
            >
            <span
              class="fact-v"
              :class="{ 'fact-empty': !contact.doc.company_name }"
              >{{ contact.doc.company_name || __('—') }}</span
            >
          </div>
          <div class="fact-tile">
            <span class="fact-k"
              ><FeatherIcon name="award" class="size-3.5" />{{
                __('Designation')
              }}</span
            >
            <span
              class="fact-v"
              :class="{ 'fact-empty': !contact.doc.designation }"
              >{{ contact.doc.designation || __('—') }}</span
            >
          </div>
          <div class="fact-tile">
            <span class="fact-k"
              ><FeatherIcon name="user" class="size-3.5" />{{ __('Gender') }}</span
            >
            <span
              class="fact-v"
              :class="{ 'fact-empty': !contact.doc.gender }"
              >{{ contact.doc.gender || __('—') }}</span
            >
          </div>
          <div class="fact-tile">
            <span class="fact-k"
              ><FeatherIcon name="zap" class="size-3.5" />{{ __('Deals') }}</span
            >
            <span class="fact-v">{{ deals.data?.length ?? 0 }}</span>
          </div>
        </section>
      </section>
    </div>

    <!-- BODY: related deals (left) + editable details (right) -->
    <div
      class="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden p-4 lg:grid-cols-[minmax(0,1fr)_340px]"
    >
      <!-- left: Deals -->
      <div
        class="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-surface)]"
      >
        <Tabs
          v-model="tabIndex"
          as="div"
          :tabs="tabs"
          class="crm-record-tabs flex flex-col flex-1 overflow-hidden [&_[role='tab']]:px-0 [&_[role='tab']]:shrink-0 [&_[role='tablist']]:px-5 [&_[role='tablist']]:gap-7.5 [&_[role='tablist']::-webkit-scrollbar]:h-0 [&_[role='tablist']]:min-h-[45px] [&_[role='tablist']_.bg-surface-gray-10]:hidden [&_[role='tablist']]:border-b [&_[role='tablist']]:border-[var(--crm-border)] [&_[role='tabpanel']:not([hidden])]:flex [&_[role='tabpanel']:not([hidden])]:grow"
        >
          <template #tab-item="{ tab, selected }">
            <button
              class="group -mb-px flex items-center gap-2 border-b-2 border-transparent py-3 text-[length:var(--text-section-title)] font-medium text-ink-gray-5 duration-200 ease-in-out hover:text-ink-gray-8"
              :class="{ '!border-brand-500 !text-brand-600 !font-semibold': selected }"
            >
              <component :is="tab.icon" v-if="tab.icon" class="h-4" />
              {{ __(tab.label) }}
              <span
                class="rounded px-1.5 text-xs font-semibold"
                :class="
                  selected
                    ? '!bg-[var(--crm-accent-soft)] !text-[var(--crm-accent-primary)]'
                    : 'bg-[var(--crm-surface-2)] text-ink-gray-6'
                "
              >
                {{ tab.count }}
              </span>
            </button>
          </template>
          <template #tab-panel="{ tab }">
            <div class="flex-1 overflow-y-auto py-2">
              <DealsListView
                v-if="tab.label === 'Deals' && rows.length"
                :rows="rows"
                :columns="columns"
                :options="{ selectable: false, showTooltip: false }"
              />
              <EmptyState
                v-if="!rows.length"
                :icon="tab.icon"
                name="Deals"
                :title="__('No deals found')"
                :description="__('Deals linked to this contact will appear here.')"
              />
            </div>
          </template>
        </Tabs>
      </div>

      <!-- right: editable Details -->
      <aside class="flex min-h-0 flex-col overflow-y-auto pb-1">
        <div
          v-if="sections.data"
          class="shrink-0 overflow-hidden rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-surface)]"
        >
          <SidePanelLayout
            :sections="parsedSections"
            doctype="Contact"
            :docname="contact.doc.name"
            @reload="sections.reload"
          />
        </div>
      </aside>
    </div>
  </div>
  <SkeletonLoader
    v-else-if="!errorTitle"
    type="detail-page"
    aria-label="Loading contact details"
  />
  <ErrorPage
    v-else-if="errorTitle"
    :errorTitle="errorTitle"
    :errorMessage="errorMessage"
  />
  <DeleteLinkedDocModal
    v-if="showDeleteLinkedDocModal"
    v-model="showDeleteLinkedDocModal"
    :doctype="'Contact'"
    :docname="contact.doc.name"
    name="Contacts"
  />
</template>

<script setup>
import ErrorPage from '@/components/ErrorPage.vue'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import Icon from '@/components/Icon.vue'
import SidePanelLayout from '@/components/SidePanelLayout.vue'
import LayoutHeader from '@/components/LayoutHeader.vue'
import PhoneIcon from '@/components/Icons/PhoneIcon.vue'
import CameraIcon from '@/components/Icons/CameraIcon.vue'
import DealsIcon from '@/components/Icons/DealsIcon.vue'
import OrganizationsIcon from '@/components/Icons/OrganizationsIcon.vue'
import DealsListView from '@/components/ListViews/DealsListView.vue'
import CustomActions from '@/components/CustomActions.vue'
import { validateIsImageFile, setupCustomizations, copyToClipboard } from '@/utils'
import { timestampCell } from '@/composables/useTimelinePreferences'
import { getView } from '@/utils/view'
import { useDocument } from '@/data/document'
import { getSettings } from '@/stores/settings'
import { getMeta } from '@/stores/meta'
import { globalStore } from '@/stores/global.js'
import { usersStore } from '@/stores/users.js'
import { organizationsStore } from '@/stores/organizations.js'
import { statusesStore } from '@/stores/statuses'
import { callEnabled } from '@/composables/telephony'
import {
  Breadcrumbs,
  Avatar,
  FileUploader,
  Tabs,
  FeatherIcon,
  call,
  createResource,
  usePageMeta,
  Dropdown,
  toast,
} from 'frappe-ui'
import { useDoctypeModal } from '@/composables/doctypeModal'
import { useTelemetry } from 'frappe-ui/frappe'
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import EmptyState from '@/components/ListViews/EmptyState.vue'

const { brand } = getSettings()
const store = globalStore()
const { makeCall, $dialog, $socket } = store

const isPhoneInCall = computed(() => {
  return (store.onCall || store.calling) && store.activeNumber === contact.doc?.mobile_no
})

const { getUser } = usersStore()
const { getOrganization } = organizationsStore()
const { getDealStatus } = statusesStore()
const { doctypeMeta } = getMeta('Contact')
const { capture } = useTelemetry()

const props = defineProps({
  contactId: { type: String, required: true },
})

const route = useRoute()
const router = useRouter()

const errorTitle = ref('')
const errorMessage = ref('')

const {
  document: contact,
  permissions,
  scripts,
  triggerOnRender,
} = useDocument('Contact', props.contactId)

const canDelete = computed(() => permissions.data?.permissions?.delete || false)

onMounted(async () => {
  if (contact.doc) await triggerOnRender()
})

const breadcrumbs = computed(() => {
  let items = [{ label: __('Contacts'), route: { name: 'Contacts' } }]

  if (route.query.view || route.query.viewType) {
    let view = getView(route.query.view, route.query.viewType, 'Contact')
    if (view) {
      items.push({
        label: __(view.label),
        icon: view.icon,
        route: {
          name: 'Contacts',
          params: { viewType: route.query.viewType },
          query: { view: route.query.view },
        },
      })
    }
  }

  items.push({
    label: title.value,
    route: { name: 'Contact', params: { contactId: props.contactId } },
  })
  return items
})

const title = computed(() => {
  let t = doctypeMeta.value?.title_field || 'name'
  return contact.doc?.[t] || props.contactId
})

usePageMeta(() => {
  return {
    title: title.value,
    icon: brand.favicon,
  }
})
const showDeleteLinkedDocModal = ref(false)

async function deleteContact() {
  showDeleteLinkedDocModal.value = true
}

function changeContactImage(file) {
  contact.doc.image = file?.file_url || ''
  contact.save.submit(null, {
    onSuccess: () => {
      toast.success(__('Contact image updated'))
    },
  })
}

const tabIndex = ref(0)
const tabs = [
  {
    label: 'Deals',
    icon: DealsIcon,
    count: computed(() => deals.data?.length),
  },
]

const deals = createResource({
  url: 'xbr_crm.api.contact.get_linked_deals',
  cache: ['deals', props.contactId],
  params: { contact: props.contactId },
  auto: true,
})

const rows = computed(() => {
  if (!deals.data || deals.data == []) return []

  return deals.data.map((row) => getDealRowObject(row))
})

const sections = createResource({
  url: 'xbr_crm.fcrm.doctype.crm_fields_layout.crm_fields_layout.get_sidepanel_sections',
  cache: ['sidePanelSections', 'Contact'],
  params: { doctype: 'Contact' },
  auto: true,
})

const parsedSections = computed(() => {
  if (!sections.data) return []
  return sections.data.map((section) => ({
    ...section,
    columns: section.columns.map((column) => ({
      ...column,
      fields: column.fields.map((field) => {
        field.label = fieldLabelMap[field.fieldname] || field.label
        field.placeholder =
          fieldPlaceholderMap[field.fieldname] || field.placeholder

        if (field.fieldname === 'email_id') {
          return {
            ...field,
            read_only: false,
            fieldtype: 'Dropdown',
            options: (contact.doc?.email_ids || []).map((email) => ({
              name: email.name,
              value: email.email_id,
              selected: email.email_id === contact.doc.email_id,
              placeholder: 'john@doe.com',
              onClick: () => setAsPrimary('email', email.email_id),
              onSave: (option, isNew) =>
                isNew
                  ? createNew('email', option.value)
                  : editOption(
                      'Contact Email',
                      option.name,
                      'email_id',
                      option.value,
                    ),
              onDelete: async (option, isNew) => {
                contact.doc.email_ids = contact.doc.email_ids.filter(
                  (e) => e.name !== option.name,
                )
                if (!isNew) await deleteOption('Contact Email', option.name)
              },
            })),
            create: () => {
              // Add a temporary new option locally (mirrors original behavior)
              contact.doc.email_ids = [
                ...(contact.doc.email_ids || []),
                {
                  name: 'new-1',
                  value: '',
                  selected: false,
                  isNew: true,
                },
              ]
            },
          }
        }
        if (field.fieldname === 'mobile_no') {
          return {
            ...field,
            read_only: false,
            fieldtype: 'Dropdown',
            options: (contact.doc?.phone_nos || []).map((phone) => ({
              name: phone.name,
              value: phone.phone,
              selected: phone.phone === contact.doc.mobile_no,
              onClick: () => setAsPrimary('mobile_no', phone.phone),
              onSave: (option, isNew) =>
                isNew
                  ? createNew('phone', option.value)
                  : editOption(
                      'Contact Phone',
                      option.name,
                      'phone',
                      option.value,
                    ),
              onDelete: async (option, isNew) => {
                contact.doc.phone_nos = contact.doc.phone_nos.filter(
                  (p) => p.name !== option.name,
                )
                if (!isNew) await deleteOption('Contact Phone', option.name)
              },
            })),
            create: () => {
              contact.doc.phone_nos = [
                ...(contact.doc.phone_nos || []),
                {
                  name: 'new-1',
                  value: '',
                  selected: false,
                  isNew: true,
                },
              ]
            },
          }
        }
        if (field.fieldname === 'address') {
          return {
            ...field,
            create: (_value, close) => {
              showAddressModal()
              close?.()
            },
            edit: (address) => showAddressModal(address),
          }
        }
        return field
      }),
    })),
  }))
})

const fieldLabelMap = {
  mobile_no: __('Mobile Number'),
  company_name: __('Organization'),
}

const fieldPlaceholderMap = {
  mobile_no: __('Add Mobile Number...'),
  company_name: __('Add Organization...'),
}

async function setAsPrimary(field, value) {
  let d = await call('xbr_crm.api.contact.set_as_primary', {
    contact: contact.doc.name,
    field,
    value,
  })
  if (d) {
    contact.reload()
    toast.success(__('Contact Updated'))
  }
}

async function createNew(field, value) {
  if (!value) return
  let d = await call('xbr_crm.api.contact.create_new', {
    contact: contact.doc.name,
    field,
    value,
  })
  if (d) {
    contact.reload()
    toast.success(__('Contact Updated'))
  }
}

async function editOption(doctype, name, fieldname, value) {
  let d = await call('frappe.client.set_value', {
    doctype,
    name,
    fieldname,
    value,
  })
  if (d) {
    contact.reload()
    toast.success(__('Contact Updated'))
  }
}

async function deleteOption(doctype, name) {
  await call('frappe.client.delete', {
    doctype,
    name,
  })
  await contact.reload()
  toast.success(__('Contact Updated'))
}

const { getFormattedCurrency } = getMeta('CRM Deal')

const columns = computed(() => dealColumns)

function getDealRowObject(deal) {
  return {
    name: deal.name,
    organization: {
      label: deal.organization,
      logo: getOrganization(deal.organization)?.organization_logo,
    },
    annual_revenue: getFormattedCurrency('annual_revenue', deal),
    status: {
      label: deal.status,
      color: getDealStatus(deal.status)?.color,
    },
    email: deal.email,
    mobile_no: deal.mobile_no,
    deal_owner: {
      label: deal.deal_owner && getUser(deal.deal_owner).full_name,
      ...(deal.deal_owner && getUser(deal.deal_owner)),
    },
    modified: timestampCell(deal.modified),
  }
}

const dealColumns = [
  {
    label: __('Organization'),
    key: 'organization',
    width: '11rem',
  },
  {
    label: __('Amount'),
    key: 'deal_value',
    align: 'right',
    width: '9rem',
  },
  {
    label: __('Status'),
    key: 'status',
    width: '10rem',
  },
  {
    label: __('Email'),
    key: 'email',
    width: '12rem',
  },
  {
    label: __('Mobile No.'),
    key: 'mobile_no',
    width: '11rem',
  },
  {
    label: __('Deal Owner'),
    key: 'deal_owner',
    width: '10rem',
  },
  {
    label: __('Last Modified'),
    key: 'modified',
    width: '8rem',
  },
]

const { showModal } = useDoctypeModal()

function showAddressModal(_address) {
  showModal({
    name: _address || null,
    doctype: 'Address',
    callbacks: {
      afterInsert: (d) => {
        capture('address_created')
        contact.doc.address = d.name
        contact.save.submit()
      },
    },
  })
}

// Setup custom actions from Form Scripts
watch(
  () => contact.doc,
  async (_doc) => {
    if (scripts.data?.length) {
      let s = await setupCustomizations(scripts.data, {
        doc: _doc,
        $dialog,
        $socket,
        router,
        toast,
        updateField: contact.setValue.submit,
        createToast: toast.create,
        deleteDoc: deleteContact,
        call,
      })
      contact._actions = s.actions || []
    }
  },
  { once: true },
)
</script>

