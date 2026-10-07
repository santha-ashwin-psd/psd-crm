<template>
  <DataImport
    :doctype="route.params.doctype"
    :importName="route.params.importName"
    :doctypeMap="doctypeMap"
  />
</template>

<script setup>
import { usePageMeta } from 'frappe-ui'
import { DataImport } from 'frappe-ui/frappe'
import { useRoute } from 'vue-router'
import { isLeadsEnabled } from '@/utils/leads'

const route = useRoute()

const doctypeMap = {
  // Not importable while Leads are switched off.
  ...(isLeadsEnabled()
    ? {
        'CRM Lead': {
          title: __('Leads'),
          listRoute: '/leads',
          pageRoute: `/leads/docname`,
        },
      }
    : {}),
  'CRM Deal': {
    title: __('Deals'),
    listRoute: '/pipeline',
    pageRoute: `/pipeline/docname`,
  },
  Contact: {
    title: __('Contacts'),
    listRoute: '/contacts',
    pageRoute: `/contacts/docname`,
  },
  'CRM Task': {
    title: __('Tasks'),
    listRoute: '/tasks',
  },
  'CRM Organization': {
    title: __('Organizations'),
    listRoute: '/organizations',
    pageRoute: `/organizations/docname`,
  },
  'CRM Call Log': {
    title: __('Call Log'),
    listRoute: '/call-logs',
  },
}

usePageMeta(() => {
  return {
    title: __('Data Import'),
  }
})
</script>
