const store = vi.hoisted(() => ({ isAdmin: true, crmUsers: [] }))
vi.mock('@/stores/users', () => ({
  usersStore: () => ({
    users: { data: { crmUsers: store.crmUsers }, reload: vi.fn() },
    isAdmin: () => store.isAdmin,
  }),
}))

const created = vi.hoisted(() => [])
vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    createResource: (options) => {
      const resource = { options, submit: vi.fn(), loading: false }
      created.push(resource)
      return resource
    },
    toast: { success: vi.fn(), error: vi.fn() },
  }
})

import AddExistingUserModal from '@/components/Modals/AddExistingUserModal.vue'
import { mountComponent } from '../helpers/mount'

const STUBS = {
  Dialog: { name: 'Dialog', template: '<div><slot name="body" /></div>' },
  EmailMultiSelect: {
    name: 'EmailMultiSelect',
    props: ['modelValue', 'existingEmails', 'placeholder'],
    template: '<div class="email-select" />',
  },
  FormControl: {
    name: 'FormControl',
    props: ['modelValue', 'type', 'options'],
    template: '<select class="role-select" />',
  },
}

function mountModal(props = {}) {
  return mountComponent(AddExistingUserModal, {
    props: { modelValue: true, ...props },
    global: { stubs: STUBS },
  })
}

describe('AddExistingUserModal', () => {
  beforeEach(() => {
    created.length = 0
    store.isAdmin = true
    store.crmUsers = [{ name: 'ada@example.com' }]
  })

  describe('role options', () => {
    it('offers all three roles to an admin', () => {
      const options = mountModal()
        .findComponent({ name: 'FormControl' })
        .props('options')
      expect(options.map((o) => o.value)).toEqual([
        'Sales User',
        'Sales Manager',
        'System Manager',
      ])
    })

    it('offers only Sales User to a non-admin', () => {
      // A manager must not be able to grant a role above their own.
      store.isAdmin = false
      const options = mountModal()
        .findComponent({ name: 'FormControl' })
        .props('options')
      expect(options.map((o) => o.value)).toEqual(['Sales User'])
    })

    it('labels the elevated roles in plain language', () => {
      const options = mountModal()
        .findComponent({ name: 'FormControl' })
        .props('options')
      expect(options.map((o) => o.label)).toEqual([
        'Sales User',
        'Manager',
        'Admin',
      ])
    })
  })

  describe('role description', () => {
    it('explains the default role', () => {
      expect(mountModal().text()).toContain(
        'Can work with leads and deals and create private views',
      )
    })

    it('changes as the role changes', async () => {
      const wrapper = mountModal()
      wrapper.vm.role = 'System Manager'
      await wrapper.vm.$nextTick()
      expect(wrapper.text()).toContain('Can manage all aspects of the CRM')
    })

    it('shows nothing for an unrecognised role', async () => {
      const wrapper = mountModal()
      wrapper.vm.role = 'Guest'
      await wrapper.vm.$nextTick()
      expect(wrapper.text()).not.toContain('Can manage')
      expect(wrapper.text()).not.toContain('Can work with')
    })
  })

  describe('the Add button', () => {
    const addButton = (wrapper) =>
      wrapper.findAll('.stub-button').find((b) => b.text().includes('Add'))

    it('is disabled until someone is chosen', () => {
      expect(addButton(mountModal()).attributes('disabled')).toBeDefined()
    })

    it('enables once a user is selected', async () => {
      const wrapper = mountModal()
      wrapper.vm.newUsers = ['bob@example.com']
      await wrapper.vm.$nextTick()
      expect(addButton(wrapper).attributes('disabled')).toBeUndefined()
    })
  })

  describe('excluded users', () => {
    it('hides people already in the CRM from the picker', () => {
      // Re-adding an existing member would fail server-side.
      store.crmUsers = [{ name: 'ada@example.com' }, { name: 'bob@example.com' }]
      const existing = mountModal()
        .findComponent({ name: 'EmailMultiSelect' })
        .props('existingEmails')
      expect(existing).toContain('ada@example.com')
      expect(existing).toContain('bob@example.com')
    })

    it('always hides the example admin account', () => {
      expect(
        mountModal().findComponent({ name: 'EmailMultiSelect' }).props('existingEmails'),
      ).toContain('admin@example.com')
    })

    it('hides the picker entirely until the user list loads', () => {
      store.crmUsers = []
      expect(
        mountModal().findComponent({ name: 'EmailMultiSelect' }).exists(),
      ).toBe(false)
    })
  })

  describe('submitting', () => {
    it('sends the chosen users and role', async () => {
      const wrapper = mountModal()
      wrapper.vm.newUsers = ['bob@example.com', 'carol@example.com']
      wrapper.vm.role = 'Sales Manager'
      await wrapper.vm.$nextTick()

      const params = created[0].options.makeParams()
      expect(JSON.parse(params.users)).toEqual([
        'bob@example.com',
        'carol@example.com',
      ])
      expect(params.role).toBe('Sales Manager')
    })

    it('clears the form and closes on success', async () => {
      const wrapper = mountModal()
      wrapper.vm.newUsers = ['bob@example.com']
      await wrapper.vm.$nextTick()

      created[0].options.onSuccess()
      expect(wrapper.vm.newUsers).toEqual([])
      expect(wrapper.emitted('update:modelValue').at(-1)).toEqual([false])
    })

    it('surfaces the server message on failure', () => {
      mountModal()
      expect(() =>
        created[0].options.onError({ messages: ['User already exists'] }),
      ).not.toThrow()
    })

    it.each([
      ['an empty messages array', { messages: [] }],
      ['a plain Error, as a network failure arrives', new Error('Network down')],
      ['an error with no messages at all', {}],
      ['no error object', undefined],
    ])('survives %s', (_label, error) => {
      // Regression: `error.messages[0]` threw a TypeError inside the handler
      // for every one of these, so the user saw no toast at all — precisely
      // when something had gone wrong.
      mountModal()
      expect(() => created[0].options.onError(error)).not.toThrow()
    })
  })
})
