<template>
  <div class="flex h-full flex-col gap-6 p-6 text-ink-gray-8">
    <!-- Header -->
    <div class="flex items-start justify-between gap-4">
      <div class="flex items-center gap-3.5">
        <span
          class="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--crm-chip-blue)] text-[var(--crm-accent-primary)]"
        >
          <LucideTextCursorInput class="size-5" />
        </span>
        <div class="flex flex-col gap-1">
          <div class="flex items-center gap-2">
            <h2 class="text-2xl font-semibold leading-none text-ink-gray-9">
              {{ __('Forms') }}
            </h2>
          </div>
          <p class="text-p-base text-ink-gray-6">
            {{
              __(
                'Capture leads and deals from public forms you embed on your website.',
              )
            }}
          </p>
        </div>
      </div>
      <Button
        class="shrink-0"
        :label="__('New')"
        icon-left="lucide-plus"
        variant="solid"
        @click="openCreate"
      />
    </div>

    <!-- List -->
    <div class="flex h-full flex-col overflow-y-auto">
      <div
        v-if="forms.loading && !forms.data"
        class="flex flex-col gap-2 py-2"
        aria-busy="true"
        aria-label="Loading forms"
      >
        <SkeletonLoader v-for="i in 4" :key="i" type="settings-row" />
      </div>
      <EmptyState
        v-else-if="forms.data?.length === 0"
        :title="__('No web forms yet')"
        :description="__('Create one to start capturing leads.')"
        :icon="h(LucideTextCursorInput)"
      />
      <div v-else class="flex flex-col gap-3 overflow-y-auto">
        <!-- Column labels -->
        <div class="crm-settings-collabels">
          <div class="flex-1">{{ __('Form') }}</div>
          <div class="w-24 shrink-0">{{ __('Type') }}</div>
          <div class="w-28 shrink-0">{{ __('Status') }}</div>
          <div class="crm-col-menu" />
        </div>

        <div
          v-for="form in forms.data"
          :key="form.name"
          class="crm-settings-row cursor-pointer"
          @click="$emit('open', form.name)"
        >
          <div class="min-w-0 flex-1">
            <div class="truncate text-base font-semibold text-ink-gray-9">
              {{ form.title }}
            </div>
            <div class="mt-0.5 truncate text-sm text-ink-gray-6">
              /crm-form/{{ form.route }}
            </div>
          </div>
          <div class="w-24 shrink-0 truncate text-sm text-ink-gray-6">
            {{ docLabel(form.document_type) }}
          </div>
          <div class="w-28 shrink-0">
            <Badge
              :theme="form.published ? 'green' : 'gray'"
              variant="subtle"
              size="md"
              class="rounded-lg"
              :label="form.published ? __('Published') : __('Unpublished')"
            />
          </div>
          <div class="crm-col-menu" @click.stop>
            <Dropdown placement="right" :options="rowOptions(form)">
              <Button
                icon="lucide-more-horizontal"
                variant="ghost"
                @click="isConfirmingDelete = false"
              />
            </Dropdown>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- create dialog -->
  <CrmDialog
    v-model:open="showCreate"
    size="xl"
    icon="lucide-file-text"
    :title="__('New form')"
    :subtitle="__('Publish a public form that creates records in the CRM')"
  >
    <template #default>
      <div class="flex flex-col gap-4">
        <FormControl
          v-model="draft.title"
          type="text"
          :label="__('Title')"
          :placeholder="__('Contact sales')"
          @input="onTitleInput"
        />
        <FormControl
          v-model="draft.document_type"
          type="select"
          :label="__('Maps to')"
          :options="targetOptions"
        />
        <div>
          <div class="crm-field-label">{{ __('Route') }}</div>
          <div
            class="crm-composite-field flex cursor-text items-center text-base transition-colors"
            @click="focusRouteEnd"
          >
            <span class="shrink-0 text-ink-gray-4">/crm-form/</span>
            <input
              v-model="draft.route"
              :placeholder="__('contact-sales')"
              class="min-w-0 flex-1 border-0 bg-transparent p-0 text-base text-ink-gray-8 placeholder:text-ink-gray-4 focus:outline-none focus:ring-0"
              @input="routeEdited = true"
            />
          </div>
        </div>
        <ErrorMessage v-if="createError" :message="createError" />
      </div>
    </template>
    <template #footer>
      <Button
        variant="solid"
        :label="__('Create form')"
        :loading="creating"
        @click="createForm"
      />
    </template>
  </CrmDialog>
</template>

<script setup>
import CrmDialog from '@/components/Modals/CrmDialog.vue'
import EmptyState from '@/components/ListViews/EmptyState.vue'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import {
  Button,
  Badge,
  Dropdown,
  FormControl,
  ErrorMessage,
  createResource,
  call,
  toast,
} from 'frappe-ui'
import { useTelemetry } from 'frappe-ui/frappe'
import LucideTextCursorInput from '~icons/lucide/text-cursor-input'
import { ref, reactive, h } from 'vue'
import { ConfirmDelete, copyToClipboard } from '../../../utils'
import { formatError } from '../../../utils/formatError'

const emit = defineEmits(['open'])
const { capture } = useTelemetry()

const isConfirmingDelete = ref(false)

const targetOptions = [
  { label: 'Lead', value: 'CRM Lead' },
  { label: 'Deal', value: 'CRM Deal' },
]
const docLabel = (dt) => targetOptions.find((o) => o.value === dt)?.label || dt

const forms = createResource({
  url: 'crm.api.form.list_forms',
  auto: true,
})

// create dialog: title, maps-to and route captured up front (maps-to governs
// which fields are available, so it's a first-class creation choice)
const showCreate = ref(false)
const creating = ref(false)
const createError = ref('')
const draft = reactive({ title: '', route: '', document_type: 'CRM Lead' })
let routeEdited = false

function slugify(v) {
  return (v || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
function openCreate() {
  draft.title = ''
  draft.route = ''
  draft.document_type = 'CRM Lead'
  routeEdited = false
  createError.value = ''
  showCreate.value = true
}
function onTitleInput(e) {
  if (!routeEdited) draft.route = slugify(e?.target?.value ?? draft.title)
}
// clicking the /crm-form/ prefix or box padding focuses the slug at the end
function focusRouteEnd(e) {
  if (e.target.tagName === 'INPUT') return
  const input = e.currentTarget.querySelector('input')
  if (!input) return
  input.focus()
  input.setSelectionRange(input.value.length, input.value.length)
}
async function createForm() {
  createError.value = ''
  const route = slugify(draft.route || draft.title)
  if (!draft.title || !route) {
    createError.value = __('Title and route are required')
    return
  }
  creating.value = true
  try {
    const doc = await call('crm.api.form.save_form', {
      name: null,
      form: { title: draft.title, route, document_type: draft.document_type },
    })
    capture('form_created', { doctype: draft.document_type })
    showCreate.value = false
    emit('open', doc.name)
    forms.reload()
    toast.success(__('Form created'))
  } catch (e) {
    createError.value =
      e?.messages?.[0] || e?.message || __('Could not create form')
  } finally {
    creating.value = false
  }
}

async function togglePublished(form, value) {
  try {
    await call('crm.api.form.set_published', {
      name: form.name,
      published: value ? 1 : 0,
    })
    form.published = value ? 1 : 0
    if (value) capture('form_published', { source: 'list' })
    toast.success(value ? __('Form published') : __('Form unpublished'))
  } catch (e) {
    forms.reload()
    toast.error(formatError(e, 'Could not update form'))
  }
}

function copyLink(form) {
  copyToClipboard(`${window.location.origin}/crm-form/${form.route}`)
}

async function deleteForm(form) {
  // Its two siblings above both catch; this one did not, so a refused delete
  // (a published form, a permission error) rejected into nothing — no toast,
  // no row removed, and an unhandled rejection in the console.
  try {
    await call('crm.api.form.delete_form', { name: form.name })
    forms.reload()
    toast.success(__('Form deleted'))
  } catch (e) {
    toast.error(formatError(e, 'Could not delete form'))
  }
}

function rowOptions(form) {
  return [
    {
      label: __('Edit'),
      icon: 'edit-2',
      onClick: () => emit('open', form.name),
    },
    {
      label: form.published ? __('Unpublish') : __('Publish'),
      icon: form.published ? 'eye-off' : 'eye',
      onClick: () => togglePublished(form, !form.published),
    },
    { label: __('Copy link'), icon: 'link', onClick: () => copyLink(form) },
    ...ConfirmDelete({
      isConfirmingDelete,
      onConfirmDelete: () => deleteForm(form),
    }),
  ]
}

defineExpose({ reload: () => forms.reload() })
</script>
