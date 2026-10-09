<template>
  <CrmDialog
    v-model:open="show"
    size="5xl"
    icon="zap"
    :title="__('Create Pipeline')"
    :subtitle="__('Add contact, organisation and pipeline details in one go')"
    body-class="crm-doc-modal"
    footer-align="between"
  >
    <template #header-actions>
      <Button
        v-if="isManager() && !isMobileView"
        variant="ghost"
        :tooltip="__('Edit Fields Layout')"
        :icon="EditIcon"
        @click="openQuickEntryModal"
      />
    </template>

    <div class="flex flex-col gap-4" @keydown="onKeydown">
      <!-- Draft from an earlier, unfinished entry -->
      <div
        v-if="draft"
        class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-gray-2 px-3 py-2 text-sm text-ink-gray-7"
      >
        <span>
          {{
            __('You have an unsaved pipeline from {0}.', [
              timeAgo(new Date(draft.savedAt)),
            ])
          }}
        </span>
        <div class="flex gap-2">
          <Button size="sm" :label="__('Discard')" @click="discardDraft" />
          <Button
            size="sm"
            variant="solid"
            :label="__('Restore')"
            @click="restoreDraft"
          />
        </div>
      </div>

      <div
        class="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]"
      >
        <!-- LEFT: the record itself -->
        <div class="flex min-w-0 flex-col gap-4">
          <!-- CONTACT -->
          <section class="crm-entry-card">
            <div class="crm-entry-card__head">
              <span class="crm-entry-card__chip"
                ><span class="lucide-user size-[18px]"
              /></span>
              <div class="min-w-0">
                <h3 class="crm-entry-card__title">
                  {{ __('Contact Details') }}
                </h3>
                <p class="crm-entry-card__sub">
                  {{ __('Add the primary contact for this pipeline') }}
                </p>
              </div>
            </div>

            <div
              v-if="selectedContact"
              class="flex items-center gap-3 rounded-lg border border-[var(--crm-border)] px-3 py-2"
            >
              <Avatar :label="selectedContact.full_name" size="lg" />
              <div class="min-w-0 flex-1">
                <div class="truncate text-base font-medium text-ink-gray-9">
                  {{ selectedContact.full_name || selectedContact.name }}
                </div>
                <div class="truncate text-sm text-ink-gray-5">
                  {{ contactLine(selectedContact) }}
                </div>
              </div>
              <Button
                variant="ghost"
                :label="__('Change')"
                @click="clearContact"
              />
            </div>

            <template v-else>
              <EntryField icon="lucide-search">
                <Autocomplete
                  :options="contactOptions"
                  :filterable="false"
                  variant="outline"
                  :placeholder="
                    __('Search existing contacts by name, email or mobile')
                  "
                  model-value=""
                  @update:model-value="(o) => o && useContact(o.contact)"
                  @update:query="searchContacts"
                >
                  <template #item-label="{ option }">
                    <div class="flex min-w-0 flex-col">
                      <span class="truncate font-medium text-ink-gray-8">
                        {{ option.label }}
                      </span>
                      <span class="truncate text-sm text-ink-gray-5">
                        {{ option.description }}
                      </span>
                    </div>
                  </template>
                  <template #footer="{ value, close }">
                    <Button
                      variant="ghost"
                      class="w-full !justify-start"
                      iconLeft="plus"
                      :label="
                        value
                          ? __('Create new contact “{0}”', [value])
                          : __('Create new contact')
                      "
                      @click="startNewContact(value, close)"
                    />
                  </template>
                </Autocomplete>
              </EntryField>

              <div class="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                <EntryField
                  ref="firstNameInput"
                  :label="__('First name')"
                  icon="lucide-user"
                >
                  <FormControl
                    v-model="deal.doc.first_name"
                    :placeholder="__('First name')"
                    autocomplete="off"
                  />
                  <template #error>
                    <FieldError :message="errors.first_name" />
                  </template>
                </EntryField>
                <EntryField :label="__('Last name')" icon="lucide-user">
                  <FormControl
                    v-model="deal.doc.last_name"
                    :placeholder="__('Last name')"
                    autocomplete="off"
                  />
                </EntryField>
                <EntryField :label="__('Mobile')" icon="lucide-phone">
                  <FormControl
                    v-model="deal.doc.mobile_no"
                    type="tel"
                    inputmode="tel"
                    :placeholder="__('+91 98765 43210')"
                    autocomplete="off"
                    @blur="tidyMobile"
                  />
                  <template #error>
                    <FieldError :message="errors.mobile_no" />
                  </template>
                </EntryField>
                <EntryField :label="__('Email')" icon="lucide-mail">
                  <FormControl
                    v-model="deal.doc.email"
                    type="email"
                    inputmode="email"
                    :placeholder="__('name@company.com')"
                    autocomplete="off"
                  />
                  <template #error>
                    <FieldError :message="errors.email" />
                  </template>
                </EntryField>
              </div>

              <div
                v-if="duplicates.length"
                class="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
                role="status"
              >
                <div
                  v-for="dup in duplicates"
                  :key="dup.name"
                  class="flex flex-wrap items-center justify-between gap-2"
                >
                  <span class="min-w-0">
                    <span
                      class="lucide-triangle-alert mr-1 inline-block size-3.5 align-[-2px]"
                    />
                    {{
                      dup.matched_on === 'mobile'
                        ? __('{0} already has this mobile number.', [
                            dup.full_name,
                          ])
                        : __('{0} already has this email.', [dup.full_name])
                    }}
                  </span>
                  <Button
                    size="sm"
                    :label="__('Use this contact')"
                    @click="useContact(dup)"
                  />
                </div>
                <label class="flex items-center gap-2">
                  <input
                    v-model="createNewContactAnyway"
                    type="checkbox"
                    class="rounded"
                  />
                  {{ __('Create a new contact anyway') }}
                </label>
                <span v-if="!createNewContactAnyway" class="text-xs opacity-80">
                  {{
                    __(
                      'Otherwise the pipeline is linked to the existing contact.',
                    )
                  }}
                </span>
              </div>
            </template>
          </section>

          <!-- PIPELINE -->
          <section class="crm-entry-card">
            <div class="crm-entry-card__head">
              <span class="crm-entry-card__chip"
                ><span class="lucide-target size-[18px]"
              /></span>
              <div class="min-w-0">
                <h3 class="crm-entry-card__title">
                  {{ __('Pipeline Information') }}
                </h3>
                <p class="crm-entry-card__sub">
                  {{ __('Set the stage, ownership and expected details') }}
                </p>
              </div>
            </div>
            <div class="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-3">
              <EntryField :label="__('Stage')" icon="lucide-flag" required>
                <FormControl
                  v-model="deal.doc.status"
                  type="select"
                  :options="stageOptions"
                />
                <template #error>
                  <FieldError :message="errors.status" />
                </template>
              </EntryField>
              <EntryField :label="__('Owner')" icon="lucide-user" required>
                <Link
                  class="form-control"
                  doctype="User"
                  variant="outline"
                  :value="
                    deal.doc.deal_owner &&
                    getUser(deal.doc.deal_owner).full_name
                  "
                  :hideMe="true"
                  @change="(v) => (deal.doc.deal_owner = v)"
                >
                  <template #prefix>
                    <UserAvatar
                      v-if="deal.doc.deal_owner"
                      class="mr-2"
                      :user="deal.doc.deal_owner"
                      size="sm"
                    />
                  </template>
                  <template #item-prefix="{ option }">
                    <UserAvatar class="mr-2" :user="option.value" size="sm" />
                  </template>
                  <template #item-label="{ option }">
                    {{ getUser(option.value).full_name }}
                  </template>
                </Link>
              </EntryField>
              <EntryField :label="__('Source')" icon="lucide-link">
                <Link
                  class="form-control"
                  doctype="CRM Lead Source"
                  variant="outline"
                  :value="deal.doc.source"
                  :placeholder="__('Select source')"
                  @change="(v) => (deal.doc.source = v)"
                />
              </EntryField>
              <EntryField :label="__('Value')">
                <template #prefix>
                  <span class="text-sm">{{ currencySymbol }}</span>
                </template>
                <FormControl
                  v-model="deal.doc.deal_value"
                  type="text"
                  inputmode="decimal"
                  :placeholder="'0'"
                  autocomplete="off"
                />
                <template #error>
                  <FieldError :message="errors.deal_value" />
                </template>
              </EntryField>
              <EntryField :label="__('Expected close')" icon="lucide-calendar">
                <DatePicker
                  :value="deal.doc.expected_closure_date"
                  :placeholder="__('Pick a date')"
                  @change="(v) => (deal.doc.expected_closure_date = v)"
                />
              </EntryField>
              <EntryField :label="__('Probability (%)')" icon="lucide-percent">
                <FormControl
                  v-model="deal.doc.probability"
                  type="number"
                  inputmode="numeric"
                  min="0"
                  max="100"
                  :placeholder="'0'"
                />
                <template #error>
                  <FieldError :message="errors.probability" />
                </template>
              </EntryField>
            </div>
            <EntryField :label="__('Next step')" icon="lucide-list">
              <FormControl
                v-model="deal.doc.next_step"
                :placeholder="__('e.g. Send the quotation by Friday')"
                autocomplete="off"
              />
            </EntryField>
          </section>

          <!-- MORE DETAILS: fields the admin added to the layout + first note -->
          <section class="crm-entry-card">
            <button
              type="button"
              class="crm-entry-card__head w-full text-left"
              :aria-expanded="showMore"
              @click="showMore = !showMore"
            >
              <span class="crm-entry-card__chip"
                ><span class="lucide-file-text size-[18px]"
              /></span>
              <div class="min-w-0 flex-1">
                <h3 class="crm-entry-card__title">
                  {{ __('More Details') }}
                  <span class="font-normal text-[var(--crm-text-4)]">{{
                    __('(Optional)')
                  }}</span>
                </h3>
                <p class="crm-entry-card__sub">
                  {{ __('Add additional information about the pipeline') }}
                </p>
              </div>
              <span
                class="size-4 shrink-0 text-ink-gray-5"
                :class="showMore ? 'lucide-chevron-up' : 'lucide-chevron-down'"
              />
            </button>
            <template v-if="showMore">
              <FieldLayout
                v-if="moreTabs.length"
                :tabs="moreTabs"
                :data="deal.doc"
                doctype="CRM Deal"
              />
              <EntryField
                :label="__('Note')"
                :hint="__('(Optional)')"
                icon="lucide-sticky-note"
                multiline
              >
                <FormControl
                  v-model="note"
                  type="textarea"
                  :rows="3"
                  :placeholder="__('Saved as the first note on the pipeline')"
                />
              </EntryField>
            </template>
          </section>
        </div>

        <!-- RIGHT: organisation + progress guide -->
        <div class="flex min-w-0 flex-col gap-4">
          <section class="crm-entry-card">
            <div class="crm-entry-card__head">
              <span class="crm-entry-card__chip"
                ><span class="lucide-building-2 size-[18px]"
              /></span>
              <div class="min-w-0">
                <h3 class="crm-entry-card__title">
                  {{ __('Organization') }}
                </h3>
                <p class="crm-entry-card__sub">
                  {{
                    __('Link to an existing organization or create a new one')
                  }}
                </p>
              </div>
            </div>
            <template v-if="!creatingOrganization">
              <EntryField icon="lucide-search">
                <Link
                  class="form-control"
                  doctype="CRM Organization"
                  variant="outline"
                  :value="deal.doc.organization"
                  :placeholder="__('Search organizations, or create a new one')"
                  :onCreate="startNewOrganization"
                  @change="(v) => (deal.doc.organization = v)"
                />
              </EntryField>
              <button
                v-if="!deal.doc.organization"
                type="button"
                class="flex h-10 items-center gap-2 rounded-lg bg-[var(--crm-accent-soft)] px-3 text-sm font-medium text-[var(--crm-accent-text)] transition-colors hover:brightness-95"
                @click="startNewOrganization('')"
              >
                <span class="lucide-plus size-4" />
                {{ __('Create new organization') }}
              </button>
            </template>
            <template v-else>
              <div class="flex flex-col gap-3">
                <EntryField
                  ref="organizationInput"
                  :label="__('Organization name')"
                  icon="lucide-building-2"
                >
                  <FormControl
                    v-model="deal.doc.organization_name"
                    autocomplete="off"
                  />
                </EntryField>
                <EntryField :label="__('Website')" icon="lucide-globe">
                  <FormControl
                    v-model="deal.doc.website"
                    type="url"
                    inputmode="url"
                    :placeholder="__('example.com')"
                    autocomplete="off"
                  />
                </EntryField>
                <EntryField :label="__('Industry')" icon="lucide-layers">
                  <Link
                    class="form-control"
                    doctype="CRM Industry"
                    variant="outline"
                    :value="deal.doc.industry"
                    @change="(v) => (deal.doc.industry = v)"
                  />
                </EntryField>
                <EntryField :label="__('Territory')" icon="lucide-map-pin">
                  <Link
                    class="form-control"
                    doctype="CRM Territory"
                    variant="outline"
                    :value="deal.doc.territory"
                    @change="(v) => (deal.doc.territory = v)"
                  />
                </EntryField>
                <EntryField :label="__('Employees')" icon="lucide-users">
                  <FormControl
                    v-model="deal.doc.no_of_employees"
                    type="select"
                    :options="EMPLOYEE_OPTIONS"
                  />
                </EntryField>
              </div>
              <button
                type="button"
                class="self-start text-sm text-[var(--crm-accent-text)] hover:underline"
                @click="cancelNewOrganization"
              >
                {{ __('Pick an existing organization instead') }}
              </button>
            </template>
          </section>

          <!-- Progress guide: each step ticks off as the form fills in. -->
          <aside class="crm-entry-guide hidden lg:flex">
            <span class="crm-entry-guide__badge"
              ><span class="lucide-box size-6"
            /></span>
            <h3 class="text-lg font-semibold text-[var(--crm-text)]">
              {{ __('Create Pipeline') }}
            </h3>
            <p class="text-sm text-[var(--crm-text-3)]">
              {{
                __('Track and manage your opportunities by adding key details.')
              }}
            </p>
            <ul class="mt-5 flex w-full flex-col gap-4 text-left">
              <li
                v-for="step in guideSteps"
                :key="step.title"
                class="flex items-start gap-3"
              >
                <span
                  class="crm-entry-guide__step"
                  :class="{ 'crm-entry-guide__step--done': step.done }"
                >
                  <span
                    :class="[step.done ? 'lucide-check' : step.icon, 'size-4']"
                  />
                </span>
                <div class="min-w-0">
                  <div class="text-sm font-semibold text-[var(--crm-text)]">
                    {{ step.title }}
                  </div>
                  <div class="text-[13px] text-[var(--crm-text-3)]">
                    {{ step.sub }}
                  </div>
                </div>
              </li>
            </ul>
          </aside>
        </div>
      </div>

      <ErrorMessage v-if="error" :message="error" />
    </div>

    <template #footer>
      <div class="hidden items-center gap-3 text-xs text-ink-gray-5 sm:flex">
        <span>{{ shortcutHint }}</span>
        <RouterLink
          :to="{ name: 'NewDataImport', params: { doctype: 'CRM Deal' } }"
          class="hover:underline"
          @click="show = false"
        >
          {{ __('Import from CSV') }}
        </RouterLink>
      </div>
      <div class="flex w-full items-center justify-end gap-2 sm:w-auto">
        <Button
          :label="__('Create & New')"
          :loading="creating && createAndNew"
          :disabled="creating"
          @click="create(true)"
        />
        <Button
          variant="solid"
          :label="__('Create')"
          :loading="creating && !createAndNew"
          :disabled="creating"
          @click="create(false)"
        />
      </div>
    </template>
  </CrmDialog>
</template>

<script setup>
import CrmDialog from '@/components/Modals/CrmDialog.vue'
import EditIcon from '@/components/Icons/EditIcon.vue'
import FieldLayout from '@/components/FieldLayout/FieldLayout.vue'
import Link from '@/components/Controls/Link.vue'
import EntryField from '@/components/Controls/EntryField.vue'
import Autocomplete from '@/components/frappe-ui/Autocomplete.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import { usersStore } from '@/stores/users'
import { statusesStore } from '@/stores/statuses'
import { getSettings } from '@/stores/settings'
import { isMobileView } from '@/composables/settings'
import { showQuickEntryModal, quickEntryProps } from '@/composables/modals'
import { useDocument } from '@/data/document'
import { timeAgo } from '@/utils'
import {
  STICKY_FIELDS,
  cleanMobile,
  validateEntry,
  extraTabs,
  saveDraft,
  loadDraft,
  clearDraft,
} from '@/utils/pipelineEntry'
import { useTelemetry } from 'frappe-ui/frappe'
import {
  Avatar,
  DatePicker,
  ErrorMessage,
  call,
  createResource,
  toast,
} from 'frappe-ui'
import { watchDebounced } from '@vueuse/core'
import { computed, h, nextTick, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

const props = defineProps({
  defaults: { type: Object, default: () => ({}) },
})

const EMPLOYEE_OPTIONS = [
  '1-10',
  '11-50',
  '51-200',
  '201-500',
  '501-1000',
  '1000+',
]

const FieldError = (p) =>
  p.message
    ? h('p', { class: 'mt-1 text-xs text-ink-red-4', role: 'alert' }, p.message)
    : null
FieldError.props = ['message']

const { getUser, isManager } = usersStore()
const { statusOptions, getDealStatus } = statusesStore()
const { settings } = getSettings()
const { capture } = useTelemetry()

const show = defineModel({ type: Boolean })
const router = useRouter()

const { document: deal, triggerOnBeforeCreate } = useDocument('CRM Deal')

const note = ref('')
const error = ref(null)
const errors = ref({})
const creating = ref(false)
const createAndNew = ref(false)
// Open by default: it holds the first note, which used to sit in plain view.
const showMore = ref(true)
const draft = ref(null)
const firstNameInput = ref(null)
const organizationInput = ref(null)

const selectedContact = ref(null)
const contactOptions = ref([])
const duplicates = ref([])
const createNewContactAnyway = ref(false)
const creatingOrganization = ref(false)

const me = computed(() => getUser().name)

const shortcutHint = computed(() => {
  const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'
  return __('{0}+Enter create · {0}+Shift+Enter create & new', [mod])
})

// Open and in-progress stages first; Won/Lost are rarely where a pipeline starts.
const stageOptions = computed(() => {
  const options = statusOptions('deal').map(({ label, value }) => ({
    label,
    value,
  }))
  const rank = (o) =>
    ['Won', 'Lost'].includes(getDealStatus(o.value)?.type) ? 1 : 0
  return [...options].sort((a, b) => rank(a) - rank(b))
})

const currency = computed(
  () =>
    deal.doc.currency ||
    settings.value?.currency ||
    window.sysdefaults?.currency ||
    'INR',
)
const currencySymbol = computed(() => {
  try {
    return (
      new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: currency.value,
      })
        .formatToParts(0)
        .find((p) => p.type === 'currency')?.value || currency.value
    )
  } catch {
    return currency.value
  }
})

// --- Layout extras -------------------------------------------------------

const layout = createResource({
  url: 'xbr_crm.fcrm.doctype.crm_fields_layout.crm_fields_layout.get_fields_layout',
  cache: ['QuickEntry', 'CRM Deal'],
  params: { doctype: 'CRM Deal', type: 'Quick Entry' },
  auto: true,
})
const moreTabs = computed(() => extraTabs(layout.data))

// The side guide ticks each step off as the form fills in.
const guideSteps = computed(() => {
  const d = deal.doc
  return [
    {
      icon: 'lucide-user',
      title: __('Add contact details'),
      sub: __('Link the primary contact'),
      done: Boolean(
        selectedContact.value || d.first_name || d.email || d.mobile_no,
      ),
    },
    {
      icon: 'lucide-building-2',
      title: __('Select or create organization'),
      sub: __('Associate with an organization'),
      done: Boolean(
        d.organization || (creatingOrganization.value && d.organization_name),
      ),
    },
    {
      icon: 'lucide-target',
      title: __('Set pipeline information'),
      sub: __('Stage, owner, value and more'),
      done: Boolean(d.status && d.deal_owner),
    },
    {
      icon: 'lucide-file-text',
      title: __('Add additional details'),
      sub: __('Revenue, description, etc.'),
      done: Boolean(note.value),
    },
  ]
})

// --- Contact --------------------------------------------------------------

function contactLine(c) {
  return [c.mobile_no, c.email, c.organization].filter(Boolean).join(' · ')
}

const contactSearch = createResource({
  url: 'xbr_crm.api.pipeline_entry.search_contacts',
  onSuccess(rows) {
    contactOptions.value = (rows || []).map((c) => ({
      label: c.full_name || c.name,
      value: c.name,
      description: contactLine(c),
      contact: c,
    }))
  },
})

function searchContacts(txt) {
  contactSearch.submit({ txt: txt || '' })
}

function useContact(contact) {
  selectedContact.value = contact
  deal.doc.contact = contact.name
  duplicates.value = []
  createNewContactAnyway.value = false
  // The contact's organisation, unless one was already chosen.
  if (
    contact.organization &&
    !deal.doc.organization &&
    !creatingOrganization.value
  ) {
    deal.doc.organization = contact.organization
  }
  delete errors.value.first_name
  delete errors.value.mobile_no
  delete errors.value.email
}

function clearContact() {
  selectedContact.value = null
  deal.doc.contact = null
}

// "Create new contact <typed text>": put what was typed where it belongs.
function startNewContact(typed, close) {
  close?.()
  const text = String(typed || '').trim()
  if (text) {
    if (text.includes('@')) deal.doc.email = text
    else if (/^[+\d][\d\s()-]{5,}$/.test(text)) deal.doc.mobile_no = text
    else {
      const [first, ...rest] = text.split(/\s+/)
      deal.doc.first_name = first
      deal.doc.last_name = rest.join(' ') || deal.doc.last_name
    }
  }
  nextTick(() => firstNameInput.value?.$el?.querySelector('input')?.focus())
}

function tidyMobile() {
  const { value, error: err } = cleanMobile(deal.doc.mobile_no)
  if (!err) deal.doc.mobile_no = value
}

watchDebounced(
  () => [deal.doc.mobile_no, deal.doc.email, selectedContact.value],
  async () => {
    if (selectedContact.value) return (duplicates.value = [])
    const mobile = cleanMobile(deal.doc.mobile_no)
    const email = (deal.doc.email || '').trim()
    if ((!mobile.value || mobile.error) && !email.includes('@')) {
      duplicates.value = []
      return
    }
    try {
      duplicates.value = await call(
        'xbr_crm.api.pipeline_entry.find_duplicates',
        {
          mobile_no: mobile.error ? '' : mobile.value,
          email,
        },
      )
    } catch {
      duplicates.value = []
    }
  },
  { debounce: 400 },
)

// --- Organisation ---------------------------------------------------------

function startNewOrganization(typed, close) {
  close?.()
  creatingOrganization.value = true
  deal.doc.organization = null
  deal.doc.organization_name =
    String(typed || '').trim() || deal.doc.organization_name
  nextTick(() => organizationInput.value?.$el?.querySelector('input')?.focus())
}

function cancelNewOrganization() {
  creatingOrganization.value = false
  deal.doc.organization_name = null
}

// --- Create ---------------------------------------------------------------

function payload() {
  const doc = { ...deal.doc }
  if (selectedContact.value) {
    doc.contact = selectedContact.value.name
    for (const f of ['first_name', 'last_name', 'email', 'mobile_no'])
      doc[f] = null
  } else {
    doc.contact = null
    doc.mobile_no = cleanMobile(doc.mobile_no).value || null
    doc.create_new_contact = createNewContactAnyway.value ? 1 : 0
  }
  if (!creatingOrganization.value) doc.organization_name = null
  else doc.organization = null
  if (doc.deal_value !== '' && doc.deal_value != null) {
    doc.deal_value = Number(String(doc.deal_value).replace(/,/g, ''))
  }
  if (doc.probability === '') doc.probability = null
  doc.currency = currency.value
  doc.note = note.value
  return doc
}

async function create(andNew = false) {
  if (creating.value) return
  error.value = null
  errors.value = validateEntry(deal.doc, {
    existingContact: !!selectedContact.value,
  })
  if (Object.keys(errors.value).length) {
    error.value = __('Please fix the highlighted fields.')
    return
  }

  creating.value = true
  createAndNew.value = andNew
  try {
    await triggerOnBeforeCreate?.()
    const name = await call(
      'xbr_crm.fcrm.doctype.crm_deal.crm_deal.create_deal',
      {
        doc: payload(),
      },
    )
    capture('deal_created')
    clearDraft(me.value)
    if (andNew) {
      toast.success(__('Pipeline {0} created', [name]), {
        action: {
          label: __('Open'),
          onClick: () =>
            router.push({ name: 'Deal', params: { dealId: name } }),
        },
      })
      resetForNext()
    } else {
      show.value = false
      router.push({ name: 'Deal', params: { dealId: name } })
    }
  } catch (err) {
    error.value =
      err?.messages?.join('\n') ||
      err?.message ||
      __('Could not create the pipeline')
  } finally {
    creating.value = false
  }
}

// Clear for the next entry, keeping owner, stage, source and currency.
function resetForNext() {
  const keep = Object.fromEntries(STICKY_FIELDS.map((f) => [f, deal.doc[f]]))
  deal.doc = { no_of_employees: '1-10', ...keep }
  note.value = ''
  errors.value = {}
  duplicates.value = []
  selectedContact.value = null
  createNewContactAnyway.value = false
  creatingOrganization.value = false
  nextTick(() => firstNameInput.value?.$el?.querySelector('input')?.focus())
}

function onKeydown(e) {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    create(e.shiftKey)
  }
}

// --- Draft ----------------------------------------------------------------

watchDebounced(
  () => [JSON.stringify(deal.doc), note.value],
  () => {
    if (!draft.value) saveDraft(me.value, deal.doc, note.value)
  },
  { debounce: 800 },
)

function restoreDraft() {
  Object.assign(deal.doc, draft.value.doc || {})
  note.value = draft.value.note || ''
  creatingOrganization.value = Boolean(deal.doc.organization_name)
  if (deal.doc.contact) {
    selectedContact.value = {
      name: deal.doc.contact,
      full_name: deal.doc.contact,
    }
  }
  draft.value = null
}

function discardDraft() {
  clearDraft(me.value)
  draft.value = null
}

function openQuickEntryModal() {
  showQuickEntryModal.value = true
  quickEntryProps.value = { doctype: 'CRM Deal' }
  nextTick(() => (show.value = false))
}

onMounted(() => {
  deal.doc.no_of_employees = '1-10'
  Object.assign(deal.doc, props.defaults)
  if (!deal.doc.deal_owner) deal.doc.deal_owner = me.value
  if (!deal.doc.status) deal.doc.status = stageOptions.value[0]?.value
  if (!deal.doc.currency) deal.doc.currency = currency.value
  draft.value = loadDraft(me.value)
  nextTick(() => firstNameInput.value?.$el?.querySelector('input')?.focus())
})

defineExpose({
  create,
  useContact,
  startNewContact,
  startNewOrganization,
  resetForNext,
  restoreDraft,
  discardDraft,
})
</script>
