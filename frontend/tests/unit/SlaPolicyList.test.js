const api = vi.hoisted(() => ({ toast: null, created: [] }))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  api.toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn() }
  return {
    ...actual,
    toast: api.toast,
    createResource: (options = {}) => {
      const r = reactive({ ...options, data: null, fetch: vi.fn(), reload: vi.fn() })
      api.created.push(r)
      return r
    },
  }
})

import SlaPolicyList from '@/components/Settings/Sla/SlaPolicyList.vue'
import { slaData } from '@/components/Settings/Sla/utils'
import { mountComponent } from '../helpers/mount'
import { ref, reactive, nextTick } from 'vue'

const policy = (name, over = {}) => ({
  name,
  sla_name: name,
  enabled: 1,
  default: 0,
  apply_on: 'CRM Lead',
  ...over,
})

let listResource
let updateStep
let searchQuery

const mount = (rows = []) => {
  listResource = reactive({
    data: rows,
    loading: false,
    start: 0,
    pageLength: 999,
    filters: {},
    reload: vi.fn(),
    delete: { submit: vi.fn() },
    setValue: { submit: vi.fn() },
  })
  updateStep = vi.fn()
  searchQuery = ref('')
  return mountComponent(SlaPolicyList, {
    global: {
      stubs: {
        SettingsLayoutBase: true,
        EmptyState: true,
        Dropdown: true,
        Dialog: true,
        LoadingIndicator: true,
        Switch: { props: ['modelValue', 'size'], template: '<button class="local-switch" />' },
      },
      provide: {
        slaPolicyListResource: listResource,
        updateStep,
        slaSearchQuery: searchQuery,
      },
    },
  })
}

describe('SlaPolicyList', () => {
  beforeEach(() => {
    api.toast.success.mockClear()
    api.toast.error.mockClear()
    api.created = []
  })

  describe('creating a policy', () => {
    it('clears any policy left in the editor first', () => {
      // The editor state is module-level; without the reset the new policy
      // opens showing the last one that was edited.
      slaData.value.sla_name = 'Leftover'
      mount().vm.createNewSlaPolicy()
      expect(slaData.value.sla_name).toBe('')
    })

    it('opens the editor with no record', () => {
      mount().vm.createNewSlaPolicy()
      expect(updateStep).toHaveBeenCalledWith('view', null)
    })
  })

  describe('searching', () => {
    it('filters the list by name', async () => {
      mount([policy('Gold')])
      searchQuery.value = 'gol'
      await nextTick()
      expect(listResource.filters).toEqual({ name: ['like', '%gol%'] })
      expect(listResource.reload).toHaveBeenCalled()
    })

    it('returns to the first page when cleared', async () => {
      mount([policy('Gold')])
      listResource.start = 20
      searchQuery.value = 'gold'
      await nextTick()
      searchQuery.value = ''
      await nextTick()
      expect(listResource.start).toBe(0)
    })

    it('keeps showing every policy after the search is cleared', async () => {
      // Regression: clearing the box also set pageLength to 10, while
      // SlaConfig creates the resource with 999 — so the list silently shrank
      // to ten policies and offered no way to see the rest.
      mount([policy('Gold')])
      searchQuery.value = 'gold'
      await nextTick()
      searchQuery.value = ''
      await nextTick()
      expect(listResource.pageLength).toBe(999)
    })
  })

  describe('enabling and disabling', () => {
    it('sends the opposite of the current state', () => {
      const wrapper = mount([policy('Gold')])
      wrapper.vm.onToggle(policy('Gold', { enabled: 1 }))
      expect(listResource.setValue.submit).toHaveBeenCalledWith(
        { name: 'Gold', enabled: false },
        expect.any(Object),
      )
    })

    it('confirms once it lands', () => {
      const wrapper = mount([policy('Gold')])
      wrapper.vm.onToggle(policy('Gold'))
      listResource.setValue.submit.mock.calls[0][1].onSuccess()
      expect(api.toast.success).toHaveBeenCalledWith('SLA Policy Status Updated')
    })

    it('refuses to disable the default policy', () => {
      // Something has to apply to records that match no other policy.
      const wrapper = mount([policy('Gold', { default: 1 })])
      wrapper.vm.onToggle(policy('Gold', { default: 1 }))
      expect(listResource.setValue.submit).not.toHaveBeenCalled()
      expect(api.toast.error).toHaveBeenCalledWith(
        'SLA set as default cannot be disabled',
      )
    })
  })

  describe('deleting', () => {
    it('asks for confirmation first', () => {
      const wrapper = mount([policy('Gold')])
      wrapper.vm.deleteSla(policy('Gold'))
      expect(listResource.delete.submit).not.toHaveBeenCalled()
      expect(wrapper.vm.isConfirmingDelete).toBe(true)
    })

    it('deletes on the second press', () => {
      const wrapper = mount([policy('Gold')])
      wrapper.vm.deleteSla(policy('Gold'))
      wrapper.vm.deleteSla(policy('Gold'))
      expect(listResource.delete.submit).toHaveBeenCalledWith(
        'Gold',
        expect.any(Object),
      )
    })

    it('confirms once it is gone', () => {
      const wrapper = mount([policy('Gold')])
      wrapper.vm.deleteSla(policy('Gold'))
      wrapper.vm.deleteSla(policy('Gold'))
      listResource.delete.submit.mock.calls[0][1].onSuccess()
      expect(api.toast.success).toHaveBeenCalledWith('SLA Policy Deleted')
    })

    it('shows the server reason when it refuses', () => {
      const wrapper = mount([policy('Gold')])
      wrapper.vm.deleteSla(policy('Gold'))
      wrapper.vm.deleteSla(policy('Gold'))
      listResource.delete.submit.mock.calls[0][1].onError({
        messages: ['Linked to 4 deals'],
      })
      expect(api.toast.error).toHaveBeenCalledWith('Linked to 4 deals')
    })

    it('shows a plain Error message rather than burying it', () => {
      const wrapper = mount([policy('Gold')])
      wrapper.vm.deleteSla(policy('Gold'))
      wrapper.vm.deleteSla(policy('Gold'))
      listResource.delete.submit.mock.calls[0][1].onError(new Error('offline'))
      expect(api.toast.error).toHaveBeenCalledWith('offline')
    })

    it('falls back when the failure carries nothing', () => {
      const wrapper = mount([policy('Gold')])
      wrapper.vm.deleteSla(policy('Gold'))
      wrapper.vm.deleteSla(policy('Gold'))
      listResource.delete.submit.mock.calls[0][1].onError({})
      expect(api.toast.error).toHaveBeenCalledWith(
        'Something went wrong, try again later',
      )
    })
  })

  describe('duplicating', () => {
    it('proposes a name marked as a copy', () => {
      const wrapper = mount([policy('Gold')])
      wrapper.vm
        .dropdownOptions(policy('Gold'))
        .find((o) => o.label === 'Duplicate')
        .onClick()
      // `sla` records which policy is being copied: the dialog is rendered once
      // for the page rather than once per row, so it can no longer read the
      // policy out of the v-for scope.
      expect(wrapper.vm.duplicateDialog).toEqual({
        show: true,
        name: 'Gold (Copy)',
        sla: policy('Gold'),
      })
    })

    it('fetches the original before copying it', () => {
      const wrapper = mount([policy('Gold')])
      wrapper.vm.duplicate(policy('Gold'))
      expect(api.created.at(-1).params).toEqual({
        doctype: 'CRM Service Level Agreement',
        name: 'Gold',
      })
    })

    it('inserts the copy under the chosen name', () => {
      const wrapper = mount([policy('Gold')])
      wrapper.vm.duplicateDialog = { show: true, name: 'Gold v2' }
      wrapper.vm.duplicate(policy('Gold'))
      api.created.at(-1).onSuccess({ name: 'Gold', sla_name: 'Gold', default: 1 })
      expect(api.created.at(-1).params.doc).toMatchObject({
        sla_name: 'Gold v2',
      })
    })

    it('never copies the default flag', () => {
      // Two defaults would leave it ambiguous which policy applies.
      const wrapper = mount([policy('Gold')])
      wrapper.vm.duplicate(policy('Gold'))
      api.created.at(-1).onSuccess({ name: 'Gold', default: 1 })
      expect(api.created.at(-1).params.doc.default).toBe(false)
    })

    it('refreshes the list and closes the dialog', () => {
      const wrapper = mount([policy('Gold')])
      wrapper.vm.duplicateDialog = { show: true, name: 'Gold v2' }
      wrapper.vm.duplicate(policy('Gold'))
      api.created.at(-1).onSuccess({ name: 'Gold' })
      api.created.at(-1).onSuccess({ name: 'Gold v2' })
      expect(listResource.reload).toHaveBeenCalled()
      expect(api.toast.success).toHaveBeenCalledWith('SLA Policy Duplicated')
      expect(wrapper.vm.duplicateDialog).toEqual({
        show: false,
        name: '',
        sla: null,
      })
    })

    it('opens the new policy once it exists', () => {
      vi.useFakeTimers()
      const wrapper = mount([policy('Gold')])
      wrapper.vm.duplicate(policy('Gold'))
      api.created.at(-1).onSuccess({ name: 'Gold' })
      api.created.at(-1).onSuccess({ name: 'Gold v2' })
      vi.advanceTimersByTime(250)
      expect(updateStep).toHaveBeenCalledWith('view', { name: 'Gold v2' }, true)
      vi.useRealTimers()
    })
  })
})
