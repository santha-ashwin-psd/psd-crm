<template>
  <div class="flex h-full flex-col gap-6 p-8 text-ink-gray-8">
    <!-- Header -->
    <div class="flex items-start justify-between gap-4">
      <div class="flex min-w-0 items-start gap-3">
        <button
          class="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg text-ink-gray-7 transition hover:bg-[var(--crm-surface-2)]"
          :aria-label="__('Back to templates')"
          @click="() => emit('updateStep', 'template-list')"
        >
          <FeatherIcon name="arrow-left" class="size-4" />
        </button>
        <div class="flex min-w-0 flex-col gap-1">
          <h2 class="truncate text-2xl font-semibold leading-none text-ink-gray-9">
            {{ __(template.name) }}
          </h2>
          <p class="text-p-base text-ink-gray-6">
            {{ __('Edit this email template for your CRM communications.') }}
          </p>
        </div>
      </div>
      <div class="flex shrink-0 items-center gap-4">
        <div class="flex items-center gap-2">
          <Switch v-model="template.enabled" size="sm" />
          <span class="text-sm font-medium text-ink-gray-7">
            {{ __('Enabled') }}
          </span>
        </div>
        <Button
          :label="__('Save')"
          variant="solid"
          :disabled="!dirty"
          :loading="renameDoc.loading || templates.setValue.loading"
          @click="updateTemplate"
        />
      </div>
    </div>

    <!-- Fields -->
    <div class="template-form flex flex-1 flex-col gap-5 overflow-y-auto">
      <div class="flex sm:flex-row flex-col gap-4">
        <div class="flex-1">
          <FormControl
            v-model="template.name"
            size="md"
            :placeholder="__('Payment Reminder')"
            :label="__('Name')"
            :required="true"
          />
        </div>
        <div class="flex-1">
          <FormControl
            v-model="template.reference_doctype"
            type="select"
            size="md"
            :label="__('For')"
            :options="leadDealDoctypeOptions()"
            :placeholder="__('Deal')"
          />
        </div>
      </div>
      <div>
        <FormControl
          ref="subjectRef"
          v-model="template.subject"
          size="md"
          :label="__('Subject')"
          :placeholder="__('Payment reminder from Frappé - (#{{ name }})')"
          :required="true"
        />
      </div>
      <div>
        <FormControl
          v-model="template.content_type"
          type="select"
          size="md"
          :label="__('Content Type')"
          default="Rich Text"
          :options="['Rich Text', 'HTML']"
          :placeholder="__('Rich Text')"
        />
      </div>
      <div>
        <FormControl
          v-if="template.content_type === 'HTML'"
          ref="content"
          v-model="template.response_html"
          size="md"
          type="textarea"
          :label="__('Content')"
          :required="true"
          :rows="10"
          :placeholder="
            __(
              '<p>Dear {{ lead_name }},</p>\n\n<p>This is a reminder for the payment of {{ grand_total }}.</p>\n\n<p>Thanks,</p>\n<p>Frappé</p>',
            )
          "
        />
        <div v-else>
          <div class="mb-1.5 text-base text-ink-gray-5">
            {{ __('Content') }}
            <span class="text-ink-red-6">*</span>
          </div>
          <TextEditor
            ref="content"
            editor-class="!prose-sm max-w-full overflow-auto min-h-[180px] max-h-80 py-2 px-3 rounded-[10px] border border-[var(--crm-settings-border)] bg-[var(--crm-surface)] placeholder-ink-gray-4 hover:border-[var(--crm-border-strong)] focus:border-[var(--crm-accent-primary)] focus:ring-0 text-ink-gray-8 transition-colors"
            :bubbleMenu="true"
            :content="template.response"
            :placeholder="
              __(
                'Dear {{ lead_name }}, \n\nThis is a reminder for the payment of {{ grand_total }}. \n\nThanks, \nFrappé',
              )
            "
            @change="(val) => (template.response = val)"
          />
        </div>
      </div>
    </div>
    <div v-if="errorMessage">
      <ErrorMessage :message="__(errorMessage)" />
    </div>
  </div>
</template>
<script setup>
import { formatError } from '@/utils/formatError'
import {
  TextEditor,
  FormControl,
  Switch,
  FeatherIcon,
  toast,
  createResource,
} from 'frappe-ui'
import { computed, inject, onMounted, ref } from 'vue'
import { leadDealDoctypeOptions } from '@/utils/leads'

const props = defineProps({
  templateData: { type: Object, required: true },
})

const emit = defineEmits(['updateStep'])
const errorMessage = ref('')

const templates = inject('templates')
const template = ref({})

const updateTemplate = async () => {
  errorMessage.value = ''
  if (!template.value.name) {
    errorMessage.value = __('Name is required')
    return
  }
  if (!template.value.subject) {
    errorMessage.value = __('Subject is required')
    return
  }
  if (template.value.content_type === 'Rich Text' && !template.value.response) {
    errorMessage.value = __('Content is required')
    return
  }
  if (template.value.content_type === 'HTML' && !template.value.response_html) {
    errorMessage.value = __('Content is required')
    return
  }

  template.value.use_html = template.value.content_type === 'HTML'

  const old = {
    ...props.templateData,
    use_html: Boolean(props.templateData.use_html),
  }
  const newEmailTemplate = {
    ...template.value,
    use_html: Boolean(template.value.use_html),
  }

  delete newEmailTemplate.content_type

  const nameChanged = old.name !== newEmailTemplate.name
  delete old.name
  delete newEmailTemplate.name

  const otherFieldChanged =
    JSON.stringify(old) !== JSON.stringify(newEmailTemplate)
  const values = newEmailTemplate

  if (!nameChanged && !otherFieldChanged) return

  let name = props.templateData.name

  if (nameChanged) {
    name = await renameDoc.fetch()
    // createResource routes a failure to its own onError and resolves
    // undefined rather than throwing, so without this the field update below
    // went ahead against `name: undefined`. errorMessage is already set.
    if (!name) return
    if (!otherFieldChanged) {
      emit('updateStep', 'template-list')
    }
  }
  if (otherFieldChanged) {
    templates.setValue.submit(
      { ...values, name },
      {
        onSuccess: () => {
          emit('updateStep', 'template-list')
          toast.success(__('Template updated successfully'))
        },
        onError: (error) => {
          errorMessage.value =
            formatError(error, 'Failed to update template')
        },
      },
    )
  }
}

const dirty = computed(() => {
  return (
    template.value.name !== props.templateData.name ||
    template.value.reference_doctype !== props.templateData.reference_doctype ||
    template.value.subject !== props.templateData.subject ||
    template.value.response_html !== props.templateData.response_html ||
    template.value.response !== props.templateData.response ||
    template.value.use_html !== props.templateData.use_html ||
    Boolean(template.value.enabled) !== Boolean(props.templateData.enabled)
  )
})

const renameDoc = createResource({
  url: 'frappe.client.rename_doc',
  method: 'POST',
  makeParams() {
    return {
      doctype: 'Email Template',
      old_name: props.templateData.name,
      new_name: template.value.name,
    }
  },
  onSuccess: () => {
    templates.reload()
    toast.success(__('Template renamed successfully'))
  },
  onError: (error) => {
    errorMessage.value = formatError(error, 'Failed to rename template')
  },
})

onMounted(() => {
  template.value = { ...props.templateData }
  template.value.content_type = template.value.use_html ? 'HTML' : 'Rich Text'
})
</script>

<style scoped>
.template-form {
  padding: 22px;
  border-radius: var(--crm-radius-lg);
  border: 1px solid var(--crm-settings-border);
  background: var(--crm-surface);
  box-shadow: var(--crm-shadow-sm);
}
</style>
