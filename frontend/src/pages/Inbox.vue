<!-- eslint-disable vue/no-v-html -->
<template>
  <LayoutHeader>
    <template #left-header>
      <Breadcrumbs :items="[{ label: __('Inbox'), route: { name: 'Inbox' } }]" />
    </template>
  </LayoutHeader>

  <div class="crm-inbox" :class="{ 'is-thread-open': Boolean(selected) }">
    <!-- Conversations -->
    <aside class="crm-inbox-list" :aria-label="__('Conversations')">
      <div class="flex flex-col gap-2 border-b border-[var(--crm-border)] p-3">
        <TextInput
          v-model="search"
          type="text"
          :placeholder="__('Search name, company or message')"
          :debounce="300"
        >
          <template #prefix>
            <span class="lucide-search size-4 text-ink-gray-5" aria-hidden="true" />
          </template>
        </TextInput>
        <div class="flex flex-wrap items-center gap-1.5">
          <button
            v-for="f in filterChips"
            :key="f.value"
            type="button"
            class="crm-inbox-chip"
            :class="{ 'is-active': filter === f.value }"
            :aria-pressed="filter === f.value"
            @click="filter = f.value"
          >
            {{ f.label }}
          </button>
          <span class="mx-1 h-4 w-px bg-[var(--crm-border)]" aria-hidden="true" />
          <button
            v-for="c in channelChips"
            :key="c.value"
            type="button"
            class="crm-inbox-chip"
            :class="{ 'is-active': channel === c.value }"
            :aria-pressed="channel === c.value"
            @click="channel = c.value"
          >
            {{ c.label }}
          </button>
          <span class="mx-1 h-4 w-px bg-[var(--crm-border)]" aria-hidden="true" />
          <select
            v-model="stage"
            class="crm-inbox-chip crm-inbox-stage"
            :class="{ 'is-active': stage }"
            :aria-label="__('Stage')"
          >
            <option value="">{{ __('Any stage') }}</option>
            <option v-for="s in stageOptions" :key="s.name" :value="s.name">
              {{ __(s.name) }}
            </option>
          </select>
        </div>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto">
        <div v-if="threads.loading && !threadList.length" class="p-3">
          <SkeletonLoader type="list" />
        </div>
        <div
          v-else-if="!threadList.length"
          class="flex flex-col items-center gap-1.5 px-6 py-12 text-center"
        >
          <span class="lucide-inbox size-6 text-ink-gray-4" aria-hidden="true" />
          <p class="text-base font-medium text-ink-gray-8">
            {{ emptyTitle }}
          </p>
          <p class="text-sm text-ink-gray-5">
            {{
              __('Emails and WhatsApp messages on your pipelines show up here.')
            }}
          </p>
        </div>
        <button
          v-for="t in threadList"
          v-else
          :key="t.deal"
          type="button"
          class="crm-inbox-thread"
          :class="{ 'is-selected': selected === t.deal }"
          :aria-current="selected === t.deal ? 'true' : undefined"
          @click="open(t.deal)"
        >
          <div class="flex items-center gap-2">
            <span
              v-if="t.needs_reply"
              class="crm-inbox-dot"
              :title="__('Waiting for your reply')"
            />
            <span
              class="truncate text-base text-ink-gray-9"
              :class="t.needs_reply ? 'font-semibold' : 'font-medium'"
              >{{ t.title }}</span
            >
            <span class="ml-auto shrink-0 text-xs text-ink-gray-5">
              {{ shortTime(t.last_at) }}
            </span>
          </div>
          <div class="mt-0.5 flex items-center gap-1.5 text-sm text-ink-gray-5">
            <span
              :class="t.last_channel === 'whatsapp' ? 'lucide-message-circle' : 'lucide-mail'"
              class="size-3.5 shrink-0"
              :aria-label="t.last_channel === 'whatsapp' ? 'WhatsApp' : __('Email')"
            />
            <span class="truncate">
              {{ t.last_inbound ? '' : __('You') + ': ' }}{{ t.subject || t.snippet }}
            </span>
          </div>
          <p
            v-if="t.subject && t.snippet"
            class="mt-0.5 truncate text-sm text-ink-gray-5"
          >
            {{ t.snippet }}
          </p>
          <div class="mt-1.5 flex items-center gap-1.5">
            <StatusBadge :status="t.status" :label="__(t.status)" />
            <span
              v-if="t.ai_suggested_status && t.ai_suggested_status !== t.status"
              class="crm-inbox-ai"
              :title="__('AI suggests {0}', [__(t.ai_suggested_status)])"
            >
              <span class="lucide-sparkles size-3" aria-hidden="true" />
              {{ __('Suggestion') }}
            </span>
            <span
              v-if="t.unread"
              class="ml-auto rounded-full bg-[var(--crm-accent-primary)] px-1.5 text-xs font-semibold text-white"
              >{{ t.unread }}</span
            >
          </div>
        </button>
      </div>
    </aside>

    <!-- Thread -->
    <section class="crm-inbox-thread-pane" :aria-label="__('Conversation')">
      <div
        v-if="!selected"
        class="flex h-full flex-col items-center justify-center gap-1.5 text-center"
      >
        <span class="lucide-messages-square size-7 text-ink-gray-4" aria-hidden="true" />
        <p class="text-base font-medium text-ink-gray-8">
          {{ __('Select a conversation') }}
        </p>
        <p class="text-sm text-ink-gray-5">
          {{ __('Read the whole thread and reply by email or WhatsApp.') }}
        </p>
      </div>

      <template v-else-if="deal">
        <header class="crm-inbox-thread-head">
          <Button
            class="lg:!hidden"
            variant="ghost"
            icon="lucide-arrow-left"
            :aria-label="__('Back to conversations')"
            @click="selected = ''"
          />
          <div class="min-w-0 flex-1">
            <div class="truncate text-lg font-semibold text-ink-gray-9">
              {{ deal.title }}
            </div>
            <div class="flex flex-wrap items-center gap-x-2 text-sm text-ink-gray-5">
              <span
                v-for="(part, i) in contactLine"
                :key="part"
                >{{ i ? '· ' : '' }}{{ part }}</span
              >
            </div>
          </div>
          <StatusBadge
            class="max-sm:!hidden"
            :status="deal.status"
            :label="__(deal.status)"
          />
          <Button
            class="max-sm:!hidden"
            :label="__('Open pipeline')"
            icon-right="lucide-arrow-up-right"
            @click="openPipeline"
          />
          <Button
            class="sm:!hidden"
            icon="lucide-arrow-up-right"
            :aria-label="__('Open pipeline')"
            @click="openPipeline"
          />
        </header>

        <div class="px-5">
          <AiStageSuggestion
            :doc="deal"
            :statusLabel="(s) => __(s)"
            @accept="acceptSuggestion"
            @dismissed="reloadAll"
            @moved="reloadAll"
          />
        </div>

        <div ref="messagesEl" class="crm-inbox-messages">
          <div
            v-for="m in messages"
            :key="m.name"
            class="crm-inbox-msg"
            :class="m.inbound ? 'is-in' : 'is-out'"
          >
            <div class="flex items-center gap-1.5 text-xs text-ink-gray-5">
              <span
                :class="m.channel === 'whatsapp' ? 'lucide-message-circle' : 'lucide-mail'"
                class="size-3.5"
                aria-hidden="true"
              />
              <span class="font-medium text-ink-gray-7">{{
                m.inbound ? m.from_name : __('You')
              }}</span>
              <span>· {{ formatDate(m.at, 'D MMM, h:mm a') }}</span>
            </div>
            <div
              v-if="m.subject"
              class="mt-1 text-sm font-semibold text-ink-gray-9"
            >
              {{ m.subject }}
            </div>
            <div
              v-if="m.content"
              class="crm-inbox-msg-body"
              v-html="m.channel === 'email' ? sanitizeHTML(m.content) : textToHtml(m.content)"
            />
            <div v-if="m.attachments?.length" class="crm-inbox-attachments">
              <AttachmentItem
                v-for="a in m.attachments"
                :key="a.file_url"
                :label="a.file_name"
                :url="a.file_url"
              />
            </div>
          </div>
        </div>

        <footer class="crm-inbox-composer">
          <div class="flex items-center gap-1.5">
            <button
              v-for="c in replyChannels"
              :key="c.value"
              type="button"
              class="crm-inbox-chip"
              :class="{ 'is-active': replyChannel === c.value }"
              :disabled="c.disabled"
              :title="c.disabled ? c.why : ''"
              @click="replyChannel = c.value"
            >
              {{ c.label }}
            </button>
            <FileUploader
              class="ml-auto"
              :upload-args="{
                doctype: 'CRM Deal',
                docname: deal.name,
                private: replyChannel !== 'whatsapp',
              }"
              @success="(file) => attachments.push(file)"
            >
              <template #default="{ openFileSelector, uploading }">
                <Button
                  variant="ghost"
                  icon="lucide-paperclip"
                  :aria-label="__('Attach a file')"
                  :tooltip="__('Attach a file')"
                  :loading="uploading"
                  @click="openFileSelector()"
                />
              </template>
            </FileUploader>
            <Button
              v-if="aiDraftAvailable"
              variant="ghost"
              icon-left="lucide-sparkles"
              :label="__('Draft with AI')"
              :tooltip="__('Anything you have typed is used as points to cover.')"
              :loading="aiDrafting"
              @click="draftWithAi"
            />
          </div>
          <Textarea
            v-model="reply"
            :rows="4"
            :placeholder="
              replyChannel === 'whatsapp'
                ? __('Write a WhatsApp message…')
                : __('Write your reply…')
            "
          />
          <div v-if="attachments.length" class="crm-inbox-attachments">
            <AttachmentItem
              v-for="a in attachments"
              :key="a.name"
              :label="a.file_name"
              :url="a.file_url"
            >
              <template #suffix>
                <span
                  class="lucide-x size-3.5"
                  role="button"
                  :aria-label="__('Remove {0}', [a.file_name])"
                  @click.stop.prevent="removeAttachment(a)"
                />
              </template>
            </AttachmentItem>
          </div>
          <div class="flex items-center justify-between gap-2">
            <span class="truncate text-xs text-ink-gray-5">
              {{
                replyChannel === 'whatsapp'
                  ? __('Sends on WhatsApp to {0}', [deal.mobile_no])
                  : __('Sends by email to {0}', [deal.email])
              }}
            </span>
            <Button
              variant="solid"
              :label="__('Send')"
              :disabled="(!reply.trim() && !attachments.length) || !canSend"
              :loading="sending"
              @click="send"
            />
          </div>
        </footer>
      </template>
    </section>
  </div>
</template>

<script setup>
/**
 * Unified inbox (xbr_crm/api/inbox.py): every pipeline's email and WhatsApp
 * conversation in one place. The list puts conversations waiting on a reply
 * first in weight (bold, blue dot), the thread reads oldest to newest, and the
 * reply box sends on either channel, with an AI draft when AI is on.
 */
import LayoutHeader from '@/components/LayoutHeader.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import SkeletonLoader from '@/components/SkeletonLoader.vue'
import AiStageSuggestion from '@/components/AiStageSuggestion.vue'
import AttachmentItem from '@/components/AttachmentItem.vue'
import { useAiDraft } from '@/composables/aiDraft'
import { inboxFilters, needsReplyCount } from '@/composables/inbox'
import { whatsappEnabled } from '@/composables/whatsapp'
import { askFollowUp, isFollowUpStage } from '@/composables/followUp'
import { statusesStore } from '@/stores/statuses'
import { usersStore } from '@/stores/users'
import { formatDate, sanitizeHTML } from '@/utils'
import { formatError } from '@/utils/formatError'
import dayjs from 'dayjs'
import mime from 'mime'
import {
  Breadcrumbs,
  Button,
  FileUploader,
  TextInput,
  Textarea,
  call,
  createResource,
  toast,
  usePageMeta,
} from 'frappe-ui'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const router = useRouter()
const route = useRoute()
const { getDealStatus, dealStatuses } = statusesStore()
const { getUser } = usersStore()

usePageMeta(() => ({ title: __('Inbox') }))

// Shared with composables/inbox so they stay as set until changed by hand.
const { search, filter, channel, stage } = inboxFilters
const filterChips = [
  { value: 'all', label: __('All') },
  { value: 'needs_reply', label: __('Needs reply') },
  { value: 'mine', label: __('Mine') },
]
const channelChips = computed(() => [
  { value: '', label: __('Any channel') },
  { value: 'email', label: __('Email') },
  ...(whatsappEnabled.value ? [{ value: 'whatsapp', label: 'WhatsApp' }] : []),
])

const stageOptions = computed(() => dealStatuses?.data || [])
// A remembered stage that has since been renamed or removed would hide every
// conversation behind a blank dropdown; fall back to "Any stage".
watch(
  stageOptions,
  (options) => {
    if (stage.value && options.length && !options.some((s) => s.name === stage.value)) {
      stage.value = ''
    }
  },
  { immediate: true },
)

const threads = createResource({
  url: 'xbr_crm.api.inbox.get_threads',
  makeParams: () => ({
    search: search.value,
    channel: channel.value,
    status: stage.value,
    needs_reply: filter.value === 'needs_reply' ? 1 : 0,
    mine: filter.value === 'mine' ? 1 : 0,
    page_length: 200,
  }),
  auto: true,
})
const threadList = computed(() => threads.data?.threads || [])
watch([search, filter, channel, stage], () => threads.reload())

const emptyTitle = computed(() =>
  filter.value === 'needs_reply'
    ? __('Nothing waiting on a reply')
    : search.value
      ? __('No conversations match')
      : __('No conversations yet'),
)

function shortTime(at) {
  const d = dayjs(at)
  if (d.isSame(dayjs(), 'day')) return d.format('h:mm a')
  if (d.isSame(dayjs(), 'year')) return d.format('D MMM')
  return d.format('D MMM YYYY')
}

// ---- thread
const selected = ref(route.query.pipeline || '')
// Declared before the immediate `selected` watcher below, which clears them.
const reply = ref('')
const attachments = ref([])
const thread = createResource({
  url: 'xbr_crm.api.inbox.get_thread',
  makeParams: () => ({ deal: selected.value }),
  onSuccess: (data) => {
    // Only jump to the bottom for a new thread or a new message, not on the
    // background refresh while someone is reading further up.
    const key = `${data?.deal?.name}:${data?.messages?.length}`
    if (key !== lastSeen) scrollToEnd()
    lastSeen = key
    // Opening a thread marks its emails read.
    threads.reload()
    needsReplyCount.reload()
  },
})
let lastSeen = ''
const deal = computed(() => thread.data?.deal)
const messages = computed(() => thread.data?.messages || [])
// Person, email and phone under the title; the person only when the title is
// a company (an email pipeline is often titled by the person already).
const contactLine = computed(() => {
  const d = deal.value || {}
  return [d.lead_name !== d.title ? d.lead_name : '', d.email, d.mobile_no].filter(Boolean)
})
const messagesEl = ref(null)

function open(name) {
  selected.value = name
}

// The page is kept when only the query changes (router meta keepOnQueryChange),
// so a link to another conversation while the Inbox is open lands here.
watch(
  () => route.query.pipeline,
  (name) => {
    if ((name || '') !== selected.value) selected.value = name || ''
  },
)

watch(
  selected,
  (name) => {
    router.replace({ query: name ? { pipeline: name } : {} })
    reply.value = ''
    // Files picked for the previous thread were never sent; drop them.
    attachments.value.forEach(deleteFile)
    attachments.value = []
    if (name) thread.reload()
  },
  { immediate: true },
)

function scrollToEnd() {
  nextTick(() => {
    if (messagesEl.value) messagesEl.value.scrollTop = messagesEl.value.scrollHeight
  })
}

function openPipeline() {
  router.push({ name: 'Deal', params: { dealId: deal.value.name } })
}

function reloadAll() {
  thread.reload()
  threads.reload()
}

function textToHtml(text) {
  const escaped = (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return escaped.replace(/\n/g, '<br>')
}

// ---- AI suggestion: same rules as the pipeline page. A lost stage needs a
// reason, which the pipeline page asks for, so that move happens there.
async function acceptSuggestion(status) {
  if (getDealStatus(status)?.type === 'Lost') {
    toast.info(__('Add the lost reason on the pipeline page.'))
    router.push({ name: 'Deal', params: { dealId: deal.value.name } })
    return
  }
  const values = { status }
  if (isFollowUpStage(status)) {
    const followUp = await askFollowUp({})
    if (!followUp) return
    Object.assign(values, followUp)
  }
  try {
    await call('frappe.client.set_value', {
      doctype: 'CRM Deal',
      name: deal.value.name,
      fieldname: values,
    })
    reloadAll()
  } catch (error) {
    toast.error(formatError(error, __('Could not change the stage')))
  }
}

// ---- reply
const replyChannel = ref('email')
const sending = ref(false)

const replyChannels = computed(() => [
  {
    value: 'email',
    label: __('Email'),
    disabled: !deal.value?.email,
    why: __('This pipeline has no email address'),
  },
  ...(whatsappEnabled.value
    ? [
        {
          value: 'whatsapp',
          label: 'WhatsApp',
          disabled: !deal.value?.mobile_no,
          why: __('This pipeline has no mobile number'),
        },
      ]
    : []),
])

// Reply on the channel the customer last wrote on.
watch(messages, (list) => {
  const lastIn = [...list].reverse().find((m) => m.inbound)
  const wanted = lastIn?.channel === 'whatsapp' && whatsappEnabled.value ? 'whatsapp' : 'email'
  replyChannel.value = replyChannels.value.find((c) => c.value === wanted && !c.disabled)
    ? wanted
    : replyChannels.value.find((c) => !c.disabled)?.value || 'email'
})

const canSend = computed(
  () => !replyChannels.value.find((c) => c.value === replyChannel.value)?.disabled,
)

const replySubject = computed(() => {
  const last = [...messages.value].reverse().find((m) => m.subject)
  if (!last) return __('Re: {0}', [deal.value?.organization || deal.value?.lead_name || ''])
  return /^re:/i.test(last.subject) ? last.subject : `Re: ${last.subject}`
})

// Uploaded but unsent files are removed, not left on the pipeline.
function deleteFile(file) {
  call('frappe.client.delete', { doctype: 'File', name: file.name }).catch(() => {})
}

function removeAttachment(file) {
  attachments.value = attachments.value.filter((a) => a !== file)
  deleteFile(file)
}

function whatsappContentType(file) {
  const type = mime.getType(file.file_name || file.file_url) || ''
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('video/')) return 'video'
  return 'document'
}

// WhatsApp hands Meta a link to fetch the file, so it must be public. Files
// picked while Email was selected are uploaded private; switch them over.
async function publicUrl(file) {
  if (!file.is_private) return file.file_url
  const updated = await call('frappe.client.set_value', {
    doctype: 'File',
    name: file.name,
    fieldname: 'is_private',
    value: 0,
  })
  return updated.file_url
}

// One file per WhatsApp message; the text goes as the first file's caption.
async function sendWhatsApp() {
  const base = {
    reference_doctype: 'CRM Deal',
    reference_name: deal.value.name,
    to: deal.value.mobile_no,
    reply_to: '',
  }
  if (!attachments.value.length) {
    await call('xbr_crm.api.whatsapp.create_whatsapp_message', {
      ...base,
      message: reply.value,
      attach: '',
      content_type: 'text',
    })
    return
  }
  for (const [i, file] of [...attachments.value].entries()) {
    await call('xbr_crm.api.whatsapp.create_whatsapp_message', {
      ...base,
      message: i === 0 ? reply.value : '',
      attach: await publicUrl(file),
      content_type: whatsappContentType(file),
    })
    // Sent: a retry after a later failure must not send it again.
    attachments.value = attachments.value.filter((a) => a !== file)
    if (i === 0) reply.value = ''
  }
}

async function send() {
  sending.value = true
  try {
    if (replyChannel.value === 'whatsapp') {
      await sendWhatsApp()
    } else {
      const me = getUser()
      await call('frappe.core.doctype.communication.email.make', {
        recipients: deal.value.email,
        subject: replySubject.value,
        content: textToHtml(reply.value),
        attachments: attachments.value.map((a) => a.name),
        doctype: 'CRM Deal',
        name: deal.value.name,
        send_email: 1,
        sender: me.email,
        sender_full_name: me.full_name || undefined,
      })
    }
    reply.value = ''
    attachments.value = []
    reloadAll()
    needsReplyCount.reload()
  } catch (error) {
    toast.error(formatError(error, __('Could not send the message')))
  } finally {
    sending.value = false
  }
}

const {
  available: aiDraftAvailable,
  drafting: aiDrafting,
  draft,
} = useAiDraft(
  () => 'CRM Deal',
  () => selected.value,
  () => replyChannel.value,
)

async function draftWithAi() {
  const result = await draft(reply.value)
  if (result) reply.value = result.text
}

// New messages arrive while the page is open.
let poll = null
onMounted(() => {
  poll = setInterval(() => {
    threads.reload()
    if (selected.value) thread.reload()
  }, 60 * 1000)
})
onBeforeUnmount(() => clearInterval(poll))
</script>
