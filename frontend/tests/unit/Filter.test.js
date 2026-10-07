const resources = vi.hoisted(() => ({ fields: [] }))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  return {
    ...actual,
    createResource: (options) =>
      reactive({
        ...options,
        // Filter.vue reads `.data` for the field list and calls `.fetch()` on
        // mount; neither should reach the network here.
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
  { fieldname: 'status', label: 'Status', fieldtype: 'Select', options: 'Open\nReplied\nClosed' },
  { fieldname: 'converted', label: 'Converted', fieldtype: 'Check' },
  { fieldname: 'annual_revenue', label: 'Revenue', fieldtype: 'Currency' },
  { fieldname: 'creation', label: 'Created', fieldtype: 'Datetime' },
  { fieldname: 'territory', label: 'Territory', fieldtype: 'Link', options: 'CRM Territory' },
  { fieldname: '_assign', label: 'Assigned To', fieldtype: 'Text' },
  { fieldname: 'duration', label: 'Duration', fieldtype: 'Duration' },
  { fieldname: 'rating', label: 'Rating', fieldtype: 'Rating' },
]

const mountFilter = (listFilters = {}, props = {}) =>
  mountComponent(Filter, {
    props: {
      doctype: 'CRM Lead',
      modelValue: { data: { params: { filters: listFilters } }, params: { filters: listFilters } },
      ...props,
    },
    global: {
      stubs: {
        Popover: { template: '<div><slot name="target" :togglePopover="() => {}" /></div>' },
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

describe('Filter', () => {
  beforeEach(() => {
    resources.fields = FIELDS
  })

  describe('reading filters back off the list', () => {
    it('turns a backend filter into an editable row', () => {
      const wrapper = mountFilter({ lead_name: ['LIKE', '%acme%'] })
      expect(Array.from(wrapper.vm.filters)).toMatchObject([
        { fieldname: 'lead_name', operator: 'like', value: '%acme%' },
      ])
    })

    it('treats a bare value as Equals', () => {
      // The backend accepts `{status: "Open"}` as shorthand for `["=", "Open"]`.
      const wrapper = mountFilter({ status: 'Open' })
      expect(Array.from(wrapper.vm.filters)[0]).toMatchObject({
        operator: 'equals',
        value: 'Open',
      })
    })

    it('shows a checkbox filter as Yes / No', () => {
      const wrapper = mountFilter({ converted: 1 })
      expect(Array.from(wrapper.vm.filters)[0]).toMatchObject({
        operator: 'equals',
        value: 'Yes',
      })
      expect(Array.from(mountFilter({ converted: 0 }).vm.filters)[0].value).toBe(
        'No',
      )
    })

    // Two shapes of list resource reach this component: some carry the applied
    // filters on `params`, others only on `data.params`. The fallback between
    // them is why a filter chip appears on every list rather than only some.
    it('reads filters carried on the resource itself', () => {
      const wrapper = mountFilter({}, {
        modelValue: {
          params: { filters: { status: 'Open' } },
          data: { params: {} },
        },
      })
      expect(Array.from(wrapper.vm.filters)).toMatchObject([
        { fieldname: 'status', value: 'Open' },
      ])
    })

    it('falls back to the filters carried on its data', () => {
      const wrapper = mountFilter({}, {
        modelValue: {
          params: {},
          data: { params: { filters: { status: 'Open' } } },
        },
      })
      expect(Array.from(wrapper.vm.filters)).toMatchObject([
        { fieldname: 'status', value: 'Open' },
      ])
    })

    it('shows no filters when neither place has any', () => {
      const wrapper = mountFilter({}, {
        modelValue: { params: {}, data: { params: {} } },
      })
      expect(Array.from(wrapper.vm.filters)).toEqual([])
    })

    it('reopens an _assign filter as Equals, not a quoted LIKE', () => {
      // apply() rewrites Equals to `%"user"%`; this is the inverse.
      const wrapper = mountFilter({ _assign: ['LIKE', '%"ada@example.com"%'] })
      expect(Array.from(wrapper.vm.filters)[0]).toMatchObject({
        operator: 'equals',
        value: 'ada@example.com',
      })
    })

    it('ignores filters on fields the user cannot filter by', () => {
      const wrapper = mountFilter({ secret_field: ['=', 'x'] })
      expect(wrapper.vm.filters.size).toBe(0)
    })

    it('is empty until the field list arrives', () => {
      resources.fields = null
      expect(mountFilter({ lead_name: ['LIKE', '%acme%'] }).vm.filters.size).toBe(0)
    })

    it('hides the view default filters from the chip count', () => {
      // A view scoped to converted=1 should not show that as a user filter.
      const wrapper = mountFilter(
        { converted: 1, status: 'Open' },
        { default_filters: { converted: 1 } },
      )
      expect(Array.from(wrapper.vm.filters).map((f) => f.fieldname)).toEqual([
        'status',
      ])
    })
  })

  describe('the field picker', () => {
    it('offers every filterable field to start with', () => {
      expect(mountFilter().vm.availableFilters).toHaveLength(FIELDS.length)
    })

    it('drops fields already in use so you cannot filter twice on one field', () => {
      const wrapper = mountFilter({ status: 'Open' })
      expect(
        wrapper.vm.availableFilters.map((f) => f.fieldname),
      ).not.toContain('status')
    })
  })

  describe('operators offered per field type', () => {
    const ops = (wrapper, type, name) =>
      wrapper.vm.getOperators(type, name).map((o) => o.value)

    it('gives text fields the full string set', () => {
      const wrapper = mountFilter()
      expect(ops(wrapper, 'Data', 'lead_name')).toEqual([
        'equals',
        'not equals',
        'like',
        'not like',
        'in',
        'not in',
        'is',
      ])
    })

    it('gives numbers comparison operators', () => {
      expect(ops(mountFilter(), 'Int', 'x')).toContain('>')
      expect(ops(mountFilter(), 'Currency', 'x')).toContain('<=')
    })

    it('gives dates a between and a timespan', () => {
      const dateOps = ops(mountFilter(), 'Datetime', 'creation')
      expect(dateOps).toContain('between')
      expect(dateOps).toContain('timespan')
    })

    it('restricts _assign to exact membership', () => {
      // A free-text LIKE on a JSON array matches partial addresses.
      expect(ops(mountFilter(), 'Text', '_assign')).toEqual([
        'equals',
        'not equals',
        'like',
        'not like',
        'is',
      ])
    })
  })

  describe('defaults when a field is picked', () => {
    it('starts a text field on like', () => {
      expect(mountFilter().vm.getDefaultOperator('Data')).toBe('like')
    })

    it('starts a select, check and number on equals', () => {
      const wrapper = mountFilter()
      expect(wrapper.vm.getDefaultOperator('Select')).toBe('equals')
      expect(wrapper.vm.getDefaultOperator('Check')).toBe('equals')
      expect(wrapper.vm.getDefaultOperator('Float')).toBe('equals')
    })

    it('starts a date on between', () => {
      expect(mountFilter().vm.getDefaultOperator('Date')).toBe('between')
    })

    it('preselects the first option of a select', () => {
      const wrapper = mountFilter()
      expect(wrapper.vm.getDefaultValue(FIELDS[1])).toBe('Open')
    })

    it('defaults a checkbox to Yes and a date to nothing', () => {
      const wrapper = mountFilter()
      expect(wrapper.vm.getDefaultValue({ fieldtype: 'Check' })).toBe('Yes')
      expect(wrapper.vm.getDefaultValue({ fieldtype: 'Date' })).toBeNull()
    })
  })

  describe('building the query sent to the backend', () => {
    const parse = (wrapper, rows) => wrapper.vm.parseFilters(new Set(rows))

    it('collapses equals to a plain value', () => {
      const wrapper = mountFilter()
      expect(
        parse(wrapper, [{ fieldname: 'status', operator: 'equals', value: 'Open' }]),
      ).toEqual({ status: 'Open' })
    })

    it('sends a checkbox as a real boolean', () => {
      const wrapper = mountFilter()
      expect(
        parse(wrapper, [
          { fieldname: 'converted', operator: 'equals', value: 'Yes' },
        ]),
      ).toEqual({ converted: true })
      expect(
        parse(wrapper, [
          { fieldname: 'converted', operator: 'equals', value: 'No' },
        ]),
      ).toEqual({ converted: false })
    })

    it('maps each operator to its backend form', () => {
      const wrapper = mountFilter()
      expect(
        parse(wrapper, [
          { fieldname: 'annual_revenue', operator: '>', value: 100 },
        ]),
      ).toEqual({ annual_revenue: ['>', 100] })
      expect(
        parse(wrapper, [{ fieldname: 'status', operator: 'not equals', value: 'Open' }]),
      ).toEqual({ status: ['!=', 'Open'] })
    })

    it('wraps a like value in wildcards', () => {
      const wrapper = mountFilter()
      expect(
        parse(wrapper, [
          { fieldname: 'lead_name', operator: 'like', value: 'acme' },
        ]),
      ).toEqual({ lead_name: ['LIKE', '%acme%'] })
    })

    it('leaves a value that already has wildcards alone', () => {
      const wrapper = mountFilter()
      expect(
        parse(wrapper, [
          { fieldname: 'lead_name', operator: 'like', value: 'acme%' },
        ]),
      ).toEqual({ lead_name: ['LIKE', 'acme%'] })
    })

    it('splits a comma list for in', () => {
      const wrapper = mountFilter()
      expect(
        parse(wrapper, [
          { fieldname: 'status', operator: 'in', value: 'Open, Closed' },
        ]),
      ).toEqual({ status: ['in', ['Open', 'Closed']] })
    })

    it('anchors an _assign equals on the array member', () => {
      // Without the quotes, "bob@x.com" would also match "bobby@x.com".
      const wrapper = mountFilter()
      expect(
        parse(wrapper, [
          { fieldname: '_assign', operator: 'equals', value: 'bob@x.com' },
        ]),
      ).toEqual({ _assign: ['LIKE', '%"bob@x.com"%'] })
    })
  })

  describe('editing filters', () => {
    it('adds a row and tells the list about it', () => {
      const wrapper = mountFilter()
      wrapper.vm.setfilter(FIELDS[1])
      expect(wrapper.emitted('update').at(-1)[0]).toEqual({ status: 'Open' })
    })

    it('does nothing when nothing was picked', () => {
      const wrapper = mountFilter()
      wrapper.vm.setfilter(null)
      expect(wrapper.emitted('update')).toBeUndefined()
    })

    it('replaces a row when the field is swapped', () => {
      const wrapper = mountFilter({ status: 'Open' })
      wrapper.vm.updateFilter(FIELDS[0], 0)
      const emitted = wrapper.emitted('update').at(-1)[0]
      expect(emitted).toHaveProperty('lead_name')
      expect(emitted).not.toHaveProperty('status')
    })

    it('removes a row', () => {
      const wrapper = mountFilter({ status: 'Open' })
      wrapper.vm.removeFilter(0)
      expect(wrapper.emitted('update').at(-1)[0]).toEqual({})
    })

    it('clears everything and closes the popover', () => {
      const close = vi.fn()
      const wrapper = mountFilter({ status: 'Open', lead_name: ['LIKE', '%a%'] })
      wrapper.vm.clearfilter(close)
      expect(wrapper.emitted('update').at(-1)[0]).toEqual({})
      expect(close).toHaveBeenCalled()
    })
  })

  describe('changing a value', () => {
    it('reads the value out of an input event', () => {
      const wrapper = mountFilter()
      const row = { fieldname: 'lead_name', operator: 'like', value: '' }
      wrapper.vm.updateValue({ target: { value: 'acme' } }, row)
      expect(row.value).toBe('acme')
    })

    it('keeps a date range as a pair', () => {
      const wrapper = mountFilter()
      const row = { fieldname: 'creation', operator: 'between', value: null }
      wrapper.vm.updateValue(['2026-01-01', '2026-01-31'], row)
      expect(row.value).toEqual(['2026-01-01', '2026-01-31'])
    })

    it('accepts a legacy comma-joined range string', () => {
      const wrapper = mountFilter()
      const row = { fieldname: 'creation', operator: 'between', value: null }
      wrapper.vm.updateValue('2026-01-01,2026-01-31', row)
      expect(row.value).toEqual(['2026-01-01', '2026-01-31'])
    })
  })

  describe('changing an operator', () => {
    it('resets the value to the new operator default', () => {
      // A "%acme%" left over from LIKE is meaningless under Equals.
      const wrapper = mountFilter()
      const row = { field: FIELDS[1], fieldname: 'status', operator: 'equals', value: '%x%' }
      wrapper.vm.updateOperator(row)
      expect(row.value).toBe('Open')
    })

    it('uses "set" for the is operators, which take no value', () => {
      const wrapper = mountFilter()
      const row = { field: FIELDS[0], fieldname: 'lead_name', operator: 'is', value: 'x' }
      wrapper.vm.updateOperator(row)
      expect(row.value).toBe('set')
    })
  })

  describe('placeholders', () => {
    const ph = (operator, fieldtype = 'Data') =>
      mountFilter().vm.placeholder({ operator, field: { fieldtype } })

    it('shows a date range example for between', () => {
      expect(ph('between')).toContain('to')
    })

    it('shows a name list for in on a text field', () => {
      expect(ph('in')).toBe('John, Jane, Doe')
    })

    it('shows a number list for in on a number field', () => {
      expect(ph('in', 'Int')).toBe('100, 200, 300')
    })

    it('shows wildcards for like', () => {
      expect(ph('like', 'Int')).toBe('%100%')
    })
  })
})
