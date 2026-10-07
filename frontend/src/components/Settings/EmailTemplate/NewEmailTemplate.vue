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
          <h2 class="text-2xl font-semibold leading-none text-ink-gray-9">
            {{
              templateData?.name ? __('Duplicate Template') : __('New Template')
            }}
          </h2>
          <p class="text-p-base text-ink-gray-6">
            {{ __('Create a new email template for your CRM communications.') }}
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
          :label="templateData?.name ? __('Duplicate') : __('Save')"
          :icon-left="templateData?.name ? 'lucide-copy' : undefined"
          variant="solid"
          @click="createTemplate"
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
            :options="[
              {
                label: __('Deal'),
                value: 'CRM Deal',
              },
              {
                label: __('Lead'),
                value: 'CRM Lead',
              },
            ]"
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
          :placeholder="__('Payment Reminder from Frappé - (#{{ name }})')"
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
import { useBroadcast } from '@/composables/useBroadcast'
import { TextEditor, FormControl, Switch, FeatherIcon, toast } from 'frappe-ui'
import { inject, onMounted, ref } from 'vue'

const props = defineProps({
  templateData: { type: Object, default: () => ({}) },
})

const { send } = useBroadcast()

const emit = defineEmits(['updateStep'])
const errorMessage = ref('')

const template = ref({
  name: '',
  reference_doctype: 'CRM Deal',
  subject: '',
  content_type: 'Rich Text',
  response_html: '',
  response: '',
  enabled: false,
})

const templates = inject('templates')

const createTemplate = () => {
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

  templates.insert.submit(
    { ...template.value },
    {
      onSuccess: () => {
        emit('updateStep', 'template-list')
        toast.success(__('Template created successfully'))
        send('refresh-email-templates')
      },
      onError: (error) => {
        errorMessage.value =
          formatError(error, 'Failed to create template')
      },
    },
  )
}

onMounted(() => {
  if (props.templateData?.name) {
    Object.assign(template.value, props.templateData)
    template.value.name = template.value.name + ' - Copy'
    template.value.enabled = false // Default to disabled for new templates
  } else {
    Object.assign(template.value, props.templateData)
  }
})
</script>

<style scoped>
/* Form card: one panel, standard control shape throughout. */
.template-form {
  padding: 22px;
  border-radius: var(--crm-radius-lg);
  border: 1px solid var(--crm-settings-border);
  background: var(--crm-surface);
  box-shadow: var(--crm-shadow-sm);
}
</style>
