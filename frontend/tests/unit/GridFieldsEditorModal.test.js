const api = vi.hoisted(() => ({
  fields: [],
  gridViewSettings: [],
  saveUserSettings: vi.fn(),
  capture: vi.fn(),
  call: vi.fn(),
  tabs: null,
}))

vi.mock('@/stores/meta', () => ({
  getMeta: () => ({
    getFields: () => api.fields,
    getGridViewSettings: () => api.gridViewSettings,
    saveUserSettings: api.saveUserSettings,
  }),
}))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  return {
    ...actual,
    call: api.call,
    createResource: (options = {}) => {
      api.tabs = reactive({
        ...options,
        data: null,
        originalData: null,
        fetch: vi.fn(),
        reload: vi.fn(),
      })
      return api.tabs
    },
  }
})

vi.mock('frappe-ui/frappe', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useTelemetry: () => ({ capture: api.capture }) }
})

vi.mock('vuedraggable', () => ({
  default: {
    name: 'Draggable',
    props: ['modelValue', 'itemKey'],
    template: '<div class="local-draggable"><slot name="item" v-for="(el, i) in modelValue" :element="el" :index="i" /></div>',
  },
}))

import GridFieldsEditorModal from '@/components/Controls/GridFieldsEditorModal.vue'
import GridRowFieldsModal from '@/components/Controls/GridRowFieldsModal.vue'
import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'
import { flushPromises } from '@vue/test-utils'

const field = (fieldname, over = {}) => ({
  label: fieldname,
  fieldname,
  fieldtype: 'Data',
  options: '',
  in_list_view: 1,
  ...over,
})

const STUBS = { Autocomplete: true, ErrorMessage: true, Draggable: true }

const mountEditor = (props = {}) =>
  mountComponent(GridFieldsEditorModal, {
    props: { modelValue: true, doctype: 'CRM Task', parentDoctype: 'CRM Deal', ...props },
    global: { stubs: STUBS },
  })

describe('GridFieldsEditorModal', () => {
  beforeEach(() => {
    api.fields = [field('subject'), field('status'), field('priority', { in_list_view: 0 })]
    api.gridViewSettings = []
    api.saveUserSettings.mockReset()
  })

  describe('which fields it starts with', () => {
    it('uses the saved grid view when there is one', () => {
      api.gridViewSettings = [{ fieldname: 'status', columns: 3 }]
      expect(mountEditor().vm.fields.map((f) => f.fieldname)).toEqual(['status'])
    })

    it('carries the saved column width across', () => {
      api.gridViewSettings = [{ fieldname: 'status', columns: 3 }]
      expect(mountEditor().vm.fields[0].columns).toBe(3)
    })

    it('falls back to the list-view fields when nothing is saved', () => {
      // `priority` is not in_list_view, so it must not appear by default.
      expect(mountEditor().vm.fields.map((f) => f.fieldname)).toEqual([
        'subject',
        'status',
      ])
    })

    it('defaults a field with no width to two columns', () => {
      expect(mountEditor().vm.fields[0].columns).toBe(2)
    })
  })

  describe('when a saved view names a field that no longer exists', () => {
    beforeEach(() => {
      // A renamed or deleted custom field still sitting in the user's settings.
      api.gridViewSettings = [
        { fieldname: 'status', columns: 3 },
        { fieldname: 'deleted_custom_field', columns: 2 },
      ]
    })

    it('mounts instead of throwing', () => {
      // Regression: the map returned `undefined` for the missing field, and
      // every consumer reads `.fieldname` off the entry.
      expect(() => mountEditor()).not.toThrow()
    })

    it('drops the stale entry and keeps the rest', () => {
      expect(mountEditor().vm.fields.map((f) => f.fieldname)).toEqual(['status'])
    })

    it('leaves no holes in the list', () => {
      expect(mountEditor().vm.fields.every(Boolean)).toBe(true)
    })

    it('can still compute what is available to add', () => {
      expect(
        mountEditor().vm.dropdownFields.map((f) => f.fieldname),
      ).toEqual(['subject', 'priority'])
    })

    it('can still remove a field', () => {
      const wrapper = mountEditor()
      wrapper.vm.removeField({ fieldname: 'status' })
      expect(wrapper.vm.fields).toEqual([])
    })
  })

  describe('the add-field list', () => {
    it('offers only fields not already chosen', () => {
      expect(mountEditor().vm.dropdownFields.map((f) => f.fieldname)).toEqual([
        'priority',
      ])
    })

    it('shrinks as fields are added', async () => {
      const wrapper = mountEditor()
      wrapper.vm.addField(field('priority'))
      await nextTick()
      expect(wrapper.vm.dropdownFields).toEqual([])
    })

    it('is empty when the doctype has no fields at all', () => {
      api.fields = []
      expect(mountEditor().vm.dropdownFields).toEqual([])
    })
  })

  describe('reset', () => {
    it('puts back the saved selection', async () => {
      const wrapper = mountEditor()
      wrapper.vm.addField(field('priority'))
      await nextTick()
      wrapper.vm.reset()
      await nextTick()
      expect(wrapper.vm.fields.map((f) => f.fieldname)).toEqual([
        'subject',
        'status',
      ])
    })
  })

  describe('the unsaved marker', () => {
    it('is off on arrival', () => {
      expect(mountEditor().vm.dirty).toBe(false)
    })

    it('comes on once a field is added', async () => {
      const wrapper = mountEditor()
      wrapper.vm.addField(field('priority'))
      await nextTick()
      expect(wrapper.vm.dirty).toBe(true)
    })

    it('goes off again after a reset', async () => {
      const wrapper = mountEditor()
      wrapper.vm.addField(field('priority'))
      await nextTick()
      wrapper.vm.reset()
      await nextTick()
      expect(wrapper.vm.dirty).toBe(false)
    })
  })

  describe('saving', () => {
    it('sends only the fieldname and width', () => {
      const wrapper = mountEditor()
      wrapper.vm.update()
      expect(api.saveUserSettings).toHaveBeenCalledWith(
        'CRM Deal',
        'GridView',
        [
          { fieldname: 'subject', columns: 2 },
          { fieldname: 'status', columns: 2 },
        ],
        expect.any(Function),
      )
    })

    it('closes once the save reports back', () => {
      const wrapper = mountEditor()
      wrapper.vm.update()
      api.saveUserSettings.mock.calls[0][3]()
      expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    })

    it('refuses to save an empty grid', async () => {
      const wrapper = mountEditor()
      wrapper.vm.fields = []
      await nextTick()
      wrapper.vm.update()
      expect(api.saveUserSettings).not.toHaveBeenCalled()
      expect(wrapper.vm.error).toBe('At least one field is required')
    })

    it('leaves the Save button usable after that refusal', async () => {
      // Regression: `loading` was set before the guard and never cleared on the
      // early return, so the button span forever and the only way out was to
      // close and reopen the dialog.
      const wrapper = mountEditor()
      wrapper.vm.fields = []
      await nextTick()
      wrapper.vm.update()
      expect(wrapper.vm.loading).toBe(false)
    })

    it('can save again once a field is put back', async () => {
      const wrapper = mountEditor()
      wrapper.vm.fields = []
      await nextTick()
      wrapper.vm.update()
      wrapper.vm.addField(field('subject'))
      await nextTick()
      wrapper.vm.update()
      expect(api.saveUserSettings).toHaveBeenCalledTimes(1)
      expect(wrapper.vm.loading).toBe(true)
    })
  })
})

describe('GridRowFieldsModal', () => {
  const mountModal = (props = {}) =>
    mountComponent(GridRowFieldsModal, {
      props: { modelValue: true, doctype: 'CRM Task', parentDoctype: 'CRM Deal', ...props },
      global: { stubs: { FieldLayout: true, FieldLayoutEditor: true } },
    })

  beforeEach(() => {
    api.call.mockReset().mockResolvedValue({})
    api.capture.mockClear()
  })

  const layout = () => [
    {
      name: 'tab',
      sections: [
        { name: 's', columns: [{ fields: [{ fieldname: 'subject' }] }] },
      ],
    },
  ]

  it('requests the Grid Row layout for the child doctype', () => {
    mountModal()
    expect(api.tabs.params).toEqual({
      doctype: 'CRM Task',
      type: 'Grid Row',
      parent_doctype: 'CRM Deal',
    })
  })

  describe('saving', () => {
    it('flattens each column to a list of fieldnames', async () => {
      const wrapper = mountModal()
      api.tabs.data = layout()
      await nextTick()
      wrapper.vm.saveChanges()
      const sent = JSON.parse(api.call.mock.calls[0][1].layout)
      expect(sent[0].sections[0].columns[0].fields).toEqual(['subject'])
    })

    it('closes and asks the parent to reload once saved', async () => {
      const wrapper = mountModal()
      api.tabs.data = layout()
      await nextTick()
      wrapper.vm.saveChanges()
      await flushPromises()
      expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
      expect(wrapper.emitted('reload')).toHaveLength(1)
    })

    it('survives a section that has no columns yet', async () => {
      // Regression: this was the one copy of the layout walk without the
      // `section.columns` guard its three siblings carry, so a half-built
      // layout threw on save.
      const wrapper = mountModal()
      api.tabs.data = [{ name: 'tab', sections: [{ name: 'empty' }] }]
      await nextTick()
      expect(() => wrapper.vm.saveChanges()).not.toThrow()
    })

    it('survives a tab that has no sections yet', async () => {
      const wrapper = mountModal()
      api.tabs.data = [{ name: 'tab' }]
      await nextTick()
      expect(() => wrapper.vm.saveChanges()).not.toThrow()
    })

    it('does nothing at all for an empty layout', async () => {
      const wrapper = mountModal()
      api.tabs.data = []
      await nextTick()
      wrapper.vm.saveChanges()
      expect(api.call).not.toHaveBeenCalled()
    })
  })

  describe('the unsaved marker', () => {
    it('is off when the layout matches what was fetched', async () => {
      const wrapper = mountModal()
      api.tabs.data = layout()
      api.tabs.originalData = layout()
      await nextTick()
      expect(wrapper.vm.dirty).toBe(false)
    })

    it('comes on once the layout is edited', async () => {
      const wrapper = mountModal()
      api.tabs.data = layout()
      api.tabs.originalData = layout()
      await nextTick()
      api.tabs.data[0].sections[0].columns[0].fields.push({ fieldname: 'status' })
      await nextTick()
      expect(wrapper.vm.dirty).toBe(true)
    })
  })

  describe('preview', () => {
    it('starts on the editor', () => {
      expect(mountModal().vm.preview).toBe(false)
    })

    it('toggles from the button', async () => {
      const wrapper = mountModal()
      const button = wrapper
        .findAll('.stub-button')
        .find((b) => b.text() === 'Show Preview')
      await button.trigger('click')
      expect(wrapper.vm.preview).toBe(true)
    })
  })
})
