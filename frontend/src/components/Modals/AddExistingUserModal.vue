<template>
  <CrmDialog
    v-model:open="show"
    size="xl"
    icon="user-plus"
    :title="__('Add Existing User')"
    body-class="crm-doc-modal"
    @close="show = false"
  >
    <div class="crm-note-banner">
      <FeatherIcon name="info" class="size-4 shrink-0" />
      <p>
        {{
          __(
            'Add existing system users to this CRM. Assign them a role to grant access with their current credentials.',
          )
        }}
      </p>
    </div>

    <div class="mt-4">
      <label class="crm-field-label" for="add-existing-users">
        {{ __('Users') }}
      </label>
      <!-- No grey fill: every field surface in the app is plain white with
           a hairline, so the wrapper only supplies the box. -->
      <div class="crm-multiselect-box">
        <EmailMultiSelect
          v-if="users?.data?.crmUsers?.length"
          id="add-existing-users"
          v-model="newUsers"
          class="flex-1"
          variant="ghost"
          :placeholder="__('john@doe.com')"
          :validate="validateEmail"
          :fetchUsers="true"
          :existingEmails="[
            ...users.data.crmUsers.map((user) => user.name),
            'admin@example.com',
          ]"
          :error-message="
            (value) => __('{0} is an invalid email address', [value])
          "
          :emptyPlaceholder="__('No Users Found')"
        />
      </div>
    </div>

    <div class="mt-4">
      <label class="crm-field-label" for="add-existing-role">
        {{ __('Role') }}
      </label>
      <FormControl
        id="add-existing-role"
        v-model="role"
        type="select"
        :options="roleOptions"
      />
      <p
        v-if="description"
        class="mt-1.5 text-xs leading-relaxed text-[var(--crm-text-3)]"
      >
        {{ __(description) }}
      </p>
    </div>

    <template #footer>
      <Button variant="ghost" :label="__('Cancel')" @click="show = false" />
      <Button
        variant="solid"
        :label="__('Add')"
        :disabled="!newUsers.length"
        :loading="addNewUser.loading"
        @click="addNewUser.submit()"
      />
    </template>
  </CrmDialog>
</template>

<script setup>
import CrmDialog from '@/components/Modals/CrmDialog.vue'
import EmailMultiSelect from '@/components/Controls/EmailMultiSelect.vue'
import { validateEmail } from '@/utils'
import { formatError } from '@/utils/formatError'
import { usersStore } from '@/stores/users'
import { createResource, toast, FeatherIcon } from 'frappe-ui'
import { ref, computed } from 'vue'
import { isLeadsEnabled } from '@/utils/leads'

const { users, isAdmin } = usersStore()

const show = defineModel({ type: Boolean })

const newUsers = ref([])
const role = ref('Sales User')

const description = computed(() => {
  return {
    'System Manager':
      'Can manage all aspects of the CRM, including user management, customizations and settings.',
    'Sales Manager':
      'Can manage and invite new users, and create public & private views (reports).',
    'Sales User': isLeadsEnabled()
      ? 'Can work with leads and deals and create private views (reports).'
      : 'Can work with deals and create private views (reports).',
  }[role.value]
})

const roleOptions = computed(() => {
  return [
    { value: 'Sales User', label: __('Sales User') },
    ...(isAdmin() ? [{ value: 'Sales Manager', label: __('Manager') }] : []),
    ...(isAdmin() ? [{ value: 'System Manager', label: __('Admin') }] : []),
  ]
})

const addNewUser = createResource({
  url: 'xbr_crm.api.user.add_existing_users',
  makeParams: () => ({
    users: JSON.stringify(newUsers.value),
    role: role.value,
  }),
  onSuccess: () => {
    toast.success(__('Users Added Successfully'))
    newUsers.value = []
    show.value = false
    users.reload()
  },
  onError: (error) => {
    // formatError, not error.messages[0] — a network failure arrives as a plain
    // Error with no `messages`, and indexing it threw inside the handler,
    // replacing the real problem with a TypeError and no toast at all.
    toast.error(formatError(error, 'Failed to Add Users'))
  },
})
</script>
