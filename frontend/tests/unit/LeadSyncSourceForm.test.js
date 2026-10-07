const api = vi.hoisted(() => ({
  toast: null,
  capture: vi.fn(),
  docs: [],
  docOptions: {},
  leadFields: [],
  sourceFields: [],
  meta: null,
}))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  api.toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
  return {
    ...actual,
    toast: api.toast,
    createResource: (options = {}) =>
      reactive({ ...options, data: null, fetch: vi.fn(), submit: vi.fn(), reload: vi.fn() }),
    createListResource: (options = {}) =>
      reactive({ ...options, data: [], fetch: vi.fn(), reload: vi.fn() }),
  }
})

vi.mock('frappe-ui/frappe', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useTelemetry: () => ({ capture: api.capture }) }
})

vi.mock('@/stores/meta', async () => {
  const { reactive } = await import('vue')
  api.meta = reactive({ data: null })
  return {
    getMeta: (doctype) => ({
      meta: api.meta,
      getFields: () =>
        doctype === 'CRM Lead' ? api.leadFields : api.sourceFields,
      doctypeMeta: { value: {} },
      doctypesMeta: {},
    }),
  }
})

vi.mock('@/data/document', async () => {
  const { reactive } = await import('vue')
  return {
    useDocument: (doctype, name, options = {}) => {
      api.docOptions[doctype] = options
      const d = {
        doctype,
        name,
        document: reactive({
          doc: null,
          save: { submit: vi.fn() },
          reload: vi.fn(),
          // useDocument attaches one of these per whitelisted method, and the
          // template reads `document?.syncLeads.error` — the optional chain
          // stops before `syncLeads`, so it has to be present.
          ...Object.fromEntries(
            Object.keys(options.whitelistedMethods || {}).map((m) => [
              m,
              { submit: vi.fn(), error: null, loading: false },
            ]),
          ),
        }),
      }
      api.docs.push(d)
      return d
    },
  }
})

import LeadSyncSourceForm from '@/components/Settings/LeadSyncing/LeadSyncSourceForm.vue'
import { supportedSourceTypes } from '@/components/Settings/LeadSyncing/leadSyncSourceConfig'
import { mountComponent } from '../helpers/mount'
import { reactive, nextTick } from 'vue'

let sources

const STUBS = {
  Link: true, Grid: true, FailureLogs: true, Tabs: true, ErrorMessage: true,
  DetailsIcon: true, RefreshIcon: true,
  Switch: { props: ['modelValue'], template: '<button />' },
}

const mount = (sourceData = {}) => {
  sources = reactive({
    data: [],
    setValue: { submit: vi.fn() },
    insert: { submit: vi.fn() },
    reload: vi.fn(),
  })
  api.docs = []
  api.docOptions = {}
  return mountComponent(LeadSyncSourceForm, {
    props: { sourceData },
    global: { stubs: STUBS, provide: { sources } },
  })
}

const existing = (over = {}) => ({
  name: 'Facebook Page A',
  type: 'Facebook',
  enabled: 1,
  facebook_page: 'PAGE-1',
  facebook_lead_form: 'FORM-1',
  ...over,
})

describe('LeadSyncSourceForm', () => {
  beforeEach(() => {
    api.toast.success.mockClear()
    api.toast.error.mockClear()
    api.capture.mockClear()
    api.leadFields = [
      { fieldname: 'first_name', label: 'First Name' },
      { fieldname: 'email', label: 'Email' },
    ]
    api.sourceFields = [
      { fieldname: 'background_sync_frequency', default: 'Hourly' },
      { fieldname: 'type' },
    ]
    api.meta.data = null
  })

  describe('creating versus editing', () => {
    it('starts as a new source when given nothing', () => {
      expect(mount().vm.isLocal).toBe(true)
    })

    it('loads an existing source for editing', () => {
      const wrapper = mount(existing())
      expect(wrapper.vm.isLocal).toBe(false)
      expect(wrapper.vm.syncSource.name).toBe('Facebook Page A')
    })

    it('offers failure logs only for a saved source', () => {
      // A source that does not exist yet cannot have failed a sync.
      expect(mount().vm.tabs.map((t) => t.label)).toEqual(['Details'])
      expect(mount(existing()).vm.tabs.map((t) => t.label)).toEqual([
        'Details',
        'Failure Logs',
      ])
    })

    it('defaults the sync frequency from the doctype', () => {
      expect(mount().vm.syncSource.background_sync_frequency).toBe('Hourly')
    })
  })

  describe('the lead field list', () => {
    it('offers every CRM Lead field as a mapping target', () => {
      expect(mount().vm.leadFields).toEqual([
        { label: 'First Name', value: 'first_name' },
        { label: 'Email', value: 'email' },
      ])
    })

    it('is empty before the meta loads', () => {
      api.leadFields = []
      expect(mount().vm.leadFields).toEqual([])
    })

    it('copes with the meta returning nothing', () => {
      api.leadFields = null
      expect(mount().vm.leadFields).toEqual([])
    })
  })

  describe('the source field map', () => {
    it('keys the doctype fields by fieldname', () => {
      expect(Object.keys(mount().vm.fieldsMap)).toEqual([
        'background_sync_frequency',
        'type',
      ])
    })

    it('refreshes when the meta arrives', async () => {
      api.sourceFields = []
      const wrapper = mount()
      expect(wrapper.vm.fieldsMap).toEqual({})
      api.sourceFields = [{ fieldname: 'type' }]
      api.meta.data = { name: 'Lead Sync Source' }
      await nextTick()
      expect(Object.keys(wrapper.vm.fieldsMap)).toEqual(['type'])
    })
  })

  describe('creating a source', () => {
    const filled = (wrapper) => {
      Object.assign(wrapper.vm.syncSource, {
        name: 'Facebook Page B',
        type: supportedSourceTypes[0],
      })
      return wrapper
    }

    it('flattens the chosen type to its value', () => {
      // The picker hands back the whole option object.
      const wrapper = filled(mount())
      wrapper.vm.createOrUpdateSource()
      expect(sources.insert.submit.mock.calls[0][0].type).toBe(
        supportedSourceTypes[0].value,
      )
    })

    it('confirms and switches to editing once created', () => {
      const wrapper = filled(mount())
      wrapper.vm.createOrUpdateSource()
      sources.insert.submit.mock.calls[0][1].onSuccess({ name: 'Facebook Page B' })
      expect(api.toast.success).toHaveBeenCalledWith(
        'Lead Sync Source created successfully',
      )
      expect(wrapper.vm.isLocal).toBe(false)
    })

    it('records the source type', () => {
      const wrapper = filled(mount())
      wrapper.vm.createOrUpdateSource()
      sources.insert.submit.mock.calls[0][1].onSuccess({ name: 'B' })
      expect(api.capture).toHaveBeenCalledWith('lead_sync_source_created', {
        source_type: supportedSourceTypes[0].value,
      })
    })

    it('reports the server reason when it refuses', () => {
      const wrapper = filled(mount())
      wrapper.vm.createOrUpdateSource()
      sources.insert.submit.mock.calls[0][1].onError({
        messages: ['Token expired'],
      })
      expect(api.toast.error).toHaveBeenCalledWith('Token expired')
    })

    it('shows a plain Error message rather than burying it', () => {
      const wrapper = filled(mount())
      wrapper.vm.createOrUpdateSource()
      sources.insert.submit.mock.calls[0][1].onError(new Error('offline'))
      expect(api.toast.error).toHaveBeenCalledWith('offline')
    })
  })

  describe('updating a source', () => {
    it('updates rather than inserting', () => {
      const wrapper = mount(existing())
      wrapper.vm.syncSource.type = supportedSourceTypes[0]
      wrapper.vm.createOrUpdateSource()
      expect(sources.setValue.submit).toHaveBeenCalled()
      expect(sources.insert.submit).not.toHaveBeenCalled()
    })

    it('reloads the source document afterwards', () => {
      const wrapper = mount(existing())
      wrapper.vm.syncSource.type = supportedSourceTypes[0]
      wrapper.vm.createOrUpdateSource()
      sources.setValue.submit.mock.calls[0][1].onSuccess()
      const sourceDoc = api.docs.find((d) => d.doctype === 'Lead Sync Source')
      expect(sourceDoc.document.reload).toHaveBeenCalled()
    })

    it('saves the field mapping alongside it', () => {
      const wrapper = mount(existing())
      wrapper.vm.syncSource.type = supportedSourceTypes[0]
      wrapper.vm.createOrUpdateSource()
      sources.setValue.submit.mock.calls[0][1].onSuccess()
      const mapping = api.docs.find((d) => d.doctype === 'Facebook Lead Form')
      expect(mapping.document.save.submit).toHaveBeenCalled()
    })

    it('survives a source with no lead form selected', async () => {
      // Regression: the mapping ref is null whenever no form is chosen — the
      // watcher sets it so explicitly — and this line was unguarded, so the
      // save threw immediately after the update had succeeded.
      const wrapper = mount(existing({ facebook_lead_form: '' }))
      wrapper.vm.syncSource.facebook_lead_form = ''
      await nextTick()
      wrapper.vm.syncSource.type = supportedSourceTypes[0]
      wrapper.vm.createOrUpdateSource()
      expect(() =>
        sources.setValue.submit.mock.calls[0][1].onSuccess(),
      ).not.toThrow()
    })

    it('reports the server reason when it refuses', () => {
      const wrapper = mount(existing())
      wrapper.vm.syncSource.type = supportedSourceTypes[0]
      wrapper.vm.createOrUpdateSource()
      sources.setValue.submit.mock.calls[0][1].onError(new Error('offline'))
      expect(api.toast.error).toHaveBeenCalledWith('offline')
    })
  })

  describe('choosing a page and a form', () => {
    it('clears the chosen form when the page changes', async () => {
      // A lead form belongs to one page; keeping it would map to nothing.
      const wrapper = mount(existing())
      // Let the mount-time assignment flush first — otherwise it and the
      // change below batch into one watcher pass, where oldValue is still the
      // empty pre-mount value and the guard short-circuits.
      await nextTick()
      wrapper.vm.syncSource.facebook_page = 'PAGE-2'
      await nextTick()
      expect(wrapper.vm.syncSource.facebook_lead_form).toBe('')
    })

    it('does not clear it on the initial load', async () => {
      // The page goes from empty to its stored value on mount, which must not
      // be read as the user changing it.
      const wrapper = mount()
      wrapper.vm.syncSource.facebook_page = 'PAGE-1'
      wrapper.vm.syncSource.facebook_lead_form = 'FORM-1'
      await nextTick()
      expect(wrapper.vm.syncSource.facebook_lead_form).toBe('FORM-1')
    })

    it('loads the mapping document when a form is chosen', async () => {
      const wrapper = mount()
      wrapper.vm.syncSource.facebook_lead_form = 'FORM-9'
      await nextTick()
      expect(wrapper.vm.mappingFormDocResource.name).toBe('FORM-9')
    })

    it('drops the mapping document when the form is cleared', async () => {
      const wrapper = mount(existing())
      await nextTick()
      wrapper.vm.syncSource.facebook_lead_form = ''
      await nextTick()
      expect(wrapper.vm.mappingFormDocResource).toBeNull()
    })
  })

  describe('syncing on demand', () => {
    it('confirms that the job has been queued', () => {
      // It runs in the background, so there is nothing to show immediately.
      mount(existing())
      api.docOptions['Lead Sync Source'].whitelistedMethods.syncLeads.onSuccess()
      expect(api.toast.success).toHaveBeenCalledWith(
        'Syncing started in background',
      )
    })

    it('reports the server reason when it cannot start', () => {
      mount(existing())
      api.docOptions['Lead Sync Source'].whitelistedMethods.syncLeads.onError({
        messages: ['Token expired'],
      })
      expect(api.toast.error).toHaveBeenCalledWith('Token expired')
    })

    it('shows a plain Error message rather than burying it', () => {
      mount(existing())
      api.docOptions['Lead Sync Source'].whitelistedMethods.syncLeads.onError(
        new Error('offline'),
      )
      expect(api.toast.error).toHaveBeenCalledWith('offline')
    })
  })
})
