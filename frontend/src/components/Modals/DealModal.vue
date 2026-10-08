<template>
  <CrmDialog
    v-model:open="show"
    size="xl"
    icon="zap"
    :title="__('Create Pipeline')"
    :subtitle="__('Contact, organisation and pipeline details in one go')"
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

    <div class="flex flex-col gap-6" @keydown="onKeydown">
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

      <!-- CONTACT -->
      <section class="flex flex-col gap-3">
        <h3 class="text-sm font-semibold text-ink-gray-9">
          {{ __('Contact') }}
        </h3>

        <div
          v-if="selectedContact"
          class="flex items-center gap-3 rounded-lg border border-outline-gray-2 px-3 py-2"
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
          <Button variant="ghost" :label="__('Change')" @click="clearContact" />
        </div>

        <template v-else>
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
            <template #prefix>
              <span class="lucide-search mr-2 size-4 text-ink-gray-5" />
            </template>
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

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormControl
              ref="firstNameInput"
              v-model="deal.doc.first_name"
              :label="__('First name')"
              autocomplete="off"
            />
            <FormControl
              v-model="deal.doc.last_name"
              :label="__('Last name')"
              autocomplete="off"
            />
            <div>
              <FormControl
                v-model="deal.doc.mobile_no"
                type="tel"
                inputmode="tel"
                :label="__('Mobile')"
                :placeholder="__('+91 98765 43210')"
                autocomplete="off"
                @blur="tidyMobile"
              />
              <FieldError :message="errors.mobile_no" />
            </div>
            <div>
              <FormControl
                v-model="deal.doc.email"
                type="email"
                inputmode="email"
                :label="__('Email')"
                autocomplete="off"
              />
              <FieldError :message="errors.email" />
            </div>
          </div>
          <FieldError :message="errors.first_name" />

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
                    ? __('{0} already has this mobile number.', [dup.full_name])
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
                __('Otherwise the pipeline is linked to the existing contact.')
              }}
            </span>
          </div>
        </template>
      </section>

      <!-- ORGANISATION -->
      <section class="flex flex-col gap-3">
        <h3 class="text-sm font-semibold text-ink-gray-9">
          {{ __('Organisation') }}
        </h3>
        <template v-if="!creatingOrganization">
          <Link
            class="form-control"
            doctype="CRM Organization"
            variant="outline"
            :value="deal.doc.organization"
            :placeholder="__('Search organisations, or create a new one')"
            :onCreate="startNewOrganization"
            @change="(v) => (deal.doc.organization = v)"
          />
          <button
            v-if="!deal.doc.organization"
            type="button"
            class="self-start text-sm text-ink-blue-3 hover:underline"
            @click="startNewOrganization('')"
          >
            + {{ __('New organisation') }}
          </button>
        </template>
        <template v-else>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormControl
              ref="organizationInput"
              v-model="deal.doc.organization_name"
              :label="__('Organisation name')"
              autocomplete="off"
            />
            <FormControl
              v-model="deal.doc.website"
              type="url"
              inputmode="url"
              :label="__('Website')"
              :placeholder="__('example.com')"
              autocomplete="off"
            />
            <Link
              class="form-control"
              doctype="CRM Industry"
              variant="outline"
              :label="__('Industry')"
              :value="deal.doc.industry"
              @change="(v) => (deal.doc.industry = v)"
            />
            <Link
              class="form-control"
              doctype="CRM Territory"
              variant="outline"
              :label="__('Territory')"
              :value="deal.doc.territory"
              @change="(v) => (deal.doc.territory = v)"
            />
            <FormControl
              v-model="deal.doc.no_of_employees"
              type="select"
              :label="__('Employees')"
              :options="EMPLOYEE_OPTIONS"
            />
          </div>
          <button
            type="button"
            class="self-start text-sm text-ink-blue-3 hover:underline"
            @click="cancelNewOrganization"
          >
            {{ __('Pick an existing organisation instead') }}
          </button>
        </template>
      </section>

      <!-- PIPELINE -->
      <section class="flex flex-col gap-3">
        <h3 class="text-sm font-semibold text-ink-gray-9">
          {{ __('Pipeline') }}
        </h3>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <FormControl
              v-model="deal.doc.status"
              type="select"
              :label="__('Stage')"
              :options="stageOptions"
            />
            <FieldError :message="errors.status" />
          </div>
          <Link
            class="form-control"
            doctype="User"
            variant="outline"
            :label="__('Owner')"
            :value="
              deal.doc.deal_owner && getUser(deal.doc.deal_owner).full_name
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
          <Link
            class="form-control"
            doctype="CRM Lead Source"
            variant="outline"
            :label="__('Source')"
            :value="deal.doc.source"
            @change="(v) => (deal.doc.source = v)"
          />
          <div>
            <FormControl
              v-model="deal.doc.deal_value"
              type="text"
              inputmode="decimal"
              :label="__('Value')"
              :placeholder="'0'"
              autocomplete="off"
            >
              <template #prefix>
                <span class="text-sm text-ink-gray-5">{{
                  currencySymbol
                }}</span>
              </template>
            </FormControl>
            <FieldError :message="errors.deal_value" />
          </div>
          <div class="flex flex-col gap-1.5">
            <span class="text-xs text-ink-gray-5">{{
              __('Expected close')
            }}</span>
            <DatePicker
              :value="deal.doc.expected_closure_date"
              :placeholder="__('Pick a date')"
              @change="(v) => (deal.doc.expected_closure_date = v)"
            />
          </div>
          <div>
            <FormControl
              v-model="deal.doc.probability"
              type="number"
              inputmode="numeric"
              min="0"
              max="100"
              :label="__('Probability (%)')"
              :placeholder="'0'"
            />
            <FieldError :message="errors.probability" />
          </div>
        </div>
        <FormControl
          v-model="deal.doc.next_step"
          :label="__('Next step')"
          :placeholder="__('e.g. Send the quotation by Friday')"
          autocomplete="off"
        />
      </section>

      <!-- NOTE -->
      <section class="flex flex-col gap-2">
        <h3 class="text-sm font-semibold text-ink-gray-9">
          {{ __('Note') }}
          <span class="font-normal text-ink-gray-5">{{
            __('(optional)')
          }}</span>
        </h3>
        <FormControl
          v-model="note"
          type="textarea"
          :rows="3"
          :placeholder="__('Saved as the first note on the pipeline')"
        />
      </section>

      <!-- Fields the admin added to the layout -->
      <section v-if="moreTabs.length" class="flex flex-col gap-2">
        <button
          type="button"
          class="flex items-center gap-1 self-start text-sm font-semibold text-ink-gray-9"
          :aria-expanded="showMore"
          @click="showMore = !showMore"
        >
          <span
            class="size-4"
            :class="showMore ? 'lucide-chevron-down' : 'lucide-chevron-right'"
          />
          {{ __('More details') }}
        </button>
        <FieldLayout
          v-if="showMore"
          :tabs="moreTabs"
          :data="deal.doc"
          doctype="CRM Deal"
        />
      </section>

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
const showMore = ref(false)
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
