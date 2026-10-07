<template>
  <CrmDialog
    v-model:open="show"
    size="xl"
    icon="user"
    :title="__('New Contact')"
    :subtitle="__('Add a new contact')"
    body-class="crm-doc-modal"
  >
    <template #header-actions>
      <Button
        v-if="isManager() && !isMobileView"
        variant="ghost"
        :tooltip="__('Edit Fields Layout')"
        :icon="EditIcon"
        @click="openQuickEntryModal"
      />
    </template>

    <FieldLayout
      v-if="tabs.data?.length"
      :tabs="tabs.data"
      :data="_contact.doc"
      doctype="Contact"
    />
    <ErrorMessage v-if="error" class="mt-4" :message="__(error)" />

    <template #footer>
      <Button variant="ghost" :label="__('Cancel')" @click="show = false" />
      <Button
        variant="solid"
        :label="__('Create')"
        :loading="insertContact.loading"
        @click="createContact"
      />
    </template>
  </CrmDialog>
</template>

<script setup>
import CrmDialog from '@/components/Modals/CrmDialog.vue'
import FieldLayout from '@/components/FieldLayout/FieldLayout.vue'
import EditIcon from '@/components/Icons/EditIcon.vue'
import { usersStore } from '@/stores/users'
import { isMobileView } from '@/composables/settings'
import { showQuickEntryModal, quickEntryProps } from '@/composables/modals'
import { useDocument } from '@/data/document'
import { evaluateDependsOnValue } from '@/utils'
import { formatError } from '@/utils/formatError'
import { useDoctypeModal } from '@/composables/doctypeModal'
import { useTelemetry } from 'frappe-ui/frappe'
import { createResource } from 'frappe-ui'
import { ref, nextTick, onMounted } from 'vue'
import { useRouter } from 'vue-router'

const props = defineProps({
  contact: { type: Object, default: () => {} },
  options: {
    type: Object,
    default: () => ({ redirect: true, afterInsert: () => {} }),
  },
})

const { isManager } = usersStore()
const { capture } = useTelemetry()

const router = useRouter()
const show = defineModel({ type: Boolean })

const error = ref(null)

const { document: _contact, triggerOnBeforeCreate } = useDocument('Contact')

function validateRequiredFields() {
  if (!tabs.data) return null

  const missingFields = []

  tabs.data.forEach((tab) => {
    tab.sections.forEach((section) => {
      section.columns.forEach((column) => {
        column.fields.forEach((field) => {
          const isMandatory =
            field.reqd ||
            (field.mandatory_depends_on &&
              evaluateDependsOnValue(field.mandatory_depends_on, _contact.doc))

          if (isMandatory && !_contact.doc[field.fieldname]) {
            missingFields.push(__(field.label))
          }
        })
      })
    })
  })

  if (missingFields.length) {
    return __('{0} is required', [missingFields.join(', ')])
  }

  if (_contact.doc.email_id && !_contact.doc.email_id.includes('@')) {
    return __('Invalid Email Address')
  }

  if (
    _contact.doc.mobile_no &&
    isNaN(_contact.doc.mobile_no.replace(/[-+() ]/g, ''))
  ) {
    return __('Mobile No. should be a number')
  }

  return null
}

const insertContact = createResource({
  url: 'frappe.client.insert',
  onSuccess: (doc) => {
    capture('contact_created')
    handleContactUpdate(doc)
    _contact.doc = {}
  },
  onError: (err) => {
    // frappe-ui hands the error straight to onError, so `err.error` is never
    // set — this used to resolve to undefined and the dialog showed nothing.
    error.value = formatError(err, 'Could not create contact')
  },
})

async function createContact() {
  error.value = null

  const validationError = validateRequiredFields()
  if (validationError) {
    error.value = validationError
    return
  }

  if (_contact.doc.email_id) {
    _contact.doc.email_ids = [
      { email_id: _contact.doc.email_id, is_primary: 1 },
    ]
    delete _contact.doc.email_id
  }

  if (_contact.doc.mobile_no) {
    _contact.doc.phone_nos = [
      { phone: _contact.doc.mobile_no, is_primary_mobile_no: 1 },
    ]
    delete _contact.doc.mobile_no
  }

  await triggerOnBeforeCreate?.()

  insertContact.submit({
    doc: {
      doctype: 'Contact',
      ..._contact.doc,
    },
  })
}

function handleContactUpdate(doc) {
  props.contact?.reload?.()
  if (doc.name && props.options.redirect) {
    router.push({
      name: 'Contact',
      params: { contactId: doc.name },
    })
  }
  show.value = false
  props.options.afterInsert?.(doc)
}

const tabs = createResource({
  url: 'xbr_crm.fcrm.doctype.crm_fields_layout.crm_fields_layout.get_fields_layout',
  cache: ['QuickEntry', 'Contact'],
  params: { doctype: 'Contact', type: 'Quick Entry' },
  auto: true,
  transform: (_tabs) => {
    return _tabs.forEach((tab) => {
      tab.sections.forEach((section) => {
        section.columns.forEach((column) => {
          column.fields.forEach((field) => {
            if (field.fieldname == 'email_id') {
              field.read_only = false
            } else if (field.fieldname == 'mobile_no') {
              field.read_only = false
            } else if (field.fieldname == 'address') {
              // `value` is raw typed text, not an Address docname — writing
              // it onto the link field made a cancelled dialog break the next
              // insert. Seed the dialog with it instead.
              field.create = (value, close) => {
                showAddressModal(null, value)
                close()
              }
              field.edit = (address) => showAddressModal(address)
            } else if (field.fieldtype === 'Table') {
              _contact.doc[field.fieldname] = []
            }
            if (field.fieldname === 'first_name') {
              field.reqd = 1
            }
          })
        })
      })
    })
  },
})

onMounted(() => {
  _contact.doc = {}
  Object.assign(_contact.doc, props.contact.data || props.contact)
})

function openQuickEntryModal() {
  showQuickEntryModal.value = true
  quickEntryProps.value = { doctype: 'Contact' }
  nextTick(() => (show.value = false))
}

const { showModal } = useDoctypeModal()

function showAddressModal(_address, typedValue) {
  showModal({
    name: _address || null,
    doctype: 'Address',
    // No Dynamic Link: the contact does not exist yet, so there is nothing to
    // link to. The typed text seeds the title so the address can name itself.
    defaults: _address || !typedValue ? {} : { address_title: typedValue },
    callbacks: {
      afterInsert: (d) => {
        capture('address_created')
        _contact.doc.address = d.name
      },
    },
  })
}
</script>

<style scoped>
:deep(:has(> .dropdown-button)) {
  width: 100%;
}
</style>
