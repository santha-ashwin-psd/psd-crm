const api = vi.hoisted(() => ({
  fields: [],
  gridViewSettings: [],
  gridSettings: {},
  createDocument: vi.fn(),
  triggerOnChange: vi.fn(),
  triggerButton: vi.fn(),
  triggerOnRowAdd: vi.fn(),
  triggerOnRowRemove: vi.fn(),
}))

vi.mock('@/stores/meta', () => ({
  getMeta: () => ({
    getFields: () => api.fields,
    getGridViewSettings: () => api.gridViewSettings,
    getGridSettings: () => api.gridSettings,
    getFloatWithPrecision: (f, d) => d?.[f],
    getCurrencyWithPrecision: (f, d) => d?.[f],
    getFormattedCurrency: (f, d) => `₹${d?.[f]}`,
  }),
}))

vi.mock('@/stores/users', () => ({
  usersStore: () => ({
    users: { data: { crmUsers: [{ name: 'ada@x.com' }] } },
    getUser: (e) => ({ full_name: e, user_image: '' }),
  }),
}))

vi.mock('@/composables/document', () => ({ createDocument: api.createDocument }))

vi.mock('vuedraggable', () => ({
  default: { name: 'Draggable', props: ['modelValue'], template: '<div><slot name="item" v-for="(el,i) in modelValue" :element="el" :index="i" /></div>' },
}))

import GridControl from '@/components/Controls/Grid.vue'
import { mountComponent } from '../helpers/mount'
import { computed, nextTick } from 'vue'

const field = (fieldname, over = {}) => ({
  label: fieldname,
  fieldname,
  fieldtype: 'Data',
  in_list_view: 1,
  ...over,
})

const STUBS = {
  Draggable: true, Combobox: true, Tooltip: true, Checkbox: true,
  TimePicker: true, DateTimePicker: true, DatePicker: true,
  Link: true, UserAvatar: true, GridRowModal: true,
  GridFieldsEditorModal: true, GridRowFieldsModal: true,
  AttachControl: true, HtmlControl: true, GeolocationControl: true,
  TextEditorControl: true, RatingInput: true, DurationInput: true,
  Password: true, ButtonControl: true, FormattedInput: true,
}

const mount = (rows = [], overrides = {}, provide = {}) =>
  mountComponent(GridControl, {
    props: {
      doctype: 'CRM Product',
      parentDoctype: 'CRM Deal',
      parentFieldname: 'products',
      modelValue: rows,
      overrides,
    },
    global: {
      stubs: STUBS,
      provide: {
        triggerOnChange: api.triggerOnChange,
        triggerButton: api.triggerButton,
        triggerOnRowAdd: api.triggerOnRowAdd,
        triggerOnRowRemove: api.triggerOnRowRemove,
        fieldPropertyOverrides: computed(() => ({})),
        ...provide,
      },
    },
  })

describe('Grid control', () => {
  beforeEach(() => {
    api.fields = [field('item'), field('qty', { fieldtype: 'Int' }), field('note', { in_list_view: 0 })]
    api.gridViewSettings = []
    api.createDocument.mockReset()
    api.triggerOnChange.mockReset()
    api.triggerButton.mockReset()
    api.triggerOnRowAdd.mockReset()
    api.triggerOnRowRemove.mockReset()
  })

  describe('which columns are shown', () => {
    it('uses the list-view fields when nothing is saved', () => {
      expect(mount().vm.fields.map((f) => f.fieldname)).toEqual(['item', 'qty'])
    })

    it('uses the saved grid view when there is one', () => {
      api.gridViewSettings = [{ fieldname: 'qty', columns: 3 }]
      expect(mount().vm.fields.map((f) => f.fieldname)).toEqual(['qty'])
    })

    it('drops a saved column whose field no longer exists', () => {
      // Regression: `find` returned undefined, `getFieldObj` spread it into
      // `{}` rather than throwing, and the grid grew a blank unlabelled column.
      api.gridViewSettings = [
        { fieldname: 'qty', columns: 3 },
        { fieldname: 'deleted_field', columns: 2 },
      ]
      expect(mount().vm.fields.map((f) => f.fieldname)).toEqual(['qty'])
    })

    it('leaves no field without a fieldname', () => {
      api.gridViewSettings = [{ fieldname: 'gone', columns: 2 }]
      expect(mount().vm.fields.every((f) => f.fieldname)).toBe(true)
    })

    it('hides a column a script marked hidden', () => {
      const overrides = computed(() => ({ 'products.qty': { hidden: 1 } }))
      expect(
        mount([], {}, { fieldPropertyOverrides: overrides }).vm.fields.map(
          (f) => f.fieldname,
        ),
      ).toEqual(['item'])
    })

    it('shows nothing when the doctype has no fields', () => {
      api.fields = []
      expect(mount().vm.fields).toEqual([])
    })
  })

  describe('column widths', () => {
    it('defaults every column to two units', () => {
      expect(mount().vm.gridTemplateColumns).toBe('minmax(0, 2fr) minmax(0, 2fr)')
    })

    it('honours the saved width', () => {
      api.gridViewSettings = [
        { fieldname: 'item', columns: 4 },
        { fieldname: 'qty', columns: 1 },
      ]
      expect(mount().vm.gridTemplateColumns).toBe(
        'minmax(0, 4fr) minmax(0, 1fr)',
      )
    })

    it('falls back to a single column when there are no fields', () => {
      api.fields = []
      expect(mount().vm.gridTemplateColumns).toBe('1fr')
    })
  })

  describe('the expand-state list', () => {
    it('starts empty for an empty grid', () => {
      // Regression: `new Array(len || [])` built a one-element array for an
      // empty grid, because `[]` is not a number.
      expect(mount().vm.showRowList).toEqual([])
    })

    it('matches the row count on arrival', () => {
      expect(mount([{ name: 'a' }, { name: 'b' }]).vm.showRowList).toEqual([
        false,
        false,
      ])
    })

    it('grows with a new row', async () => {
      const wrapper = mount([])
      wrapper.vm.addRow()
      await nextTick()
      expect(wrapper.vm.showRowList).toEqual([false])
    })
  })

  describe('adding a row', () => {
    it('seeds every field, not just the visible ones', () => {
      const wrapper = mount([])
      wrapper.vm.addRow()
      const row = wrapper.vm.rows[0]
      expect(Object.keys(row)).toEqual(
        expect.arrayContaining(['item', 'qty', 'note']),
      )
    })

    it('starts a checkbox at false, not an empty string', () => {
      api.fields = [field('done', { fieldtype: 'Check' })]
      const wrapper = mount([])
      wrapper.vm.addRow()
      expect(wrapper.vm.rows[0].done).toBe(false)
    })

    it('numbers the row from one', () => {
      const wrapper = mount([{ name: 'a', idx: 1 }])
      wrapper.vm.addRow()
      expect(wrapper.vm.rows[1].idx).toBe(2)
    })

    it('marks it local and stamps the parent links', () => {
      // The server needs all four to attach the row to its parent document.
      const wrapper = mount([])
      wrapper.vm.addRow()
      expect(wrapper.vm.rows[0]).toMatchObject({
        __islocal: true,
        doctype: 'CRM Product',
        parentfield: 'products',
        parenttype: 'CRM Deal',
      })
    })

    it('gives it a name so it can be selected before it is saved', () => {
      const wrapper = mount([])
      wrapper.vm.addRow()
      expect(wrapper.vm.rows[0].name).toEqual(expect.any(String))
      expect(wrapper.vm.rows[0].name.length).toBe(10)
    })

    it('tells any attached script about it', () => {
      const wrapper = mount([])
      wrapper.vm.addRow()
      expect(api.triggerOnRowAdd).toHaveBeenCalledWith(wrapper.vm.rows[0])
    })
  })

  describe('field defaults', () => {
    const def = (wrapper, value, fieldtype) =>
      wrapper.vm.getDefaultValue(value, fieldtype)

    it('parses a number for Int', () => {
      expect(def(mount(), '5', 'Int')).toBe(5)
    })

    it.each(['Float', 'Currency', 'Percent'])('parses a decimal for %s', (t) => {
      expect(def(mount(), '5.5', t)).toBe(5.5)
    })

    it.each(['1', 'true', 'True'])('reads %s as a ticked box', (v) => {
      expect(def(mount(), v, 'Check')).toBe(true)
    })

    it.each(['0', 'false', 'False'])('reads %s as unticked', (v) => {
      expect(def(mount(), v, 'Check')).toBe(false)
    })

    it('resolves Today for a Date', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-03-15T10:00:00'))
      expect(def(mount(), 'Today', 'Date')).toBe('2026-03-15')
      vi.useRealTimers()
    })

    it.each(['Now', 'now'])('resolves %s for a Datetime', (v) => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-03-15T10:30:00'))
      expect(def(mount(), v, 'Datetime')).toBe('2026-03-15 10:30:00')
      vi.useRealTimers()
    })

    it('formats a literal date', () => {
      expect(def(mount(), '2026-01-02', 'Date')).toBe('2026-01-02')
    })

    it('passes anything else through untouched', () => {
      expect(def(mount(), 'hello', 'Data')).toBe('hello')
    })
  })

  describe('selecting rows', () => {
    it('selects all', () => {
      const wrapper = mount([{ name: 'a' }, { name: 'b' }])
      wrapper.vm.toggleSelectAllRows(true)
      expect(wrapper.vm.allRowsSelected).toBe(true)
    })

    it('clears the selection', () => {
      const wrapper = mount([{ name: 'a' }, { name: 'b' }])
      wrapper.vm.toggleSelectAllRows(true)
      wrapper.vm.toggleSelectAllRows(false)
      expect(wrapper.vm.selectedRows.size).toBe(0)
    })

    it('is not "all selected" when the grid is empty', () => {
      // 0 rows and 0 selected would otherwise satisfy the equality check and
      // tick the header box on an empty grid.
      expect(mount([]).vm.allRowsSelected).toBe(false)
    })

    it('toggles one row on and off', () => {
      const wrapper = mount([{ name: 'a' }])
      wrapper.vm.toggleSelectRow({ name: 'a' })
      expect(wrapper.vm.selectedRows.has('a')).toBe(true)
      wrapper.vm.toggleSelectRow({ name: 'a' })
      expect(wrapper.vm.selectedRows.has('a')).toBe(false)
    })

    it('offers Delete only once something is selected', () => {
      const wrapper = mount([{ name: 'a' }])
      expect(wrapper.vm.showDeleteBtn).toBe(false)
      wrapper.vm.toggleSelectRow({ name: 'a' })
      expect(wrapper.vm.showDeleteBtn).toBe(true)
    })
  })

  describe('deleting rows', () => {
    it('removes exactly the selected ones', () => {
      const wrapper = mount([{ name: 'a' }, { name: 'b' }, { name: 'c' }])
      wrapper.vm.toggleSelectRow({ name: 'b' })
      wrapper.vm.deleteRows()
      expect(wrapper.vm.rows.map((r) => r.name)).toEqual(['a', 'c'])
    })

    it('clears the selection afterwards', () => {
      const wrapper = mount([{ name: 'a' }])
      wrapper.vm.toggleSelectRow({ name: 'a' })
      wrapper.vm.deleteRows()
      expect(wrapper.vm.selectedRows.size).toBe(0)
    })

    it('tells any attached script what went', () => {
      const wrapper = mount([{ name: 'a' }, { name: 'b' }])
      wrapper.vm.toggleSelectRow({ name: 'a' })
      wrapper.vm.deleteRows()
      expect(api.triggerOnRowRemove).toHaveBeenCalled()
    })
  })

  describe('reordering', () => {
    it('renumbers every row from one', () => {
      const wrapper = mount([
        { name: 'a', idx: 3 },
        { name: 'b', idx: 1 },
      ])
      wrapper.vm.reorder()
      expect(wrapper.vm.rows.map((r) => r.idx)).toEqual([1, 2])
    })
  })

  describe('reporting a change', () => {
    it('passes a plain value straight through', () => {
      mount().vm.fieldChange('5', { fieldname: 'qty' }, { name: 'a' })
      expect(api.triggerOnChange).toHaveBeenCalledWith('qty', '5', { name: 'a' })
    })

    it('unwraps a select option to its value', () => {
      // Autocomplete hands back `{ label, value }`; storing the object would
      // write "[object Object]" to the document.
      mount().vm.fieldChange(
        { label: 'Five', value: 5 },
        { fieldname: 'qty' },
        { name: 'a' },
      )
      expect(api.triggerOnChange).toHaveBeenCalledWith('qty', 5, { name: 'a' })
    })

    it('keeps an array intact', () => {
      mount().vm.fieldChange(['a', 'b'], { fieldname: 'tags' }, { name: 'a' })
      expect(api.triggerOnChange).toHaveBeenCalledWith(
        'tags',
        ['a', 'b'],
        { name: 'a' },
      )
    })

    it('passes null through rather than treating it as an object', () => {
      mount().vm.fieldChange(null, { fieldname: 'qty' }, { name: 'a' })
      expect(api.triggerOnChange).toHaveBeenCalledWith('qty', null, {
        name: 'a',
      })
    })
  })

  describe('select options', () => {
    it('splits a newline-separated string', () => {
      expect(mount().vm.getOptions('One\nTwo')).toEqual([
        { label: 'One', value: 'One' },
        { label: 'Two', value: 'Two' },
      ])
    })

    it('leaves an array alone', () => {
      const opts = [{ label: 'A', value: 'a' }]
      expect(mount().vm.getOptions(opts)).toBe(opts)
    })

    it('returns nothing for anything else', () => {
      expect(mount().vm.getOptions(undefined)).toEqual([])
      expect(mount().vm.getOptions(null)).toEqual([])
    })
  })

  describe('per-row field overrides', () => {
    const base = { fieldname: 'qty', fieldtype: 'Int', read_only: 0 }

    it('returns the field untouched when nothing overrides it', () => {
      const wrapper = mount()
      expect(wrapper.vm.getRowFieldObj(base, { name: 'r1' })).toBe(base)
    })

    it('applies a column-level override to every row', () => {
      const overrides = computed(() => ({ 'products.qty': { read_only: 1 } }))
      const wrapper = mount([], {}, { fieldPropertyOverrides: overrides })
      expect(wrapper.vm.getRowFieldObj(base, { name: 'r1' }).read_only).toBe(1)
    })

    it('lets a row-level override win over the column', () => {
      const overrides = computed(() => ({
        'products.qty': { read_only: 1 },
        'products.qty:r1': { read_only: 0 },
      }))
      const wrapper = mount([], {}, { fieldPropertyOverrides: overrides })
      expect(wrapper.vm.getRowFieldObj(base, { name: 'r1' }).read_only).toBe(0)
      expect(wrapper.vm.getRowFieldObj(base, { name: 'r2' }).read_only).toBe(1)
    })

    it('copes with a row that has no name yet', () => {
      const overrides = computed(() => ({ 'products.qty': { read_only: 1 } }))
      const wrapper = mount([], {}, { fieldPropertyOverrides: overrides })
      expect(wrapper.vm.getRowFieldObj(base, {}).read_only).toBe(1)
    })
  })

  describe('button fields', () => {
    it('prefers a script-supplied click handler', async () => {
      const click = vi.fn()
      await mount().vm.handleButtonClick({ fieldname: 'go', click }, { name: 'a' })
      expect(click).toHaveBeenCalledWith({ name: 'a' })
      expect(api.triggerButton).not.toHaveBeenCalled()
    })

    it('falls back to the document trigger', async () => {
      await mount().vm.handleButtonClick({ fieldname: 'go' }, { name: 'a' })
      expect(api.triggerButton).toHaveBeenCalledWith('go', { name: 'a' })
    })
  })

  describe('link fields', () => {
    it('turns a User link into a User field filtered to CRM users', () => {
      api.fields = [field('owner', { fieldtype: 'Link', options: 'User' })]
      const f = mount().vm.fields[0]
      expect(f.fieldtype).toBe('User')
      expect(JSON.parse(f.link_filters).name).toEqual(['in', ['ada@x.com']])
    })

    it('gives a non-User link a create handler', () => {
      api.fields = [field('product', { fieldtype: 'Link', options: 'CRM Item' })]
      expect(typeof mount().vm.fields[0].create).toBe('function')
    })

    it('creates against the linked doctype', () => {
      api.fields = [field('product', { fieldtype: 'Link', options: 'CRM Item' })]
      const wrapper = mount()
      const f = wrapper.vm.fields[0]
      const close = vi.fn()
      f.create('Widget', f, { name: 'r1' }, close)
      expect(api.createDocument).toHaveBeenCalledWith(
        'CRM Item',
        'Widget',
        close,
        expect.any(Function),
      )
    })

    it('writes the created record back into the row', () => {
      api.fields = [field('product', { fieldtype: 'Link', options: 'CRM Item' })]
      const wrapper = mount()
      const f = wrapper.vm.fields[0]
      f.create('Widget', f, { name: 'r1' }, vi.fn())
      api.createDocument.mock.calls[0][3]({ name: 'ITEM-1' })
      expect(api.triggerOnChange).toHaveBeenCalledWith('product', 'ITEM-1', {
        name: 'r1',
      })
    })

    it('falls back to the label for a missing placeholder', () => {
      expect(mount().vm.fields[0].placeholder).toBe('item')
    })
  })
})
