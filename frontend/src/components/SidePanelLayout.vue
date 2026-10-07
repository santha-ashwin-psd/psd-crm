<template>
  <div class="sections flex min-h-0 flex-1 flex-col overflow-y-auto">
    <template v-for="(section, i) in _sections" :key="section.name">
      <div v-if="section.visible" class="section flex flex-col">
        <div
          v-if="i !== firstVisibleIndex()"
          class="w-full section-border h-px border-t border-[var(--crm-border)]"
        />
        <div class="p-1 sm:p-3">
          <CollapsibleSection
            labelClass="px-2 font-semibold"
            headerClass="h-8"
            :label="section.label"
            :hideLabel="!section.label"
            :opened="section.opened"
          >
            <template v-if="!preview" #actions>
              <slot name="actions" v-bind="{ section }">
                <Button
                  v-if="section.showEditButton"
                  variant="ghost"
                  class="w-7 mr-2"
                  :label="__('Edit fields')"
                  :icon="EditIcon"
                  @click="showSidePanelModal = true"
                />
              </slot>
            </template>
            <slot v-bind="{ section }">
              <FadedScrollableDiv
                v-if="section.columns?.[0]?.fields?.length"
                class="column flex flex-col gap-1.5"
              >
                <template
                  v-for="field in section.columns?.[0]?.fields || []"
                  :key="field.fieldname"
                >
                  <div
                    v-if="field.visible"
                    class="field group flex items-center gap-2 px-3 leading-5 first:mt-3 rounded-lg hover:bg-[var(--crm-row-hover)] transition-colors duration-150 py-0.5"
                    :class="{
                      'border border-red-300 bg-red-50/20 hover:bg-red-50/40':
                        fieldErrors[field.fieldname],
                    }"
                  >
                    <Tooltip
                      v-if="!['Button', 'HTML'].includes(field.fieldtype)"
                      :text="__(field.label)"
                      :hoverDelay="1"
                    >
                      <!-- Label column. Was `w-[35%] min-w-20` with a
                           `truncate` label, which in a ~310px panel left about
                           88px for the text — so "Company Description",
                           "No. of Employees" and "Annual Revenue" all rendered
                           clipped. Widened, and the label now wraps to a
                           second line instead of being cut; the type size is
                           deliberately unchanged, since shrinking it would
                           hide the problem rather than fix it. -->
                      <div
                        class="w-[42%] min-w-24 shrink-0 flex items-start gap-1.5 py-1"
                      >
                        <FeatherIcon
                          :name="iconForField(field)"
                          class="size-3.5 shrink-0 mt-0.5 text-[var(--crm-accent-primary)]"
                        />
                        <!-- The label is the thing you scan this panel FOR —
                             you look for "Territory", then read what is in it.
                             At ink-gray-5 it sat lighter than the values beside
                             it and the column read as a grey gutter. Near-black
                             and semibold matches the key-facts strip above, so
                             the two halves of the record page agree. -->
                        <div
                          class="text-sm font-semibold leading-snug text-ink-gray-8 break-words"
                        >
                          {{ __(field.label) }}
                        </div>
                        <div
                          v-if="
                            field.reqd ||
                            (field.mandatory_depends_on &&
                              field.mandatory_via_depends_on)
                          "
                          class="text-ink-red-5"
                        >
                          *
                        </div>
                      </div>
                    </Tooltip>
                    <div
                      :class="[
                        'flex items-center justify-between',
                        ['Button', 'HTML'].includes(field.fieldtype)
                          ? 'w-full'
                          : 'w-[58%]',
                      ]"
                    >
                      <div
                        class="grid min-h-[28px] flex-1 items-center overflow-hidden text-base"
                      >
                        <div
                          v-if="
                            field.read_only &&
                            ![
                              'Int',
                              'Float',
                              'Currency',
                              'Percent',
                              'Check',
                              'Dropdown',
                              'Duration',
                              'Rating',
                              'Button',
                              'Attach',
                              'Attach Image',
                              'HTML',
                              'Geolocation',
                              'Text Editor',
                            ].includes(field.fieldtype)
                          "
                          class="flex h-7 cursor-pointer items-center px-2 py-1 text-ink-gray-5"
                        >
                          <Tooltip :text="__(field.tooltip)">
                            <div>{{ doc[field.fieldname] }}</div>
                          </Tooltip>
                        </div>
                        <PrimaryDropdown
                          v-else-if="field.fieldtype === 'Dropdown'"
                          :value="doc[field.fieldname]"
                          :placeholder="field.placeholder"
                          :options="field.options"
                          :create="field.create"
                          :label="field.label"
                        />
                        <FormControl
                          v-else-if="field.fieldtype == 'Check'"
                          v-model="doc[field.fieldname]"
                          class="form-control"
                          type="checkbox"
                          :disabled="Boolean(field.read_only)"
                          @change.stop="
                            fieldChange($event.target.checked, field)
                          "
                        />
                        <FormControl
                          v-else-if="
                            [
                              'Small Text',
                              'Text',
                              'Long Text',
                              'Code',
                            ].includes(field.fieldtype)
                          "
                          class="form-control [&_textarea]:transition-all [&_textarea]:duration-200 [&_textarea]:min-h-[38px] [&_textarea:focus]:min-h-[120px]"
                          type="textarea"
                          :value="doc[field.fieldname]"
                          :placeholder="field.placeholder"
                          :debounce="500"
                          @change.stop="fieldChange($event.target.value, field)"
                        />
                        <FormControl
                          v-else-if="field.fieldtype === 'Select'"
                          v-model="doc[field.fieldname]"
                          class="form-control cursor-pointer [&_select]:cursor-pointer truncate [&>*]:!ring-0"
                          type="select"
                          :options="field.options"
                          :placeholder="field.placeholder"
                          @update:modelValue="(v) => fieldChange(v, field)"
                        />
                        <Link
                          v-else-if="field.fieldtype === 'User'"
                          class="form-control"
                          :value="
                            doc[field.fieldname] &&
                            getUser(doc[field.fieldname]).full_name
                          "
                          doctype="User"
                          :filters="field.filters"
                          :placeholder="
                            __('Select') + ' ' + field.label + '...'
                          "
                          :hideMe="true"
                          @change="(v) => fieldChange(v, field)"
                        >
                          <template v-if="doc[field.fieldname]" #prefix>
                            <UserAvatar
                              class="mr-1.5"
                              :user="doc[field.fieldname]"
                              size="sm"
                            />
                          </template>
                          <template #item-prefix="{ option }">
                            <UserAvatar
                              class="mr-1.5"
                              :user="option.value"
                              size="sm"
                            />
                          </template>
                          <template #item-label="{ option }">
                            <Tooltip :text="option.value">
                              <div class="cursor-pointer">
                                {{ getUser(option.value).full_name }}
                              </div>
                            </Tooltip>
                          </template>
                        </Link>
                        <Link
                          v-else-if="
                            ['Link', 'Dynamic Link'].includes(field.fieldtype)
                          "
                          class="form-control select-text"
                          :value="doc[field.fieldname]"
                          :doctype="
                            field.fieldtype == 'Link'
                              ? field.options
                              : doc[field.options]
                          "
                          :filters="field.filters"
                          :placeholder="field.placeholder"
                          :onCreate="field.create"
                          @change="(v) => fieldChange(v, field)"
                        />
                        <div
                          v-else-if="field.fieldtype === 'Time'"
                          class="form-control"
                        >
                          <TimePicker
                            :value="doc[field.fieldname]"
                            :format="getFormat('', '', false, true, false)"
                            :placeholder="field.placeholder"
                            @change="(v) => fieldChange(v, field)"
                          />
                        </div>
                        <div
                          v-else-if="field.fieldtype === 'Datetime'"
                          class="form-control"
                        >
                          <DateTimePicker
                            :value="doc[field.fieldname]"
                            :format="getFormat('', '', true, true, false)"
                            :placeholder="field.placeholder"
                            placement="left-start"
                            @change="(v) => fieldChange(v, field)"
                          />
                        </div>
                        <div
                          v-else-if="field.fieldtype === 'Date'"
                          class="form-control"
                        >
                          <DatePicker
                            :value="doc[field.fieldname]"
                            :format="getFormat('', '', true, false, false)"
                            :placeholder="field.placeholder"
                            placement="left-start"
                            @change="(v) => fieldChange(v, field)"
                          />
                        </div>
                        <FormattedInput
                          v-else-if="field.fieldtype === 'Percent'"
                          class="form-control text-right [&_input]:text-right"
                          type="text"
                          :value="getFormattedPercent(field.fieldname, doc)"
                          :placeholder="field.placeholder"
                          :debounce="500"
                          :disabled="Boolean(field.read_only)"
                          @change.stop="
                            fieldChange(flt($event.target.value), field)
                          "
                        />
                        <Password
                          v-else-if="field.fieldtype === 'Password'"
                          class="form-control"
                          :value="doc[field.fieldname]"
                          :placeholder="field.placeholder"
                          :debounce="500"
                          :disabled="Boolean(field.read_only)"
                          @change.stop="fieldChange($event.target.value, field)"
                        />
                        <FormattedInput
                          v-else-if="field.fieldtype === 'Int'"
                          class="form-control text-right [&_input]:text-right"
                          type="text"
                          :value="doc[field.fieldname] || '0'"
                          :placeholder="field.placeholder"
                          :debounce="500"
                          :disabled="Boolean(field.read_only)"
                          @change.stop="fieldChange($event.target.value, field)"
                        />
                        <FormattedInput
                          v-else-if="field.fieldtype === 'Float'"
                          class="form-control text-right [&_input]:text-right"
                          type="text"
                          :value="getFormattedFloat(field.fieldname, doc)"
                          :placeholder="field.placeholder"
                          :debounce="500"
                          :disabled="Boolean(field.read_only)"
                          @change.stop="
                            fieldChange(flt($event.target.value), field)
                          "
                        />
                        <FormattedInput
                          v-else-if="field.fieldtype === 'Currency'"
                          class="form-control text-right [&_input]:text-right"
                          type="text"
                          :value="getFormattedCurrency(field.fieldname, doc)"
                          :placeholder="field.placeholder"
                          :debounce="500"
                          :disabled="Boolean(field.read_only)"
                          @change.stop="
                            fieldChange(flt($event.target.value), field)
                          "
                        />
                        <DurationInput
                          v-else-if="field.fieldtype === 'Duration'"
                          class="form-control"
                          :value="doc[field.fieldname]"
                          :placeholder="field.placeholder"
                          :disabled="Boolean(field.read_only)"
                          @change="(v) => fieldChange(v, field)"
                        />
                        <RatingInput
                          v-else-if="field.fieldtype === 'Rating'"
                          class="pl-[10px]"
                          :value="doc[field.fieldname]"
                          :max="field.options || 5"
                          :disabled="Boolean(field.read_only)"
                          @change="(v) => fieldChange(v, field)"
                        />
                        <ButtonControl
                          v-else-if="field.fieldtype === 'Button'"
                          :label="field.label"
                          :icon="field.icon"
                          :theme="getButtonTheme(field.button_color)"
                          :variant="getButtonVariant(field.button_color)"
                          :disabled="Boolean(field.read_only)"
                          @click="handleButtonClick(field)"
                        />
                        <AttachControl
                          v-else-if="
                            ['Attach', 'Attach Image'].includes(field.fieldtype)
                          "
                          class="attach-control"
                          :value="doc[field.fieldname]"
                          :doctype="doctype"
                          :docname="doc.name"
                          :fieldname="field.fieldname"
                          :imageOnly="field.fieldtype === 'Attach Image'"
                          :disabled="Boolean(field.read_only)"
                          @change="(v) => fieldChange(v, field)"
                        />
                        <HtmlControl
                          v-else-if="field.fieldtype === 'HTML'"
                          :html="
                            document.fieldHtmlMap?.[field.fieldname] !==
                            undefined
                              ? document.fieldHtmlMap[field.fieldname]
                              : interpolateTemplate(field.options || '', doc)
                          "
                        />
                        <GeolocationControl
                          v-else-if="field.fieldtype === 'Geolocation'"
                          class="geolocation-control"
                          :value="doc[field.fieldname]"
                          :disabled="Boolean(field.read_only)"
                          @change="(v) => fieldChange(v, field)"
                        />
                        <TextEditorControl
                          v-else-if="field.fieldtype === 'Text Editor'"
                          variant="ghost"
                          :fixed-menu="false"
                          :bubble-menu="true"
                          editorClass="w-full !min-h-[38px] !h-[38px] ml-1"
                          :value="doc[field.fieldname]"
                          :placeholder="field.placeholder"
                          :disabled="Boolean(field.read_only)"
                          @change="(v) => fieldChange(v, field)"
                        />
                        <FormControl
                          v-else
                          class="form-control"
                          type="text"
                          :value="doc[field.fieldname]"
                          :placeholder="field.placeholder"
                          :debounce="500"
                          @change.stop="fieldChange($event.target.value, field)"
                        />
                      </div>
                      <div class="ml-1 flex items-center gap-1.5 shrink-0">
                        <ArrowUpRightIcon
                          v-if="
                            field.fieldtype === 'Link' &&
                            field.link &&
                            doc[field.fieldname]
                          "
                          class="h-4 w-4 shrink-0 cursor-pointer text-ink-gray-5 hover:text-ink-gray-8"
                          @click.stop="field.link(doc[field.fieldname])"
                        />
                        <ArrowUpRightIcon
                          v-else-if="isExternalUrl(doc[field.fieldname])"
                          class="h-4 w-4 shrink-0 cursor-pointer text-ink-gray-5 hover:text-ink-gray-8"
                          @click.stop="openExternalUrl(doc[field.fieldname])"
                        />
                        <EditIcon
                          v-if="
                            field.fieldtype === 'Link' &&
                            field.edit &&
                            doc[field.fieldname]
                          "
                          class="size-3.5 shrink-0 cursor-pointer text-ink-gray-5 hover:text-ink-gray-8"
                          @click.stop="field.edit(doc[field.fieldname])"
                        />
                        <span
                          v-if="
                            !field.read_only &&
                            !['Button', 'HTML'].includes(field.fieldtype)
                          "
                          class="lucide-pencil size-3.5 text-ink-gray-4 opacity-0 group-hover:opacity-100 transition-opacity duration-150 shrink-0"
                          aria-hidden="true"
                        />
                        <span
                          v-if="activeFieldSaving === field.fieldname"
                          class="lucide-loader size-3.5 animate-spin text-ink-gray-4 shrink-0"
                          aria-hidden="true"
                        />
                        <span
                          v-else-if="showSuccessCheck === field.fieldname"
                          class="lucide-check size-3.5 text-emerald-600 shrink-0"
                          aria-hidden="true"
                        />
                        <Tooltip
                          v-if="fieldErrors[field.fieldname]"
                          :text="fieldErrors[field.fieldname]"
                        >
                          <span
                            class="lucide-alert-circle size-4 text-red-500 shrink-0"
                            aria-hidden="true"
                          />
                        </Tooltip>
                      </div>
                    </div>
                  </div>
                </template>
              </FadedScrollableDiv>
            </slot>
          </CollapsibleSection>
        </div>
      </div>
    </template>
  </div>
  <SidePanelModal
    v-if="showSidePanelModal"
    v-model="showSidePanelModal"
    :doctype="doctype"
    @reload="() => emit('reload')"
  />
</template>

<script setup>
import Password from '@/components/Controls/Password.vue'
import FormattedInput from '@/components/Controls/FormattedInput.vue'
import DurationInput from '@/components/Controls/DurationInput.vue'
import RatingInput from '@/components/Controls/RatingInput.vue'
import AttachControl from '@/components/Controls/AttachControl.vue'
import HtmlControl from '@/components/Controls/HtmlControl.vue'
import GeolocationControl from '@/components/Controls/GeolocationControl.vue'
import TextEditorControl from '@/components/Controls/TextEditorControl.vue'
import ButtonControl, {
  getButtonTheme,
  getButtonVariant,
} from '@/components/Controls/ButtonControl.vue'
import CollapsibleSection from '@/components/CollapsibleSection.vue'
import PrimaryDropdown from '@/components/PrimaryDropdown.vue'
import FadedScrollableDiv from '@/components/FadedScrollableDiv.vue'
import ArrowUpRightIcon from '@/components/Icons/ArrowUpRightIcon.vue'
import EditIcon from '@/components/Icons/EditIcon.vue'
import Link from '@/components/Controls/Link.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import SidePanelModal from '@/components/Modals/SidePanelModal.vue'
import { getMeta } from '@/stores/meta'
import { parseLinkFilters } from '@/utils/fieldTransforms'
import { usersStore } from '@/stores/users'
import { createDocument } from '@/composables/document'
import { isMobileView } from '@/composables/settings'
import {
  getFormat,
  evaluateDependsOnValue,
  isNull,
  interpolateTemplate,
} from '@/utils'
import { flt } from '@/utils/numberFormat.js'
import { formatError } from '@/utils/formatError'
import {
  Tooltip,
  DateTimePicker,
  DatePicker,
  TimePicker,
  FeatherIcon,
} from 'frappe-ui'
import { useDocument } from '@/data/document'
import { ref, computed, getCurrentInstance } from 'vue'

// Leading icon per field. Panels are user-configurable, so match on the field
// name/label first and fall back to the fieldtype — a fixed per-field table
// would leave any custom field iconless.
const FIELD_ICON_BY_TYPE = {
  Link: 'link',
  'Dynamic Link': 'link',
  User: 'user',
  Select: 'list',
  Check: 'check-square',
  Date: 'calendar',
  Datetime: 'calendar',
  Time: 'clock',
  Duration: 'clock',
  Currency: 'dollar-sign',
  Float: 'hash',
  Int: 'hash',
  Percent: 'percent',
  Rating: 'star',
  Attach: 'paperclip',
  'Attach Image': 'image',
  Geolocation: 'map-pin',
  'Small Text': 'align-left',
  Text: 'align-left',
  'Long Text': 'align-left',
  'Text Editor': 'align-left',
  Code: 'code',
}

function iconForField(field) {
  const key = `${field.fieldname || ''} ${field.label || ''}`.toLowerCase()
  if (/e-?mail/.test(key)) return 'mail'
  if (/mobile|phone|whatsapp/.test(key)) return 'phone'
  if (/website|url|domain/.test(key)) return 'globe'
  if (/organi[sz]ation|company|account/.test(key)) return 'briefcase'
  if (/territory|region|country|city|address|location/.test(key))
    return 'map-pin'
  if (/industry|sector/.test(key)) return 'layers'
  if (/employee|people|team|contact|person/.test(key)) return 'users'
  if (/owner|assign|salutation|lead ?name|first ?name|last ?name/.test(key))
    return 'user'
  if (/status|stage/.test(key)) return 'activity'
  if (/source|campaign/.test(key)) return 'git-branch'
  if (/amount|value|revenue|deal ?value|price/.test(key)) return 'dollar-sign'
  if (/probability/.test(key)) return 'percent'
  if (/date|closure|created|modified/.test(key)) return 'calendar'
  if (/description|note|comment/.test(key)) return 'file-text'
  return FIELD_ICON_BY_TYPE[field.fieldtype] || 'circle'
}

const fieldErrors = ref({})
const activeFieldSaving = ref('')
const showSuccessCheck = ref('')

const props = defineProps({
  sections: { type: Object, default: () => ({}) },
  doctype: { type: String, default: 'CRM Lead' },
  docname: { type: String, required: true },
  preview: { type: Boolean, default: false },
  addContact: { type: Function, default: null },
})

const emit = defineEmits(['beforeFieldChange', 'afterFieldChange', 'reload'])

const { getFormattedPercent, getFormattedFloat, getFormattedCurrency } =
  getMeta(props.doctype)

const { users, isManager, getUser } = usersStore()

const showSidePanelModal = ref(false)

let document = { doc: {} }
let triggerOnChange
let triggerButton = () => {}

if (props.docname) {
  let d = useDocument(props.doctype, props.docname)
  document = d.document
  triggerOnChange = d.triggerOnChange
  triggerButton = d.triggerButton
}

const doc = computed(() => document.doc || {})

const _sections = computed(() => {
  if (!props.sections?.length) return []
  let editButtonAdded = false
  return props.sections.map((section) => {
    // Build a copy rather than writing the parsed fields back into the prop.
    // Re-parsing an already-parsed field made `read_only` sticky: the first
    // pass stored the *result* of `read_only_depends_on` as `read_only`, and
    // every pass after that OR'd against it, so a field that had gone
    // read-only once stayed read-only for the rest of the page's life even
    // after its condition stopped holding.
    let _section = { ...section }
    if (_section.columns?.length) {
      _section.columns = _section.columns.map((column, i) =>
        i === 0
          ? { ...column, fields: (column.fields || []).map(parsedField) }
          : column,
      )
    }
    _section = parsedSection(_section, editButtonAdded)
    if (_section.showEditButton) {
      editButtonAdded = true
    }
    return _section
  })
})

function parsedField(field) {
  // Clone to avoid mutating the cached layout data
  field = { ...field }

  // Merge script property overrides
  const overrides = document.fieldPropertyOverrides?.[field.fieldname]
  if (overrides) {
    Object.assign(field, overrides)
  }

  // The server composes this string ("Select Territory...") and every template
  // binding below used it raw, so placeholders were the one bit of side-panel
  // text that never went through the translation layer.
  if (field.placeholder) field.placeholder = __(field.placeholder)

  if (field.fieldtype == 'Select' && typeof field.options === 'string') {
    field.options = field.options.split('\n').map((option) => {
      return { label: option, value: option }
    })

    if (field.options[0].value !== '' && !field.reqd) {
      field.options.unshift({ label: '', value: '' })
    }
  }

  if (field.fieldtype === 'Link' && field.options === 'User') {
    field.fieldtype = 'User'
    field.link_filters = JSON.stringify({
      name: ['in', users.data?.crmUsers?.map((user) => user.name)],
      ignore_user_type: 1,
      ...(parseLinkFilters(field.link_filters) || {}),
    })
  } else if (field.fieldtype === 'Link' && !field.create) {
    // FieldLayout/Field.vue has had this fallback all along; the side panel
    // did not. Link.vue only renders its "Create New" footer button when
    // `onCreate` is truthy, so every Link in every side panel — territory,
    // industry, source, salutation — was a dropdown you could not add to.
    // Placed after the User branch and behind `!field.create` so a handler the
    // page supplies (Organization's address, Deal's organization) still wins.
    field.create = (value, close) =>
      createDocument(field.options, value, close, (doc) => {
        if (doc) fieldChange(doc.name, field)
      })
  }

  const read_only_via_depends_on = evaluateDependsOnValue(
    field.read_only_depends_on,
    doc.value,
  )

  // Script overrides for read_only take priority over depends_on
  const scriptReadOnly = overrides?.read_only
  const effectiveReadOnly =
    scriptReadOnly !== undefined
      ? scriptReadOnly
      : field.read_only ||
        (field.read_only_depends_on && read_only_via_depends_on)

  let _field = {
    ...field,
    filters: parseLinkFilters(field.link_filters),
    placeholder: field.placeholder || field.label,
    display_via_depends_on: evaluateDependsOnValue(field.depends_on, doc.value),
    mandatory_via_depends_on: evaluateDependsOnValue(
      field.mandatory_depends_on,
      doc.value,
    ),
    read_only: effectiveReadOnly,
  }

  _field.visible = isFieldVisible(_field, overrides?.hidden)
  return _field
}

const instance = getCurrentInstance()
const attrs = instance?.vnode?.props ?? {}

function isExternalUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim())
}

function openExternalUrl(value) {
  window.open(value.trim(), '_blank', 'noopener,noreferrer')
}

async function fieldChange(value, df) {
  if (props.preview) return

  await triggerOnChange(df.fieldname, value)

  const hasListener = attrs['onBeforeFieldChange'] !== undefined

  if (hasListener) {
    emit('beforeFieldChange', { [df.fieldname]: value })
  } else {
    activeFieldSaving.value = df.fieldname
    delete fieldErrors.value[df.fieldname]

    document.save.submit(null, {
      onSuccess: () => {
        activeFieldSaving.value = ''
        showSuccessCheck.value = df.fieldname
        setTimeout(() => {
          if (showSuccessCheck.value === df.fieldname) {
            showSuccessCheck.value = ''
          }
        }, 2000)
        emit('afterFieldChange', { [df.fieldname]: value })
      },
      onError: (err) => {
        activeFieldSaving.value = ''
        // formatError, not `err?.message || err`: a Frappe error carries its
        // text in `messages`, and the bare `|| err` fallback put the error
        // object itself into the template, which rendered "[object Object]"
        // under the field.
        fieldErrors.value[df.fieldname] = formatError(
          err,
          __('Failed to save field value'),
        )
      },
    })
  }
}

function parsedSection(section, editButtonAdded) {
  // Merge script property overrides for section
  const overrides = document.fieldPropertyOverrides?.[section.name]
  if (overrides) {
    section = { ...section, ...overrides }
  }

  let isContactSection = section.name == 'contacts_section'
  section.showEditButton = !(
    isMobileView.value ||
    !isManager() ||
    isContactSection ||
    editButtonAdded
  )

  // Script hidden override for sections
  if (overrides?.hidden !== undefined) {
    section.visible = !overrides.hidden
  } else {
    // `?.` all the way down: a panel layout is user-editable, so a section
    // can be saved with no columns, and this used to throw while deciding
    // whether to render it — taking the whole panel with it.
    section.visible = Boolean(
      isContactSection ||
      section.columns?.[0]?.fields?.filter((f) => f.visible).length,
    )
  }

  return section
}

function isFieldVisible(field, scriptHidden) {
  if (props.preview) return true

  // Script override for hidden wins over everything
  if (scriptHidden !== undefined) return !scriptHidden

  let readOnlyField =
    field.read_only || field.fieldtype === 'Read Only' ? true : false

  let hideEmptyReadOnlyField =
    isNull(doc.value[field.fieldname]) &&
    Number(window.sysdefaults?.hide_empty_read_only_fields ?? 1)

  let showReadOnlyField = readOnlyField && !hideEmptyReadOnlyField

  // Boolean(): see the matching note in FieldLayout/Field.vue — the raw result
  // of an `eval:` depends_on can be undefined or a string, and this value is
  // also counted (`.filter((f) => f.visible).length`) when deciding whether a
  // whole side-panel section renders.
  return Boolean(
    (field.fieldtype == 'Check' ||
      field.fieldtype == 'Button' ||
      showReadOnlyField ||
      !readOnlyField) &&
    (!field.depends_on || field.display_via_depends_on) &&
    !field.hidden,
  )
}

async function handleButtonClick(field) {
  if (props.preview) return

  if (typeof field.click === 'function') {
    await field.click(doc.value)
  } else {
    await triggerButton(field.fieldname)
  }
}

function firstVisibleIndex() {
  return _sections.value.findIndex((section) => section.visible)
}
</script>

<style scoped>
.form-control {
  margin: 2px;
}

/* Panel fields are borderless/transparent so the panel reads as a list, not a
   form. The descendant selectors below only work when `.form-control` is a
   wrapper — but FormControl forwards the class to its ROOT, and for select /
   textarea (which render no label here) the root IS the control. Those two
   therefore kept frappe-ui's gray fill while every other field was
   transparent. The `*.form-control` selectors cover that case, and
   `[data-slot='trigger']` covers Select/Combobox/Link, none of which render a
   native <select>. */
:deep(.form-control input:not([type='checkbox'])),
:deep(.form-control select),
:deep(.form-control button),
:deep(input.form-control:not([type='checkbox'])),
:deep(select.form-control),
:deep(button.form-control),
:deep([data-slot='trigger']),
:deep(.attach-control),
:deep(.geolocation-control),
.dropdown-button {
  /* !important so this beats the app-wide field baseline in index.css — the
     panel is deliberately borderless, and all of its fields match each other. */
  border-color: transparent !important;
  background: transparent !important;
}

/* Textareas keep a box. Single-line fields can read as plain text until
   clicked, but a multi-line field with a resize grabber and no boundary just
   looks like stray text — so it takes the app-wide white field style. */
:deep(.form-control textarea),
:deep(textarea.form-control) {
  border: 1px solid var(--crm-settings-border) !important;
  background: var(--crm-surface) !important;
  border-radius: var(--crm-radius-md) !important;
}
:deep(.form-control textarea:hover),
:deep(textarea.form-control:hover) {
  border-color: var(--crm-border-strong) !important;
}
:deep(.form-control textarea:focus),
:deep(textarea.form-control:focus) {
  border-color: var(--crm-accent-primary) !important;
}

:deep(.form-control button) {
  gap: 0;
}
:deep(.form-control [type='checkbox']) {
  margin-left: 9px;
  cursor: pointer;
}

:deep(.form-control button > div) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.form-control button svg) {
  color: white;
  width: 0;
}

/* One continuous scroll surface. Individual sections must never scroll on
   their own — a per-section max-height used to make each its own scroll
   container, so the wheel latched inside "Details" and never reached the
   sections below it.

   `.sections` keeps overflow-y-auto + min-h-0 so it scrolls where it IS the
   scroll owner (mobile pages, the layout-preview modal), but stays inert on
   the desktop detail pages, where the card is shrink-0 at full content height
   and the page's <aside> does the scrolling. */
</style>
