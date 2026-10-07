const api = vi.hoisted(() => ({
  tabs: null,
  doc: null,
  isManager: true,
  isMobileView: null,
}))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  return {
    ...actual,
    createResource: (options = {}) => {
      api.tabs = reactive({ ...options, data: null, fetch: vi.fn(), reload: vi.fn() })
      return api.tabs
    },
  }
})

vi.mock('@/stores/users', () => ({
  usersStore: () => ({ isManager: () => api.isManager }),
}))

vi.mock('@/composables/settings', async () => {
  const { ref } = await import('vue')
  api.isMobileView = ref(false)
  return {
    isMobileView: api.isMobileView,
    showSettings: ref(false),
    activeSettingsPage: ref(''),
    disableSettingModalOutsideClick: ref(false),
  }
})

vi.mock('@/data/document', async () => {
  const { reactive } = await import('vue')
  return {
    useDocument: () => {
      api.doc = reactive({
        doc: { name: 'DEAL-1', deal_name: 'Acme', annual_revenue: 100 },
        originalDoc: { name: 'DEAL-1', deal_name: 'Acme', annual_revenue: 100 },
        isDirty: false,
        save: { submit: vi.fn(), loading: false },
        // The template reads `document.get.loading` directly to decide whether
        // to show the spinner, so the fetch resource has to be present.
        get: { loading: false },
      })
      return { document: api.doc }
    },
  }
})

import DataFields from '@/components/Activities/DataFields.vue'
import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'

const STUBS = {
  DataFieldsModal: true, FieldLayout: true, LoadingIndicator: true,
  EditIcon: true, Badge: true,
}

const mount = (listeners = {}) =>
  mountComponent(DataFields, {
    props: { doctype: 'CRM Deal', docname: 'DEAL-1', ...listeners },
    global: { stubs: STUBS },
  })

describe('DataFields', () => {
  beforeEach(() => {
    api.isManager = true
    api.isMobileView.value = false
  })

  describe('the layout', () => {
    it('asks for the Data Fields layout of this doctype', () => {
      mount()
      expect(api.tabs.params).toEqual({
        doctype: 'CRM Deal',
        type: 'Data Fields',
      })
    })

    it('caches per doctype, so a lead and a deal do not share one', () => {
      mount()
      expect(api.tabs.cache).toEqual(['DataFields', 'CRM Deal'])
    })
  })

  describe('saving', () => {
    it('does nothing when nothing changed', () => {
      const wrapper = mount()
      wrapper.vm.saveChanges()
      expect(api.doc.save.submit).not.toHaveBeenCalled()
    })

    it('saves when something did', async () => {
      const wrapper = mount()
      api.doc.doc.deal_name = 'Acme Ltd'
      api.doc.isDirty = true
      await nextTick()
      wrapper.vm.saveChanges()
      expect(api.doc.save.submit).toHaveBeenCalled()
    })

    it('reports only the fields that actually changed', () => {
      // The parent uses this to decide what to validate, so sending the whole
      // document would make every save look like a full rewrite.
      const wrapper = mount()
      api.doc.doc.deal_name = 'Acme Ltd'
      api.doc.isDirty = true
      wrapper.vm.saveChanges()
      api.doc.save.submit.mock.calls[0][1].onSuccess()
      expect(wrapper.emitted('afterSave')[0][0]).toEqual({
        deal_name: 'Acme Ltd',
      })
    })

    it('compares values structurally, not by reference', () => {
      // A child table replaced with an equal array must not read as a change.
      const wrapper = mount()
      api.doc.doc.items = [{ a: 1 }]
      api.doc.originalDoc.items = [{ a: 1 }]
      api.doc.doc.deal_name = 'Acme Ltd'
      api.doc.isDirty = true
      wrapper.vm.saveChanges()
      api.doc.save.submit.mock.calls[0][1].onSuccess()
      expect(wrapper.emitted('afterSave')[0][0]).not.toHaveProperty('items')
    })
  })

  describe('when the parent wants to intervene', () => {
    it('hands the changes over instead of saving', () => {
      // A page that listens takes responsibility for the write — the lost
      // reason being that it may need to confirm or transform it first.
      const wrapper = mountComponent(DataFields, {
        props: { doctype: 'CRM Deal', docname: 'DEAL-1', onBeforeSave: vi.fn() },
        global: { stubs: STUBS },
      })
      api.doc.doc.deal_name = 'Acme Ltd'
      api.doc.isDirty = true
      wrapper.vm.saveChanges()
      expect(api.doc.save.submit).not.toHaveBeenCalled()
      expect(wrapper.emitted('beforeSave')[0][0]).toEqual({
        deal_name: 'Acme Ltd',
      })
    })

    it('saves itself when nobody is listening', () => {
      const wrapper = mount()
      api.doc.doc.deal_name = 'Acme Ltd'
      api.doc.isDirty = true
      wrapper.vm.saveChanges()
      expect(api.doc.save.submit).toHaveBeenCalled()
      expect(wrapper.emitted('beforeSave')).toBeUndefined()
    })
  })

  describe('tracking edits', () => {
    it('marks the document dirty when a field changes', async () => {
      const wrapper = mount()
      api.doc.doc.deal_name = 'Acme Ltd'
      await nextTick()
      expect(api.doc.isDirty).toBe(true)
    })

    it('marks it clean again when the value is put back', async () => {
      const wrapper = mount()
      api.doc.doc.deal_name = 'Acme Ltd'
      await nextTick()
      api.doc.doc.deal_name = 'Acme'
      await nextTick()
      expect(api.doc.isDirty).toBe(false)
    })

    it('releases the save spinner on a fresh edit', async () => {
      // A previous save may have left it spinning; typing again must not look
      // like that save is still in flight.
      const wrapper = mount()
      api.doc.save.loading = true
      api.doc.doc.deal_name = 'Acme Ltd'
      await nextTick()
      expect(api.doc.save.loading).toBe(false)
    })
  })

  describe('editing the layout', () => {
    it('is offered to a manager', () => {
      expect(mount().vm.isManager()).toBe(true)
    })

    it('keeps the editor modal shut until asked', () => {
      expect(mount().vm.showDataFieldsModal).toBe(false)
    })
  })
})
