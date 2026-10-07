<template>
  <LayoutHeader>
    <template #left-header>
      <ViewBreadcrumbs v-model="viewControls" routeName="Notes" />
    </template>
    <template #right-header />
  </LayoutHeader>

  <!-- Flex column so the notes area claims the height left under the toolbar
       and the pager pins to the foot, instead of two cards floating above
       ~550px of empty page. -->
  <div class="flex h-full min-h-0 flex-col">
    <ViewControls
      ref="viewControls"
      v-model="notes"
      v-model:loadMore="loadMore"
      v-model:updatedPageCount="updatedPageCount"
      doctype="FCRM Note"
      :options="{
        hideColumnsButton: true,
        defaultViewName: __('Notes View'),
      }"
    />

    <div v-if="notes.data?.data?.length" class="min-h-0 flex-1 overflow-y-auto">
      <div
        class="grid grid-cols-1 items-start gap-3 px-3 pb-4 pt-3 sm:grid-cols-2 sm:px-5 lg:grid-cols-3 2xl:grid-cols-4"
      >
        <!-- A note is a record, not a sticky note. Neutral surface, shared card
             primitive, shared interactive state. There is deliberately no
             colour here: FCRM Note has only title, content and a reference —
             no category, tag or colour field — so any tint would be decoration
             claiming to be meaning. -->
        <div
          v-for="note in notes.data.data"
          :key="note.name"
          class="note-card crm-card crm-card--interactive group"
          role="button"
          tabindex="0"
          :aria-label="__('Open note {0}', [note.title || __('Untitled')])"
          @click="editNote(note.name)"
          @keydown.enter.prevent="editNote(note.name)"
          @keydown.space.prevent="editNote(note.name)"
        >
          <!-- title + menu -->
          <div class="flex items-start justify-between gap-2">
            <Tooltip :text="note.title || __('Untitled')">
              <h3 class="note-title">{{ note.title || __('Untitled') }}</h3>
            </Tooltip>
            <Dropdown
              :options="[
                {
                  label: __('Delete'),
                  icon: 'trash-2',
                  onClick: () => deleteNote(note.name),
                },
              ]"
            >
              <!-- A plain button, not frappe-ui's: reka's dropdown trigger
                   rewrites the element's attributes, so an `aria-label` passed
                   to <Button> never reaches the DOM and the control ends up
                   with no accessible name at all. The visually-hidden label
                   below survives, because it is content rather than an
                   attribute. -->
              <button
                type="button"
                class="note-menu shrink-0 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                :title="__('Note actions')"
                @click.stop
              >
                <FeatherIcon name="more-horizontal" class="size-4" />
                <span class="sr-only">{{ __('Note actions') }}</span>
              </button>
            </Dropdown>
          </div>

          <!-- Content preview, clamped to a whole number of lines. The previous
               treatment faded the text out with a mask, which ghosted the last
               line mid-word and read as a rendering fault; a line clamp ends on
               an ellipsis, so the truncation is obviously deliberate. Opening
               the note shows all of it. -->
          <TextEditor
            v-if="note.content"
            :content="note.content"
            :editable="false"
            editor-class="prose-sm max-w-none focus:outline-none"
            class="note-content"
          />
          <p v-else class="note-empty">{{ __('No content') }}</p>

          <!-- What this note is attached to. -->
          <button
            v-if="
              note.reference_docname &&
              (note.reference_doctype !== 'CRM Lead' || isLeadsEnabled())
            "
            class="note-ref"
            :title="__('Open {0}', [note.reference_docname])"
            @click.stop="openReference(note)"
          >
            <FeatherIcon :name="referenceIcon(note)" class="size-3 shrink-0" />
            <span class="truncate">{{ note.reference_docname }}</span>
          </button>

          <!-- footer -->
          <div class="note-footer">
            <div class="flex min-w-0 items-center gap-2">
              <UserAvatar :user="note.owner" size="xs" />
              <span class="truncate text-xs font-medium text-ink-gray-7">
                {{ getUser(note.owner).full_name }}
              </span>
            </div>
            <Tooltip :text="formatDate(note.modified)">
              <span class="shrink-0 text-xs text-ink-gray-5">
                {{ __(timeAgo(note.modified)) }}
              </span>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>

    <!-- Two different empty states: nothing written yet invites you to write
         one; filters matching nothing says so and offers to clear them. -->
    <EmptyState
      v-else
      class="min-h-0 flex-1"
      framed
      name="Notes"
      :icon="NoteIcon"
      :title="hasActiveFilters ? __('No notes match these filters') : ''"
      :description="
        hasActiveFilters
          ? __('Try changing or clearing the filters to see more notes.')
          : ''
      "
      :ctaLabel="hasActiveFilters ? __('Clear filters') : __('Create Note')"
      @ctaClick="hasActiveFilters ? clearFilters() : createNote()"
    />

    <ListPagination
      v-if="notes.data?.data?.length"
      :list="notes"
      :label="__('Notes')"
      card
      @pageChange="(page) => viewControls.goToPage(page)"
      @pageSizeChange="(size) => viewControls.setPageSize(size)"
    />
  </div>
</template>

<script setup>
import ViewBreadcrumbs from '@/components/ViewBreadcrumbs.vue'
import LayoutHeader from '@/components/LayoutHeader.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import NoteIcon from '@/components/Icons/NoteIcon.vue'
import ViewControls from '@/components/ViewControls.vue'
import { DEFAULT_PAGE_LENGTH } from '@/composables/pageLength'
import { useDoctypeModal } from '@/composables/doctypeModal'
import EmptyState from '@/components/ListViews/EmptyState.vue'
import { usersStore } from '@/stores/users'
import { useRouter } from 'vue-router'
import { isLeadsEnabled } from '@/utils/leads'
import { timeAgo, formatDate } from '@/utils'
import { useOnboarding, useTelemetry } from 'frappe-ui/frappe'
import { TextEditor, call, Dropdown, Tooltip, FeatherIcon } from 'frappe-ui'
import ListPagination from '@/components/ListViews/ListPagination.vue'
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { pageCreateAction } from '@/composables/pageActions'

const { getUser } = usersStore()
const router = useRouter()

// No per-note colour. FCRM Note stores only a title, content and an optional
// reference — there is no category, tag or colour field — so the rotating
// six-colour palette this replaced was keyed to the card's index in the array:
// the same note changed colour when another was added before it, and the hue
// said nothing about the note. Colour is reserved for things that mean
// something (utils/statusTheme); a note is a neutral surface.
const { updateOnboardingStep } = useOnboarding('frappecrm')
const { capture } = useTelemetry()

const { showModal } = useDoctypeModal()

const notes = ref({})
const loadMore = ref(1)
const updatedPageCount = ref(DEFAULT_PAGE_LENGTH)
const viewControls = ref(null)

watch(
  () => notes.value?.data?.page_length_count,
  (val, old_value) => {
    openNoteFromURL()
    if (!val || val === old_value) return
    updatedPageCount.value = val
  },
)

const noteCallbacks = {
  afterInsert: () => {
    notes.value.reload()
    updateOnboardingStep('create_first_note')
    capture('note_created')
  },
  afterUpdate: () => {
    notes.value.reload()
    capture('note_updated')
  },
}

// Any user-applied filter, so the empty state can tell "nothing written yet"
// apart from "your filters matched nothing".
const hasActiveFilters = computed(
  () => Object.keys(notes.value?.params?.filters || {}).length > 0,
)

function clearFilters() {
  if (!viewControls.value) return
  viewControls.value.updateFilter({})
}

function createNote() {
  showModal({
    doctype: 'FCRM Note',
    title: 'Note',
    callbacks: noteCallbacks,
  })
}

// Wire the header's +Create button to this page's create flow.
onMounted(() => (pageCreateAction.value = createNote))
onBeforeUnmount(() => (pageCreateAction.value = null))

function editNote(noteName) {
  showModal({
    name: noteName,
    doctype: 'FCRM Note',
    title: 'Note',
    callbacks: noteCallbacks,
  })
}

function referenceIcon(note) {
  return note.reference_doctype === 'CRM Deal' ? 'zap' : 'user'
}

// Route names and params match router.js; unknown doctypes are simply not
// rendered as a chip, so this only ever gets Lead or Deal.
function openReference(note) {
  const target =
    note.reference_doctype === 'CRM Deal'
      ? { name: 'Deal', params: { dealId: note.reference_docname } }
      : { name: 'Lead', params: { leadId: note.reference_docname } }
  router.push(target)
}

async function deleteNote(name) {
  await call('frappe.client.delete', {
    doctype: 'FCRM Note',
    name,
  })
  notes.value.reload()
}

const openNoteFromURL = () => {
  const searchParams = new URLSearchParams(window.location.search)
  const noteName = searchParams.get('open')

  if (noteName && notes.value?.data?.data) {
    const foundNote = notes.value.data.data.find(
      (note) => note.name === noteName,
    )
    if (foundNote) {
      editNote(foundNote.name)
    }
    // Drop only `open`. Replacing with the bare pathname discarded the whole
    // query string — including `view`, which selects the saved view.
    searchParams.delete('open')
    const rest = searchParams.toString()
    window.history.replaceState(
      null,
      '',
      window.location.pathname + (rest ? `?${rest}` : ''),
    )
  }
}
</script>

<style scoped>
/* A note card is a content card: neutral surface, shared border and radius
   from `.crm-card`, shared hover/focus from `.crm-card--interactive`. The
   tinted "sticky note" treatment it replaces carried a fixed 224px height, a
   16px radius outside the global scale, and a colour chosen by array index. */
.note-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
  /* ONE height for every card. The min/max pair this replaces let each card
     size to its own content, so a note carrying a heading and a list rendered
     207px beside two 148px neighbours and the board looked accidental. A board
     of previews is a grid; the preview is a fixed window onto the note and the
     note itself is one click away. */
  height: 196px;
  overflow: hidden;
}

.note-menu {
  display: inline-grid;
  place-items: center;
  width: 26px;
  height: 26px;
  margin: -2px -4px 0 0;
  border-radius: var(--crm-radius-xs);
  color: var(--crm-text-3);
  transition:
    background-color 0.15s var(--crm-ease),
    color 0.15s var(--crm-ease);
}
.note-menu:hover {
  background: var(--crm-surface-2);
  color: var(--crm-text);
}
.note-menu:focus-visible {
  outline: 2px solid var(--crm-accent-primary);
  outline-offset: 1px;
}

.note-title {
  font-size: var(--text-section-title);
  font-weight: var(--weight-semibold);
  line-height: 1.35;
  color: var(--crm-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

/* Body: clamped to whole lines, ending on an ellipsis. Never a fade — a mask
   that dissolves the last line mid-word reads as a rendering fault, not as
   deliberate truncation. */
.note-content {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
  font-size: var(--text-body);
  line-height: 1.5;
  color: var(--crm-text-2);
}
/* The preview ends in a fade, not a line clamp.

   `-webkit-line-clamp` was the obvious tool and it does not work here: the
   preview is a flex item of the card, so Chrome blockifies its
   `display: -webkit-box` to `flow-root` and the clamp becomes inert — even
   with !important, and even when moved onto the wrapper. (That is why a long
   note used to grow its card: the clamp was declared but never applied.)

   The card now has one fixed height and clips, and the last visible line
   dissolves into the card surface rather than being chopped mid-stroke, so the
   truncation reads as deliberate. Opening the note shows all of it. */
.note-content::after {
  content: '';
  position: absolute;
  inset: auto 0 0 0;
  height: 24px;
  background: linear-gradient(to bottom, transparent, var(--crm-surface));
  pointer-events: none;
}
.note-content :deep(.ProseMirror) {
  padding: 0;
  border: 0;
  background: transparent;
  font-size: var(--text-body);
  line-height: 1.5;
  color: var(--crm-text-2);
}
/* The editor renders block children; keep their spacing tight so four clamped
   lines are four lines of text rather than four paragraphs of margin. */
.note-content :deep(.ProseMirror > *) {
  margin: 0;
}
.note-content :deep(.ProseMirror > * + *) {
  margin-top: 4px;
}
/* A preview is not the document. `prose-sm` sizes headings and lists relative
   to the note's own typography, so a note whose first line is an <h1> rendered
   at document scale inside a 148px card — two notes of similar length ended up
   with wildly different visual weight, which is the "cards look inconsistent"
   problem this page was redesigned to solve.
   Flatten the block scale to the card's own; opening the note still shows the
   real formatting, and inline emphasis (bold, italic, links) survives here. */
.note-content :deep(h1),
.note-content :deep(h2),
.note-content :deep(h3),
.note-content :deep(h4),
.note-content :deep(h5),
.note-content :deep(h6) {
  font-size: var(--text-body);
  font-weight: var(--weight-semibold);
  line-height: 1.5;
  color: var(--crm-text);
}
.note-content :deep(p),
.note-content :deep(li),
.note-content :deep(blockquote) {
  font-size: var(--text-body);
  line-height: 1.5;
}
/* Enough indent to read as a list, not enough to eat a card's width. */
.note-content :deep(ul),
.note-content :deep(ol) {
  padding-left: 1.2em;
}
.note-content :deep(blockquote) {
  padding-left: var(--space-3);
  border-left: 2px solid var(--crm-border);
}

.note-empty {
  flex: 1 1 auto;
  font-size: var(--text-body);
  font-style: italic;
  color: var(--crm-text-4);
}

/* Reference chip — neutral. The icon plus the record id already distinguish a
   lead from a deal, so colour is not carrying that meaning alone. */
.note-ref {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  align-self: flex-start;
  max-width: 100%;
  padding: 2px 8px;
  border-radius: var(--crm-radius-xs);
  border: 1px solid var(--crm-border);
  background: var(--crm-surface-2);
  font-size: var(--text-caption);
  font-weight: 500;
  color: var(--crm-text-3);
  transition:
    color 0.15s var(--crm-ease),
    border-color 0.15s var(--crm-ease);
}
.note-ref:hover {
  border-color: var(--crm-accent-primary);
  color: var(--crm-accent-primary);
}
.note-ref:focus-visible {
  outline: 2px solid var(--crm-accent-primary);
  outline-offset: 1px;
}

.note-footer {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--crm-border);
}
</style>
