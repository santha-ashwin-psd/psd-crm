<template>
  <div v-if="attachments.length" class="grid grid-cols-1 md:grid-cols-2 gap-4">
    <div
      v-for="attachment in attachments"
      :key="attachment.name"
      class="activity bg-[var(--crm-surface)] border border-[var(--crm-border)] border-l-4 border-l-orange-500 hover:border-orange-400 hover:shadow-md transition-all duration-200 rounded-2xl p-4 shadow-sm flex justify-between items-center gap-2 cursor-pointer"
      @click="openFile(attachment)"
    >
      <div class="flex gap-3 truncate">
        <div
          class="size-12 bg-[var(--crm-surface-2)] border border-[var(--crm-border)] rounded-xl overflow-hidden flex-shrink-0 flex justify-center items-center"
        >
          <img
            v-if="isImage(attachment.file_type)"
            class="size-full object-cover"
            :src="attachment.file_url"
            :alt="attachment.file_name"
          />
          <component
            :is="fileIcon(attachment.file_type)"
            v-else
            class="size-5 text-[var(--crm-text-3)]"
          />
        </div>
        <div class="flex flex-col justify-center gap-0.5 truncate">
          <div class="text-base font-medium text-[var(--crm-text)] truncate">
            {{ attachment.file_name }}
          </div>
          <div class="text-xs text-[var(--crm-text-4)]">
            {{ convertSize(attachment.file_size) }}
          </div>
        </div>
      </div>
      <div class="flex flex-col items-end gap-1.5 flex-shrink-0">
        <TimelineTimestamp :date="attachment.creation" class="text-xs text-[var(--crm-text-4)]" />
        <div class="flex gap-1.5">
          <Button
            :tooltip="
              attachment.is_private ? __('Make Public') : __('Make Private')
            "
            class="!h-6 !w-6 hover:bg-[var(--crm-surface-2)]"
            variant="ghost"
            @click.stop="
              togglePrivate(attachment.name, attachment.is_private)
            "
          >
            <template #icon>
              <FeatherIcon
                :name="attachment.is_private ? 'lock' : 'unlock'"
                class="size-3.5 text-[var(--crm-text-3)]"
              />
            </template>
          </Button>
          <Button
            :tooltip="__('Delete Attachment')"
            class="!h-6 !w-6 hover:bg-red-50 text-red-600"
            variant="ghost"
            @click.stop="() => deleteAttachment(attachment.name)"
          >
            <template #icon>
              <span
                class="lucide-trash-2 size-3.5 text-red-500"
                aria-hidden="true"
              />
            </template>
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup>
import FileAudioIcon from '@/components/Icons/FileAudioIcon.vue'
import FileTextIcon from '@/components/Icons/FileTextIcon.vue'
import FileVideoIcon from '@/components/Icons/FileVideoIcon.vue'
import { globalStore } from '@/stores/global'
import { call, toast } from 'frappe-ui'
import TimelineTimestamp from '@/components/Activities/TimelineTimestamp.vue'
import { convertSize, isImage } from '@/utils'
import { formatError } from '@/utils/formatError'

defineProps({
  attachments: { type: Array, default: () => [] },
})

const emit = defineEmits(['reload'])

const { $dialog } = globalStore()

function openFile(attachment) {
  window.open(attachment.file_url, '_blank')
}

function togglePrivate(fileName, isPrivate) {
  let changeTo = isPrivate ? __('public') : __('private')
  let title = __('Make attachment {0}', [changeTo])
  let message = __('Are you sure you want to make this attachment {0}?', [
    changeTo,
  ])
  $dialog({
    title,
    message,
    actions: [
      {
        label: __('Make {0}', [changeTo]),
        variant: 'solid',
        onClick: async (close) => {
          // Unguarded before: a refused change rejected into nothing, the
          // dialog stayed open because close() was never reached, and the
          // user was told neither what failed nor why.
          try {
            await call('frappe.client.set_value', {
              doctype: 'File',
              name: fileName,
              fieldname: {
                is_private: !isPrivate,
              },
            })
            emit('reload')
            close()
          } catch (e) {
            toast.error(formatError(e, 'Could not change the attachment'))
          }
        },
      },
    ],
  })
}

function deleteAttachment(fileName) {
  $dialog({
    title: __('Delete Attachment'),
    message: __('Are you sure you want to delete this attachment?'),
    actions: [
      {
        label: __('Delete'),
        variant: 'solid',
        theme: 'red',
        onClick: async (close) => {
          try {
            await call('frappe.client.delete', {
              doctype: 'File',
              name: fileName,
            })
            emit('reload')
            close()
          } catch (e) {
            toast.error(formatError(e, 'Could not delete the attachment'))
          }
        },
      },
    ],
  })
}

function fileIcon(type) {
  if (!type) return FileTextIcon
  let audioExtentions = ['wav', 'mp3', 'ogg', 'flac', 'aac']
  let videoExtentions = ['mp4', 'avi', 'mkv', 'flv', 'mov']
  if (audioExtentions.includes(type.toLowerCase())) {
    return FileAudioIcon
  } else if (videoExtentions.includes(type.toLowerCase())) {
    return FileVideoIcon
  }
  return FileTextIcon
}
</script>
