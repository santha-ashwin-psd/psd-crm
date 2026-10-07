const store = vi.hoisted(() => ({
  allUsers: [
    { name: 'ada@example.com', email: 'ada@example.com', full_name: 'Ada Lovelace' },
    { name: 'alan@example.com', email: 'alan@example.com', full_name: 'Alan Turing' },
    { name: 'grace@example.com', email: 'grace@example.com', full_name: 'Grace Hopper' },
  ],
}))

// The component builds a `xbr_crm.api.contact.search_emails` resource when the
// query changes. Left real it fires at localhost:3000 — a leak that shows up
// only as an unhandled rejection below the pass summary, and only sometimes.
vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  return {
    ...actual,
    createResource: (options = {}) =>
      reactive({
        ...options,
        data: null,
        loading: false,
        fetch: vi.fn(),
        submit: vi.fn(),
        reload: vi.fn(),
        update: vi.fn(),
      }),
  }
})

vi.mock('@/stores/users', () => ({
  usersStore: () => ({
    users: { data: {} },
    allUsers: { get value() { return store.allUsers } },
  }),
}))

import EmailMultiSelect from '@/components/Controls/EmailMultiSelect.vue'
import { mountComponent } from '../helpers/mount'
import { validateEmail } from '@/utils'

// reka-ui's combobox needs its own provider context; the parts are stubbed so
// the assertions are about this component's own list and value handling.
const STUBS = Object.fromEntries(
  [
    'ComboboxRoot',
    'ComboboxAnchor',
    'ComboboxPortal',
    'ComboboxContent',
    'ComboboxViewport',
  ].map((name) => [name, { name, template: '<div><slot /></div>' }]),
)
Object.assign(STUBS, {
  ComboboxInput: {
    name: 'ComboboxInput',
    props: ['value', 'placeholder'],
    template: '<input class="combo-input" :placeholder="placeholder" />',
  },
  ComboboxItem: {
    name: 'ComboboxItem',
    props: ['value'],
    template: '<div class="combo-item" :data-value="value"><slot /></div>',
  },
  ComboboxEmpty: {
    name: 'ComboboxEmpty',
    template: '<div class="combo-empty"><slot /></div>',
  },
  UserAvatar: { name: 'UserAvatar', template: '<span />' },
  ErrorMessage: {
    name: 'ErrorMessage',
    props: ['message'],
    template: '<div class="error">{{ message }}</div>',
  },
})

function mountSelect(props = {}) {
  return mountComponent(EmailMultiSelect, {
    props: { modelValue: [], fetchUsers: true, ...props },
    global: { stubs: STUBS },
  })
}

const emittedValues = (wrapper) =>
  wrapper.emitted('update:modelValue')?.at(-1)?.[0]

describe('EmailMultiSelect', () => {
  describe('adding values', () => {
    it('adds a typed address', () => {
      const wrapper = mountSelect()
      wrapper.vm.addValue('bob@example.com')
      expect(wrapper.vm.values).toEqual(['bob@example.com'])
    })

    it('splits a pasted comma-separated list', () => {
      // Pasting a row of addresses out of a spreadsheet is the common case.
      const wrapper = mountSelect()
      wrapper.vm.addValue('a@x.com, b@x.com ,c@x.com')
      expect(wrapper.vm.values).toEqual(['a@x.com', 'b@x.com', 'c@x.com'])
    })

    it('ignores empty input', () => {
      const wrapper = mountSelect()
      wrapper.vm.addValue('')
      wrapper.vm.addValue(null)
      expect(wrapper.vm.values).toEqual([])
    })

    it('ignores stray separators in a pasted list', () => {
      const wrapper = mountSelect()
      wrapper.vm.addValue('a@x.com,,b@x.com,')
      expect(wrapper.vm.values).toEqual(['a@x.com', 'b@x.com'])
    })

    it('refuses a duplicate and says so', () => {
      const wrapper = mountSelect({ modelValue: ['a@x.com'] })
      wrapper.vm.addValue('a@x.com')
      expect(wrapper.vm.values).toEqual(['a@x.com'])
      expect(wrapper.vm.info).toBe('Email already exists')
    })

    it('keeps the valid part of a list containing a duplicate', () => {
      const wrapper = mountSelect({ modelValue: ['a@x.com'] })
      wrapper.vm.addValue('a@x.com, b@x.com')
      expect(wrapper.vm.values).toEqual(['a@x.com', 'b@x.com'])
    })
  })

  describe('validation', () => {
    it('rejects an invalid address and reports it', () => {
      const wrapper = mountSelect({ validate: validateEmail })
      wrapper.vm.addValue('not-an-email')
      expect(wrapper.vm.values).toEqual([])
      expect(wrapper.vm.error).toContain('not-an-email')
    })

    it('leaves the bad value in the box so it can be corrected', () => {
      // Clearing it would make the user retype the whole address.
      const wrapper = mountSelect({ validate: validateEmail })
      wrapper.vm.addValue('not-an-email')
      expect(wrapper.vm.query).toBe('not-an-email')
    })

    it('stops at the first invalid entry in a pasted list', () => {
      const wrapper = mountSelect({ validate: validateEmail })
      wrapper.vm.addValue('good@x.com, bad, other@x.com')
      expect(wrapper.vm.values).toEqual(['good@x.com'])
    })

    it('accepts anything when no validator is supplied', () => {
      const wrapper = mountSelect()
      wrapper.vm.addValue('not-an-email')
      expect(wrapper.vm.values).toEqual(['not-an-email'])
    })

    it('clears a previous error on the next successful add', () => {
      const wrapper = mountSelect({ validate: validateEmail })
      wrapper.vm.addValue('bad')
      expect(wrapper.vm.error).toBeTruthy()
      wrapper.vm.addValue('good@x.com')
      expect(wrapper.vm.error).toBeNull()
    })
  })

  describe('removing values', () => {
    it('removes the named value', () => {
      const wrapper = mountSelect({ modelValue: ['a@x.com', 'b@x.com'] })
      wrapper.vm.removeValue('a@x.com')
      expect(emittedValues(wrapper)).toEqual(['b@x.com'])
    })

    it('leaves the list alone for an unknown value', () => {
      const wrapper = mountSelect({ modelValue: ['a@x.com'] })
      wrapper.vm.removeValue('nope@x.com')
      expect(emittedValues(wrapper)).toEqual(['a@x.com'])
    })

    it('does not backspace away a value while there is text to delete', () => {
      const wrapper = mountSelect({ modelValue: ['a@x.com'] })
      wrapper.vm.query = 'typing'
      wrapper.vm.removeLastValue()
      expect(wrapper.vm.values).toEqual(['a@x.com'])
    })
  })

  describe('the suggestion list', () => {
    it('offers users by name and address', () => {
      const wrapper = mountSelect()
      expect(wrapper.vm.options).toEqual([
        { label: 'Ada Lovelace', value: 'ada@example.com' },
        { label: 'Alan Turing', value: 'alan@example.com' },
        { label: 'Grace Hopper', value: 'grace@example.com' },
      ])
    })

    it('hides people who are already excluded', () => {
      const wrapper = mountSelect({ existingEmails: ['ada@example.com'] })
      expect(wrapper.vm.options.map((o) => o.value)).not.toContain(
        'ada@example.com',
      )
    })

    it('filters on the typed text, matching name or address', () => {
      const wrapper = mountSelect()
      wrapper.vm.query = 'grace'
      expect(wrapper.vm.options.map((o) => o.value)).toEqual([
        'grace@example.com',
      ])

      wrapper.vm.query = 'alan@'
      expect(wrapper.vm.options.map((o) => o.value)).toEqual([
        'alan@example.com',
      ])
    })

    it('matches case-insensitively', () => {
      const wrapper = mountSelect()
      wrapper.vm.query = 'ADA'
      expect(wrapper.vm.options).toHaveLength(1)
    })

    it('offers the typed text itself in free mode', () => {
      // With no directory to search, whatever was typed is the only candidate.
      const wrapper = mountSelect({ fetchUsers: false, mode: 'free' })
      wrapper.vm.query = 'someone@elsewhere.com'
      expect(wrapper.vm.options).toEqual([
        { label: 'someone@elsewhere.com', value: 'someone@elsewhere.com' },
      ])
    })

    it('offers nothing in free mode before anything is typed', () => {
      const wrapper = mountSelect({ fetchUsers: false, mode: 'free' })
      expect(wrapper.vm.options).toEqual([])
    })
  })

  describe('mode resolution', () => {
    it('prefers an explicit mode', () => {
      expect(mountSelect({ mode: 'contacts', fetchUsers: true }).vm.effectiveMode).toBe(
        'contacts',
      )
    })

    it('infers users from the legacy flag', () => {
      expect(mountSelect({ fetchUsers: true }).vm.effectiveMode).toBe('users')
    })

    it('falls back to free', () => {
      expect(mountSelect({ fetchUsers: false }).vm.effectiveMode).toBe('free')
    })
  })

  describe('selecting from the list', () => {
    it('adds the choice and clears the query', () => {
      const wrapper = mountSelect()
      wrapper.vm.query = 'ada'
      wrapper.vm.onSelect('ada@example.com')
      expect(wrapper.vm.values).toEqual(['ada@example.com'])
      expect(wrapper.vm.query).toBe('')
    })

    it('keeps the query when the choice fails validation', () => {
      const wrapper = mountSelect({ validate: validateEmail })
      wrapper.vm.onSelect('bad')
      expect(wrapper.vm.query).toBe('bad')
    })

    it('ignores an empty selection', () => {
      const wrapper = mountSelect()
      wrapper.vm.onSelect('')
      expect(wrapper.vm.values).toEqual([])
    })

    it('commits the typed text on Enter', () => {
      const wrapper = mountSelect()
      wrapper.vm.query = 'typed@x.com'
      wrapper.vm.handleEnter()
      expect(wrapper.vm.values).toEqual(['typed@x.com'])
    })

    it('does nothing on Enter with an empty box', () => {
      const wrapper = mountSelect()
      wrapper.vm.handleEnter()
      expect(wrapper.vm.values).toEqual([])
    })
  })

  describe('rendering', () => {
    it('shows a chip per selected address', () => {
      const wrapper = mountSelect({ modelValue: ['a@x.com', 'b@x.com'] })
      expect(wrapper.findAll('.stub-button')).toHaveLength(2)
    })

    it('shows the placeholder on the input', () => {
      const wrapper = mountSelect({ placeholder: 'john@doe.com' })
      expect(wrapper.find('.combo-input').attributes('placeholder')).toBe(
        'john@doe.com',
      )
    })
  })
})
