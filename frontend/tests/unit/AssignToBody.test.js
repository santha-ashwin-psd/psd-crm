const users = vi.hoisted(() => ({
  current: {
    name: 'ada@example.com',
    full_name: 'Ada Lovelace',
    user_image: '/ada.png',
  },
}))

vi.mock('@/stores/users', () => ({
  usersStore: () => ({
    users: { data: [] },
    getUser: (email) =>
      !email
        ? users.current
        : {
            name: email,
            full_name: email === 'alan@example.com' ? 'Alan Turing' : email,
            user_image: `/${email.split('@')[0]}.png`,
          },
  }),
}))

vi.mock('frappe-ui/frappe', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useTelemetry: () => ({ capture: vi.fn() }) }
})

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    createResource: (options) => ({ options, submit: vi.fn(), reload: vi.fn() }),
  }
})

import AssignToBody from '@/components/AssignToBody.vue'
import { mountComponent } from '../helpers/mount'

const STUBS = {
  UserAvatar: { name: 'UserAvatar', props: ['user'], template: '<span />' },
  Link: { name: 'Link', props: ['doctype', 'value'], template: '<div class="link" />' },
  Tooltip: { name: 'Tooltip', props: ['text'], template: '<div><slot /></div>' },
  Switch: {
    name: 'Switch',
    props: ['modelValue', 'label'],
    template: '<button class="switch" />',
  },
}

const mountAssign = (props = {}) =>
  mountComponent(AssignToBody, {
    props: { doctype: 'CRM Deal', docname: 'DEAL-1', modelValue: [], ...props },
    global: { stubs: STUBS },
  })

describe('AssignToBody', () => {
  describe('mounting', () => {
    it('mounts cleanly on a document that already has assignees', () => {
      // Regression: the `open` watcher runs with `immediate: true`, so its
      // callback fired during setup. With existing assignees it got past the
      // no-change early return and reached `addAssignees`, which was declared
      // *below* the watcher — a temporal dead zone, so every mount on an
      // already-assigned document threw a ReferenceError.
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const wrapper = mountAssign({
        modelValue: [{ name: 'alan@example.com', label: 'Alan Turing' }],
      })
      expect(wrapper.exists()).toBe(true)
      expect(
        spy.mock.calls.flat().join(' '),
      ).not.toContain('before initialization')
      spy.mockRestore()
    })

    it('mounts cleanly with no assignees', () => {
      expect(() => mountAssign({ modelValue: [] })).not.toThrow()
    })
  })

  describe('adding an assignee', () => {
    it('records the person with their name and avatar', () => {
      const wrapper = mountAssign()
      wrapper.vm.addValue('alan@example.com')
      expect(wrapper.vm.assignees).toEqual([
        {
          name: 'alan@example.com',
          label: 'Alan Turing',
          image: '/alan.png',
        },
      ])
    })

    it('does not add the same person twice', () => {
      const wrapper = mountAssign()
      wrapper.vm.addValue('alan@example.com')
      wrapper.vm.addValue('alan@example.com')
      expect(wrapper.vm.assignees).toHaveLength(1)
    })

    it('appends to an existing list', () => {
      const wrapper = mountAssign({
        modelValue: [{ name: 'grace@example.com', label: 'Grace Hopper' }],
      })
      wrapper.vm.addValue('alan@example.com')
      expect(wrapper.vm.assignees).toHaveLength(2)
    })

    it('clears any previous error', () => {
      const wrapper = mountAssign()
      wrapper.vm.error = 'something went wrong'
      wrapper.vm.addValue('alan@example.com')
      expect(wrapper.vm.error).toBe('')
    })
  })

  describe('removing an assignee', () => {
    it('drops the named person', () => {
      const wrapper = mountAssign({
        modelValue: [
          { name: 'alan@example.com', label: 'Alan Turing' },
          { name: 'grace@example.com', label: 'Grace Hopper' },
        ],
      })
      wrapper.vm.removeValue('alan@example.com')
      expect(wrapper.vm.assignees.map((a) => a.name)).toEqual([
        'grace@example.com',
      ])
    })

    it('leaves the list alone for someone not on it', () => {
      const wrapper = mountAssign({
        modelValue: [{ name: 'alan@example.com', label: 'Alan Turing' }],
      })
      wrapper.vm.removeValue('nobody@example.com')
      expect(wrapper.vm.assignees).toHaveLength(1)
    })
  })

  describe('the "assign to me" switch', () => {
    it('adds the current user when switched on', async () => {
      const wrapper = mountAssign()
      wrapper.vm.assignToMe = true
      await wrapper.vm.$nextTick()
      expect(wrapper.vm.assignees.map((a) => a.name)).toEqual([
        'ada@example.com',
      ])
    })

    it('removes the current user when switched off', async () => {
      const wrapper = mountAssign({
        modelValue: [{ name: 'ada@example.com', label: 'Ada Lovelace' }],
      })
      wrapper.vm.assignToMe = true
      await wrapper.vm.$nextTick()
      wrapper.vm.assignToMe = false
      await wrapper.vm.$nextTick()
      expect(wrapper.vm.assignees).toHaveLength(0)
    })

    it('switches itself on when the current user is added directly', () => {
      // Otherwise the toggle would contradict the list beneath it.
      const wrapper = mountAssign()
      wrapper.vm.addValue('ada@example.com')
      expect(wrapper.vm.assignToMe).toBe(true)
    })

    it('switches itself off when the current user is removed directly', () => {
      const wrapper = mountAssign({
        modelValue: [{ name: 'ada@example.com', label: 'Ada Lovelace' }],
      })
      wrapper.vm.assignToMe = true
      wrapper.vm.removeValue('ada@example.com')
      expect(wrapper.vm.assignToMe).toBe(false)
    })

    it('is unaffected by adding somebody else', () => {
      const wrapper = mountAssign()
      wrapper.vm.addValue('alan@example.com')
      expect(wrapper.vm.assignToMe).toBe(false)
    })
  })

  describe('opening the panel', () => {
    it('reflects an existing self-assignment in the switch', async () => {
      const wrapper = mountAssign({
        modelValue: [{ name: 'ada@example.com', label: 'Ada Lovelace' }],
      })
      await wrapper.setProps({ open: true })
      expect(wrapper.vm.assignToMe).toBe(true)
    })

    it('leaves the switch off when someone else is assigned', async () => {
      const wrapper = mountAssign({
        modelValue: [{ name: 'alan@example.com', label: 'Alan Turing' }],
      })
      await wrapper.setProps({ open: true })
      expect(wrapper.vm.assignToMe).toBe(false)
    })

    it('remembers who was assigned when it opened', async () => {
      // Kept so the panel can tell on close what actually changed.
      const wrapper = mountAssign({
        modelValue: [{ name: 'alan@example.com', label: 'Alan Turing' }],
      })
      await wrapper.setProps({ open: true })
      expect(wrapper.vm.oldAssignees).toEqual([
        { name: 'alan@example.com', label: 'Alan Turing' },
      ])
    })
  })
})
