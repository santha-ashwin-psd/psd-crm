const api = vi.hoisted(() => ({ toast: null }))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  api.toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn() }
  return { ...actual, toast: api.toast }
})

import WorkDayModal from '@/components/Settings/Sla/WorkDayModal.vue'
import { mountComponent } from '../helpers/mount'
import { reactive, nextTick } from 'vue'

const day = (workday, start = '09:00:00', end = '17:00:00') => ({
  workday,
  start_time: start,
  end_time: end,
})

const mount = (workDaysList = [], dialog = {}) => {
  const model = reactive({
    show: false,
    isEditing: false,
    data: { workday: '', start_time: '', end_time: '' },
    ...dialog,
  })
  const wrapper = mountComponent(WorkDayModal, {
    props: { workDaysList, modelValue: model },
    global: { stubs: { Dialog: true } },
  })
  return { wrapper, model, workDaysList }
}

const open = async (ctx) => {
  ctx.model.show = true
  await nextTick()
  return ctx
}

describe('WorkDayModal', () => {
  beforeEach(() => {
    api.toast.error.mockClear()
  })

  describe('which days can be chosen', () => {
    it('offers all seven when none are taken', () => {
      expect(mount().wrapper.vm.workdayOptions).toHaveLength(7)
    })

    it('hides days already on the schedule', () => {
      const { wrapper } = mount([day('Monday'), day('Tuesday')])
      expect(wrapper.vm.workdayOptions.map((o) => o.value)).not.toContain(
        'Monday',
      )
      expect(wrapper.vm.workdayOptions).toHaveLength(5)
    })

    it('keeps the day being edited in the list', () => {
      // Otherwise the control would be blank while editing Monday, because
      // Monday is taken — by the very row being edited.
      const { wrapper } = mount([day('Monday')], {
        isEditing: true,
        data: day('Monday'),
      })
      expect(wrapper.vm.workdayOptions.map((o) => o.value)).toContain('Monday')
    })
  })

  describe('time formatting', () => {
    const fmt = (v) => mount().wrapper.vm.formatTimeToHHMMSS(v)

    it('pads to seconds', () => {
      expect(fmt('09:30')).toBe('09:30:00')
    })

    it('pads a single-digit hour', () => {
      expect(fmt('9:30')).toBe('09:30:00')
    })

    it('keeps seconds it was given', () => {
      expect(fmt('09:30:45')).toBe('09:30:45')
    })

    it('returns nothing for an empty value', () => {
      expect(fmt('')).toBe('')
      expect(fmt(undefined)).toBe('')
    })

    it('returns nothing for something that is not a time', () => {
      expect(fmt('half past nine')).toBe('')
      expect(fmt('09')).toBe('')
    })
  })

  describe('validation', () => {
    const fill = async (ctx, over = {}) => {
      Object.assign(ctx.wrapper.vm.workDayData, {
        workday: 'Monday',
        start_time: '09:00',
        end_time: '17:00',
        ...over,
      })
      await nextTick()
      return ctx
    }

    it('accepts a complete, ordered entry', async () => {
      const ctx = await fill(mount())
      expect(ctx.wrapper.vm.validateForm()).toBe(true)
    })

    it('requires a day', async () => {
      const ctx = await fill(mount(), { workday: '' })
      expect(ctx.wrapper.vm.validateForm()).toBe(false)
      expect(ctx.wrapper.vm.errors.workday).toBe('This field is required')
    })

    it('requires a start time', async () => {
      // Two validators write to this field: validateField sets "This field is
      // required", then validateTimeRange overwrites it with its own wording.
      // The second one wins, so that is the message the user actually sees.
      const ctx = await fill(mount(), { start_time: '' })
      expect(ctx.wrapper.vm.validateForm()).toBe(false)
      expect(ctx.wrapper.vm.errors.start_time).toBe('Start Time is required')
    })

    it('requires an end time', async () => {
      const ctx = await fill(mount(), { end_time: '' })
      expect(ctx.wrapper.vm.validateForm()).toBe(false)
      expect(ctx.wrapper.vm.errors.end_time).toBe('This field is required')
    })

    it('rejects an end time before the start', async () => {
      const ctx = await fill(mount(), { start_time: '17:00', end_time: '09:00' })
      expect(ctx.wrapper.vm.validateForm()).toBe(false)
      expect(ctx.wrapper.vm.errors.end_time).toBe(
        'End Time must be after Start Time',
      )
    })

    it('rejects a zero-length day', async () => {
      // Equal times would store a working day nobody can be reached on.
      const ctx = await fill(mount(), { start_time: '09:00', end_time: '09:00' })
      expect(ctx.wrapper.vm.validateForm()).toBe(false)
    })

    it('compares minutes, not just hours', async () => {
      const ctx = await fill(mount(), { start_time: '09:30', end_time: '09:15' })
      expect(ctx.wrapper.vm.validateForm()).toBe(false)
    })

    it('accepts a range inside the same hour', async () => {
      const ctx = await fill(mount(), { start_time: '09:00', end_time: '09:30' })
      expect(ctx.wrapper.vm.validateForm()).toBe(true)
    })

    it('clears an earlier error once corrected', async () => {
      const ctx = await fill(mount(), { start_time: '17:00', end_time: '09:00' })
      ctx.wrapper.vm.validateForm()
      await fill(ctx, { start_time: '09:00', end_time: '17:00' })
      ctx.wrapper.vm.validateForm()
      expect(ctx.wrapper.vm.errors.end_time).toBe('')
    })
  })

  describe('saving a new day', () => {
    it('adds it to the schedule', async () => {
      const list = []
      const ctx = mount(list)
      Object.assign(ctx.wrapper.vm.workDayData, {
        workday: 'Monday',
        start_time: '09:00',
        end_time: '17:00',
      })
      await nextTick()
      ctx.wrapper.vm.onSave()
      expect(list).toEqual([day('Monday', '09:00:00', '17:00:00')])
    })

    it('normalises the times before storing them', async () => {
      const list = []
      const ctx = mount(list)
      Object.assign(ctx.wrapper.vm.workDayData, {
        workday: 'Monday',
        start_time: '9:05',
        end_time: '17:00',
      })
      await nextTick()
      ctx.wrapper.vm.onSave()
      expect(list[0].start_time).toBe('09:05:00')
    })

    it('closes the dialog', async () => {
      const ctx = mount([])
      Object.assign(ctx.wrapper.vm.workDayData, {
        workday: 'Monday',
        start_time: '09:00',
        end_time: '17:00',
      })
      await nextTick()
      ctx.wrapper.vm.onSave()
      expect(ctx.model.show).toBe(false)
    })

    it('refuses and says so when the form is wrong', async () => {
      const list = []
      const ctx = mount(list)
      ctx.wrapper.vm.onSave()
      expect(list).toEqual([])
      expect(api.toast.error).toHaveBeenCalledWith(
        'Please fix the errors in the form',
      )
    })

    it('leaves the dialog open so the errors can be read', async () => {
      const ctx = await open(mount([]))
      ctx.wrapper.vm.onSave()
      expect(ctx.model.show).toBe(true)
    })
  })

  describe('editing an existing day', () => {
    it('loads the current values', async () => {
      const ctx = await open(
        mount([day('Monday')], { isEditing: true, data: day('Monday') }),
      )
      expect(ctx.wrapper.vm.workDayData.workday).toBe('Monday')
      expect(ctx.wrapper.vm.workDayData.start_time).toBe('09:00:00')
    })

    it('replaces the row in place rather than appending', async () => {
      const list = [day('Monday'), day('Tuesday')]
      const ctx = await open(
        mount(list, { isEditing: true, data: day('Monday') }),
      )
      ctx.wrapper.vm.workDayData.end_time = '18:00'
      await nextTick()
      ctx.wrapper.vm.onSave()
      expect(list).toHaveLength(2)
      expect(list[0].end_time).toBe('18:00:00')
    })

    it('keeps any other fields on the row', async () => {
      // The row may carry a server-assigned name and idx.
      const list = [{ ...day('Monday'), name: 'ROW-1', idx: 1 }]
      const ctx = await open(
        mount(list, { isEditing: true, data: day('Monday') }),
      )
      ctx.wrapper.vm.workDayData.end_time = '18:00'
      await nextTick()
      ctx.wrapper.vm.onSave()
      expect(list[0]).toMatchObject({ name: 'ROW-1', idx: 1 })
    })
  })

  describe('deleting a day', () => {
    const evt = () => ({ preventDefault: vi.fn() })

    it('asks for confirmation first', async () => {
      const list = [day('Monday')]
      const ctx = await open(
        mount(list, { isEditing: true, data: day('Monday') }),
      )
      ctx.wrapper.vm.deleteWorkDay(evt())
      expect(ctx.wrapper.vm.isConfirmingDelete).toBe(true)
      expect(list).toHaveLength(1)
    })

    it('removes it on the second press', async () => {
      const list = [day('Monday'), day('Tuesday')]
      const ctx = await open(
        mount(list, { isEditing: true, data: day('Monday') }),
      )
      ctx.wrapper.vm.deleteWorkDay(evt())
      ctx.wrapper.vm.deleteWorkDay(evt())
      expect(list.map((d) => d.workday)).toEqual(['Tuesday'])
      expect(ctx.model.show).toBe(false)
    })

    it('does not submit the surrounding form', async () => {
      const ctx = await open(
        mount([day('Monday')], { isEditing: true, data: day('Monday') }),
      )
      const e = evt()
      ctx.wrapper.vm.deleteWorkDay(e)
      expect(e.preventDefault).toHaveBeenCalled()
    })

    it('forgets a primed confirmation when the dialog is reopened', async () => {
      // Regression: the editing branch skipped resetForm, so a delete armed on
      // one workday stayed armed. Reopening the dialog on a *different* day
      // meant a single click removed it with no second chance.
      const list = [day('Monday'), day('Tuesday')]
      const ctx = mount(list, { isEditing: true, data: day('Monday') })
      await open(ctx)
      ctx.wrapper.vm.deleteWorkDay(evt())
      expect(ctx.wrapper.vm.isConfirmingDelete).toBe(true)

      ctx.model.show = false
      await nextTick()
      ctx.model.data = day('Tuesday')
      await open(ctx)

      expect(ctx.wrapper.vm.isConfirmingDelete).toBe(false)
      ctx.wrapper.vm.deleteWorkDay(evt())
      expect(list).toHaveLength(2)
    })

    it('forgets stale validation errors when reopened', async () => {
      const ctx = mount([day('Monday')], {
        isEditing: true,
        data: day('Monday'),
      })
      await open(ctx)
      ctx.wrapper.vm.workDayData.end_time = ''
      await nextTick()
      ctx.wrapper.vm.validateForm()
      expect(ctx.wrapper.vm.errors.end_time).toBeTruthy()

      ctx.model.show = false
      await nextTick()
      await open(ctx)
      expect(ctx.wrapper.vm.errors.end_time).toBe('')
    })
  })

  describe('opening for a new day', () => {
    it('starts from a blank form', async () => {
      const ctx = mount([day('Monday')], { isEditing: true, data: day('Monday') })
      await open(ctx)
      ctx.model.show = false
      ctx.model.isEditing = false
      await nextTick()
      await open(ctx)
      expect(ctx.wrapper.vm.workDayData.workday).toBe('')
      expect(ctx.wrapper.vm.workDayData.start_time).toBe('')
    })
  })
})
