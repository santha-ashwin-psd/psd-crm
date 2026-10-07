const api = vi.hoisted(() => ({ fields: [] }))

vi.mock('@/stores/meta', () => ({
  getMeta: () => ({ getFields: () => api.fields }),
}))

vi.mock('vuedraggable', () => ({
  default: {
    name: 'Draggable',
    props: ['list', 'modelValue', 'itemKey', 'group', 'handle'],
    template:
      '<div><slot name="item" v-for="(el, i) in (list || modelValue || [])" :element="el" :index="i" /><slot name="footer" /></div>',
  },
}))

import KanbanView from '@/components/Kanban/KanbanView.vue'
import KanbanSettings from '@/components/Kanban/KanbanSettings.vue'
import { mountComponent } from '../helpers/mount'
import { nextTick, reactive } from 'vue'

const quiet = { inheritAttrs: false, template: '<div><slot /></div>' }
const STUBS = {
  Autocomplete: {
    name: 'AutocompleteStub',
    inheritAttrs: false,
    props: ['options', 'modelValue'],
    template: '<div><slot name="target" :togglePopover="() => {}" /></div>',
  },
  Dropdown: {
    name: 'DropdownStub',
    inheritAttrs: false,
    props: ['options'],
    template: '<div><slot /></div>',
  },
  Popover: { ...quiet, name: 'PopoverStub' },
  Dialog: {
    name: 'DialogStub',
    inheritAttrs: false,
    props: ['open', 'modelValue'],
    template:
      '<div v-if="open || modelValue"><slot /><slot name="body-content" /></div>',
  },
  SkeletonLoader: { ...quiet, name: 'S1' },
  RefreshIcon: { ...quiet, name: 'S2' },
  IndicatorIcon: { ...quiet, name: 'S3' },
  DragVerticalIcon: { ...quiet, name: 'S4' },
  KanbanIcon: { ...quiet, name: 'S5' },
}

const col = (name, data = [], over = {}) => ({
  column: { name, ...over },
  data,
  page_length: 20,
})

describe('KanbanView', () => {
  const mount = (data, props = {}) => {
    const kanban = reactive({
      data: { view_type: 'kanban', column_field: 'status', ...data },
      loading: false,
    })
    return mountComponent(KanbanView, {
      props: { modelValue: kanban, ...props },
      global: { stubs: STUBS },
    })
  }

  describe('the columns it shows', () => {
    it('shows none until the data arrives', () => {
      expect(mount({}).vm.columns).toEqual([])
    })

    it('shows none for a view that is not a kanban', () => {
      // The same list resource backs the list and group-by views.
      expect(
        mount({ view_type: 'list', data: [col('Open')] }).vm.columns,
      ).toEqual([])
    })

    it('shows one per column', () => {
      const wrapper = mount({ data: [col('Open'), col('Won')] })
      expect(wrapper.vm.columns.map((c) => c.column.name)).toEqual([
        'Open',
        'Won',
      ])
    })

    it('gives every column a colour when none has one', () => {
      const wrapper = mount({ data: [col('Open'), col('Won')] })
      const colours = wrapper.vm.columns.map((c) => c.column.color)
      expect(colours.every(Boolean)).toBe(true)
    })

    it('takes the default colour from what the column MEANS', () => {
      // Regression: the default used to be `colors[i % colors.length]`, and
      // since that array runs gray, blue, green, red, pink… the fourth column
      // was always red. On the task board the fourth column is "Done", so a
      // completed column rendered as an error state.
      const wrapper = mount({
        data: [
          col('Backlog'),
          col('Todo'),
          col('In Progress'),
          col('Done'),
          col('Canceled'),
        ],
      })
      expect(wrapper.vm.columns.map((c) => c.column.color)).toEqual([
        'gray',
        'blue',
        'blue',
        'green',
        'red',
      ])
    })

    it('tones the deal board from the same table', () => {
      // Same component, different doctype — the meaning comes from the shared
      // status vocabulary, not from a per-board list.
      const wrapper = mount({
        data: [
          col('Qualification'),
          col('Negotiation'),
          col('Won'),
          col('Lost'),
        ],
      })
      expect(wrapper.vm.columns.map((c) => c.column.color)).toEqual([
        'blue',
        'orange',
        'green',
        'red',
      ])
    })

    it('falls back to neutral for a status with no defined meaning', () => {
      // Grey is the honest answer — better than borrowing a colour that
      // implies something untrue about a site's custom column.
      const wrapper = mount({ data: [col('Blergh')] })
      expect(wrapper.vm.columns[0].column.color).toBe('gray')
    })

    it('re-tones a board that has the OLD positional palette saved', () => {
      // The bug this guards: updateColumn() persists colours on any column
      // change, so every board that was ever dragged had gray/blue/green/red/
      // pink baked into its saved view. Changing only the default left those
      // boards showing a red "Done" forever.
      const wrapper = mount({
        data: [
          col('Backlog', [], { color: 'gray' }),
          col('Todo', [], { color: 'blue' }),
          col('In Progress', [], { color: 'green' }),
          col('Done', [], { color: 'red' }),
          col('Canceled', [], { color: 'pink' }),
        ],
      })
      expect(wrapper.vm.columns.map((c) => c.column.color)).toEqual([
        'gray',
        'blue',
        'blue',
        'green',
        'red',
      ])
    })

    it('keeps a colour someone actually picked', () => {
      // One column off the legacy sequence means a human chose it, so the
      // whole board is left alone.
      const wrapper = mount({
        data: [
          col('Backlog', [], { color: 'gray' }),
          col('Todo', [], { color: 'blue' }),
          col('In Progress', [], { color: 'violet' }),
          col('Done', [], { color: 'red' }),
          col('Canceled', [], { color: 'pink' }),
        ],
      })
      expect(wrapper.vm.columns.map((c) => c.column.color)).toEqual([
        'gray',
        'blue',
        'violet',
        'red',
        'pink',
      ])
    })

    it('leaves the colours alone when they are already set', () => {
      // Colours are saved on the view; a colour the user picked from the
      // popover must survive, so the semantic default only fills in a board
      // that has never had one assigned.
      const wrapper = mount({
        data: [col('Open', [], { color: 'green' }), col('Won')],
      })
      expect(wrapper.vm.columns[0].column.color).toBe('green')
    })
  })

  describe('column field visibility', () => {
    // `parseBgColor` is gone with the per-card gradient wash it fed: the card
    // no longer paints a status-tinted overlay, so a card-background colour
    // map has nothing left to colour. Column identity now comes from the
    // header's indicator dot (`parseColor`, still covered above).
    it('no longer exposes a card background colour map', () => {
      expect(mount({}).vm.parseBgColor).toBeUndefined()
    })

    it('renders every field by default', () => {
      const wrapper = mount({})
      const column = { fields: ['description', 'priority', 'creation'] }
      expect(wrapper.vm.visibleFields(column)).toEqual([
        'description',
        'priority',
        'creation',
      ])
    })

    it('hides the fields the caller renders itself', () => {
      // A caller promoting a field into its own #title slot must remove it
      // here: a false `v-if` inside #fields renders only a comment, which Vue
      // treats as an empty slot and replaces with this component's default
      // renderer — so the field came back as raw text.
      // mount(data, props) — options is a prop, not kanban data.
      const wrapper = mount(
        {},
        { options: { hideFields: ['priority', 'due_date'] } },
      )
      const column = { fields: ['description', 'priority', 'creation'] }
      expect(wrapper.vm.visibleFields(column)).toEqual([
        'description',
        'creation',
      ])
    })

    it('is safe when a column carries no fields', () => {
      const wrapper = mount({}, { options: { hideFields: ['priority'] } })
      expect(wrapper.vm.visibleFields({})).toEqual([])
    })
  })

  describe('collapsing a column', () => {
    it('starts expanded', () => {
      expect(mount({}).vm.isCollapsed('Open')).toBe(false)
    })

    it('collapses and expands again', () => {
      const wrapper = mount({})
      wrapper.vm.toggleCollapse('Open')
      expect(wrapper.vm.isCollapsed('Open')).toBe(true)
      wrapper.vm.toggleCollapse('Open')
      expect(wrapper.vm.isCollapsed('Open')).toBe(false)
    })

    it('tracks each column separately', () => {
      const wrapper = mount({})
      wrapper.vm.toggleCollapse('Open')
      expect(wrapper.vm.isCollapsed('Won')).toBe(false)
    })
  })

  describe('the total across a column', () => {
    const summed = (rows, over = {}) =>
      mount({ data: [col('Open', rows)] }, { sumField: 'amount', ...over })

    it('is nothing when no field is being summed', () => {
      expect(
        mount({ data: [col('Open', [{ amount: 5 }])] }).vm.getColumnSum(
          mount({ data: [col('Open', [{ amount: 5 }])] }).vm.columns[0],
        ),
      ).toBe(0)
    })

    it('adds the plain numbers', () => {
      const wrapper = summed([{ amount: 100 }, { amount: 250 }])
      expect(wrapper.vm.getColumnSum(wrapper.vm.columns[0])).toBe(350)
    })

    it('reads a formatted cell', () => {
      // List cells arrive as { label, value } once a column is formatted.
      const wrapper = summed([{ amount: { value: 100, label: '₹100' } }])
      expect(wrapper.vm.getColumnSum(wrapper.vm.columns[0])).toBe(100)
    })

    it('falls back to the label when there is no value', () => {
      const wrapper = summed([{ amount: { label: '250' } }])
      expect(wrapper.vm.getColumnSum(wrapper.vm.columns[0])).toBe(250)
    })

    it('strips the thousands separators', () => {
      const wrapper = summed([{ amount: '1,250' }])
      expect(wrapper.vm.getColumnSum(wrapper.vm.columns[0])).toBe(1250)
    })

    it('skips what it cannot read as a number', () => {
      const wrapper = summed([{ amount: 'n/a' }, { amount: 100 }, {}])
      expect(wrapper.vm.getColumnSum(wrapper.vm.columns[0])).toBe(100)
    })

    it('is nothing for an empty column', () => {
      const wrapper = summed([])
      expect(wrapper.vm.getColumnSum(wrapper.vm.columns[0])).toBe(0)
    })

    it('is nothing for a column with no rows loaded', () => {
      const wrapper = mount({ data: [col('Open')] }, { sumField: 'amount' })
      wrapper.vm.columns[0].data = undefined
      expect(wrapper.vm.getColumnSum(wrapper.vm.columns[0])).toBe(0)
    })

    it('hands the total to the caller to format', () => {
      const formatValue = vi.fn((v) => `₹${v}`)
      const wrapper = mount(
        { data: [col('Open', [{ amount: 100 }])] },
        { sumField: 'amount', formatValue },
      )
      expect(wrapper.vm.getFormattedSum(wrapper.vm.columns[0])).toBe('₹100')
    })
  })

  describe('deleted columns', () => {
    it('lists the ones marked for deletion, to be added back', () => {
      const wrapper = mount({
        kanban_columns: [{ name: 'Open' }, { name: 'Lost', delete: true }],
      })
      expect(wrapper.vm.deletedColumns).toEqual([
        { label: 'Lost', value: 'Lost' },
      ])
    })

    it('lists none before the data arrives', () => {
      expect(mount({}).vm.deletedColumns).toEqual([])
    })

    it('marks a column deleted and reports it', () => {
      const wrapper = mount({ data: [col('Open'), col('Lost')] })
      const column = wrapper.vm.columns[1]
      wrapper.vm.actions(column)[0].items[0].onClick()
      expect(column.column.delete).toBe(true)
      expect(wrapper.emitted('update')).toBeTruthy()
    })

    it('brings one back at the end', () => {
      const wrapper = mount({
        data: [col('Open'), col('Lost', [], { delete: true }), col('Won')],
      })
      wrapper.vm.addColumn({ value: 'Lost' })
      expect(wrapper.vm.columns.map((c) => c.column.name)).toEqual([
        'Open',
        'Won',
        'Lost',
      ])
      expect(wrapper.vm.columns[2].column.delete).toBe(false)
    })

    it('does nothing for a name it does not have', () => {
      // Regression: this dereferenced `undefined`, and the `indexOf` miss fed
      // -1 to splice, which removes the last column.
      const wrapper = mount({ data: [col('Open'), col('Won')] })
      wrapper.vm.addColumn({ value: 'Nothing' })
      expect(wrapper.vm.columns.map((c) => c.column.name)).toEqual([
        'Open',
        'Won',
      ])
    })
  })

  describe('moving a card', () => {
    const card = { name: 'DEAL-1', status: 'Open' }

    it('offers every other stage', () => {
      const wrapper = mount({
        kanban_columns: [{ name: 'Open' }, { name: 'Won' }, { name: 'Lost' }],
      })
      expect(
        wrapper.vm.getStageMoveOptions(card)[0].items.map((i) => i.label),
      ).toEqual(['Won', 'Lost'])
    })

    it('does not offer the stage the card is already in', () => {
      const wrapper = mount({
        kanban_columns: [{ name: 'Open' }, { name: 'Won' }],
      })
      expect(
        wrapper.vm.getStageMoveOptions(card)[0].items.map((i) => i.label),
      ).not.toContain('Open')
    })

    it('reads a formatted stage cell', () => {
      const wrapper = mount({
        kanban_columns: [{ name: 'Open' }, { name: 'Won' }],
      })
      const formatted = {
        name: 'DEAL-1',
        status: { label: 'Open', value: 'Open' },
      }
      expect(
        wrapper.vm.getStageMoveOptions(formatted)[0].items.map((i) => i.label),
      ).toEqual(['Won'])
    })

    it('leaves out stages marked for deletion', () => {
      const wrapper = mount({
        kanban_columns: [{ name: 'Open' }, { name: 'Lost', delete: true }],
      })
      expect(wrapper.vm.getStageMoveOptions(card)[0].items).toEqual([])
    })

    it('reports the move', () => {
      const wrapper = mount({
        kanban_columns: [{ name: 'Open' }, { name: 'Won' }],
      })
      wrapper.vm.getStageMoveOptions(card)[0].items[0].onClick()
      expect(wrapper.emitted('update').at(-1)[0]).toMatchObject({
        item: 'DEAL-1',
        to: 'Won',
      })
    })

    it('copes with no stages configured', () => {
      expect(mount({}).vm.getStageMoveOptions(card)[0].items).toEqual([])
    })
  })

  describe('saving the column layout', () => {
    it('records the order of the cards in each column', () => {
      const wrapper = mount({
        data: [col('Open', [{ name: 'D1' }, { name: 'D2' }])],
      })
      wrapper.vm.updateColumn()
      expect(
        wrapper.emitted('update').at(-1)[0].kanban_columns[0].order,
      ).toEqual(['D1', 'D2'])
    })

    it('copes with a column whose rows have not loaded', () => {
      const wrapper = mount({ data: [col('Open')] })
      wrapper.vm.columns[0].data = undefined
      expect(() => wrapper.vm.updateColumn()).not.toThrow()
    })

    it('does not save the page size, which is per-session', () => {
      const wrapper = mount({ data: [col('Open', [])] })
      wrapper.vm.updateColumn()
      expect(
        wrapper.emitted('update').at(-1)[0].kanban_columns[0].page_length,
      ).toBeUndefined()
    })

    it('reports a card that moved between columns', () => {
      const wrapper = mount({ data: [col('Open', []), col('Won', [])] })
      wrapper.vm.updateColumn({
        to: { dataset: { column: 'Won' } },
        from: { dataset: { column: 'Open' } },
        item: { dataset: { name: 'DEAL-1' } },
      })
      expect(wrapper.emitted('update').at(-1)[0]).toMatchObject({
        item: 'DEAL-1',
        to: 'Won',
      })
    })

    it('reports only a reorder when the card stayed put', () => {
      const wrapper = mount({ data: [col('Open', [])] })
      wrapper.vm.updateColumn({
        to: { dataset: { column: 'Open' } },
        from: { dataset: { column: 'Open' } },
        item: { dataset: { name: 'DEAL-1' } },
      })
      expect(wrapper.emitted('update').at(-1)[0].item).toBeUndefined()
    })

    it('can ask for the columns to be refetched', () => {
      const wrapper = mount({ data: [col('Open', [])] })
      wrapper.vm.updateColumn(null, true)
      expect(wrapper.emitted('update').at(-1)[0].fetchNewColumns).toBe(true)
    })
  })

  it('names the field the card title comes from', () => {
    expect(mount({ title_field: 'lead_name' }).vm.titleField).toBe('lead_name')
  })
})

describe('KanbanSettings', () => {
  const mount = (data = {}) => {
    const list = reactive({
      data: { column_field: 'status', title_field: 'name', ...data },
    })
    return mountComponent(KanbanSettings, {
      props: { doctype: 'CRM Deal', modelValue: list },
      global: { stubs: STUBS },
    })
  }

  beforeEach(() => {
    api.fields = [
      { label: 'Status', fieldname: 'status', fieldtype: 'Select' },
      { label: 'Owner', fieldname: 'deal_owner', fieldtype: 'Link' },
      { label: 'Amount', fieldname: 'amount', fieldtype: 'Currency' },
      { label: 'Name', fieldname: 'name', fieldtype: 'Data' },
    ]
  })

  describe('the fields on the card', () => {
    it('reads them from the saved list', () => {
      const wrapper = mount({ kanban_fields: ['status', 'amount'] })
      expect(wrapper.vm.allFields.map((f) => f.fieldname)).toEqual([
        'status',
        'amount',
      ])
    })

    it('reads them from a saved JSON string', () => {
      const wrapper = mount({ kanban_fields: '["status"]' })
      expect(wrapper.vm.allFields.map((f) => f.fieldname)).toEqual(['status'])
    })

    it('is empty when none are saved', () => {
      expect(mount({}).vm.allFields).toEqual([])
    })

    it('drops a saved field that no longer exists on the doctype', () => {
      const wrapper = mount({ kanban_fields: ['status', 'gone'] })
      expect(wrapper.vm.allFields.map((f) => f.fieldname)).toEqual(['status'])
    })
  })

  describe('the fields it offers to add', () => {
    it('offers the ones not already on the card', () => {
      // Regression: `fields` and `allFields` read each other, so Vue handed one
      // of them `undefined` and the "already on the card" list came out empty —
      // the picker went on offering fields that were already there.
      const wrapper = mount({ kanban_fields: ['status', 'amount'] })
      expect(wrapper.vm.fields.map((f) => f.fieldname)).toEqual([
        'deal_owner',
        'name',
      ])
    })

    it('offers everything when the card is empty', () => {
      expect(mount({}).vm.fields).toHaveLength(4)
    })

    it('offers nothing before the meta loads', () => {
      api.fields = []
      expect(mount({}).vm.fields).toEqual([])
    })

    it('copes with the meta returning nothing', () => {
      api.fields = null
      expect(mount({}).vm.fields).toEqual([])
    })
  })

  describe('the column field', () => {
    it('offers only fields with a fixed set of values', () => {
      // A kanban column is one distinct value; a free-text field has no columns.
      expect(mount({}).vm.columnFields.map((f) => f.fieldname)).toEqual([
        'status',
        'deal_owner',
      ])
    })

    it('still offers a field that is also on the card', () => {
      const wrapper = mount({ kanban_fields: ['status'] })
      expect(wrapper.vm.columnFields.map((f) => f.fieldname)).toContain(
        'status',
      )
    })

    it('shows the one in use', () => {
      expect(mount({}).vm.columnField.fieldname).toBe('status')
    })

    it('shows nothing when none is set', () => {
      expect(mount({ column_field: '' }).vm.columnField).toBe('')
    })

    it('still finds it when it is also on the card', () => {
      // Regression: the lookup ran over the picker's list, which excludes
      // fields already on the card, so the box went blank.
      const wrapper = mount({
        column_field: 'status',
        kanban_fields: ['status'],
      })
      expect(wrapper.vm.columnField.fieldname).toBe('status')
    })
  })

  describe('the title field', () => {
    it('shows the one in use', () => {
      expect(mount({}).vm.titleField.fieldname).toBe('name')
    })

    it('shows nothing when none is set', () => {
      expect(mount({ title_field: '' }).vm.titleField).toBe('')
    })

    it('still finds it when it is also on the card', () => {
      const wrapper = mount({ title_field: 'name', kanban_fields: ['name'] })
      expect(wrapper.vm.titleField.fieldname).toBe('name')
    })
  })

  describe('editing the card fields', () => {
    it('adds one', () => {
      const wrapper = mount({ kanban_fields: ['status'] })
      wrapper.vm.addField({ fieldname: 'amount' })
      expect(wrapper.vm.allFields.map((f) => f.fieldname)).toEqual([
        'status',
        'amount',
      ])
    })

    it('ignores an empty choice', () => {
      const wrapper = mount({ kanban_fields: ['status'] })
      wrapper.vm.addField(null)
      expect(wrapper.vm.allFields).toHaveLength(1)
    })

    it('adds to an empty card', () => {
      const wrapper = mount({})
      wrapper.vm.addField({ fieldname: 'status' })
      expect(wrapper.vm.allFields.map((f) => f.fieldname)).toEqual(['status'])
    })

    it('removes one', () => {
      const wrapper = mount({ kanban_fields: ['status', 'amount'] })
      wrapper.vm.removeField({ fieldname: 'status' })
      expect(wrapper.vm.allFields.map((f) => f.fieldname)).toEqual(['amount'])
    })

    it('saves the order after a drag', () => {
      const wrapper = mount({ kanban_fields: ['status', 'amount'] })
      wrapper.vm.reorder()
      expect(wrapper.vm.list.data.kanban_fields).toEqual(['status', 'amount'])
    })
  })

  describe('applying', () => {
    it('reports every setting and closes', async () => {
      const wrapper = mount({ kanban_fields: ['status'] })
      wrapper.vm.showDialog = true
      wrapper.vm.apply()
      await nextTick()
      expect(wrapper.emitted('update').at(-1)).toEqual([
        {
          column_field: 'status',
          title_field: 'name',
          kanban_fields: ['status'],
        },
      ])
      expect(wrapper.vm.showDialog).toBe(false)
    })

    it('copes with a column field that no longer exists', async () => {
      // Unguarded before: the lookup found nothing and `.fieldname` threw.
      const wrapper = mount({ column_field: 'gone', title_field: 'gone' })
      wrapper.vm.apply()
      await nextTick()
      expect(wrapper.emitted('update').at(-1)[0]).toEqual({
        column_field: undefined,
        title_field: undefined,
        kanban_fields: [],
      })
    })
  })
})
