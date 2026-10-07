<template>
  <CrmDialog
    v-model:open="show"
    size="xl"
    :icon="editMode ? 'edit-3' : 'plus'"
    :title="
      editMode
        ? __('Edit ' + (doctypeTitle || doctype))
        : __('Create ' + (doctypeTitle || doctype))
    "
    :body-class="['crm-doc-modal', composerClass]"
  >
    <template #header-actions>
      <CustomActions
        v-if="document.actions?.length"
        :actions="document.actions"
        :close="() => (show = false)"
      />
      <Button
        v-if="isManager() && !isMobileView"
        variant="ghost"
        :tooltip="__('Edit Fields Layout')"
        :icon="EditIcon"
        @click="openQuickEntryModal"
      />
    </template>

    <FieldLayout
      v-if="layout.data"
      :tabs="layout.data"
      :data="doc"
      :doctype="doctype"
      :docname="docname"
    />
    <ErrorMessage v-if="error" class="mt-4" :message="__(error)" />

    <template #footer>
      <Button variant="ghost" :label="__('Cancel')" @click="show = false" />
      <Button
        variant="solid"
        :label="editMode ? __('Update') : __('Create')"
        :loading="editMode ? document.save.loading : create.loading"
        @click="editMode ? update() : create()"
      />
    </template>
  </CrmDialog>
</template>

<script setup>
import CrmDialog from '@/components/Modals/CrmDialog.vue'
import EditIcon from '@/components/Icons/EditIcon.vue'
import FieldLayout from '@/components/FieldLayout/FieldLayout.vue'
import CustomActions from '@/components/CustomActions.vue'
import { useDocument } from '@/data/document'
import { globalStore } from '@/stores/global'
import { usersStore } from '@/stores/users'
import {
  showQuickEntryModal,
  quickEntryProps,
  composerClassFor,
} from '@/composables/modals'
import { isMobileView } from '@/composables/settings'
import { setupCustomizations } from '@/utils'
import { call, createResource, toast } from 'frappe-ui'
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const props = defineProps({
  doctypeTitle: { type: String, default: '' },
  doctype: { type: String, default: '' },
  docname: { type: String, default: '' },
  defaults: { type: Object, default: () => ({}) },
})

const show = defineModel({ type: Boolean })

const composerClass = computed(() => composerClassFor(props.doctype))

const emit = defineEmits(['afterInsert', 'afterUpdate'])

const router = useRouter()

const { isManager } = usersStore()
const { $dialog, $socket } = globalStore()

const { document, scripts, triggerOnRender, triggerOnBeforeCreate } =
  useDocument(props.doctype, props.docname || null)

const doc = computed(() => document.doc || {})

const layout = createResource({
  url: 'xbr_crm.fcrm.doctype.crm_fields_layout.crm_fields_layout.get_fields_layout',
  cache: ['Quick Entry', props.doctype],
  params: { doctype: props.doctype, type: 'Quick Entry' },
  auto: true,
})

const error = ref(null)
const editMode = computed(() => Boolean(document.doc?.name))

const _create = createResource({
  url: 'frappe.client.insert',
  onSuccess: (d) => {
    document.doc = {}
    emit('afterInsert', d)
    show.value = false
  },
  onError: (err) => {
    if (err.exc_type == 'MandatoryError') {
      const fieldName = err.messages
        .map((msg) => {
          let arr = msg.split(': ')
          return arr[arr.length - 1].trim()
        })
        .join(', ')
      error.value = __('Mandatory field error: {0}', [fieldName])
      return
    }
    error.value = err.messages?.[0] || 'Could not create document'
  },
})

async function create() {
  await triggerOnBeforeCreate?.()

  _create.submit({
    doc: {
      doctype: props.doctype,
      ...document.doc,
    },
  })
}

function update() {
  document.save.submit(null, {
    onSuccess: (d) => {
      emit('afterUpdate', d)
      show.value = false
    },
    onError: (err) => {
      error.value = err.messages?.[0] || 'Could not update document'
    },
  })
}

function openQuickEntryModal() {
  showQuickEntryModal.value = true
  quickEntryProps.value = { doctype: props.doctype }
  nextTick(() => (show.value = false))
}

watch(
  () => document.doc,
  async (_doc) => {
    if (scripts.data?.length) {
      setupCustomizations(scripts.data, {
        doc: _doc,
        $dialog,
        $socket,
        router,
        toast,
        call,
      })
    }
  },
  { once: true },
)

onMounted(async () => {
  document.doc = {
    ...document.doc,
    ...props.defaults,
  }
  await triggerOnRender()
})
</script>
