<template>
  <!-- Only the layout action lives up here. Save moved to a sticky bar at the
       bottom: on a form this long it scrolled out of sight exactly when you
       needed it, and a permanently disabled button is noise the rest of the
       time. The bar appears only when there is something to save. -->
  <div class="mb-3 mt-4 flex items-center justify-end text-lg-medium sm:mt-5">
    <Button
      v-if="isManager() && !isMobileView"
      :label="__('Edit Fields')"
      :tooltip="__('Edit Fields Layout')"
      :iconLeft="EditIcon"
      @click="showDataFieldsModal = true"
    />
  </div>
  <div
    v-if="document.get.loading"
    class="flex flex-1 flex-col items-center justify-center gap-3 text-2xl-medium text-ink-gray-6"
  >
    <LoadingIndicator class="h-6 w-6" />
    <span>{{ __('Loading...') }}</span>
  </div>
  <div v-else class="crm-data-fields pb-8">
    <FieldLayout
      v-if="tabs.data"
      :tabs="tabs.data"
      :data="document.doc"
      :doctype="doctype"
    />
    <div v-if="document.isDirty" class="crm-data-savebar">
      <Badge :label="__('Not Saved')" theme="orange" />
      <Button
        label="Save"
        variant="solid"
        :loading="document.save.loading"
        @click="saveChanges"
      />
    </div>
  </div>
  <DataFieldsModal
    v-if="showDataFieldsModal"
    v-model="showDataFieldsModal"
    :doctype="doctype"
    @reload="
      () => {
        tabs.reload()
        document.reload()
      }
    "
  />
</template>

<script setup>
import EditIcon from '@/components/Icons/EditIcon.vue'
import DataFieldsModal from '@/components/Modals/DataFieldsModal.vue'
import FieldLayout from '@/components/FieldLayout/FieldLayout.vue'
import { Badge, createResource } from 'frappe-ui'
import LoadingIndicator from '@/components/Icons/LoadingIndicator.vue'
import { usersStore } from '@/stores/users'
import { useDocument } from '@/data/document'
import { isMobileView } from '@/composables/settings'
import { ref, watch, getCurrentInstance } from 'vue'

const props = defineProps({
  doctype: { type: String, required: true },
  docname: { type: String, required: true },
})

const emit = defineEmits(['beforeSave', 'afterSave'])

const { isManager } = usersStore()

const instance = getCurrentInstance()
const attrs = instance?.vnode?.props ?? {}

const showDataFieldsModal = ref(false)

const { document } = useDocument(props.doctype, props.docname)

const tabs = createResource({
  url: 'crm.fcrm.doctype.crm_fields_layout.crm_fields_layout.get_fields_layout',
  cache: ['DataFields', props.doctype],
  params: { doctype: props.doctype, type: 'Data Fields' },
  auto: true,
})

function saveChanges() {
  if (!document.isDirty) return

  const updatedDoc = { ...document.doc }
  const oldDoc = { ...document.originalDoc }

  const changes = Object.keys(updatedDoc).reduce((acc, key) => {
    if (JSON.stringify(updatedDoc[key]) !== JSON.stringify(oldDoc[key])) {
      acc[key] = updatedDoc[key]
    }
    return acc
  }, {})

  const hasListener = attrs['onBeforeSave'] !== undefined

  if (hasListener) {
    emit('beforeSave', changes)
  } else {
    document.save.submit(null, {
      onSuccess: () => emit('afterSave', changes),
    })
  }
}

watch(
  () => document.doc,
  (newValue, oldValue) => {
    if (!oldValue) return
    if (newValue && oldValue) {
      const isDirty =
        JSON.stringify(newValue) !== JSON.stringify(document.originalDoc)
      document.isDirty = isDirty
      if (isDirty) {
        document.save.loading = false
      }
    }
  },
  { deep: true },
)
</script>

<style scoped>
/* Data-tab polish (scoped to this tab only): cleaner inputs (surface + light
   border instead of heavy gray fills), accent section headers matching the
   side panel, and a touch tighter density. */

/* Inputs, textareas and every value picker.
   `[data-slot='trigger']` covers frappe-ui Select/Combobox and (since it
   carries the same marker) our Link/Autocomplete. A `select` selector would
   match nothing — none of these render a native <select>. */
.crm-data-fields :deep(input:not([type='checkbox'])),
.crm-data-fields :deep(textarea),
.crm-data-fields :deep([data-slot='trigger']) {
  background-color: var(--crm-surface) !important;
  border-color: var(--crm-border) !important;
  border-radius: var(--crm-radius-sm) !important;
}
.crm-data-fields :deep(input:not([type='checkbox']):hover),
.crm-data-fields :deep(textarea:hover),
.crm-data-fields :deep([data-slot='trigger']:hover) {
  border-color: var(--crm-border-strong) !important;
  background-color: var(--crm-surface) !important;
}
.crm-data-fields :deep(input:not([type='checkbox']):focus),
.crm-data-fields :deep(textarea:focus),
.crm-data-fields :deep([data-slot='trigger']:focus),
.crm-data-fields :deep([data-slot='trigger'][data-state='open']) {
  border-color: var(--crm-accent-primary) !important;
  box-shadow: 0 0 0 1px var(--crm-accent-primary) !important;
}

/* Section headers — accent chevron + tighter tracking, like the side panel */
.crm-data-fields :deep(.section-header [class*='lucide-chevron']) {
  color: var(--crm-accent-primary);
  opacity: 0.9;
}
.crm-data-fields :deep(.section-header .text-ink-gray-9) {
  letter-spacing: -0.01em;
}

/* Density — tighten the gap between sections */
.crm-data-fields :deep(.section.border-t) {
  margin-top: 1rem;
  padding-top: 1rem;
}

/* ---- Row alignment -------------------------------------------------------
   Each column is an independent flex stack, so fields only line up across
   columns while every field is the same height. A standard field is 51px on a
   67px pitch (51 + 16 gap), but a textarea is 85px — 1.27 rows. That knocked
   everything below it out of phase: on this lead, `industry` sat at 602 while
   its neighbours' third row was at 568, and the section read as ragged.

   Putting each column on a fixed row grid makes the columns agree by
   construction: every field occupies one 51px row, and the fields that
   genuinely need more space claim a whole number of rows instead of a
   fraction. Column assignment is untouched — this is alignment only, not a
   reflow, so a layout authored in Edit Fields still renders as authored. */
/* ONE grid for the whole section, not three independent stacks.

   Three stacks could never agree: each sized its own rows, so a tall field in
   one column pushed everything below it out of phase with its neighbours, and
   an uneven field count left a large void under the shorter columns (4 / 2 / 3
   on a stock lead layout). Flattening the columns with `display: contents`
   hands every field to a single grid, so rows share a height by construction,
   fields fill evenly left-to-right, and there is nothing left to drift.

   Rows are minmax(51px, auto): 51px is a standard field, and a row holding a
   textarea grows rather than clipping it — a flat height cut Company
   Description off at ~900px, where the narrower column wraps its label onto a
   second line. */
.crm-data-fields :deep(.columns) {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-auto-rows: minmax(51px, auto);
  gap: 16px;
  align-items: start;
}
.crm-data-fields :deep(.column) {
  display: contents;
}
/* A child table is not a field-sized thing. In one 239px cell the Products
   grid had its columns (No. / Product / Rate / …) crushed, and Add Row sat
   under a table a third of the row wide, reading as two unrelated controls.
   It claims the full row instead — the width its own header already assumes.

   Matched on `.grid-header`, not on `table`: the Grid control builds its
   header and rows out of divs, so there is no table element to select. */
.crm-data-fields :deep(.field:has(.grid-header)) {
  grid-column: 1 / -1;
}
/* The Grid control was the one thing in this tab still wearing frappe-ui's
   own palette: an #EDEDED outline against the --crm-border every input beside
   it uses, and an #F3F3F3 header against the --crm-list-header-bg every other
   table in the app uses. Same tokens as the inputs above, so the table reads
   as part of the form rather than something dropped into it.
   (Add Row needs nothing — it already measures identically to the tab's other
   subtle buttons: 28px, 8px radius, same fill.) */
.crm-data-fields :deep(.field:has(.grid-header) .grid-header) {
  background: var(--crm-list-header-bg);
  border-bottom: 1px solid var(--crm-border);
}
.crm-data-fields :deep(.field .grid-header) ~ *,
.crm-data-fields :deep(.field .grid-row),
.crm-data-fields :deep(.field .grid-row-checkbox) {
  border-color: var(--crm-border);
}
.crm-data-fields :deep(.field:has(.grid-header) > div > div:first-child) {
  border-color: var(--crm-border);
}
@media (max-width: 1100px) {
  .crm-data-fields :deep(.columns) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 700px) {
  .crm-data-fields :deep(.columns) {
    grid-template-columns: minmax(0, 1fr);
  }
}

/* Section headings — "Details", "Person". At 15px/420 beside a hairline they
   were quieter than the field labels underneath them; matched to the side
   panel's section headers so the two read as one product. */
.crm-data-fields :deep(.section-header > div:first-child) {
  font-size: var(--text-section-title);
  font-weight: var(--weight-semibold);
  color: var(--crm-text);
}
/* Section.vue puts `mt-6` on the Column to clear the heading, and
   `display: contents` drops that margin along with the box it was on. The gap
   has to come from the heading instead, or "Details" sits on top of the first
   row of labels. */
.crm-data-fields :deep(.section-header) {
  margin-bottom: var(--space-4);
}

/* Sticky save bar — pinned to the bottom of the scrolling tab panel. */
.crm-data-savebar {
  position: sticky;
  bottom: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-4);
  margin-top: var(--space-6);
  padding: var(--space-4) 0;
  background: var(--crm-surface);
  border-top: 1px solid var(--crm-border);
}

/* ---- Labels --------------------------------------------------------------
   Matched to SidePanelLayout: this tab and the panel beside it show the same
   field names, and at 420-weight grey they read as two different products. */
.crm-data-fields :deep(.field > div:first-child) {
  font-weight: var(--weight-semibold);
  color: var(--crm-text-2);
}
</style>
