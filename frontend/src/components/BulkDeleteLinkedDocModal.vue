<template>
  <CrmDialog
    v-model:open="show"
    size="sm"
    icon="lucide-trash-2"
    theme="red"
    :title="__('Delete')"
  >
    <!-- Second step: spell out that linked documents are affected too. -->
    <div v-if="confirmDeleteInfo.show" class="text-p-base text-ink-gray-7">
      {{
        confirmDeleteInfo.delete
          ? __(
              'This will delete selected items and items linked to it, are you sure?',
            )
          : __(
              'This will delete selected items and unlink linked items to it, are you sure?',
            )
      }}
    </div>

    <!-- First step: how many, and which way. -->
    <div v-else class="text-p-base text-ink-gray-7">
      {{ __('Are you sure you want to delete {0} items?', [props.items?.length]) }}
    </div>

    <template #footer>
      <template v-if="confirmDeleteInfo.show">
        <Button
          :label="__('Cancel')"
          variant="subtle"
          @click="confirmDeleteInfo.show = false"
        />
        <Button
          :label="confirmDeleteInfo.delete ? __('Delete') : __('Unlink & Delete')"
          :icon-left="confirmDeleteInfo.delete ? 'trash-2' : 'unlock'"
          variant="solid"
          theme="red"
          @click="deleteDocs()"
        />
      </template>
      <template v-else>
        <Button
          :label="__('Unlink & Delete {0} items', [props.items.length])"
          icon-left="lucide-unlock"
          variant="solid"
          @click="confirmUnlink()"
        />
        <Button
          :label="__('Delete {0} items', [props.items.length])"
          icon-left="lucide-trash-2"
          variant="solid"
          theme="red"
          @click="confirmDelete()"
        />
      </template>
    </template>
  </CrmDialog>
</template>

<script setup>
import CrmDialog from '@/components/Modals/CrmDialog.vue'
import { call, toast } from 'frappe-ui'
import { formatError } from '@/utils/formatError'
import { ref } from 'vue'

const show = defineModel({ type: Boolean })
const props = defineProps({
  doctype: { type: String, required: true },
  items: { type: Array, required: true },
  reload: { type: Function, required: true },
})

const confirmDeleteInfo = ref({
  show: false,
  title: '',
  message: '',
  delete: false,
})

const confirmDelete = () => {
  confirmDeleteInfo.value = {
    show: true,
    title: __('Delete'),
    message: __('Are you sure you want to delete {0} linked doc(s)?', [
      props.items.length,
    ]),
    delete: true,
  }
}

const confirmUnlink = () => {
  confirmDeleteInfo.value = {
    show: true,
    title: __('Unlink'),
    message: __('Are you sure you want to unlink {0} linked doc(s)?', [
      props.items.length,
    ]),
    delete: false,
  }
}

const deleteDocs = () => {
  call('crm.api.doc.delete_bulk_docs', {
    items: props.items,
    doctype: props.doctype,
    delete_linked: confirmDeleteInfo.value.delete,
  })
    .then(() => {
      confirmDeleteInfo.value = {
        show: false,
        title: '',
      }
      show.value = false
      props.reload()
    })
    .catch((e) => {
      // Unguarded before: a refused bulk delete rejected into nothing and left
      // the confirmation open with no indication that anything had happened.
      confirmDeleteInfo.value = { show: false, title: '' }
      toast.error(formatError(e, 'Could not delete the linked documents'))
    })
}
</script>
