const api = vi.hoisted(() => ({ call: vi.fn(), capture: vi.fn() }))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, call: api.call }
})

vi.mock('frappe-ui/frappe', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useTelemetry: () => ({ capture: api.capture }) }
})

const PEOPLE = {
  'ada@example.com': { full_name: 'Ada Lovelace', user_image: '/ada.png' },
  'bob@example.com': { full_name: 'Bob Brown', user_image: '' },
}

vi.mock('@/stores/users', async () => {
  const { reactive } = await import('vue')
  return {
    usersStore: () => ({
      users: reactive({ data: { crmUsers: [] } }),
      getUser: (email) => PEOPLE[email] || { full_name: email, user_image: '' },
    }),
  }
})

import AssignmentModal from '@/components/Modals/AssignmentModal.vue'
import { mountComponent } from '../helpers/mount'
import { flushPromises } from '@vue/test-utils'

const assignee = (email) => ({
  name: email,
  label: PEOPLE[email]?.full_name ?? email,
  image: PEOPLE[email]?.user_image ?? '',
})

const mountModal = ({ assignees = [], docs = new Set(), doc = { name: 'DEAL-1' } } = {}) =>
  mountComponent(AssignmentModal, {
    props: {
      modelValue: true,
      assignees,
      docs,
      doc,
      doctype: 'CRM Deal',
    },
    global: { stubs: { Dialog: true, Link: true, UserAvatar: true, Tooltip: true } },
  })

const callNames = () => api.call.mock.calls.map((c) => c[0])
const callTo = (name) => api.call.mock.calls.find((c) => c[0] === name)?.[1]

describe('AssignmentModal', () => {
  beforeEach(() => {
    api.call.mockReset().mockResolvedValue({})
    api.capture.mockClear()
  })

  describe('adding someone', () => {
    it('resolves the name and avatar from the user store', () => {
      const wrapper = mountModal()
      wrapper.vm.addValue('ada@example.com')
      expect(wrapper.vm.assignees).toEqual([assignee('ada@example.com')])
    })

    it('falls back to the address for an unknown user', () => {
      const wrapper = mountModal()
      wrapper.vm.addValue('zoe@example.com')
      expect(wrapper.vm.assignees[0]).toMatchObject({
        name: 'zoe@example.com',
        label: 'zoe@example.com',
      })
    })

    it('will not add the same person twice', () => {
      // The picker stays open, so a double click is easy to do.
      const wrapper = mountModal()
      wrapper.vm.addValue('ada@example.com')
      wrapper.vm.addValue('ada@example.com')
      expect(wrapper.vm.assignees).toHaveLength(1)
    })

    it('clears any previous error', () => {
      const wrapper = mountModal()
      wrapper.vm.error = 'something went wrong'
      wrapper.vm.addValue('ada@example.com')
      expect(wrapper.vm.error).toBe('')
    })
  })

  describe('removing someone', () => {
    it('drops just that person', () => {
      const wrapper = mountModal({
        assignees: [assignee('ada@example.com'), assignee('bob@example.com')],
      })
      wrapper.vm.removeValue('ada@example.com')
      expect(wrapper.vm.assignees.map((a) => a.name)).toEqual([
        'bob@example.com',
      ])
    })

    it('ignores someone who is not assigned', () => {
      const wrapper = mountModal({ assignees: [assignee('ada@example.com')] })
      wrapper.vm.removeValue('zoe@example.com')
      expect(wrapper.vm.assignees).toHaveLength(1)
    })
  })

  describe('saving a single document', () => {
    it('adds only the people who were not there before', async () => {
      const wrapper = mountModal({ assignees: [assignee('ada@example.com')] })
      wrapper.vm.addValue('bob@example.com')
      await wrapper.vm.updateAssignees()
      expect(callTo('frappe.desk.form.assign_to.add')).toMatchObject({
        doctype: 'CRM Deal',
        name: 'DEAL-1',
        assign_to: ['bob@example.com'],
      })
    })

    it('removes only the people who were dropped', async () => {
      const wrapper = mountModal({
        assignees: [assignee('ada@example.com'), assignee('bob@example.com')],
      })
      wrapper.vm.removeValue('bob@example.com')
      await wrapper.vm.updateAssignees()
      expect(callTo('xbr_crm.api.doc.remove_assignments')).toMatchObject({
        name: 'DEAL-1',
        assignees: JSON.stringify(['bob@example.com']),
      })
    })

    it('does nothing at all when nothing changed', async () => {
      // Reopening and closing the panel should not touch the server.
      const wrapper = mountModal({ assignees: [assignee('ada@example.com')] })
      await wrapper.vm.updateAssignees()
      expect(api.call).not.toHaveBeenCalled()
    })

    it('handles an add and a remove in one save', async () => {
      const wrapper = mountModal({ assignees: [assignee('ada@example.com')] })
      wrapper.vm.removeValue('ada@example.com')
      wrapper.vm.addValue('bob@example.com')
      await wrapper.vm.updateAssignees()
      expect(callNames()).toContain('xbr_crm.api.doc.remove_assignments')
      expect(callNames()).toContain('frappe.desk.form.assign_to.add')
    })

    it('closes afterwards', async () => {
      const wrapper = mountModal()
      wrapper.vm.addValue('ada@example.com')
      await wrapper.vm.updateAssignees()
      expect(wrapper.emitted('update:modelValue').at(-1)[0]).toBe(false)
    })
  })

  describe('saving a bulk selection', () => {
    it('uses the multi-document endpoint', async () => {
      const wrapper = mountModal({ docs: new Set(['DEAL-1', 'DEAL-2']) })
      wrapper.vm.addValue('ada@example.com')
      await wrapper.vm.updateAssignees()
      await flushPromises()
      expect(callNames()).toContain('frappe.desk.form.assign_to.add_multiple')
      expect(callNames()).not.toContain('frappe.desk.form.assign_to.add')
    })

    it('passes every selected document', async () => {
      const wrapper = mountModal({ docs: new Set(['DEAL-1', 'DEAL-2']) })
      wrapper.vm.addValue('ada@example.com')
      await wrapper.vm.updateAssignees()
      expect(callTo('frappe.desk.form.assign_to.add_multiple')).toMatchObject({
        name: JSON.stringify(['DEAL-1', 'DEAL-2']),
        assign_to: ['ada@example.com'],
        bulk_assign: true,
        re_assign: true,
      })
    })

    it('asks the list to reload once the batch lands', async () => {
      const wrapper = mountModal({ docs: new Set(['DEAL-1']) })
      wrapper.vm.addValue('ada@example.com')
      await wrapper.vm.updateAssignees()
      await flushPromises()
      expect(wrapper.emitted('reload')).toBeTruthy()
    })

    it('reports the bulk action separately from the single one', async () => {
      const wrapper = mountModal({ docs: new Set(['DEAL-1']) })
      wrapper.vm.addValue('ada@example.com')
      await wrapper.vm.updateAssignees()
      expect(api.capture).toHaveBeenCalledWith('bulk_assign_to', {
        doctype: 'CRM Deal',
      })
    })
  })
})
