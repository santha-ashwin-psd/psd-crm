const api = vi.hoisted(() => ({ toast: null, created: [] }))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  api.toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn() }
  return {
    ...actual,
    toast: api.toast,
    createResource: (options = {}) => {
      const r = reactive({
        ...options,
        data: null,
        submit: vi.fn(async () => ({})),
        fetch: vi.fn(),
        reload: vi.fn(async () => ({})),
      })
      api.created.push(r)
      return r
    },
  }
})

vi.mock('@/composables/settings', async () => {
  const { ref } = await import('vue')
  return {
    disableSettingModalOutsideClick: ref(false),
    isMobileView: ref(false),
  }
})

import SlaPolicyView from '@/components/Settings/Sla/SlaPolicyView.vue'
import { slaData, resetSlaData } from '@/components/Settings/Sla/utils'
import { mountComponent } from '../helpers/mount'
import { ref, reactive, nextTick } from 'vue'
import { flushPromises } from '@vue/test-utils'

let listResource
let updateStep
let step

const validPolicy = () => {
  slaData.value.sla_name = 'Gold'
  slaData.value.priorities = [
    { priority: 'High', first_response_time: 3600, default_priority: true },
  ]
}

const mount = (stepValue = { screen: 'view', data: null, fetchData: false }) => {
  listResource = reactive({
    data: [],
    reload: vi.fn(),
    insert: { submit: vi.fn() },
    setValue: { submit: vi.fn(async () => ({})) },
  })
  updateStep = vi.fn()
  step = ref(stepValue)
  api.created = []
  return mountComponent(SlaPolicyView, {
    global: {
      stubs: {
        SettingsLayoutBase: true,
        SlaAssignmentConditions: true,
        SlaHolidays: true,
        SlaPriorityList: true,
        ConfirmDialog: true,
        DatePicker: true,
        Popover: true,
        LoadingIndicator: true,
        ErrorMessage: true,
        FormLabel: true,
        Checkbox: true,
        Select: true,
        Switch: { props: ['modelValue', 'size'], template: '<button />' },
      },
      provide: {
        slaPolicyListResource: listResource,
        step,
        updateStep,
      },
    },
  })
}

// The `get` resource is the first one this component builds.
const getResource = () => api.created[0]

describe('SlaPolicyView', () => {
  beforeEach(() => {
    resetSlaData()
    api.toast.success.mockClear()
    api.toast.error.mockClear()
  })

  describe('loading an existing policy', () => {
    const load = (over = {}) => {
      const wrapper = mount({
        screen: 'view',
        data: { name: 'Gold' },
        fetchData: true,
      })
      getResource().onSuccess({
        name: 'Gold',
        sla_name: 'Gold',
        enabled: 1,
        default: 0,
        rolling_responses: 1,
        condition: '',
        condition_json: '[]',
        ...over,
      })
      return wrapper
    }

    it('turns the server flags into booleans', () => {
      // They arrive as 0/1 and are bound to checkboxes and switches.
      load()
      expect(slaData.value.enabled).toBe(true)
      expect(slaData.value.default).toBe(false)
      expect(slaData.value.rolling_responses).toBe(true)
    })

    it('parses the stored conditions', () => {
      load({ condition_json: '[["status","=","Open"]]' })
      expect(slaData.value.condition_json).toEqual([['status', '=', 'Open']])
    })

    it('says so and carries on when the conditions are corrupt', () => {
      // Refusing to open the policy at all would leave no way to repair it.
      const wrapper = load({ condition_json: '{not json' })
      expect(api.toast.error).toHaveBeenCalledWith(
        'Assignment conditions are invalid or corrupt, recreate the conditions.',
      )
      expect(slaData.value.condition_json).toEqual([])
      expect(wrapper.vm.useNewUI).toBe(true)
    })

    it('falls back to the old editor for a policy that predates the new one', () => {
      // An old policy has a `condition` string but no structured JSON; showing
      // the new builder would present it as empty and overwrite it on save.
      const wrapper = load({ condition: 'doc.status == "Open"', condition_json: '[]' })
      expect(wrapper.vm.useNewUI).toBe(false)
      expect(wrapper.vm.isOldSla).toBe(true)
    })

    it('uses the new editor once structured conditions exist', () => {
      const wrapper = load({
        condition: 'doc.status == "Open"',
        condition_json: '[["status","=","Open"]]',
      })
      expect(wrapper.vm.useNewUI).toBe(true)
      expect(wrapper.vm.isOldSla).toBe(false)
    })
  })

  describe('the enabled switch', () => {
    it('toggles', () => {
      const wrapper = mount()
      slaData.value.enabled = false
      wrapper.vm.toggleEnabled()
      expect(slaData.value.enabled).toBe(true)
    })

    it('refuses to disable the default policy', () => {
      const wrapper = mount()
      slaData.value.default = true
      slaData.value.enabled = true
      wrapper.vm.toggleEnabled()
      expect(slaData.value.enabled).toBe(true)
      expect(api.toast.error).toHaveBeenCalledWith(
        'SLA set as default cannot be disabled',
      )
    })
  })

  describe('the default switch', () => {
    it('enables the policy when it becomes the default', () => {
      // A disabled default would leave unmatched records with no SLA at all.
      const wrapper = mount()
      slaData.value.enabled = false
      slaData.value.default = false
      wrapper.vm.toggleDefaultSla()
      expect(slaData.value.default).toBe(true)
      expect(slaData.value.enabled).toBe(true)
    })

    it('leaves enabled alone when it stops being the default', () => {
      const wrapper = mount()
      slaData.value.default = true
      slaData.value.enabled = true
      wrapper.vm.toggleDefaultSla()
      expect(slaData.value.default).toBe(false)
      expect(slaData.value.enabled).toBe(true)
    })
  })

  describe('saving', () => {
    it('refuses an invalid policy', () => {
      const wrapper = mount()
      wrapper.vm.saveSla()
      expect(listResource.insert.submit).not.toHaveBeenCalled()
      expect(api.toast.error).toHaveBeenCalledWith(
        'Invalid fields, check if all are filled in and values are correct.',
      )
    })

    it('creates when there is no record yet', () => {
      const wrapper = mount({ screen: 'view', data: null, fetchData: false })
      validPolicy()
      wrapper.vm.saveSla()
      expect(listResource.insert.submit).toHaveBeenCalled()
    })

    it('serialises the conditions both ways for the server', () => {
      // `condition` is the evaluated expression the backend runs; the JSON is
      // what the builder reads back.
      const wrapper = mount({ screen: 'view', data: null, fetchData: false })
      validPolicy()
      slaData.value.condition_json = [['status', '=', 'Open']]
      wrapper.vm.saveSla()
      const sent = listResource.insert.submit.mock.calls[0][0]
      expect(typeof sent.condition).toBe('string')
      expect(sent.condition_json).toBe('[["status","=","Open"]]')
    })

    it('opens the created policy', () => {
      const wrapper = mount({ screen: 'view', data: null, fetchData: false })
      validPolicy()
      wrapper.vm.saveSla()
      listResource.insert.submit.mock.calls[0][1].onSuccess({ name: 'Gold' })
      expect(api.toast.success).toHaveBeenCalledWith('SLA Policy Created')
      expect(updateStep).toHaveBeenCalledWith('view', { name: 'Gold' }, true)
    })

    it('shows a plain Error message rather than burying it', () => {
      const wrapper = mount({ screen: 'view', data: null, fetchData: false })
      validPolicy()
      wrapper.vm.saveSla()
      listResource.insert.submit.mock.calls[0][1].onError(new Error('offline'))
      expect(api.toast.error).toHaveBeenCalledWith('offline')
    })

    it('warns before overwriting an old policy conditions', () => {
      const wrapper = mount({
        screen: 'view',
        data: { name: 'Gold' },
        fetchData: false,
      })
      validPolicy()
      wrapper.vm.isOldSla = true
      wrapper.vm.useNewUI = true
      wrapper.vm.saveSla()
      expect(wrapper.vm.showConfirmDialog.show).toBe(true)
      expect(wrapper.vm.showConfirmDialog.title).toBe('Confirm Overwrite')
      expect(listResource.setValue.submit).not.toHaveBeenCalled()
    })
  })

  describe('updating', () => {
    const setup = () => {
      const wrapper = mount({
        screen: 'view',
        data: { name: 'Gold' },
        fetchData: false,
      })
      validPolicy()
      slaData.value.name = 'Gold'
      return wrapper
    }

    it('reports success and refreshes the list', async () => {
      const wrapper = setup()
      await wrapper.vm.updateSla()
      await flushPromises()
      expect(api.toast.success).toHaveBeenCalledWith('SLA Policy Updated')
      expect(listResource.reload).toHaveBeenCalled()
    })

    it('does not claim success when the save was refused', async () => {
      // Regression: `submit` resolves either way, so the function ran on and
      // showed "SLA Policy Updated" next to the error it had just reported.
      // setup() mounts, and mount() builds a fresh listResource — so the
      // override has to come after it, not before.
      const wrapper = setup()
      listResource.setValue.submit = vi.fn(async (_doc, opts) => {
        opts.onError({ messages: ['Name already taken'] })
      })
      await wrapper.vm.updateSla()
      await flushPromises()
      expect(api.toast.error).toHaveBeenCalledWith('Name already taken')
      expect(api.toast.success).not.toHaveBeenCalled()
    })

    it('does not refresh the list after a refused save', async () => {
      const wrapper = setup()
      listResource.setValue.submit = vi.fn(async (_doc, opts) => {
        opts.onError({})
      })
      await wrapper.vm.updateSla()
      await flushPromises()
      expect(listResource.reload).not.toHaveBeenCalled()
    })

    it('renames when the display name changed', async () => {
      const wrapper = setup()
      slaData.value.sla_name = 'Platinum'
      await wrapper.vm.updateSla()
      await flushPromises()
      const rename = api.created.find((r) => r.url === 'frappe.client.rename_doc')
      expect(rename.submit).toHaveBeenCalled()
    })

    it('stops after a refused rename rather than fetching a name that does not exist', async () => {
      const wrapper = setup()
      slaData.value.sla_name = 'Platinum'
      const rename = api.created.find((r) => r.url === 'frappe.client.rename_doc')
      rename.submit = vi.fn(() => Promise.reject({ messages: ['Duplicate'] }))
      await wrapper.vm.updateSla()
      await flushPromises()
      expect(api.toast.error).toHaveBeenCalledWith('Duplicate')
      expect(api.toast.success).not.toHaveBeenCalled()
    })

    it('reloads in place when the name did not change', async () => {
      const wrapper = setup()
      await wrapper.vm.updateSla()
      await flushPromises()
      expect(getResource().reload).toHaveBeenCalled()
    })
  })

  describe('going back', () => {
    it('asks before discarding unsaved edits', () => {
      const wrapper = mount({
        screen: 'view',
        data: { name: 'Gold' },
        fetchData: false,
      })
      wrapper.vm.isDirty = true
      wrapper.vm.goBack()
      expect(wrapper.vm.showConfirmDialog.show).toBe(true)
      expect(wrapper.vm.showConfirmDialog.title).toBe('Unsaved Changes')
    })

    it('asks before abandoning a policy that was never saved', () => {
      const wrapper = mount({ screen: 'view', data: null, fetchData: false })
      wrapper.vm.goBack()
      expect(wrapper.vm.showConfirmDialog.show).toBe(true)
    })

    it('returns to the list once confirmed', () => {
      vi.useFakeTimers()
      const wrapper = mount({
        screen: 'view',
        data: { name: 'Gold' },
        fetchData: false,
      })
      wrapper.vm.goBack()
      vi.advanceTimersByTime(250)
      expect(step.value).toEqual({
        screen: 'list',
        data: null,
        fetchData: true,
      })
      vi.useRealTimers()
    })
  })
})
