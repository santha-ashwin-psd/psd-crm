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
          title: 'Leads',
          listRoute: '/leads',
          pageRoute: `/leads/docname`,
        },
      }
    : {}),
  'CRM Deal': {
    title: 'Deals',
    listRoute: '/deals',
    pageRoute: `/deals/docname`,
  },
  Contact: {
    title: 'Contacts',
    listRoute: '/contacts',
    pageRoute: `/contacts/docname`,
  },
  'CRM Task': {
    title: 'Tasks',
    listRoute: '/tasks',
  },
  'CRM Organization': {
    title: 'Organizations',
    listRoute: '/organizations',
    pageRoute: `/organizations/docname`,
  },
  'CRM Call Log': {
    title: 'Call Log',
    listRoute: '/call-logs',
  },
}

usePageMeta(() => {
  return {
    title: __('Data Import'),
  }
})
</script>
