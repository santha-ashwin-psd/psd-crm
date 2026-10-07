<template>
  <CrmDialog
    v-model:open="show"
    size="xl"
    icon="paperclip"
    :title="__('Attach')"
    footer-align="between"
  >
    <template #default>
      <FilesUploaderArea
        ref="filesUploaderArea"
        v-model="files"
        :doctype="doctype"
        :options="options"
      />
    </template>
    <template #footer>
      <div class="flex justify-between w-full">
        <div class="flex gap-2">
          <Button
            v-if="files.length"
            variant="subtle"
            :label="__('Remove All')"
            :disabled="fileUploadStarted"
            @click="removeAllFiles"
          />
          <Button
            v-if="
              filesUploaderArea?.showWebLink || filesUploaderArea?.showCamera
            "
            :label="isMobileView ? __('Back') : __('Back to File Upload')"
            iconLeft="arrow-left"
            @click="
              () => {
                filesUploaderArea.showWebLink = false
                filesUploaderArea.showCamera = false
                filesUploaderArea.webLink = null
                filesUploaderArea.cameraImage = null
              }
            "
          />
          <Button
            v-if="
              filesUploaderArea?.showCamera && !filesUploaderArea?.cameraImage
            "
            :label="__('Switch Camera')"
            @click="() => filesUploaderArea.switchCamera()"
          />
          <Button
            v-if="filesUploaderArea?.cameraImage"
            :label="__('Retake')"
            @click="filesUploaderArea.cameraImage = null"
          />
        </div>
        <div class="flex gap-2">
          <Button
            v-if="isAllPrivate && files.length"
            variant="subtle"
            :label="__('Set all as public')"
            :disabled="fileUploadStarted"
            @click="setAllPublic"
          />
          <Button
            v-else-if="files.length"
            variant="subtle"
            :label="__('Set all as private')"
            :disabled="fileUploadStarted"
            @click="setAllPrivate"
          />
          <Button
            v-if="!filesUploaderArea?.showCamera"
            variant="solid"
            :label="__('Attach')"
            :loading="fileUploadStarted"
            :disabled="disableAttachButton"
            @click="attachFiles"
          />
          <Button
            v-if="
              filesUploaderArea?.showCamera && filesUploaderArea?.cameraImage
            "
            variant="solid"
            :label="__('Upload')"
            @click="() => filesUploaderArea.uploadViaCamera()"
          />
          <Button
            v-if="
              filesUploaderArea?.showCamera && !filesUploaderArea?.cameraImage
            "
            variant="solid"
            :label="__('Capture')"
            @click="() => filesUploaderArea.captureImage()"
          />
        </div>
      </div>
    </template>
  </CrmDialog>
</template>

<script setup>
import CrmDialog from '@/components/Modals/CrmDialog.vue'
import FilesUploaderArea from '@/components/FilesUploader/FilesUploaderArea.vue'
import FilesUploadHandler from './filesUploaderHandler'
import { isMobileView } from '@/composables/settings'
import { toast } from 'frappe-ui'
import { ref, computed } from 'vue'

const props = defineProps({
  doctype: { type: String, required: true },
  docname: { type: String, required: true },
  fieldname: { type: String, default: '' },
  options: {
    type: Object,
    default: () => ({
      folder: 'Home/Attachments',
    }),
  },
})

const emit = defineEmits(['after'])
// 'after' payload: array of uploaded file objects (each has file_url, file_name, name, ...)

const show = defineModel({ type: Boolean })

const filesUploaderArea = ref(null)
const files = ref([])

const isAllPrivate = computed(() => files.value.every((a) => a.private))

function setAllPrivate() {
  files.value.forEach((file) => (file.private = true))
}

function setAllPublic() {
  files.value.forEach((file) => (file.private = false))
}

function removeAllFiles() {
  files.value = []
}

const disableAttachButton = computed(() => {
  if (filesUploaderArea.value?.showCamera) {
    return !filesUploaderArea.value.cameraImage
  }
  if (filesUploaderArea.value?.showWebLink) {
    return !filesUploaderArea.value.webLink
  }
  return !files.value.length
})

function attachFiles() {
  if (filesUploaderArea.value.showWebLink) {
    return uploadViaWebLink()
  }
  pendingUploads = files.value.length
  hadUploadFailure = false
  files.value.forEach((file) => attachFile(file))
}

function uploadViaWebLink() {
  let fileUrl = filesUploaderArea.value.webLink
  if (!fileUrl) {
    toast.error(__('Please enter a valid URL'))
    return
  }
  fileUrl = decodeURI(fileUrl)
  // The dialog used to close here, before the upload had happened — and
  // `attachFile` was called with no index, so the completion check below never
  // matched and the parent was never told about the file at all.
  pendingUploads = 1
  hadUploadFailure = false
  return attachFile({
    fileUrl,
  })
}

const uploader = ref(null)
const fileUploadStarted = ref(false)
const uploadedFiles = ref([])

// Uploads run concurrently and finish in any order. This used to be decided by
// `i === files.value.length - 1` — the *last* file to be started, not the last
// to finish — so if it came back first it emitted its own response alone,
// cleared the list and closed the dialog while the others were still going.
// Their results were then dropped.
let pendingUploads = 0
let hadUploadFailure = false

function settleUpload(failed) {
  if (failed) hadUploadFailure = true
  pendingUploads -= 1
  if (pendingUploads > 0) return

  const uploaded = uploadedFiles.value.slice()
  uploadedFiles.value = []
  fileUploadStarted.value = false
  if (uploaded.length) emit('after', uploaded)
  // Anything that failed keeps the dialog open so its message stays on screen.
  if (!hadUploadFailure) {
    files.value = []
    show.value = false
  }
}

function attachFile(file) {
  const args = {
    fileObj: file.fileObj || {},
    type: file.type,
    private: file.private,
    fileUrl: file.fileUrl,
    folder: props.options.folder,
    doctype: props.doctype,
    docname: props.docname,
    fieldname: props.fieldname,
  }

  uploader.value = new FilesUploadHandler()

  uploader.value.on('start', () => {
    file.uploading = true
    fileUploadStarted.value = true
  })
  uploader.value.on('progress', (data) => {
    file.uploaded = data.uploaded
    file.total = data.total
  })
  uploader.value.on('error', (error) => {
    file.uploading = false
    file.errorMessage = error || 'Error Uploading File'
  })
  uploader.value.on('finish', () => {
    file.uploading = false
  })

  uploader.value
    .upload(file, args || {})
    .then((response) => {
      uploadedFiles.value.push(response)
      settleUpload(false)
    })
    .catch((error) => {
      file.uploading = false
      settleUpload(true)
      let errorMessage = 'Error Uploading File'
      if (error?._server_messages) {
        errorMessage = JSON.parse(JSON.parse(error._server_messages)[0]).message
      } else if (error?.exc) {
        errorMessage = JSON.parse(error.exc)[0].split('\n').slice(-2, -1)[0]
      } else if (typeof error === 'string') {
        errorMessage = error
      }
      file.errorMessage = errorMessage
    })
}
</script>
