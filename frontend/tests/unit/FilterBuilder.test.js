const resources = vi.hoisted(() => ({ fields: [] }))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  return {
    ...actual,
    createResource: (options) =>
      reactive({
        ...options,
        get data() {
          return resources.fields
        },
        fetch: vi.fn(),
        reload: vi.fn(),
        submit: vi.fn(),
      }),
  }
})

import Filter from '@/components/Filter.vue'
import { mountComponent } from '../helpers/mount'

const FIELDS = [
  { fieldname: 'lead_name', label: 'Name', fieldtype: 'Data' },
  {
    fieldname: 'status',
    label: 'Status',
    fieldtype: 'Select',
    options: 'Open\nReplied\nClosed',
  },
  { fieldname: 'converted', label: 'Converted', fieldtype: 'Check' },
  { fieldname: 'annual_revenue', label: 'Revenue', fieldtype: 'Currency' },
  { fieldname: 'creation', label: 'Created', fieldtype: 'Datetime' },
  {
    fieldname: 'territory',
    label: 'Territory',
    fieldtype: 'Link',
    options: 'CRM Territory',
  },
  { fieldname: '_assign', label: 'Assigned To', fieldtype: 'Text' },
  { fieldname: 'duration', label: 'Duration', fieldtype: 'Duration' },
  { fieldname: 'rating', label: 'Rating', fieldtype: 'Rating' },
]

const mountFilter = (listFilters = {}, props = {}) =>
  mountComponent(Filter, {
    props: {
      doctype: 'CRM Lead',
      modelValue: {
        data: { params: { filters: listFilters } },
        params: { filters: listFilters },
      },
      ...props,
    },
    global: {
      stubs: {
        Popover: {
          template: '<div><slot name="target" :togglePopover="() => {}" /></div>',
        },
        Link: true,
        Autocomplete: true,
        DurationInput: true,
        RatingInput: true,
        DatePicker: true,
        DateTimePicker: true,
        DateRangePicker: true,
      },
    },
  })

const fieldNamed = (name) => FIELDS.find((f) => f.fieldname === name)
const lastUpdate = (wrapper) => wrapper.emitted('update').at(-1)[0]

describe('Filter — the parts the first suite left', () => {
  beforeEach(() => {
    resources.fields = FIELDS
  })

  describe('which fields are still available to filter on', () => {
    it('offers every field when nothing is filtered', () => {
      expect(mountFilter().vm.availableFilters).toHaveLength(FIELDS.length)
    })

    it('stops offering a field already in use', () => {
      // Two rows on the same field would fight each other.
      const wrapper = mountFilter({ lead_name: ['LIKE', '%acme%'] })
      expect(
        wrapper.vm.availableFilters.map((f) => f.fieldname),
      ).not.toContain('lead_name')
    })

    it('offers nothing before the field list has loaded', () => {
      resources.fields = null
      expect(mountFilter().vm.availableFilters).toEqual([])
    })
  })

  describe('reading the list back', () => {
    it('is empty before the list has any data', () => {
      const wrapper = mountComponent(Filter, {
        props: { doctype: 'CRM Lead', modelValue: {} },
        global: { stubs: { Popover: { template: '<div />' } } },
      })
      expect(Array.from(wrapper.vm.filters)).toEqual([])
    })

    it('is empty when the list carries no filters', () => {
      expect(Array.from(mountFilter({}).vm.filters)).toEqual([])
    })

    it('is empty before the field list has loaded', () => {
      resources.fields = null
      expect(Array.from(mountFilter({ lead_name: 'acme' }).vm.filters)).toEqual([])
    })

    it('reads a bare value as an equality', () => {
      const wrapper = mountFilter({ lead_name: 'acme' })
      expect(Array.from(wrapper.vm.filters)).toMatchObject([
        { fieldname: 'lead_name', operator: 'equals', value: 'acme' },
      ])
    })

    it('reads a stored checkbox back as Yes or No', () => {
      // The backend stores 1/0; the row shows the words.
      expect(Array.from(mountFilter({ converted: 1 }).vm.filters)).toMatchObject([
        { operator: 'equals', value: 'Yes' },
      ])
      expect(Array.from(mountFilter({ converted: 0 }).vm.filters)).toMatchObject([
        { operator: 'equals', value: 'No' },
      ])
    })

    it('ignores a filter on a field the doctype no longer has', () => {
      // A saved view can outlive the field it filters on.
      const wrapper = mountFilter({ gone_field: 'x', lead_name: 'acme' })
      expect(Array.from(wrapper.vm.filters).map((f) => f.fieldname)).toEqual([
        'lead_name',
      ])
    })

    it('hides a filter the page applies for you', () => {
      // "My Deals" pins a filter; showing it as a removable chip would
      // suggest it can be cleared, and it cannot. Both fields here are real
      // ones, so only the default-matching value is what removes the row.
      const wrapper = mountFilter(
        { lead_name: 'acme', status: 'Open' },
        { default_filters: { status: 'Open' } },
      )
      expect(Array.from(wrapper.vm.filters).map((f) => f.fieldname)).toEqual([
        'lead_name',
      ])
    })

    it('keeps a filter that only shares the field name', () => {
      // Same field, different value — the user narrowed it further, and that
      // is theirs to clear.
      const wrapper = mountFilter(
        { status: 'Closed' },
        { default_filters: { status: 'Open' } },
      )
      expect(Array.from(wrapper.vm.filters).map((f) => f.fieldname)).toEqual([
        'status',
      ])
    })
  })

  describe('adding a filter', () => {
    it('adds a row with sensible defaults', () => {
      const wrapper = mountFilter()
      wrapper.vm.setfilter(fieldNamed('lead_name'))
      expect(Array.from(wrapper.vm.filters)).toMatchObject([
        { fieldname: 'lead_name', operator: 'like', value: '' },
      ])
    })

    it('applies it immediately', () => {
      const wrapper = mountFilter()
      wrapper.vm.setfilter(fieldNamed('status'))
      expect(lastUpdate(wrapper)).toEqual({ status: 'Open' })
    })

    it('ignores an empty choice', () => {
      const wrapper = mountFilter()
      wrapper.vm.setfilter(null)
      expect(wrapper.emitted('update')).toBeUndefined()
    })

    it('starts a Select on its first option', () => {
      const wrapper = mountFilter()
      wrapper.vm.setfilter(fieldNamed('status'))
      expect(Array.from(wrapper.vm.filters)[0].value).toBe('Open')
    })

    it('starts a checkbox on Yes', () => {
      const wrapper = mountFilter()
      wrapper.vm.setfilter(fieldNamed('converted'))
      expect(Array.from(wrapper.vm.filters)[0]).toMatchObject({
        operator: 'equals',
        value: 'Yes',
      })
    })

    it('starts a date on a range with nothing in it', () => {
      const wrapper = mountFilter()
      wrapper.vm.setfilter(fieldNamed('creation'))
      expect(Array.from(wrapper.vm.filters)[0]).toMatchObject({
        operator: 'between',
        value: null,
      })
    })

    it('copes with a Select whose options come from a script', () => {
      // Regression: `options.split` on a field with none stored threw while
      // working out the default value. The same defect was fixed in the
      // condition builder; this is the other copy of it.
      resources.fields = [
        { fieldname: 'stage', label: 'Stage', fieldtype: 'Select', options: null },
      ]
      const wrapper = mountFilter()
      expect(() =>
        wrapper.vm.setfilter({
          fieldname: 'stage',
          label: 'Stage',
          fieldtype: 'Select',
          options: null,
        }),
      ).not.toThrow()
    })
  })

  describe('editing a filter', () => {
    it('swaps the field and resets the row', () => {
      const wrapper = mountFilter({ lead_name: ['LIKE', '%acme%'] })
      wrapper.vm.updateFilter(fieldNamed('status'), 0)
      expect(Array.from(wrapper.vm.filters)).toMatchObject([
        { fieldname: 'status', operator: 'equals', value: 'Open' },
      ])
    })

    it('ignores a choice with no field behind it', () => {
      const wrapper = mountFilter({ lead_name: 'acme' })
      wrapper.vm.updateFilter({}, 0)
      expect(Array.from(wrapper.vm.filters)).toHaveLength(1)
    })

    it('removes a row', () => {
      const wrapper = mountFilter({ lead_name: 'acme', converted: 1 })
      wrapper.vm.removeFilter(0)
      expect(Array.from(wrapper.vm.filters)).toHaveLength(1)
      expect(lastUpdate(wrapper)).toEqual({ converted: true })
    })

    it('clears every row and closes the panel', () => {
      const close = vi.fn()
      const wrapper = mountFilter({ lead_name: 'acme' })
      wrapper.vm.clearfilter(close)
      expect(Array.from(wrapper.vm.filters)).toEqual([])
      expect(lastUpdate(wrapper)).toEqual({})
      expect(close).toHaveBeenCalled()
    })
  })

  describe('changing an operator', () => {
    it("resets the value to the new operator's default", () => {
      const wrapper = mountFilter({ status: 'Open' })
      const filter = Array.from(wrapper.vm.filters)[0]
      filter.operator = 'not equals'
      wrapper.vm.updateOperator(filter)
      expect(filter.value).toBe('Open')
    })

    it('sets the value to "set" for an is-check', () => {
      // "Is" asks whether the field has any value; the value box becomes a
      // set / not set choice.
      const wrapper = mountFilter({ lead_name: 'acme' })
      const filter = Array.from(wrapper.vm.filters)[0]
      filter.operator = 'is'
      wrapper.vm.updateOperator(filter)
      expect(filter.value).toBe('set')
    })

    it('does the same for is-not', () => {
      const wrapper = mountFilter({ lead_name: 'acme' })
      const filter = Array.from(wrapper.vm.filters)[0]
      filter.operator = 'is not'
      wrapper.vm.updateOperator(filter)
      expect(filter.value).toBe('set')
    })
  })

  describe('changing a value', () => {
    it('takes it from an input event', () => {
      const wrapper = mountFilter({ lead_name: 'acme' })
      const filter = Array.from(wrapper.vm.filters)[0]
      wrapper.vm.updateValue({ target: { value: 'globex' } }, filter)
      expect(filter.value).toBe('globex')
    })

    it('takes a plain value too', () => {
      const wrapper = mountFilter({ lead_name: 'acme' })
      const filter = Array.from(wrapper.vm.filters)[0]
      wrapper.vm.updateValue('globex', filter)
      expect(filter.value).toBe('globex')
    })

    it('takes a date range as the pair it is', () => {
      const wrapper = mountFilter({ creation: ['between', ['a', 'b']] })
      const filter = Array.from(wrapper.vm.filters)[0]
      wrapper.vm.updateValue(['2026-01-01', '2026-12-31'], filter)
      expect(filter.value).toEqual(['2026-01-01', '2026-12-31'])
    })

    it('splits a range that arrives as one string', () => {
      // Older saved views stored the range as "from,to".
      const wrapper = mountFilter({ creation: ['between', ['a', 'b']] })
      const filter = Array.from(wrapper.vm.filters)[0]
      wrapper.vm.updateValue('2026-01-01, 2026-12-31', filter)
      expect(filter.value).toEqual(['2026-01-01', '2026-12-31'])
    })
  })

  describe('the query it sends', () => {
    const sent = (listFilters, edit) => {
      const wrapper = mountFilter(listFilters)
      if (edit) edit(wrapper)
      wrapper.vm.apply()
      return lastUpdate(wrapper)
    }

    it('sends an equality as a bare value', () => {
      expect(sent({ lead_name: 'acme' })).toEqual({ lead_name: 'acme' })
    })

    it('sends a checkbox as a boolean', () => {
      expect(sent({ converted: 1 })).toEqual({ converted: true })
      expect(sent({ converted: 0 })).toEqual({ converted: false })
    })

    it('sends every other operator as a pair', () => {
      expect(sent({ annual_revenue: ['>', 1000] })).toEqual({
        annual_revenue: ['>', 1000],
      })
    })

    it('wraps a partial match in wildcards', () => {
      const out = sent({}, (w) => {
        w.vm.setfilter(fieldNamed('lead_name'))
        const f = Array.from(w.vm.filters)[0]
        f.value = 'acme'
      })
      expect(out).toEqual({ lead_name: ['LIKE', '%acme%'] })
    })

    it('leaves wildcards the user typed alone', () => {
      const out = sent({}, (w) => {
        w.vm.setfilter(fieldNamed('lead_name'))
        const f = Array.from(w.vm.filters)[0]
        f.value = 'acme%'
      })
      expect(out).toEqual({ lead_name: ['LIKE', 'acme%'] })
    })

    it('splits a comma-separated list', () => {
      const out = sent({}, (w) => {
        w.vm.setfilter(fieldNamed('status'))
        const f = Array.from(w.vm.filters)[0]
        f.operator = 'in'
        f.value = 'Open, Closed'
      })
      expect(out).toEqual({ status: ['in', ['Open', 'Closed']] })
    })

    it('leaves a list that is already an array alone', () => {
      const out = sent({}, (w) => {
        w.vm.setfilter(fieldNamed('status'))
        const f = Array.from(w.vm.filters)[0]
        f.operator = 'in'
        f.value = ['Open', 'Closed']
      })
      expect(out).toEqual({ status: ['in', ['Open', 'Closed']] })
    })

    it('sends nothing when every row is gone', () => {
      expect(sent({})).toEqual({})
    })
  })

  describe('the placeholder in the value box', () => {
    const hint = (fieldname, operator) => {
      const wrapper = mountFilter()
      return wrapper.vm.placeholder({
        field: fieldNamed(fieldname),
        operator,
        fieldname,
      })
    }

    it('shows a date range for between', () => {
      expect(hint('creation', 'between')).toContain('to')
    })

    it('shows a list, worded for the field type', () => {
      expect(hint('lead_name', 'in')).toBe('John, Jane, Doe')
      expect(hint('annual_revenue', 'in')).toBe('100, 200, 300')
      expect(hint('annual_revenue', 'not in')).toBe('100, 200, 300')
    })

    it('shows wildcards for a partial match', () => {
      expect(hint('lead_name', 'like')).toBe('%John%')
      expect(hint('annual_revenue', 'like')).toBe('%100%')
      expect(hint('lead_name', 'not like')).toBe('%John%')
    })

    it('shows Set for an is-check', () => {
      expect(hint('lead_name', 'is')).toBe('Set')
      expect(hint('lead_name', 'is not')).toBe('Set')
    })

    it('shows an example timespan', () => {
      expect(hint('creation', 'timespan')).toBe('Last Week')
    })

    it('falls back to the field type when the operator says nothing', () => {
      expect(hint('annual_revenue', 'equals')).toBe('1000')
      expect(hint('creation', 'equals')).toBe('01/01/2022')
      expect(hint('converted', 'equals')).toBe('Yes')
      expect(hint('territory', 'equals')).toBe('Select a Value')
      expect(hint('status', 'equals')).toBe('Select an Option')
      expect(hint('lead_name', 'equals')).toBe('John Doe')
    })

    it('falls back once more for a type it has nothing to say about', () => {
      expect(hint('duration', 'equals')).toBe('Enter Value')
      expect(hint('rating', 'equals')).toBe('Enter Value')
    })
  })

  describe('the control shown for a value', () => {
    const control = (fieldname, operator) => {
      const wrapper = mountFilter()
      return wrapper.vm.getValueControl({
        field: fieldNamed(fieldname),
        operator,
        fieldname,
      })
    }

    it('offers set / not set for an is-check', () => {
      expect(control('lead_name', 'is')).toBeTruthy()
    })

    it('draws a plain box for a partial match, whatever the field', () => {
      // "like" against a Select or a Link is free text, not a picker.
      expect(control('status', 'like')).toBeTruthy()
      expect(control('territory', 'like')).toBeTruthy()
    })

    it('draws something for every field type it knows', () => {
      for (const f of FIELDS) {
        expect(control(f.fieldname, 'equals'), f.fieldname).toBeTruthy()
      }
    })
  })

  describe('the operators offered', () => {
    const ops = (fieldtype, fieldname = 'x') =>
      mountFilter()
        .vm.getOperators(fieldtype, fieldname)
        .map((o) => o.value)

    it('offers a range and a timespan on a date, but not a partial match', () => {
      const list = ops('Datetime')
      expect(list).toContain('between')
      expect(list).toContain('timespan')
      expect(list).not.toContain('like')
    })

    it('offers only comparisons on a rating', () => {
      const list = ops('Rating')
      expect(list).toEqual(['equals', 'not equals', '>', '<', '>=', '<=', 'is'])
    })

    it('offers only equality on a checkbox', () => {
      expect(ops('Check')).toEqual(['equals'])
    })

    it('offers partial matching on a duration', () => {
      expect(ops('Duration')).toContain('like')
    })

    it('offers at least one operator for every type the server sends', () => {
      // The server's allowed list and this function have to stay in step; an
      // empty list leaves the row with no operator at all.
      for (const type of [
        'Check', 'Data', 'Float', 'Int', 'Currency', 'Dynamic Link', 'Link',
        'Long Text', 'Select', 'Small Text', 'Text Editor', 'Text', 'Duration',
        'Rating', 'Date', 'Datetime',
      ]) {
        expect(ops(type).length, type).toBeGreaterThan(0)
      }
    })
  })
})
