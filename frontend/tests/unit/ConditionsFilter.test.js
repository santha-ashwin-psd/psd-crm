const api = vi.hoisted(() => ({ fields: null }))

vi.mock('@/components/ConditionsFilter/filterableFields', async () => {
  const { reactive } = await import('vue')
  api.fields = reactive({ data: [], submit: vi.fn(), fetch: vi.fn() })
  return { filterableFields: api.fields }
})

import CFConditions from '@/components/ConditionsFilter/CFConditions.vue'
import CFCondition from '@/components/ConditionsFilter/CFCondition.vue'
import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'

const quiet = { inheritAttrs: false, template: '<div><slot /></div>' }
const STUBS = {
  Autocomplete: { ...quiet, name: 'AutocompleteStub' },
  Dropdown: {
    name: 'DropdownStub',
    inheritAttrs: false,
    props: ['options'],
    template: '<div><slot /></div>',
  },
  FormControl: { ...quiet, name: 'FormControlStub' },
  Link: { ...quiet, name: 'LinkStub' },
  // Renders its body only while open, as the real Dialog does. The nested
  // conditions editor lives inside it, and an always-open stub puts a second
  // "Add Condition" menu on the page.
  Dialog: {
    name: 'DialogStub',
    inheritAttrs: false,
    props: ['open'],
    template: '<div v-if="open"><slot /></div>',
  },
  DatePicker: { ...quiet, name: 'S1' },
  DateTimePicker: { ...quiet, name: 'S2' },
  DateRangePicker: { ...quiet, name: 'S3' },
  Rating: { ...quiet, name: 'S4' },
}

// Every fieldtype the server will hand back from get_filterable_fields.
const SERVER_FIELDTYPES = [
  'Check', 'Data', 'Float', 'Int', 'Currency', 'Dynamic Link', 'Link',
  'Long Text', 'Select', 'Small Text', 'Text Editor', 'Text', 'Duration',
  'Rating', 'Date', 'Datetime',
]

describe('CFConditions', () => {
  // `isChild` is what puts the "Add Condition" menu on screen; the outermost
  // list is driven by whatever embeds it.
  const mount = (conditions, props = {}) =>
    mountComponent(CFConditions, {
      props: { conditions, doctype: 'CRM Deal', isChild: true, ...props },
      global: { stubs: STUBS },
    })

  const menu = (wrapper) =>
    wrapper
      .findAllComponents({ name: 'DropdownStub' })
      .find((d) => d.props('options')?.[0]?.label === 'Add Condition')

  beforeEach(() => {
    api.fields.data = [
      { label: 'Status', fieldname: 'status', value: 'status', fieldtype: 'Select', options: 'Open\nWon' },
    ]
  })

  it('asks the server for the fields of its doctype', () => {
    mount([])
    expect(api.fields.submit).toHaveBeenCalledWith({ doctype: 'CRM Deal' })
  })

  it('asks again when the doctype changes', async () => {
    const wrapper = mount([])
    api.fields.submit.mockClear()
    await wrapper.setProps({ doctype: 'CRM Lead' })
    expect(api.fields.submit).toHaveBeenCalledWith({ doctype: 'CRM Lead' })
  })

  describe('adding', () => {
    it('adds a condition joined by the current word', () => {
      const conditions = [['status', '==', 'Open']]
      menu(mount(conditions)).props('options')[0].onClick()
      expect(conditions).toEqual([
        ['status', '==', 'Open'],
        'and',
        ['', '', ''],
      ])
    })

    it('joins with the word already in use', () => {
      // A group is all-and or all-or; a new row must not silently flip it.
      const conditions = [['status', '==', 'Open'], 'or', ['status', '==', 'Won']]
      menu(mount(conditions)).props('options')[0].onClick()
      expect(conditions[3]).toBe('or')
    })

    it('adds a nested group', () => {
      const conditions = [['status', '==', 'Open']]
      menu(mount(conditions)).props('options')[1].onClick()
      expect(conditions[2]).toEqual([[]])
    })

    it('stops offering groups past the nesting limit', () => {
      // Four levels is as deep as the renderer goes.
      const labels = menu(mount([], { level: 3 }))
        .props('options')
        .map((o) => o.label)
      expect(labels).toEqual(['Add Condition'])
    })

    it('offers groups below the limit', () => {
      const labels = menu(mount([], { level: 2 }))
        .props('options')
        .map((o) => o.label)
      expect(labels).toEqual(['Add Condition', 'Add Condition Group'])
    })
  })

  describe('removing', () => {
    it('takes the joining word after the first condition', () => {
      const conditions = [['a', '==', '1'], 'and', ['b', '==', '2']]
      mount(conditions).vm.removeCondition(conditions[0])
      expect(conditions).toEqual([['b', '==', '2']])
    })

    it('takes the joining word before a later condition', () => {
      const conditions = [['a', '==', '1'], 'and', ['b', '==', '2']]
      mount(conditions).vm.removeCondition(conditions[2])
      expect(conditions).toEqual([['a', '==', '1']])
    })

    it('empties the list when the only condition goes', () => {
      const conditions = [['a', '==', '1']]
      mount(conditions).vm.removeCondition(conditions[0])
      expect(conditions).toEqual([])
    })

    it('does nothing when handed something not in the list', () => {
      // `indexOf` returning -1 fed straight into splice, and a negative index
      // counts from the end — the last two entries were removed instead.
      const conditions = [['a', '==', '1'], 'and', ['b', '==', '2']]
      mount(conditions).vm.removeCondition(['not', 'in', 'here'])
      expect(conditions).toEqual([['a', '==', '1'], 'and', ['b', '==', '2']])
    })
  })

  describe('grouping', () => {
    it('wraps a condition in a group of its own', () => {
      const conditions = [['a', '==', '1']]
      mount(conditions).vm.turnIntoGroup(conditions[0])
      expect(conditions).toEqual([[['a', '==', '1']]])
    })

    it('leaves the rest of the list alone', () => {
      const conditions = [['a', '==', '1'], 'and', ['b', '==', '2']]
      mount(conditions).vm.turnIntoGroup(conditions[2])
      expect(conditions[0]).toEqual(['a', '==', '1'])
      expect(conditions[2]).toEqual([['b', '==', '2']])
    })

    it('does nothing when handed something not in the list', () => {
      const conditions = [['a', '==', '1'], 'and', ['b', '==', '2']]
      mount(conditions).vm.turnIntoGroup(['not', 'in', 'here'])
      expect(conditions).toHaveLength(3)
      expect(conditions[2]).toEqual(['b', '==', '2'])
    })

    it('spreads a group back out, rejoined with the outer word', () => {
      // The inner group may have used a different word; flattening it has to
      // adopt the outer one or the meaning changes.
      const conditions = [
        ['a', '==', '1'],
        'and',
        [['b', '==', '2'], 'or', ['c', '==', '3']],
      ]
      mount(conditions).vm.unGroupConditions(conditions[2])
      expect(conditions).toEqual([
        ['a', '==', '1'],
        'and',
        ['b', '==', '2'],
        'and',
        ['c', '==', '3'],
      ])
    })

    it('spreads out a group at the front', () => {
      const conditions = [[['b', '==', '2'], 'and', ['c', '==', '3']]]
      mount(conditions).vm.unGroupConditions(conditions[0])
      expect(conditions).toEqual([
        ['b', '==', '2'],
        'and',
        ['c', '==', '3'],
      ])
    })

    it('does nothing when handed a group not in the list', () => {
      const conditions = [['a', '==', '1']]
      mount(conditions).vm.unGroupConditions([['x', '==', '1']])
      expect(conditions).toEqual([['a', '==', '1']])
    })
  })

  describe('the joining word', () => {
    it('is and until something says otherwise', () => {
      expect(mount([['a', '==', '1']]).vm.getConjunction()).toBe('and')
    })

    it('reads the one in use', () => {
      expect(
        mount([['a', '==', '1'], 'or', ['b', '==', '2']]).vm.getConjunction(),
      ).toBe('or')
    })

    it('flips every one at once', () => {
      // The whole level shares one word; flipping half would change meaning.
      const conditions = [
        ['a', '==', '1'],
        'and',
        ['b', '==', '2'],
        'and',
        ['c', '==', '3'],
      ]
      mount(conditions).vm.toggleConjunction('and')
      expect(conditions[1]).toBe('or')
      expect(conditions[3]).toBe('or')
    })

    it('flips back', () => {
      const conditions = [['a', '==', '1'], 'or', ['b', '==', '2']]
      mount(conditions).vm.toggleConjunction('or')
      expect(conditions[1]).toBe('and')
    })
  })

  it('recognises a group by its shape', () => {
    const wrapper = mount([])
    expect(wrapper.vm.isGroupCondition([['a', '==', '1']])).toBe(true)
    expect(wrapper.vm.isGroupCondition('and')).toBe(false)
  })

  it('renders a row per condition, not per joining word', () => {
    const wrapper = mount([['a', '==', '1'], 'and', ['b', '==', '2']])
    expect(wrapper.findAllComponents(CFCondition)).toHaveLength(2)
  })

  it('renders with nothing in it', () => {
    expect(() => mount([])).not.toThrow()
  })
})

describe('CFCondition', () => {
  const mount = (condition, props = {}) =>
    mountComponent(CFCondition, {
      props: { condition, doctype: 'CRM Deal', ...props },
      global: { stubs: STUBS },
    })

  const field = (over = {}) => ({
    label: 'Name',
    fieldname: 'name',
    value: 'name',
    fieldtype: 'Data',
    ...over,
  })

  beforeEach(() => {
    api.fields.data = [field()]
  })

  describe('choosing a field', () => {
    it('records it', () => {
      const condition = ['', '', '']
      mount(condition).vm.updateField({ fieldname: 'name' })
      expect(condition[0]).toBe('name')
    })

    it('clears the value, which belonged to the old field', () => {
      const condition = ['status', '==', 'Open']
      mount(condition).vm.updateField({ fieldname: 'name' })
      expect(condition[2]).toBe('')
    })

    it('copes with the picker being cleared', () => {
      const condition = ['name', '==', 'x']
      mount(condition).vm.updateField(null)
      expect(condition[0]).toBeUndefined()
    })
  })

  describe('the operators offered', () => {
    const operators = (fieldtype, condition) => {
      api.fields.data = [field({ fieldtype, options: 'Open\nWon' })]
      return mount(condition || ['name', '', '']).vm.getOperators()
    }

    it('offers none until a field is chosen', () => {
      expect(mount(['', '', '']).vm.getOperators()).toEqual([])
    })

    it('offers none for a field the server did not send', () => {
      expect(mount(['gone', '', '']).vm.getOperators()).toEqual([])
    })

    it.each(SERVER_FIELDTYPES)('offers at least one for %s', (fieldtype) => {
      // The server's allowed list and this function's branches have to stay in
      // step: with no branch the list is empty and `options[0].value` throws.
      expect(operators(fieldtype).length).toBeGreaterThan(0)
    })

    it('offers text matching for a Data field', () => {
      expect(operators('Data').map((o) => o.value)).toEqual([
        '==', '!=', 'like', 'not like', 'in', 'not in', 'is',
      ])
    })

    it('offers comparisons for a number', () => {
      expect(operators('Int').map((o) => o.value)).toEqual(
        expect.arrayContaining(['<', '>', '<=', '>=']),
      )
    })

    it('offers only equality for a checkbox', () => {
      expect(operators('Check').map((o) => o.value)).toEqual(['=='])
    })

    it('offers a range for a date', () => {
      expect(operators('Date').map((o) => o.value)).toContain('between')
    })

    it('does not offer like-matching on a Select', () => {
      // The stored value is one of a fixed set; a partial match is meaningless.
      expect(operators('Select').map((o) => o.value)).not.toContain('like')
    })

    it('settles on the first operator when none is set', () => {
      const condition = ['name', '', '']
      api.fields.data = [field()]
      mount(condition).vm.getOperators()
      expect(condition[1]).toBe('==')
    })

    it('keeps an operator that is still valid', () => {
      const condition = ['name', 'like', 'ac']
      api.fields.data = [field()]
      mount(condition).vm.getOperators()
      expect(condition[1]).toBe('like')
    })

    it('falls back when the operator no longer applies to the field', () => {
      // A Data field's "like" does not exist on a checkbox.
      const condition = ['name', 'like', 'ac']
      api.fields.data = [field({ fieldtype: 'Check' })]
      mount(condition).vm.getOperators()
      expect(condition[1]).toBe('==')
    })
  })

  describe('changing the operator', () => {
    it('clears the value, which may no longer fit', () => {
      const condition = ['name', 'between', ['a', 'b']]
      mount(condition).vm.updateOperator()
      expect(condition[2]).toBe('')
    })
  })

  describe('recording a value', () => {
    const set = (condition, value) => {
      mount(condition).vm.updateValue(value)
      return condition[2]
    }

    it('takes it from a change event', () => {
      expect(set(['name', '==', ''], { target: { value: 'acme' } })).toBe('acme')
    })

    it('takes a plain value too', () => {
      expect(set(['name', '==', ''], 'acme')).toBe('acme')
    })

    it('stores a number as a number', () => {
      expect(set(['amount', '>', ''], '500')).toBe(500)
    })

    it('leaves an emptied box empty rather than turning it into 0', () => {
      // Regression: `isNaN('')` is false and `Number('')` is 0, so clearing a
      // text condition put the number zero into the filter.
      expect(set(['name', '==', 'acme'], { target: { value: '' } })).toBe('')
    })

    it('leaves a missing value alone', () => {
      expect(set(['name', '==', 'acme'], null)).toBe(null)
    })

    it('splits a range in two', () => {
      expect(set(['closure', 'between', ''], '2024-01-01,2024-12-31')).toEqual([
        '2024-01-01',
        '2024-12-31',
      ])
    })
  })

  describe('the control it draws for the value', () => {
    const control = (fieldtype, operator = '==', over = {}) => {
      api.fields.data = [field({ fieldtype, options: 'Open\nWon', ...over })]
      return mount(['name', operator, '']).vm.getValueControl()
    }

    it('draws nothing until a field is chosen', () => {
      expect(mount(['', '', '']).vm.getValueControl()).toBeNull()
    })

    it('draws nothing for a field the server did not send', () => {
      expect(mount(['gone', '==', '']).vm.getValueControl()).toBeNull()
    })

    it('offers set/not-set for the "is" operator, whatever the field', () => {
      const vnode = control('Data', 'is')
      expect(vnode.props.options.map((o) => o.value)).toEqual(['set', 'not set'])
    })

    it('offers the select options', () => {
      expect(control('Select').props.options.map((o) => o.value)).toEqual([
        'Open',
        'Won',
      ])
    })

    it('copes with a Select that has no options', () => {
      // Options can be filled in by a script rather than stored on the field.
      expect(() => control('Select', '==', { options: null })).not.toThrow()
    })

    it('offers yes/no for a checkbox', () => {
      expect(control('Check').props.options.map((o) => o.value)).toEqual([
        'Yes',
        'No',
      ])
    })

    it('draws a record picker for a link', () => {
      expect(control('Link', '==', { options: 'CRM Deal' }).props.doctype).toBe(
        'CRM Deal',
      )
    })

    it('draws a plain box for a dynamic link, which has no fixed doctype', () => {
      expect(control('Dynamic Link').props.type).toBe('text')
    })

    it('draws a number box for a number', () => {
      expect(control('Int').props.type).toBe('number')
    })

    it('draws a range picker for a date between two others', () => {
      expect(control('Date', 'between').props.iconLeft).toBe('')
    })

    it('draws a plain box for a partial match', () => {
      // "like" against a Link is free text, not a record picker.
      for (const op of ['like', 'not like', 'in', 'not in']) {
        expect(control('Link', op, { options: 'CRM Deal' }).props.type, op).toBe(
          'text',
        )
      }
    })

    it('starts a rating at zero rather than blank', () => {
      expect(control('Rating').props.modelValue).toBe(0)
    })

    it('falls back to a plain box', () => {
      expect(control('Duration').props.type).toBe('text')
    })
  })

  describe('its menu', () => {
    const menuOf = (wrapper) =>
      wrapper
        .findAllComponents({ name: 'DropdownStub' })
        .map((d) => d.props('options'))
        .find((o) => o?.some((i) => i.label?.startsWith('Remove')))

    const options = (props) => menuOf(mount(['name', '==', ''], props))

    const enabled = (opts) =>
      opts.filter((o) => (o.condition ? o.condition() : true)).map((o) => o.label)

    it('offers to group a plain condition', () => {
      expect(enabled(options({}))).toEqual(['Turn into a Group', 'Remove'])
    })

    it('offers to ungroup a group', () => {
      expect(enabled(options({ isGroup: true }))).toEqual([
        'Ungroup Conditions',
        'Remove Group',
      ])
    })

    it('stops offering grouping past the nesting limit', () => {
      expect(enabled(options({ level: 4 }))).toEqual(['Remove'])
    })

    it('reports a removal', () => {
      const wrapper = mount(['name', '==', ''])
      menuOf(wrapper).find((o) => o.label === 'Remove').onClick()
      expect(wrapper.emitted('remove')).toBeTruthy()
    })

    it('reports a request to group', () => {
      const wrapper = mount(['name', '==', ''])
      menuOf(wrapper).find((o) => o.label === 'Turn into a Group').onClick()
      expect(wrapper.emitted('turnIntoGroup')).toBeTruthy()
    })

    it('passes the current word up when flipping it', () => {
      const wrapper = mount(['name', '==', ''], { conjunction: 'or' })
      wrapper.vm.toggleConjunction()
      expect(wrapper.emitted('toggleConjunction').at(-1)).toEqual(['or'])
    })
  })
})
