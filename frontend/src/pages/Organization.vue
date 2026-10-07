<template>
  <LayoutHeader v-if="organization.doc">
    <template #left-header>
      <Breadcrumbs :items="breadcrumbs">
        <template #prefix="{ item }">
          <Icon v-if="item.icon" :icon="item.icon" class="mr-2 h-4" />
        </template>
      </Breadcrumbs>
    </template>
    <template #right-header>
      <CustomActions
        v-if="organization._actions?.length"
        :actions="organization._actions"
      />
    </template>
  </LayoutHeader>
  <div
    v-if="organization.doc"
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
          <!-- logo (editable) -->
          <FileUploader
            :validateFile="validateIsImageFile"
            @success="changeOrganizationImage"
          >
            <template #default="{ openFileSelector }">
              <div
                class="group relative size-[68px] shrink-0 overflow-hidden !rounded-2xl"
              >
                <Avatar
                  size="3xl"
                  class="!size-[68px] !rounded-2xl"
                  :label="title"
                  :image="organization.doc.organization_logo"
                />
                <Dropdown
                  v-if="organization.doc.organization_logo"
                  :options="[
                    {
                      icon: 'upload',
                      label: __('Change Image'),
                      onClick: openFileSelector,
                    },
                    {
                      icon: 'trash-2',
                      label: __('Remove Image'),
                      onClick: () => changeOrganizationImage(''),
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
              {{ title }}
            </div>
            <div
              class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-5 text-ink-gray-5"
            >
              <span
                v-if="organization.doc.website"
                class="inline-flex h-5 items-center gap-1.5 rounded-md border border-[var(--crm-border)] bg-[var(--crm-surface-2)] px-2 font-medium text-ink-gray-7"
              >
                <WebsiteIcon class="size-3.5 shrink-0" />
                {{ website(organization.doc.website) }}
              </span>
              <template v-if="organization.doc.industry">
                <span class="text-ink-gray-4">·</span>
                <span>{{ organization.doc.industry }}</span>
              </template>
              <span class="text-ink-gray-4">·</span>
              <span
                class="inline-flex cursor-copy items-center gap-1 hover:text-ink-gray-7"
                @click="copyToClipboard(organization.doc.name)"
              >
                {{ organization.doc.name }}
                <span class="lucide-copy size-3 opacity-50" aria-hidden="true" />
              </span>
            </div>
          </div>

          <!-- record actions -->
          <div class="flex shrink-0 items-center gap-1.5 pb-0.5">
            <Button
              :tooltip="__('Go to Website')"
              :icon="LinkIcon"
              @click="openWebsite"
            />
            <Button
              v-if="canDelete"
              :tooltip="__('Delete')"
              variant="subtle"
              theme="red"
              icon="lucide-trash-2"
              @click="deleteOrganization"
            />
          </div>
        </div>

        <!-- KEY FACTS -->
        <section
          class="grid grid-cols-2 gap-2.5 px-6 pb-5 sm:grid-cols-3 lg:grid-cols-6"
        >
          <div class="fact-tile">
            <span class="fact-k"
              ><FeatherIcon name="globe" class="size-3.5" />{{ __('Website') }}</span
            >
            <span
              class="fact-v"
              :class="{ 'fact-empty': !organization.doc.website }"
              >{{ website(organization.doc.website) || __('—') }}</span
            >
          </div>
          <div class="fact-tile">
            <span class="fact-k"
              ><FeatherIcon name="briefcase" class="size-3.5" />{{
                __('Industry')
              }}</span
            >
            <span
              class="fact-v"
              :class="{ 'fact-empty': !organization.doc.industry }"
              >{{ organization.doc.industry || __('—') }}</span
            >
          </div>
          <div class="fact-tile">
            <span class="fact-k"
              ><FeatherIcon name="users" class="size-3.5" />{{
                __('Company size')
              }}</span
            >
            <span
              class="fact-v"
              :class="{ 'fact-empty': !organization.doc.no_of_employees }"
              >{{ organization.doc.no_of_employees || __('—') }}</span
            >
          </div>
          <div class="fact-tile">
            <span class="fact-k"
              ><FeatherIcon name="map-pin" class="size-3.5" />{{
                __('Territory')
              }}</span
            >
            <span
              class="fact-v"
              :class="{ 'fact-empty': !organization.doc.territory }"
              >{{ organization.doc.territory || __('—') }}</span
            >
          </div>
          <div class="fact-tile">
            <span class="fact-k"
              ><FeatherIcon name="zap" class="size-3.5" />{{ __('Deals') }}</span
            >
            <span class="fact-v">{{ deals.data?.length ?? 0 }}</span>
          </div>
          <div class="fact-tile">
            <span class="fact-k"
              ><FeatherIcon name="user" class="size-3.5" />{{
                __('Contacts')
              }}</span
            >
            <span class="fact-v">{{ contacts.data?.length ?? 0 }}</span>
          </div>
        </section>
      </section>
    </div>

    <!-- BODY: related lists (left) + editable details (right) -->
    <div
      class="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden p-4 lg:grid-cols-[minmax(0,1fr)_340px]"
    >
      <!-- left: Deals / Contacts -->
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
              <ContactsListView
                v-if="tab.label === 'Contacts' && rows.length"
                :rows="rows"
                :columns="columns"
                :options="{ selectable: false, showTooltip: false }"
              />
              <EmptyState
                v-if="!rows.length"
                :icon="tab.icon"
                :name="__(tab.label)"
              />
            </div>
          </template>
        </Tabs>
      </div>

      <!-- right: editable Details -->
      <aside class="flex min-h-0 flex-col overflow-y-auto pb-1">
        <div
          v-if="parsedSections.length"
          class="shrink-0 overflow-hidden rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-surface)]"
        >
          <SidePanelLayout
            :sections="parsedSections"
            doctype="CRM Organization"
            :docname="organization.doc.name"
            @reload="sections.reload"
            @beforeFieldChange="beforeFieldChange"
          />
        </div>
      </aside>
    </div>
  </div>
  <SkeletonLoader
    v-else-if="!errorTitle"
    type="detail-page"
    aria-label="Loading organization details"
  />
  <ErrorPage
    v-else-if="errorTitle"
    :errorTitle="errorTitle"
    :errorMessage="errorMessage"
  />
  <DeleteLinkedDocModal
    v-if="showDeleteLinkedDocModal"
    v-model="showDeleteLinkedDocModal"
    :doctype="'CRM Organization'"
    :docname="props.organizationId"
    name="Organizations"
  />
</template>

<script setup>
import ErrorPage from '@/components/ErrorPage.vue'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import SidePanelLayout from '@/components/SidePanelLayout.vue'
import Icon from '@/components/Icon.vue'
import LayoutHeader from '@/components/LayoutHeader.vue'
import DealsListView from '@/components/ListViews/DealsListView.vue'
import ContactsListView from '@/components/ListViews/ContactsListView.vue'
import WebsiteIcon from '@/components/Icons/WebsiteIcon.vue'
import CameraIcon from '@/components/Icons/CameraIcon.vue'
import LinkIcon from '@/components/Icons/LinkIcon.vue'
import DealsIcon from '@/components/Icons/DealsIcon.vue'
import ContactsIcon from '@/components/Icons/ContactsIcon.vue'
import DeleteLinkedDocModal from '@/components/DeleteLinkedDocModal.vue'
import CustomActions from '@/components/CustomActions.vue'
import { useDocument } from '@/data/document'
import { getSettings } from '@/stores/settings'
import { globalStore } from '@/stores/global'
import { getMeta } from '@/stores/meta'
import { usersStore } from '@/stores/users'
import { statusesStore } from '@/stores/statuses'
import { getView } from '@/utils/view'
import {
  validateIsImageFile,
  setupCustomizations,
  copyToClipboard,
  openWebsite as openExternalWebsite,
} from '@/utils'
import { timestampCell } from '@/composables/useTimelinePreferences'
import {
  Breadcrumbs,
  Avatar,
  FileUploader,
  Dropdown,
  Tabs,
  FeatherIcon,
  createListResource,
  usePageMeta,
  createResource,
  toast,
  call,
} from 'frappe-ui'
import { useDoctypeModal } from '@/composables/doctypeModal'
import { useTelemetry } from 'frappe-ui/frappe'
import { computed, ref, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const props = defineProps({
  organizationId: { type: String, required: true },
})

const { brand } = getSettings()
const { $dialog, $socket } = globalStore()
const { getUser } = usersStore()
const { getDealStatus } = statusesStore()
const { doctypeMeta } = getMeta('CRM Organization')
const { capture } = useTelemetry()

const route = useRoute()
const router = useRouter()

const errorTitle = ref('')
const errorMessage = ref('')

const showDeleteLinkedDocModal = ref(false)

const {
  document: organization,
  permissions,
  scripts,
  triggerOnRender,
} = useDocument('CRM Organization', props.organizationId)

const canDelete = computed(() => permissions.data?.permissions?.delete || false)

onMounted(async () => {
  if (organization.doc) await triggerOnRender()
})

const breadcrumbs = computed(() => {
  let items = [{ label: __('Organizations'), route: { name: 'Organizations' } }]

  if (route.query.view || route.query.viewType) {
    let view = getView(
      route.query.view,
      route.query.viewType,
      'CRM Organization',
    )
    if (view) {
      items.push({
        label: __(view.label),
        icon: view.icon,
        route: {
          name: 'Organizations',
          params: { viewType: route.query.viewType },
          query: { view: route.query.view },
        },
      })
    }
  }

  items.push({
    label: title.value,
    route: {
      name: 'Organization',
      params: { organizationId: props.organizationId },
    },
  })
  return items
})

const title = computed(() => {
  let t = doctypeMeta.value?.title_field || 'name'
  return organization.doc?.[t] || props.organizationId
})

usePageMeta(() => {
  return {
    title: title.value,
    icon: brand.favicon,
  }
})

async function deleteOrganization() {
  showDeleteLinkedDocModal.value = true
}

function changeOrganizationImage(file) {
  organization.setValue.submit({
    organization_logo: file?.file_url || null,
  })
}

function beforeFieldChange(data) {
  if (Object.hasOwn(data ?? {}, 'organization_name')) {
    call('frappe.client.rename_doc', {
      doctype: 'CRM Organization',
      old_name: props.organizationId,
      new_name: data.organization_name,
    }).then(() => {
      router.push({
        name: 'Organization',
        params: { organizationId: data.organization_name },
      })
    })
  } else {
    organization.save.submit()
  }
}

function website(url) {
  return url && url.replace(/^(?:https?:\/\/)?(?:www\.)?/i, '')
}

function openWebsite() {
  if (!organization.doc.website) {
    toast.error(__('No Website Found'))
    return
  }

  openExternalWebsite(organization.doc.website)
}

const sections = createResource({
  url: 'crm.fcrm.doctype.crm_fields_layout.crm_fields_layout.get_sidepanel_sections',
  cache: ['sidePanelSections', 'CRM Organization'],
  params: { doctype: 'CRM Organization' },
  auto: true,
  // No `transform` here. frappe-ui returns the CACHED resource on a cache hit
  // and throws the new options away (resources.js:9-21), so the transform
  // installed by the first Organization mounted was reused for every later
  // one — and it closed over *that* organization's document. Creating an
  // address on org B wrote it onto org A, which is why organizations were
  // left with address = NULL. The layout is identical for every record, so
  // caching the server data is right; only the per-record handlers below
  // must be rebuilt per component instance.
})

const parsedSections = computed(() => {
  if (!sections.data) return []
  // Spread at every level: `sections.data` is the shared cache entry and must
  // not be mutated.
  return sections.data.map((section) => ({
    ...section,
    columns: (section.columns || []).map((column) => ({
      ...column,
      fields: (column.fields || []).map((field) =>
        field.fieldname === 'address'
          ? {
              ...field,
              create: (value, close) => {
                showAddressModal(null, value)
                close()
              },
              edit: (address) => showAddressModal(address),
            }
          : field,
      ),
    })),
  }))
})

const tabIndex = ref(0)
const tabs = [
  {
    label: 'Deals',
    icon: DealsIcon,
    count: computed(() => deals.data?.length),
  },
  {
    label: 'Contacts',
    icon: ContactsIcon,
    count: computed(() => contacts.data?.length),
  },
]

const deals = createListResource({
  type: 'list',
  doctype: 'CRM Deal',
  cache: ['deals', props.organizationId],
  fields: [
    'name',
    'organization',
    'currency',
    'annual_revenue',
    'status',
    'email',
    'mobile_no',
    'deal_owner',
    'modified',
  ],
  filters: {
    organization: props.organizationId,
  },
  orderBy: 'modified desc',
  pageLength: 20,
  auto: true,
})

const contacts = createListResource({
  type: 'list',
  doctype: 'Contact',
  cache: ['contacts', props.organizationId],
  fields: [
    'name',
    'full_name',
    'image',
    'email_id',
    'mobile_no',
    'company_name',
    'modified',
  ],
  filters: {
    company_name: props.organizationId,
  },
  orderBy: 'modified desc',
  pageLength: 20,
  auto: true,
})

const rows = computed(() => {
  let list = !tabIndex.value ? deals : contacts

  if (!list.data) return []

  return list.data.map((row) => {
    return !tabIndex.value ? getDealRowObject(row) : getContactRowObject(row)
  })
})

const { getFormattedCurrency } = getMeta('CRM Deal')

const columns = computed(() => {
  return tabIndex.value === 0 ? dealColumns : contactColumns
})

function getDealRowObject(deal) {
  return {
    name: deal.name,
    organization: {
      label: deal.organization,
      logo: organization.doc?.organization_logo,
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

function getContactRowObject(contact) {
  return {
    name: contact.name,
    full_name: {
      label: contact.full_name,
      image_label: contact.full_name,
      image: contact.image,
    },
    email: contact.email_id,
    mobile_no: contact.mobile_no,
    company_name: {
      label: contact.company_name,
      logo: organization.doc?.organization_logo,
    },
    modified: timestampCell(contact.modified),
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
    key: 'annual_revenue',
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

const contactColumns = [
  {
    label: __('Name'),
    key: 'full_name',
    width: '17rem',
  },
  {
    label: __('Email'),
    key: 'email',
    width: '12rem',
  },
  {
    label: __('Phone'),
    key: 'mobile_no',
    width: '12rem',
  },
  {
    label: __('Organization'),
    key: 'company_name',
    width: '12rem',
  },
  {
    label: __('Last Modified'),
    key: 'modified',
    width: '8rem',
  },
]

const { showModal } = useDoctypeModal()

function showAddressModal(_address, typedValue) {
  showModal({
    name: _address || null,
    doctype: 'Address',
    defaults: _address
      ? {}
      : {
          // Frappe's Address.autoname fills address_title from links[0] when
          // it is blank, so the address names itself after the organization
          // ("Acme-Billing") instead of demanding a title. Writing this row is
          // also what makes the address findable from the organization at all;
          // CRM never wrote one, so tabDynamic Link was empty and users had to
          // paste the whole address into the title, which became the docname.
          links: [
            {
              link_doctype: 'CRM Organization',
              link_name: organization.doc.name,
            },
          ],
          // Whatever was typed into the link box before "Create New" — this
          // used to be written straight onto doc.address and then discarded.
          ...(typedValue ? { address_title: typedValue } : {}),
        },
    callbacks: {
      afterInsert: (d) => {
        capture('address_created')
        organization.doc.address = d.name
        organization.save.submit()
      },
    },
  })
}

// Setup custom actions from Form Scripts
watch(
  () => organization.doc,
  async (_doc) => {
    if (scripts.data?.length) {
      let s = await setupCustomizations(scripts.data, {
        doc: _doc,
        $dialog,
        $socket,
        router,
        toast,
        updateField: organization.setValue.submit,
        createToast: toast.create,
        deleteDoc: deleteOrganization,
        call,
      })
      organization._actions = s.actions || []
    }
  },
  { once: true },
)
</script>

