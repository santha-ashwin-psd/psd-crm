<template>
  <div
    class="activity group flex h-48 cursor-pointer flex-col justify-between gap-2 bg-[var(--crm-surface)] border border-[var(--crm-border)] border-l-4 border-l-amber-500 hover:border-amber-400 hover:shadow-md transition-all duration-200 rounded-2xl p-4 shadow-sm"
  >
    <div class="flex items-start justify-between gap-2">
      <div class="flex min-w-0 items-start gap-2.5">
        <span class="note-chip">
          <NoteIcon class="h-4 w-4" />
        </span>
        <div class="min-w-0">
          <div class="truncate text-lg-medium text-ink-gray-8">
            {{ note.title }}
          </div>
          <span class="note-badge">{{ __('Note') }}</span>
        </div>
      </div>
      <Dropdown
        :options="[
          {
            label: __('Delete'),
            icon: 'trash-2',
            onClick: () => deleteNote(note.name),
          },
        ]"
        class="h-6 w-6"
        @click.stop
      >
        <Button
          icon="lucide-more-horizontal"
          variant="ghost"
          class="!h-6 !w-6 hover:bg-surface-gray-2"
          @click.stop.prevent
        />
      </Dropdown>
    </div>
    <TextEditor
      v-if="note.content"
      :content="note.content"
      :editable="false"
      editor-class="prose-sm text-p-sm max-w-none text-ink-gray-5 focus:outline-none"
      class="flex-1 overflow-hidden"
    />
    <div class="mt-1 flex items-center justify-between gap-2">
      <div class="flex items-center gap-2 truncate">
        <UserAvatar :user="note.owner" size="xs" />
        <div
          class="truncate text-sm text-ink-gray-8"
          :title="getUser(note.owner).full_name"
        >
          {{ getUser(note.owner).full_name }}
        </div>
      </div>
      <div class="flex shrink-0 items-center gap-1.5 text-ink-gray-7">
        <FeatherIcon name="clock" class="h-3.5 w-3.5" />
        <TimelineTimestamp
          :date="note.modified"
          class-name="truncate text-sm text-ink-gray-7"
        />
      </div>
    </div>
  </div>
</template>
<script setup>
import UserAvatar from '@/components/UserAvatar.vue'
import NoteIcon from '@/components/Icons/NoteIcon.vue'
import TimelineTimestamp from '@/components/Activities/TimelineTimestamp.vue'
import { Dropdown, FeatherIcon, TextEditor, call, toast } from 'frappe-ui'
import { usersStore } from '@/stores/users'

defineProps({
  note: { type: Object, default: () => ({}) },
})

const notes = defineModel({ type: Object })

const { getUser } = usersStore()

async function deleteNote(name) {
  await toast.promise(
    call('frappe.client.delete', {
      doctype: 'FCRM Note',
      name,
    }),
    {
      loading: __('Deleting note...'),
      success: __('Note deleted'),
      error: __('Failed to delete note'),
    },
  )
  notes.value?.reload()
}
</script>

<style scoped>
/* Amber chip + badge, keyed to the card's existing amber left stripe. Both
   read from the warning token pair, so dark mode follows automatically. */
.note-chip {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  border-radius: var(--crm-radius-sm);
  background: var(--crm-warning-soft);
  color: var(--crm-warning);
}
.note-badge {
  display: inline-block;
  margin-top: 3px;
  padding: 2px 8px;
  border-radius: var(--crm-radius-sm);
  background: var(--crm-warning-soft);
  color: var(--crm-warning);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
}
</style>
