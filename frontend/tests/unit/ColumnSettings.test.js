const meta = vi.hoisted(() => ({
  fields: [
    { fieldname: 'organization', label: 'Organization', fieldtype: 'Data' },
    { fieldname: 'annual_revenue', label: 'Revenue', fieldtype: 'Currency' },
    { fieldname: 'probability', label: 'Probability', fieldtype: 'Percent' },
    { fieldname: 'status', label: 'Status', fieldtype: 'Select' },
  ],
}))

vi.mock('@/stores/meta', () => ({
  getMeta: () => ({ getFields: () => meta.fields }),
}))

import ColumnSettings from '@/components/ColumnSettings.vue'
import { mountComponent } from '../helpers/mount'

const STUBS = {
  Popover: {
    name: 'Popover',
    template: '<div><slot name="target" :togglePopover="() => {}" /><slot name="body" :close="() => {}" /></div>',
  },
  Autocomplete: {
    name: 'Autocomplete',
    props: ['options'],
    template: '<div class="autocomplete" />',
  },
  Draggable: {
    name: 'Draggable',
    props: ['modelValue', 'list'],
    template: '<div><slot v-for="e in (list || [])" :element="e" /></div>',
  },
}

const COLUMNS = [
  { key: 'organization', label: 'Organization', width: '10rem' },
  { key: 'status', label: 'Status', width: '8rem' },
]

function mountSettings(data = {}) {
  return mountComponent(ColumnSettings, {
    props: {
      doctype: 'CRM Deal',
      modelValue: {
        data: {
          columns: structuredClone(COLUMNS),
          rows: ['organization', 'status'],
          is_default: false,
          ...data,
        },
      },
    },
    global: { stubs: STUBS },
  })
}

const lastUpdate = (wrapper) => wrapper.emitted('update')?.at(-1)?.[0]

describe('ColumnSettings', () => {
  describe('the field picker', () => {
    it('offers only fields that are not already columns', () => {
      const names = mountSettings().vm.fields.map((f) => f.fieldname)
      expect(names).toEqual(['annual_revenue', 'probability'])
    })

    it('offers everything when no columns are set', () => {
      const wrapper = mountSettings({ columns: [], rows: [] })
      expect(wrapper.vm.fields).toHaveLength(4)
    })
  })

  describe('adding a column', () => {
    it('appends the column and its row key', () => {
      const wrapper = mountSettings()
      wrapper.vm.addColumn({
        fieldname: 'probability',
        label: 'Probability',
        fieldtype: 'Percent',
        value: 'probability',
      })
      expect(wrapper.vm.columns.map((c) => c.key)).toContain('probability')
      expect(wrapper.vm.rows).toContain('probability')
    })

    it('right-aligns numeric columns', () => {
      // Numbers read better against a common decimal edge.
      const wrapper = mountSettings()
      for (const fieldtype of ['Float', 'Int', 'Percent', 'Currency', 'Duration']) {
        wrapper.vm.addColumn({ fieldname: fieldtype, label: fieldtype, fieldtype })
      }
      const added = wrapper.vm.columns.slice(2)
      expect(added.every((c) => c.align === 'right')).toBe(true)
    })

    it('left-aligns everything else', () => {
      const wrapper = mountSettings()
      wrapper.vm.addColumn({ fieldname: 'x', label: 'X', fieldtype: 'Data' })
      expect(wrapper.vm.columns.at(-1).align).toBe('left')
    })

    it('gives a new column a default width', () => {
      const wrapper = mountSettings()
      wrapper.vm.addColumn({ fieldname: 'x', label: 'X', fieldtype: 'Data' })
      expect(wrapper.vm.columns.at(-1).width).toBe('10rem')
    })

    it('reloads the list, since the new column needs its data', () => {
      const wrapper = mountSettings()
      wrapper.vm.addColumn({ fieldname: 'x', label: 'X', fieldtype: 'Data' })
      expect(lastUpdate(wrapper).reload).toBe(true)
    })

    it('ignores an empty selection', () => {
      const wrapper = mountSettings()
      wrapper.vm.addColumn(null)
      expect(wrapper.vm.columns).toHaveLength(2)
      expect(wrapper.emitted('update')).toBeUndefined()
    })
  })

  describe('removing a column', () => {
    it('drops the column and its row key', () => {
      const wrapper = mountSettings()
      wrapper.vm.removeColumn({ key: 'status' })
      expect(wrapper.vm.columns.map((c) => c.key)).toEqual(['organization'])
      expect(wrapper.vm.rows).toEqual(['organization'])
    })

    it('keeps `name` in the rows even when its column goes', () => {
      // The identifier is needed to build row links regardless of display.
      const wrapper = mountSettings({
        columns: [{ key: 'name', label: 'ID' }],
        rows: ['name', 'status'],
      })
      wrapper.vm.removeColumn({ key: 'name' })
      expect(wrapper.vm.rows).toContain('name')
    })

    it('does not reload — the data is already loaded', () => {
      const wrapper = mountSettings()
      wrapper.vm.removeColumn({ key: 'status' })
      expect(lastUpdate(wrapper).reload).toBe(false)
    })
  })

  describe('editing a column', () => {
    it('keeps a copy so the edit can be abandoned', () => {
      const wrapper = mountSettings()
      wrapper.vm.editColumn(wrapper.vm.columns[0])
      expect(wrapper.vm.edit).toBe(true)
      expect(wrapper.vm.column.old).toMatchObject({ label: 'Organization' })
    })

    it('applies a new label and width', () => {
      const wrapper = mountSettings()
      const target = wrapper.vm.columns[0]
      wrapper.vm.editColumn(target)
      wrapper.vm.updateColumn({ ...target, label: 'Company', width: '20rem' })
      expect(wrapper.vm.columns[0].label).toBe('Company')
      expect(wrapper.vm.columns[0].width).toBe('20rem')
    })

    it('does not leave the backup copy on the saved column', () => {
      const wrapper = mountSettings()
      const target = wrapper.vm.columns[0]
      wrapper.vm.editColumn(target)
      wrapper.vm.updateColumn({ ...target, label: 'Company', width: '20rem' })
      expect(wrapper.vm.columns[0].old).toBeUndefined()
    })

    it('restores the original on cancel', () => {
      const wrapper = mountSettings()
      wrapper.vm.editColumn(wrapper.vm.columns[0])
      wrapper.vm.column.label = 'Half typed'
      wrapper.vm.cancelUpdate()
      expect(wrapper.vm.column.label).toBe('Organization')
      expect(wrapper.vm.edit).toBe(false)
    })
  })

  describe('reset', () => {
    it('restores the values captured when the panel opened', () => {
      const wrapper = mountSettings()
      wrapper.vm.oldValues = {
        columns: [{ key: 'original' }],
        rows: ['original'],
        isDefault: false,
      }
      wrapper.vm.reset(() => {})
      const update = lastUpdate(wrapper)
      expect(update.reset).toBe(true)
      expect(update.columns).toEqual([{ key: 'original' }])
    })

    it('resetting to default flags it as the default view', () => {
      const wrapper = mountSettings()
      wrapper.vm.resetToDefault(() => {})
      const update = lastUpdate(wrapper)
      expect(update.isDefault).toBe(true)
      expect(update.reload).toBe(true)
    })

    it('closes the panel afterwards', () => {
      const wrapper = mountSettings()
      const close = vi.fn()
      wrapper.vm.reset(close)
      expect(close).toHaveBeenCalled()
      wrapper.vm.resetToDefault(close)
      expect(close).toHaveBeenCalledTimes(2)
    })
  })
})
