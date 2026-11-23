<!-- eslint-disable vue/no-v-html -->
<template>
  <div
    v-if="reply?.message"
    class="flex items-center justify-around gap-2 px-3 pt-2 sm:px-10"
  >
    <div
      class="mb-1 ml-13 flex-1 cursor-pointer rounded border-0 border-l-4 border-green-500 bg-surface-gray-2 p-2 text-base text-ink-gray-5"
      :class="reply.type == 'Incoming' ? 'border-green-500' : 'border-blue-400'"
    >
      <div
        class="mb-1 text-sm-bold"
        :class="
          reply.type == 'Incoming' ? 'text-[var(--crm-success-text)]' : 'text-ink-blue-link'
        "
      >
        {{ reply.from_name || __('You') }}
      </div>
      <div
        class="max-h-12 overflow-hidden"
        v-html="sanitizeHTML(reply.message)"
      />
    </div>

    <Button variant="ghost" icon="lucide-x" @click="reply = {}" />
  </div>
  <div class="flex items-end gap-2 px-3 py-2.5 sm:px-10" v-bind="$attrs">
    <div class="flex h-8 items-center gap-2">
      <FileUploader @success="(file) => uploadFile(file)">
        <template #default="{ openFileSelector }">
          <div class="flex items-center space-x-2">
            <Dropdown :options="uploadOptions(openFileSelector)">
              <span
                class="lucide-plus size-4.5 cursor-pointer text-ink-gray-5"
                aria-hidden="true"
              />
            </Dropdown>
          </div>
        </template>
      </FileUploader>
      <IconPicker
        v-slot="{ togglePopover }"
        v-model="emoji"
        @update:modelValue="
          () => {
            content += emoji
            $refs.textareaRef.el.focus()
            capture('whatsapp_emoji_added')
          }
        "
      >
        <SmileIcon
          class="flex size-4.5 cursor-pointer rounded-sm text-2xl leading-none text-ink-gray-4"
          @click="togglePopover"
        />
      </IconPicker>
      <Button
        v-if="aiDraftAvailable"
        variant="ghost"
        size="sm"
        icon="lucide-sparkles"
        :aria-label="__('Draft with AI')"
        :tooltip="
          __(
            'Draft with AI. Anything you have typed is used as points to cover.',
          )
        "
        :loading="aiDrafting"
        @click="draftWithAi"
      />
    </div>
    <Textarea
      ref="textareaRef"
      v-model="content"
      type="textarea"
      class="min-h-8 w-full"
      :rows="rows"
      :placeholder="placeholder"
      @focus="rows = 6"
      @blur="rows = 1"
      @keydown.enter.stop="(e) => sendTextMessage(e)"
    />
  </div>
</template>

<script setup>
import IconPicker from '@/components/IconPicker.vue'
import SmileIcon from '@/components/Icons/SmileIcon.vue'
import { sanitizeHTML } from '@/utils'
import { useAiDraft } from '@/composables/aiDraft'
import { formatError } from '@/utils/formatError'
import { useTelemetry } from 'frappe-ui/frappe'
import {
  createResource,
  Textarea,
  FileUploader,
  Dropdown,
  toast,
} from 'frappe-ui'
import { ref, nextTick, watch } from 'vue'

const props = defineProps({
  doctype: { type: String, default: '' },
})

const doc = defineModel({ type: Object, default: () => ({}) })
const whatsapp = defineModel('whatsapp', { type: Object, default: () => ({}) })
const reply = defineModel('reply', { type: Object, default: () => ({}) })

const { capture } = useTelemetry()

const rows = ref(1)
const textareaRef = ref(null)
const emoji = ref('')

const content = ref('')
const placeholder = ref(__('Type your message here...'))
const fileType = ref('')

const {
  available: aiDraftAvailable,
  drafting: aiDrafting,
  draft,
} = useAiDraft(
  () => props.doctype,
  () => doc.value?.name,
  'whatsapp',
)

async function draftWithAi() {
  const result = await draft(content.value)
  if (!result) return
  content.value = result.text
  rows.value = 6
  nextTick(() => textareaRef.value?.el?.focus())
  capture('ai_draft_applied', { channel: 'whatsapp' })
}

function show() {
  nextTick(() => textareaRef.value.el.focus())
}

function uploadFile(file) {
  whatsapp.value.attach = file.file_url
  whatsapp.value.content_type = fileType.value
  sendWhatsAppMessage()
  capture('whatsapp_upload_file')
}

function sendTextMessage(event) {
  if (event.shiftKey) return
  sendWhatsAppMessage()
  textareaRef.value.el?.blur()
  content.value = ''
  capture('whatsapp_send_message')
}

async function sendWhatsAppMessage() {
  let args = {
    reference_doctype: props.doctype,
    reference_name: doc.value.name,
    message: content.value,
    to: doc.value.mobile_no,
    attach: whatsapp.value.attach || '',
    reply_to: reply.value?.name || '',
    content_type: whatsapp.value.content_type,
  }
  content.value = ''
  fileType.value = ''
  whatsapp.value.attach = ''
  whatsapp.value.content_type = 'text'
  reply.value = {}
  createResource({
    url: 'xbr_crm.api.whatsapp.create_whatsapp_message',
    params: args,
    auto: true,
    onSuccess: () => whatsapp.value.reload(),
    onError: (error) => {
      // The box is cleared optimistically above, before the request goes out,
      // so without this a failed send silently destroyed what the user typed —
      // an error toast over an empty composer.
      content.value = args.message
      whatsapp.value.attach = args.attach
      whatsapp.value.content_type = args.content_type
      toast.error(formatError(error, 'Failed to send WhatsApp message'))
    },
  })
}

function uploadOptions(openFileSelector) {
  return [
    {
      label: __('Upload Document'),
      icon: 'file',
      onClick: () => {
        fileType.value = 'document'
        openFileSelector()
      },
    },
    {
      label: __('Upload Image'),
      icon: 'image',
      onClick: () => {
        fileType.value = 'image'
        openFileSelector('image/*')
      },
    },
    {
      label: __('Upload Video'),
      icon: 'video',
      onClick: () => {
        fileType.value = 'video'
        openFileSelector('video/*')
      },
    },
  ]
}

watch(reply, (value) => {
  if (value?.message) {
    show()
  }
})

defineExpose({ show })
</script>
