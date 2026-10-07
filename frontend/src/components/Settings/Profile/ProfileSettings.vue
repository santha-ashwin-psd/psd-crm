<template>
  <SettingsLayoutBase
    v-if="user.doc"
    :title="__('Profile')"
    :description="__('Manage your profile & login information.')"
  >
    <template #content>
      <div class="flex flex-col gap-6">
      <div class="flex items-center justify-between gap-4 rounded-2xl border border-[var(--crm-settings-border)] bg-[var(--crm-surface)] p-5 shadow-sm">
        <FileUploader
          :validateFile="validateIsImageFile"
          @success="(file) => updateImage(file.file_url)"
        >
          <template #default="{ openFileSelector, error: _error, uploading }">
            <div class="flex items-center justify-center gap-2">
              <div class="group relative !size-14">
                <Avatar
                  class="profile-avatar !size-14"
                  :image="user.doc.user_image"
                  :label="fullName"
                />
                <Tooltip
                  :hoverDelay="0"
                  placement="bottom"
                  :text="profileTooltipText"
                >
                  <div
                    class="z-1 absolute top-0 left-0 flex h-9 cursor-pointer items-center justify-center rounded-full !size-14"
                    @click.stop="openFileSelector"
                  />
                  <div
                    v-if="user.doc.user_image"
                    class="z-1 size-4 absolute -top-1 -right-1 flex cursor-pointer items-center justify-center rounded-full bg-surface-base opacity-0 duration-300 ease-in-out group-hover:opacity-100 hover:bg-surface-gray-2 outline outline-black-overlay-50"
                    @click.stop="updateImage()"
                    @mouseenter="isHoveringRemove = true"
                    @mouseleave="isHoveringRemove = false"
                  >
                    <span
                      class="lucide-x size-3.5 cursor-pointer text-ink-gray-4"
                      aria-hidden="true"
                    />
                  </div>
                </Tooltip>
                <div
                  v-if="uploading"
                  class="w-full h-full top-0 left-0 absolute bg-black bg-opacity-20 rounded-full flex items-center justify-center"
                >
                  <LoadingIndicator class="size-4" />
                </div>
              </div>
              <div class="flex flex-col gap-1">
                <div class="flex flex-col gap-1">
                  <div v-if="!editName" class="flex items-center gap-1">
                    <span
                      class="text-lg sm:text-2xl !font-semibold text-ink-gray-8"
                    >
                      {{ fullName }}
                    </span>
                    <button
                      class="grid size-7 shrink-0 place-items-center rounded-lg bg-[var(--crm-chip-blue)] text-[var(--crm-accent-primary)] transition hover:brightness-95"
                      :aria-label="__('Edit name')"
                      @click="editFullName"
                    >
                      <EditIcon class="size-3.5" />
                    </button>
                  </div>
                  <div v-else class="flex items-center gap-1">
                    <TextInput
                      ref="fullNameRef"
                      v-model="fullName"
                      @keydown.enter="save"
                      @keydown.esc.stop="editName = false"
                    />
                    <Button
                      variant="outline"
                      icon="lucide-check"
                      @click="save"
                    />
                  </div>
                  <span class="text-p-sm text-ink-gray-6">
                    {{ user.doc.email }}
                  </span>
                </div>
                <ErrorMessage :message="__(_error)" />
              </div>
            </div>
          </template>
        </FileUploader>
      </div>
      <!-- Section header -->
      <div class="flex items-center gap-3 pt-1">
        <span class="shrink-0 text-base font-semibold text-ink-gray-9">
          {{ __('Account Info & Security') }}
        </span>
        <div class="h-px flex-1 bg-[var(--crm-settings-border)]" />
        <FeatherIcon name="shield" class="size-4 text-ink-gray-5" />
      </div>

      <!-- Emails & Signature -->
      <div
        class="flex items-center justify-between gap-4 rounded-2xl border border-[var(--crm-settings-border)] bg-[var(--crm-surface)] p-5"
      >
        <div class="flex min-w-0 items-center gap-4">
          <span
            class="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--crm-chip-blue)] text-[var(--crm-info)]"
          >
            <FeatherIcon name="mail" class="size-5" />
          </span>
          <div class="min-w-0">
            <div class="text-base font-medium text-ink-gray-8">
              {{ __('Emails & Signature') }}
            </div>
            <div class="text-sm text-ink-gray-6">
              {{
                __(
                  'Manage your account emails and email signature for communication.',
                )
              }}
            </div>
          </div>
        </div>
        <Button
          class="settings-cta shrink-0"
          variant="outline"
          :label="__('Configure')"
          iconRight="chevron-right"
          @click="emit('updateStep', 'user-email-settings')"
        />
      </div>

      <!-- Password -->
      <div
        class="flex items-center justify-between gap-4 rounded-2xl border border-[var(--crm-settings-border)] bg-[var(--crm-surface)] p-5"
      >
        <div class="flex min-w-0 items-center gap-4">
          <span
            class="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--crm-chip-green)] text-[var(--crm-success)]"
          >
            <FeatherIcon name="lock" class="size-5" />
          </span>
          <div class="min-w-0">
            <div class="text-base font-medium text-ink-gray-8">
              {{ __('Password') }}
            </div>
            <div class="text-sm text-ink-gray-6">
              {{
                __(
                  'Change your account password for security and keep your account safe.',
                )
              }}
            </div>
          </div>
        </div>
        <Button
          class="settings-cta shrink-0"
          variant="outline"
          :label="__('Change Password')"
          iconRight="chevron-right"
          @click="showChangePasswordModal = true"
        />
      </div>

      <!-- 2FA banner -->
      <div
        class="flex items-center justify-between gap-4 rounded-2xl border border-[var(--crm-settings-border)] bg-[var(--crm-banner-blue)] p-4"
      >
        <div class="flex min-w-0 items-center gap-3">
          <span
            class="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--crm-chip-blue)] text-[var(--crm-accent-primary)]"
          >
            <FeatherIcon name="shield" class="size-5" />
          </span>
          <div class="min-w-0">
            <div class="text-sm font-semibold text-ink-gray-9">
              {{ __('Keep your account secure') }}
            </div>
            <div class="text-sm italic text-ink-gray-6">
              {{
                __(
                  'We recommend using a strong password and enabling two-factor authentication.',
                )
              }}
            </div>
          </div>
        </div>
        <Button
          class="settings-cta shrink-0"
          variant="outline"
          :label="__('Enable 2FA')"
          @click="openTwoFactor"
        />
      </div>
      </div>
    </template>
  </SettingsLayoutBase>
  <ChangePasswordModal
    v-if="showChangePasswordModal"
    v-model="showChangePasswordModal"
  />
</template>

<script setup>
import EditIcon from '@/components/Icons/EditIcon.vue'
import SettingsLayoutBase from '@/components/Layouts/SettingsLayoutBase.vue'
import ChangePasswordModal from '@/components/Modals/ChangePasswordModal.vue'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import { validateIsImageFile } from '@/utils'
import { formatError } from '@/utils/formatError'
import {
  Avatar,
  TextInput,
  FileUploader,
  LoadingIndicator,
  FeatherIcon,
  toast,
  Tooltip,
  createDocumentResource,
} from 'frappe-ui'
import { ref, computed, inject, useTemplateRef, nextTick } from 'vue'

const emit = defineEmits(['updateStep'])

const { user: sessionUser } = inject('session')
const user = createDocumentResource({ doctype: 'User', name: sessionUser })

const showChangePasswordModal = ref(false)
const isHoveringRemove = ref(false)
const editName = ref(false)

// Two-factor auth lives in the Frappe desk user settings; open it in a new tab.
function openTwoFactor() {
  window.open(`/app/user/${sessionUser}`, '_blank')
}

const profileTooltipText = computed(() => {
  if (isHoveringRemove.value) return __('Remove Photo')
  return user.doc.user_image ? __('Change Photo') : __('Upload Photo')
})

const fullNameRef = useTemplateRef('fullNameRef')
const fullName = computed({
  get: () =>
    [user.doc.first_name, user.doc.last_name].filter(Boolean).join(' '),
  set: (val) => {
    const [firstName, ...lastName] = val.split(' ')
    user.doc.first_name = firstName
    user.doc.last_name = lastName.join(' ')
  },
})

function editFullName() {
  editName.value = true
  nextTick(() => fullNameRef.value?.el?.focus())
}

const isDirty = computed(() => {
  return JSON.stringify(user.doc) !== JSON.stringify(user.originalDoc)
})

function save() {
  if (!isDirty.value) {
    editName.value = false
    return
  }

  user.save.submit(null, {
    onSuccess: () => {
      editName.value = false
      toast.success(__('Profile Updated Successfully'))
    },
    onError: (err) => {
      toast.error(formatError(err, __('Failed to update profile')))
    },
  })
}

function updateImage(fileUrl = '') {
  isHoveringRemove.value = false
  user.doc.user_image = fileUrl
  save()
}

useKeyboardShortcuts({
  ignoreTyping: false,
  shortcuts: [
    {
      match: (e) => (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's',
      action: () => {
        if (isDirty.value) {
          save()
        }
      },
    },
  ],
})
</script>

<style scoped>
/* Profile avatar reads as a soft blue identity chip (not the default gray). */
.profile-avatar :deep(div) {
  background-color: var(--crm-chip-blue) !important;
  color: var(--crm-accent-primary) !important;
  font-weight: 600 !important;
}
.profile-avatar :deep(img) {
  background-color: transparent !important;
}

/* Row CTAs: white pill, soft border, blue label + chevron. */
.settings-cta {
  height: 38px !important;
  border-radius: var(--crm-radius-md) !important;
  border: 1px solid var(--crm-settings-border) !important;
  background-color: var(--crm-surface) !important;
  color: var(--crm-accent-primary) !important;
  font-weight: 500 !important;
}
.settings-cta :deep(svg) {
  color: var(--crm-accent-primary) !important;
}
.settings-cta:hover {
  background-color: var(--crm-chip-blue) !important;
}
</style>
