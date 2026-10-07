const api = vi.hoisted(() => ({ call: vi.fn(), dialog: vi.fn(), capture: vi.fn() }))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    call: api.call,
    toast: { success: vi.fn(), error: vi.fn(), create: vi.fn() },
  }
})

vi.mock('frappe-ui/frappe', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useTelemetry: () => ({ capture: api.capture }) }
})

vi.mock('@/stores/global', () => ({
  globalStore: () => ({ $dialog: api.dialog, $socket: { on: vi.fn(), off: vi.fn() } }),
}))

const customizations = vi.hoisted(() => ({ result: null }))
vi.mock('@/utils', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    setupListCustomizations: vi.fn(async () => customizations.result),
  }
})

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useRouter: () => ({ push: vi.fn() }) }
})

import ListBulkActions from '@/components/ListBulkActions.vue'
import { mountComponent } from '../helpers/mount'
import { flushPromises } from '@vue/test-utils'

const mountActions = (props = {}) =>
  mountComponent(ListBulkActions, {
    props: {
      doctype: 'CRM Deal',
      modelValue: { data: {}, reload: vi.fn() },
      ...props,
    },
    global: { stubs: { EditValueModal: true, AssignmentModal: true, DeleteLinkedDocModal: true } },
  })

const labels = (wrapper, selections = new Set(['A'])) =>
  wrapper.vm.bulkActions(selections, vi.fn()).map((a) => a.label)

describe('ListBulkActions', () => {
  beforeEach(() => {
    api.call.mockReset().mockResolvedValue({})
    api.dialog.mockReset()
    api.capture.mockClear()
    customizations.result = null
  })

  describe('which actions are offered', () => {
    it('offers the standard set by default', () => {
      expect(labels(mountActions())).toEqual([
        'Edit',
        'Delete',
        'Assign To',
        'Clear Assignment',
      ])
    })

    it('offers Convert to Deal only on leads', () => {
      expect(labels(mountActions({ doctype: 'CRM Lead' }))).toContain(
        'Convert to Deal',
      )
      expect(labels(mountActions({ doctype: 'CRM Deal' }))).not.toContain(
        'Convert to Deal',
      )
    })

    it('honours each hide option', () => {
      const wrapper = mountActions({ options: { hideEdit: true } })
      expect(labels(wrapper)).not.toContain('Edit')
      expect(labels(wrapper)).toContain('Delete')
    })

    it('hides both assignment actions together', () => {
      // They are one capability; offering Clear without Assign makes no sense.
      const wrapper = mountActions({ options: { hideAssign: true } })
      expect(labels(wrapper)).not.toContain('Assign To')
      expect(labels(wrapper)).not.toContain('Clear Assignment')
    })

    it('can be stripped back to nothing', () => {
      const wrapper = mountActions({
        options: { hideEdit: true, hideDelete: true, hideAssign: true },
      })
      expect(labels(wrapper)).toEqual([])
    })
  })

  describe('customizations from the server', () => {
    it('appends custom bulk actions after the built-ins', async () => {
      customizations.result = {
        bulkActions: [{ label: 'Archive', onClick: vi.fn() }],
      }
      const wrapper = mountActions()
      await flushPromises()
      expect(labels(wrapper).at(-1)).toBe('Archive')
    })

    it('hands the custom action the list and the selection', async () => {
      const onClick = vi.fn()
      customizations.result = { bulkActions: [{ label: 'Archive', onClick }] }
      const wrapper = mountActions()
      await flushPromises()
      const selections = new Set(['A', 'B'])
      wrapper.vm.bulkActions(selections, vi.fn()).at(-1).onClick()
      expect(onClick).toHaveBeenCalledWith(
        expect.objectContaining({ selections }),
      )
    })

    it('falls back to actions declared on the list data', async () => {
      customizations.result = null
      const wrapper = mountActions({
        modelValue: {
          data: { bulkActions: [{ label: 'FromData', onClick: vi.fn() }] },
          reload: vi.fn(),
        },
      })
      await flushPromises()
      expect(labels(wrapper)).toContain('FromData')
    })

    it('does not run customizations before the list has loaded', async () => {
      const { setupListCustomizations } = await import('@/utils')
      setupListCustomizations.mockClear()
      mountActions({ modelValue: { reload: vi.fn() } })
      await flushPromises()
      expect(setupListCustomizations).not.toHaveBeenCalled()
    })
  })

  describe('deleting', () => {
    it('asks about linked documents for a single row', () => {
      // One row can be inspected for links; a batch cannot, cheaply.
      const wrapper = mountActions()
      wrapper.vm.deleteValues(new Set(['DEAL-1']), vi.fn())
      expect(wrapper.vm.showDeleteDocModal).toMatchObject({
        showLinkedDocsModal: true,
        docname: 'DEAL-1',
      })
    })

    it('goes straight to a bulk confirm for several rows', () => {
      const wrapper = mountActions()
      wrapper.vm.deleteValues(new Set(['DEAL-1', 'DEAL-2']), vi.fn())
      expect(wrapper.vm.showDeleteDocModal).toMatchObject({
        showDeleteModal: true,
        items: ['DEAL-1', 'DEAL-2'],
      })
    })
  })

  describe('clearing assignments', () => {
    it('confirms before doing anything', () => {
      const wrapper = mountActions()
      wrapper.vm.clearAssignments(new Set(['A']), vi.fn())
      expect(api.dialog).toHaveBeenCalled()
      expect(api.call).not.toHaveBeenCalled()
    })

    it('posts every selected name once confirmed', async () => {
      const wrapper = mountActions()
      wrapper.vm.clearAssignments(new Set(['A', 'B']), vi.fn())
      const confirm = api.dialog.mock.calls[0][0].actions[0]
      await confirm.onClick(vi.fn())
      expect(api.call).toHaveBeenCalledWith(
        'frappe.desk.form.assign_to.remove_multiple',
        expect.objectContaining({
          doctype: 'CRM Deal',
          names: JSON.stringify(['A', 'B']),
        }),
      )
    })
  })

  describe('converting leads to deals', () => {
    it('confirms first', () => {
      const wrapper = mountActions({ doctype: 'CRM Lead' })
      wrapper.vm.convertToDeal(new Set(['LEAD-1']), vi.fn())
      expect(api.dialog).toHaveBeenCalled()
      expect(api.call).not.toHaveBeenCalled()
    })

    it('converts each selected lead', async () => {
      const wrapper = mountActions({ doctype: 'CRM Lead' })
      wrapper.vm.convertToDeal(new Set(['LEAD-1', 'LEAD-2']), vi.fn())
      await api.dialog.mock.calls[0][0].actions[0].onClick(vi.fn())
      await flushPromises()
      expect(api.call).toHaveBeenCalledTimes(2)
      expect(api.call.mock.calls.map((c) => c[1].lead)).toEqual([
        'LEAD-1',
        'LEAD-2',
      ])
    })
  })

  describe('reload', () => {
    it('closes the delete modals and refreshes the list', () => {
      const reload = vi.fn()
      const wrapper = mountActions({ modelValue: { data: {}, reload } })
      wrapper.vm.deleteValues(new Set(['DEAL-1']), vi.fn())
      wrapper.vm.reload()
      expect(wrapper.vm.showDeleteDocModal).toMatchObject({
        showLinkedDocsModal: false,
        showDeleteModal: false,
        docname: null,
      })
      expect(reload).toHaveBeenCalled()
    })

    it('clears the selection through both paths', () => {
      // The stored action covers the modal flow; the argument covers callers
      // that pass their own.
      const stored = vi.fn()
      const passed = vi.fn()
      const wrapper = mountActions()
      wrapper.vm.editValues(new Set(['A']), stored)
      wrapper.vm.reload(passed)
      expect(stored).toHaveBeenCalled()
      expect(passed).toHaveBeenCalled()
    })
  })
})
