import { defineStore } from 'pinia'
import { createResource } from 'frappe-ui'
import { reactive, ref } from 'vue'
import { isLeadsEnabled } from '@/utils/leads'

export const viewsStore = defineStore('crm-views', (doctype) => {
  if (typeof doctype !== 'string') {
    doctype = null
  }

  let viewsByName = reactive({})
  let pinnedViews = ref([])
  let publicViews = ref([])
  let standardViews = ref({})
  const defaultView = ref(null)

  // Views
  const views = createResource({
    url: 'xbr_crm.api.views.get_views',
    params: { doctype: doctype || '' },
    cache: 'crm-views',
    initialData: [],
    auto: true,
    transform(views) {
      pinnedViews.value = []
      publicViews.value = []
      defaultView.value = null
      for (let view of views) {
        viewsByName[view.name] = view
        view.type = view.type || 'list'
        if (view.pinned) {
          pinnedViews.value?.push(view)
        }
        if (view.public) {
          publicViews.value?.push(view)
        }
        if (view.is_standard && view.dt) {
          standardViews.value[view.dt + ' ' + view.type] = view
        }
        if (view.is_default) {
          defaultView.value = view
        }
      }
      return views
    },
  })

  function getDefaultView() {
    return defaultView.value
  }

  function getView(view, type, doctype = null) {
    type = type || 'list'
    if (!view && doctype) {
      return standardViews.value[doctype + ' ' + type] || null
    }
    return viewsByName[view]
  }

  // Saved views on CRM Lead stay stored but are not offered while Leads are off.
  function visible(list) {
    if (isLeadsEnabled()) return list
    return list.filter((view) => view.dt !== 'CRM Lead')
  }

  function getPinnedViews() {
    if (!pinnedViews.value?.length) return []
    return visible(pinnedViews.value)
  }

  function getPublicViews() {
    if (!publicViews.value?.length) return []
    return visible(publicViews.value)
  }

  async function reload() {
    await views.reload()
  }

  return {
    views,
    defaultView,
    standardViews,
    getDefaultView,
    getPinnedViews,
    getPublicViews,
    reload,
    getView,
  }
})
