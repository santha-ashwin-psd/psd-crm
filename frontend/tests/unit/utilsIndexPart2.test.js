const api = vi.hoisted(() => ({ fields: null, toast: null }))

vi.mock('@/stores/meta', () => ({
  getMeta: () => ({ getFields: () => api.fields }),
}))

vi.mock('@/stores/users', () => ({
  usersStore: () => ({
    getUser: (e) => ({
      name: e,
      full_name: e === 'ada@x.com' ? 'Ada Lovelace' : e,
      user_image: e === 'ada@x.com' ? '/files/ada.png' : '',
    }),
  }),
}))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  api.toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
  return { ...actual, toast: api.toast }
})

import {
  convertToConditions,
  parseAssignees,
  taskStatusOptions,
  taskPriorityOptions,
  copyToClipboard,
  DropdownOption,
  TemplateOption,
  ConfirmDelete,
  clearCache,
  isTouchScreenDevice,
  colors,
  formatDate,
  setupCustomizations,
  setupListCustomizations,
} from '@/utils'
import { ref } from 'vue'

describe('convertToConditions', () => {
  // The condition tree the filter editor produces, turned into the expression
  // string the server evaluates.
  const build = (conditions, fieldPrefix) =>
    convertToConditions({ conditions, fieldPrefix })

  describe('nothing to convert', () => {
    it('is empty for no conditions', () => {
      expect(build([])).toBe('')
      expect(build(null)).toBe('')
      expect(build(undefined)).toBe('')
    })

    it('ignores an entry that is neither a word nor a condition', () => {
      expect(build([{ not: 'a condition' }])).toBe('')
    })
  })

  describe('a single comparison', () => {
    it('reads field, operator and value in order', () => {
      expect(build([['status', '==', 'Open']])).toBe('status == "Open"')
    })

    it('qualifies the field when asked to', () => {
      // Scripts evaluate against `doc`, so the prefix is what makes the
      // expression resolve at all.
      expect(build([['status', '==', 'Open']], 'doc')).toBe(
        'doc.status == "Open"',
      )
    })

    it('accepts the spellings the editor and the server both use', () => {
      for (const op of ['equals', 'Equals', '=', '==']) {
        expect(build([['status', op, 'Open']]), op).toBe('status == "Open"')
      }
      for (const op of ['!=', 'not equals']) {
        expect(build([['status', op, 'Open']]), op).toBe('status != "Open"')
      }
    })

    it('passes an unknown operator through untouched', () => {
      expect(build([['status', '~=', 'Open']])).toBe('status ~= "Open"')
    })

    it('carries the comparison operators across', () => {
      for (const op of ['<', '<=', '>', '>=']) {
        expect(build([['amount', op, 100]]), op).toBe(`amount ${op} 100`)
      }
    })

    it('writes numbers unquoted', () => {
      expect(build([['amount', '>', 100]])).toBe('amount > 100')
    })

    it('writes a boolean the way Python spells it', () => {
      // The result is evaluated server-side by Python, where `true` raises
      // NameError. Not reachable from the condition editor today — checkbox
      // values are stored as "Yes"/"No" — but the output has only one correct
      // form.
      expect(build([['converted', '==', true]])).toBe('converted == True')
      expect(build([['converted', '!=', false]])).toBe('converted != False')
    })

    it('escapes a quote inside a value', () => {
      // Otherwise the generated expression would not parse.
      expect(build([['title', '==', 'the "big" one']])).toBe(
        'title == "the \\"big\\" one"',
      )
    })
  })

  describe('checkboxes', () => {
    it('reads as the field itself when ticked', () => {
      expect(build([['converted', '==', 'Yes']])).toBe('converted')
    })

    it('reads as a negation when unticked', () => {
      expect(build([['converted', '==', 'No']])).toBe('not converted')
    })

    it('inverts again for "not equals"', () => {
      expect(build([['converted', '!=', 'Yes']])).toBe('not converted')
      expect(build([['converted', '!=', 'No']])).toBe('converted')
    })

    it('does not care about the case of yes and no', () => {
      expect(build([['converted', '==', 'yes']])).toBe('converted')
      expect(build([['converted', '==', 'NO']])).toBe('not converted')
    })
  })

  describe('set and not set', () => {
    it('reads "is set" as the field itself', () => {
      expect(build([['email', 'is', 'set']])).toBe('email')
    })

    it('reads "is not set" as a negation', () => {
      expect(build([['email', 'is', 'not set']])).toBe('not email')
    })

    it('reads "is not set" the other way round too', () => {
      expect(build([['email', 'is not', 'set']])).toBe('not email')
    })
  })

  describe('partial matches', () => {
    it('guards the field before searching inside it', () => {
      // `"x" in None` raises; the leading truth test is what stops it.
      expect(build([['title', 'like', 'acme']])).toBe(
        '(title and "acme" in title)',
      )
    })

    it('does the same for a negated match', () => {
      expect(build([['title', 'not like', 'acme']])).toBe(
        '(title and "acme" not in title)',
      )
    })
  })

  describe('lists', () => {
    it('turns a comma-separated string into a list', () => {
      expect(build([['status', 'in', 'Open,Won']])).toBe(
        '(status and status in ["Open", "Won"])',
      )
    })

    it('trims the spaces people leave after commas', () => {
      expect(build([['status', 'in', 'Open, Won ']])).toBe(
        '(status and status in ["Open", "Won"])',
      )
    })

    it('takes an array as it is', () => {
      expect(build([['status', 'in', ['Open', 'Won']]])).toBe(
        '(status and status in ["Open", "Won"])',
      )
    })

    it('copes with a single non-string value', () => {
      expect(build([['amount', 'in', 100]])).toBe(
        '(amount and amount in ["100"])',
      )
    })

    it('negates the same way', () => {
      expect(build([['status', 'not in', 'Lost']])).toBe(
        '(status and status not in ["Lost"])',
      )
    })
  })

  describe('ranges', () => {
    it('becomes a pair of comparisons', () => {
      expect(build([['closure', 'between', '2026-01-01,2026-12-31']])).toBe(
        '(closure >= "2026-01-01" and closure <= "2026-12-31")',
      )
    })

    it('trims the two ends', () => {
      expect(build([['closure', 'between', ' 2026-01-01 , 2026-12-31 ']])).toBe(
        '(closure >= "2026-01-01" and closure <= "2026-12-31")',
      )
    })

    it('falls back to a plain comparison with only one end', () => {
      expect(build([['closure', 'between', '2026-01-01']])).toBe(
        'closure between "2026-01-01"',
      )
    })
  })

  describe('an empty value', () => {
    it('reads an equals-nothing as a negation', () => {
      expect(build([['email', '==', null]])).toBe('not email')
      expect(build([['email', 'is', undefined]])).toBe('not email')
    })

    it('reads any other operator against nothing as a truth test', () => {
      expect(build([['email', '!=', null]])).toBe('email')
    })
  })

  describe('joining several', () => {
    it('keeps the joining word between them', () => {
      expect(
        build([
          ['status', '==', 'Open'],
          'and',
          ['amount', '>', 100],
        ]),
      ).toBe('status == "Open" and amount > 100')
    })

    it('lowercases the joining word for the evaluator', () => {
      // Python wants `and`/`or`, not `AND`/`OR`.
      expect(
        build([['status', '==', 'Open'], 'OR', ['status', '==', 'Won']]),
      ).toBe('status == "Open" or status == "Won"')
    })
  })

  describe('nested groups', () => {
    it('wraps a group in brackets', () => {
      expect(
        build([
          ['status', '==', 'Open'],
          'and',
          [['amount', '>', 100], 'or', ['amount', '<', 10]],
        ]),
      ).toBe('status == "Open" and (amount > 100 or amount < 10)')
    })

    it('carries the prefix into the group', () => {
      expect(
        build([[['amount', '>', 100], 'or', ['amount', '<', 10]]], 'doc'),
      ).toBe('(doc.amount > 100 or doc.amount < 10)')
    })

    it('nests as deeply as the editor allows', () => {
      expect(
        build([
          [
            ['a', '==', '1'],
            'and',
            [['b', '==', '2'], 'or', ['c', '==', '3']],
          ],
        ]),
      ).toBe('(a == "1" and (b == "2" or c == "3"))')
    })
  })
})

describe('parseAssignees', () => {
  it('turns each address into a name and a picture', () => {
    expect(parseAssignees(['ada@x.com'])).toEqual([
      { name: 'ada@x.com', image: '/files/ada.png', label: 'Ada Lovelace' },
    ])
  })

  it('falls back to the address for someone unknown', () => {
    expect(parseAssignees(['nobody@x.com'])[0].label).toBe('nobody@x.com')
  })

  it('copes with nobody assigned', () => {
    expect(parseAssignees([])).toEqual([])
  })
})

describe('task option menus', () => {
  beforeEach(() => {
    api.fields = null
  })

  describe('statuses', () => {
    it('falls back to the built-in list before the meta loads', () => {
      expect(taskStatusOptions().map((o) => o.label)).toEqual([
        'Backlog',
        'Todo',
        'In Progress',
        'Done',
        'Canceled',
      ])
    })

    it('prefers the statuses configured on the doctype', () => {
      api.fields = [
        { fieldname: 'status', options: [{ value: 'New' }, { value: 'Shipped' }] },
      ]
      expect(taskStatusOptions().map((o) => o.label)).toEqual(['New', 'Shipped'])
    })

    it('drops the blank option a Select carries', () => {
      api.fields = [
        { fieldname: 'status', options: [{ value: '' }, { value: 'New' }] },
      ]
      expect(taskStatusOptions().map((o) => o.label)).toEqual(['New'])
    })

    it('gives every entry an icon', () => {
      expect(taskStatusOptions().every((o) => typeof o.icon === 'function')).toBe(
        true,
      )
    })

    it('reports the status that was picked, with the task', () => {
      const action = vi.fn()
      const task = { name: 'TASK-1' }
      taskStatusOptions(action, task)[1].onClick()
      expect(action).toHaveBeenCalledWith('Todo', task)
    })

    it('is safe to click with no handler', () => {
      expect(() => taskStatusOptions()[0].onClick()).not.toThrow()
    })
  })

  describe('priorities', () => {
    it('falls back to the built-in list', () => {
      expect(taskPriorityOptions().map((o) => o.label)).toEqual([
        'Low',
        'Medium',
        'High',
      ])
    })

    it('prefers what the doctype defines', () => {
      api.fields = [
        { fieldname: 'priority', options: [{ value: 'Urgent' }] },
      ]
      expect(taskPriorityOptions().map((o) => o.label)).toEqual(['Urgent'])
    })

    it('reports the priority that was picked', () => {
      const action = vi.fn()
      taskPriorityOptions(action, { name: 'TASK-1' })[2].onClick()
      expect(action).toHaveBeenCalledWith('High', { name: 'TASK-1' })
    })
  })
})

describe('copyToClipboard', () => {
  beforeEach(() => api.toast.success.mockClear())

  it('uses the clipboard API where it is available', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: true,
    })

    copyToClipboard('ada@x.com')
    await Promise.resolve()
    expect(writeText).toHaveBeenCalledWith('ada@x.com')
  })

  it('falls back to a hidden field over plain http', () => {
    // The clipboard API is refused outside a secure context.
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: false,
    })
    document.execCommand = vi.fn(() => true)

    copyToClipboard('ada@x.com')
    expect(document.execCommand).toHaveBeenCalledWith('copy')
    expect(api.toast.success).toHaveBeenCalledWith('Copied to Clipboard')
  })

  it('leaves no scratch field behind', () => {
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: false,
    })
    document.execCommand = vi.fn(() => true)
    const before = document.querySelectorAll('textarea').length
    copyToClipboard('x')
    expect(document.querySelectorAll('textarea').length).toBe(before)
  })
})

describe('the dropdown builders', () => {
  describe('DropdownOption', () => {
    it('renders the label', () => {
      const vnode = DropdownOption({ option: 'Rename' })
      expect(JSON.stringify(vnode.children)).toContain('Rename')
    })

    it('draws an icon only when given one', () => {
      const without = DropdownOption({ option: 'Rename' })
      const withIcon = DropdownOption({ option: 'Rename', icon: 'edit' })
      expect(JSON.stringify(withIcon).length).toBeGreaterThan(
        JSON.stringify(without).length,
      )
    })

    it('draws a tick only when selected', () => {
      const plain = DropdownOption({ option: 'Rename' })
      const chosen = DropdownOption({ option: 'Rename', selected: true })
      expect(JSON.stringify(chosen).length).toBeGreaterThan(
        JSON.stringify(plain).length,
      )
    })

    it('carries the click handler', () => {
      const onClick = vi.fn()
      expect(DropdownOption({ option: 'Rename', onClick }).props.onClick).toBe(
        onClick,
      )
    })
  })

  describe('TemplateOption', () => {
    it('renders the label', () => {
      expect(
        JSON.stringify(TemplateOption({ option: 'Delete' }).children),
      ).toContain('Delete')
    })

    it('marks the active entry differently', () => {
      const active = TemplateOption({ option: 'Delete', active: true })
      const idle = TemplateOption({ option: 'Delete', active: false })
      expect(active.props.class).not.toEqual(idle.props.class)
    })

    it('colours a dangerous action', () => {
      const danger = TemplateOption({ option: 'Delete', variant: 'danger' })
      expect(String(danger.props.class)).toContain('red')
    })

    it('leaves an ordinary action uncoloured', () => {
      const plain = TemplateOption({ option: 'Rename', variant: 'grey' })
      expect(String(plain.props.class)).not.toContain('red')
    })
  })
})

describe('ConfirmDelete', () => {
  const build = (over = {}) => {
    const isConfirmingDelete = ref(false)
    const onConfirmDelete = vi.fn()
    const options = ConfirmDelete({
      isConfirmingDelete,
      onConfirmDelete,
      ...over,
    })
    return { options, isConfirmingDelete, onConfirmDelete }
  }

  const clickOf = (entry) => {
    let captured
    entry.component({
      active: false,
    })
    // TemplateOption stores the handler on the vnode it returns.
    captured = entry.component({ active: false }).props.onClick
    return captured
  }

  it('offers Delete first, and the confirmation only after', () => {
    const { options, isConfirmingDelete } = build()
    expect(options[0].condition()).toBe(true)
    expect(options[1].condition()).toBe(false)

    isConfirmingDelete.value = true
    expect(options[0].condition()).toBe(false)
    expect(options[1].condition()).toBe(true)
  })

  it('arms the confirmation rather than deleting', () => {
    const { options, isConfirmingDelete, onConfirmDelete } = build()
    const event = { preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() }
    clickOf(options[0])(event)
    expect(isConfirmingDelete.value).toBe(true)
    expect(onConfirmDelete).not.toHaveBeenCalled()
  })

  it('keeps the menu open while arming', () => {
    // Without this the dropdown closes and the confirmation is never seen.
    const { options } = build()
    const event = { preventDefault: vi.fn(), stopImmediatePropagation: vi.fn() }
    clickOf(options[0])(event)
    expect(event.preventDefault).toHaveBeenCalled()
    expect(event.stopImmediatePropagation).toHaveBeenCalled()
  })

  it('deletes on the second click and disarms', () => {
    const { options, isConfirmingDelete, onConfirmDelete } = build()
    isConfirmingDelete.value = true
    clickOf(options[1])()
    expect(onConfirmDelete).toHaveBeenCalled()
    expect(isConfirmingDelete.value).toBe(false)
  })

  it('uses the caller\'s wording throughout', () => {
    const { options } = build({ label: 'Remove view' })
    expect(options[0].label).toBe('Remove view')
    expect(options[1].label).toBe('Confirm Remove view')
  })
})

describe('clearCache', () => {
  it('removes the keys the desk leaves behind', () => {
    localStorage.setItem('_last_load', '1')
    localStorage.setItem('metadata_version', '2')
    localStorage.setItem('last_visited', 'Leads')
    clearCache()
    expect(localStorage.getItem('_last_load')).toBeNull()
    expect(localStorage.getItem('metadata_version')).toBeNull()
    expect(localStorage.getItem('last_visited')).toBeNull()
  })

  it('removes the prefixed families too', () => {
    localStorage.setItem('_page:Leads', 'x')
    localStorage.setItem('_doctype:CRM Deal', 'x')
    localStorage.setItem('preferred_breadcrumbs:Deal', 'x')
    clearCache()
    expect(localStorage.getItem('_page:Leads')).toBeNull()
    expect(localStorage.getItem('_doctype:CRM Deal')).toBeNull()
    expect(localStorage.getItem('preferred_breadcrumbs:Deal')).toBeNull()
  })

  it('leaves everything else alone', () => {
    // Sidebar width and theme live here too, and clearing them would be a
    // visible loss on what is meant to be a cache flush.
    localStorage.setItem('isSidebarCollapsed', 'true')
    clearCache()
    expect(localStorage.getItem('isSidebarCollapsed')).toBe('true')
  })
})

describe('small helpers', () => {
  it('detects a touch screen by whether the browser has the event', () => {
    expect(typeof isTouchScreenDevice()).toBe('boolean')
  })

  it('offers a colour palette with no duplicates', () => {
    expect(colors.length).toBeGreaterThan(5)
    expect(new Set(colors).size).toBe(colors.length)
  })

  it('formats a date, and nothing for no date', () => {
    expect(formatDate('')).toBe('')
    expect(formatDate(null)).toBe('')
    expect(formatDate('2026-03-04 10:00:00')).toBeTruthy()
  })
})

describe('doctype customisations', () => {
  describe('form scripts', () => {
    it('runs nothing when there are none', async () => {
      expect(await setupCustomizations(null, {})).toEqual([])
    })

    it('collects the actions and statuses a script declares', async () => {
      const script = `
        function setupForm(obj) {
          return { actions: [{ label: 'Convert' }], statuses: [{ name: 'Hot' }] }
        }
      `
      const result = await setupCustomizations([{ script }], {})
      expect(result.actions).toEqual([{ label: 'Convert' }])
      expect(result.statuses).toEqual([{ name: 'Hot' }])
    })

    it('ignores a script that declares no form hook', async () => {
      const result = await setupCustomizations([{ script: 'const x = 1' }], {})
      expect(result).toEqual({ statuses: [], actions: [] })
    })

    it('merges several scripts together', async () => {
      const one = `function setupForm() { return { actions: [{ label: 'A' }] } }`
      const two = `function setupForm() { return { actions: [{ label: 'B' }] } }`
      const result = await setupCustomizations([{ script: one }, { script: two }], {})
      expect(result.actions.map((a) => a.label)).toEqual(['A', 'B'])
    })

    it('copes with a hook that returns nothing', async () => {
      const script = `function setupForm() {}`
      const result = await setupCustomizations([{ script }], {})
      expect(result).toEqual({ statuses: [], actions: [] })
    })
  })

  describe('list scripts', () => {
    it('runs nothing when there are none', async () => {
      expect(await setupListCustomizations({}, {})).toEqual([])
    })

    it('records the actions on the list data', async () => {
      const data = {
        list_script: `function setupList() {
          return { actions: [{ label: 'Export' }], bulk_actions: [{ label: 'Merge' }] }
        }`,
      }
      const result = await setupListCustomizations(data, {})
      expect(result.actions).toEqual([{ label: 'Export' }])
      expect(result.bulkActions).toEqual([{ label: 'Merge' }])
      expect(data.listActions).toEqual([{ label: 'Export' }])
      expect(data.bulkActions).toEqual([{ label: 'Merge' }])
    })

    it('merges several list scripts', async () => {
      const data = {
        list_script: [
          `function setupList() { return { actions: [{ label: 'A' }] } }`,
          `function setupList() { return { actions: [{ label: 'B' }] } }`,
        ],
      }
      const result = await setupListCustomizations(data, {})
      expect(result.actions.map((a) => a.label)).toEqual(['A', 'B'])
    })
  })
})
