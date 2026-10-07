const api = vi.hoisted(() => ({
  toast: null,
  fields: null,
  doc: null,
  setValueOptions: null,
}))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  api.toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn() }
  return {
    ...actual,
    toast: api.toast,
    createResource: (options = {}) => {
      api.fields = reactive({ ...options, data: null, fetch: vi.fn(), reload: vi.fn() })
      return api.fields
    },
    createDocumentResource: (options = {}) => {
      api.setValueOptions = options.setValue
      api.doc = reactive({
        ...options,
        doc: { name: 'FCRM Settings' },
        isDirty: false,
        get: { loading: false },
        save: { submit: vi.fn(), loading: false, error: null },
        setValue: { submit: vi.fn() },
      })
      return api.doc
    },
  }
})

import SettingsPage from '@/components/Settings/SettingsPage.vue'
import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'

const df = (fieldname, fieldtype = 'Data', over = {}) => ({
  fieldname,
  fieldtype,
  label: fieldname,
  ...over,
})

const mount = (props = {}) =>
  mountComponent(SettingsPage, {
    props: { doctype: 'FCRM Settings', ...props },
    global: { stubs: { FieldLayout: true, LoadingIndicator: true } },
  })

const tabsFor = (fields) => {
  const wrapper = mount()
  api.fields.data = fields
  return wrapper.vm.tabs
}

describe('SettingsPage', () => {
  beforeEach(() => {
    api.toast.success.mockClear()
    api.toast.error.mockClear()
  })

  describe('building the form layout', () => {
    it('wraps loose fields in a tab, section and column', () => {
      const tabs = tabsFor([df('a'), df('b')])
      expect(tabs).toHaveLength(1)
      expect(tabs[0].name).toBe('first_tab')
      expect(tabs[0].sections[0].columns[0].fields.map((f) => f.fieldname)).toEqual(
        ['a', 'b'],
      )
    })

    it('starts a new tab at each Tab Break', () => {
      const tabs = tabsFor([
        df('a'),
        df('tab2', 'Tab Break'),
        df('b'),
      ])
      expect(tabs.map((t) => t.name)).toEqual(['first_tab', 'tab2'])
      expect(tabs[1].sections[0].columns[0].fields.map((f) => f.fieldname)).toEqual(
        ['b'],
      )
    })

    it('adds no empty tab when the layout opens with a Tab Break', () => {
      // Regression: the guard read `.type`, which no DocField carries, so it
      // was always true and prepended an unnamed empty tab.
      const tabs = tabsFor([df('tab1', 'Tab Break'), df('a')])
      expect(tabs).toHaveLength(1)
      expect(tabs[0].name).toBe('tab1')
    })

    it('adds no empty section when the layout opens with a Section Break', () => {
      const tabs = tabsFor([df('sec1', 'Section Break'), df('a')])
      expect(tabs[0].sections).toHaveLength(1)
      expect(tabs[0].sections[0].name).toBe('sec1')
    })

    it('leaves no section without a field in it', () => {
      const tabs = tabsFor([df('tab1', 'Tab Break'), df('a')])
      for (const tab of tabs) {
        for (const section of tab.sections) {
          const count = section.columns.reduce(
            (n, c) => n + c.fields.length,
            0,
          )
          expect(count, section.name).toBeGreaterThan(0)
        }
      }
    })

    it('starts a new section at each Section Break', () => {
      const tabs = tabsFor([df('a'), df('sec2', 'Section Break'), df('b')])
      expect(tabs[0].sections).toHaveLength(2)
      expect(tabs[0].sections[1].name).toBe('sec2')
    })

    it('carries the section label and border flag across', () => {
      const tabs = tabsFor([
        df('a'),
        df('sec2', 'Section Break', { label: 'More', hide_border: 1 }),
        df('b'),
      ])
      expect(tabs[0].sections[1]).toMatchObject({
        label: 'More',
        hideBorder: 1,
      })
    })

    it('starts a new column at each Column Break', () => {
      const tabs = tabsFor([df('a'), df('col2', 'Column Break'), df('b')])
      const [section] = tabs[0].sections
      expect(section.columns).toHaveLength(2)
      expect(section.columns[1].fields.map((f) => f.fieldname)).toEqual(['b'])
    })

    it('puts each field in the column that is currently open', () => {
      const tabs = tabsFor([
        df('a'),
        df('col2', 'Column Break'),
        df('b'),
        df('sec2', 'Section Break'),
        df('c'),
      ])
      expect(tabs[0].sections[0].columns[0].fields.map((f) => f.fieldname)).toEqual(['a'])
      expect(tabs[0].sections[0].columns[1].fields.map((f) => f.fieldname)).toEqual(['b'])
      expect(tabs[0].sections[1].columns[0].fields.map((f) => f.fieldname)).toEqual(['c'])
    })

    it('gives every section and column a name so keys stay stable', () => {
      const tabs = tabsFor([df('a'), df('sec2', 'Section Break'), df('b')])
      for (const tab of tabs) {
        for (const section of tab.sections) {
          expect(section.name, 'section').toBeTruthy()
          for (const column of section.columns) {
            expect(column.name, 'column').toBeTruthy()
          }
        }
      }
    })

    it('builds nothing before the fields arrive', () => {
      expect(mount().vm.tabs).toEqual([])
    })
  })

  describe('the heading', () => {
    it('falls back to the doctype name', () => {
      expect(mount().text()).toContain('FCRM Settings')
    })

    it('prefers an explicit title', () => {
      const wrapper = mount({ title: 'Email Settings' })
      expect(wrapper.text()).toContain('Email Settings')
      expect(wrapper.text()).not.toContain('FCRM Settings')
    })

    it('offers a back control only when the caller supplies one', async () => {
      const back = vi.fn()
      const withBack = mount({ back })
      await withBack.findAll('.stub-button')[0].trigger('click')
      expect(back).toHaveBeenCalled()
    })

    it('marks the form when there are unsaved edits', async () => {
      const wrapper = mount()
      expect(wrapper.text()).not.toContain('Not Saved')
      api.doc.isDirty = true
      await nextTick()
      expect(wrapper.text()).toContain('Not Saved')
    })
  })

  describe('saving', () => {
    it('submits from the Update button', async () => {
      const wrapper = mount()
      const update = wrapper
        .findAll('.stub-button')
        .find((b) => b.text() === 'Update')
      await update.trigger('click')
      expect(api.doc.save.submit).toHaveBeenCalled()
    })

    it('confirms with the caller message', () => {
      mount({ successMessage: 'Telephony updated' })
      api.setValueOptions.onSuccess()
      expect(api.toast.success).toHaveBeenCalledWith('Telephony updated')
    })

    it('has a default confirmation', () => {
      mount()
      api.setValueOptions.onSuccess()
      expect(api.toast.success).toHaveBeenCalledWith('Updated Successfully')
    })

    it('shows the server reason when it refuses', () => {
      mount()
      api.setValueOptions.onError({ messages: ['Invalid API key'] })
      expect(api.toast.error).toHaveBeenCalledWith('Invalid API key')
    })

    it('shows a plain Error message rather than burying it', () => {
      // The old expression was `err.message + ': ' + err.messages[0]`, which
      // threw outright when there was no `messages` array.
      mount()
      api.setValueOptions.onError(new Error('Network request failed'))
      expect(api.toast.error).toHaveBeenCalledWith('Network request failed')
    })

    it('falls back when the failure carries nothing at all', () => {
      mount()
      api.setValueOptions.onError({})
      expect(api.toast.error).toHaveBeenCalledWith('Failed to save settings')
    })
  })

  describe('while loading', () => {
    it('shows a spinner instead of an empty form', async () => {
      const wrapper = mount()
      api.doc.get.loading = true
      await nextTick()
      expect(wrapper.findComponent({ name: 'LoadingIndicator' }).exists()).toBe(
        true,
      )
    })
  })
})
