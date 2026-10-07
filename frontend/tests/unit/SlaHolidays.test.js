const api = vi.hoisted(() => ({ holidayLists: null }))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  return {
    ...actual,
    createListResource: (options = {}) => {
      api.holidayLists = reactive({
        ...options,
        data: null,
        fetch: vi.fn(),
        reload: vi.fn(),
      })
      return api.holidayLists
    },
  }
})

import SlaHolidays from '@/components/Settings/Sla/SlaHolidays.vue'
import { slaData, resetSlaData } from '@/components/Settings/Sla/utils'
import { mountComponent } from '../helpers/mount'

const day = (workday, start = '09:00:00', end = '17:00:00') => ({
  workday,
  start_time: start,
  end_time: end,
})

const mount = () =>
  mountComponent(SlaHolidays, {
    global: {
      stubs: {
        Dropdown: true,
        NestedPopover: true,
        ErrorMessage: true,
        WorkDayModal: true,
      },
    },
  })

describe('SlaHolidays', () => {
  let open

  beforeEach(() => {
    resetSlaData()
    open = vi.spyOn(window, 'open').mockImplementation(() => {})
  })

  afterEach(() => {
    open.mockRestore()
  })

  describe('the columns', () => {
    it('requires all three', () => {
      // A workday with no times is not a schedule, so none of them is optional.
      expect(mount().vm.columns.every((c) => c.isRequired)).toBe(true)
      expect(mount().vm.columns.map((c) => c.key)).toEqual([
        'workday',
        'start_time',
        'end_time',
      ])
    })
  })

  describe('adding a workday', () => {
    it('picks the first day not already scheduled', () => {
      const wrapper = mount()
      slaData.value.working_hours = [day('Monday'), day('Tuesday')]
      wrapper.vm.addWorkDay()
      expect(slaData.value.working_hours.at(-1).workday).toBe('Wednesday')
    })

    it('starts it at the standard office hours', () => {
      const wrapper = mount()
      slaData.value.working_hours = []
      wrapper.vm.addWorkDay()
      expect(slaData.value.working_hours[0]).toMatchObject({
        workday: 'Monday',
        start_time: '09:00:00',
        end_time: '17:00:00',
      })
    })

    it('gives the row a local id so the list can key on it', () => {
      const wrapper = mount()
      slaData.value.working_hours = []
      wrapper.vm.addWorkDay()
      expect(slaData.value.working_hours[0].id).toEqual(expect.any(String))
    })

    it('reaches past a gap in the week', () => {
      const wrapper = mount()
      slaData.value.working_hours = [day('Monday'), day('Wednesday')]
      wrapper.vm.addWorkDay()
      expect(slaData.value.working_hours.at(-1).workday).toBe('Tuesday')
    })

    it('offers the weekend once the week is full', () => {
      const wrapper = mount()
      slaData.value.working_hours = [
        'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday',
      ].map((d) => day(d))
      wrapper.vm.addWorkDay()
      expect(slaData.value.working_hours.at(-1).workday).toBe('Saturday')
    })
  })

  describe('editing a workday', () => {
    it('opens the dialog in editing mode', () => {
      const wrapper = mount()
      wrapper.vm.editWorkDay(day('Monday'))
      expect(wrapper.vm.dialog.show).toBe(true)
      expect(wrapper.vm.dialog.isEditing).toBe(true)
    })

    it('hands over a copy of the row, not the row itself', () => {
      // The dialog edits its own draft and writes back on save; sharing the
      // object would apply every keystroke straight to the table.
      const wrapper = mount()
      const monday = day('Monday')
      wrapper.vm.editWorkDay(monday)
      expect(wrapper.vm.dialog.data).not.toBe(monday)
      expect(wrapper.vm.dialog.data).toEqual({
        workday: 'Monday',
        start_time: '09:00:00',
        end_time: '17:00:00',
      })
    })
  })

  describe('deleting a workday', () => {
    it('asks for confirmation first', () => {
      const wrapper = mount()
      const monday = day('Monday')
      slaData.value.working_hours = [monday]
      wrapper.vm.deleteWorkDay(monday)
      expect(slaData.value.working_hours).toHaveLength(1)
      expect(wrapper.vm.isConfirmingDelete).toBe(true)
    })

    it('removes it on the second press', () => {
      const wrapper = mount()
      const monday = day('Monday')
      slaData.value.working_hours = [monday, day('Tuesday')]
      wrapper.vm.deleteWorkDay(monday)
      wrapper.vm.deleteWorkDay(monday)
      expect(slaData.value.working_hours.map((d) => d.workday)).toEqual([
        'Tuesday',
      ])
    })

    it('does nothing for a row that is no longer there', () => {
      const wrapper = mount()
      slaData.value.working_hours = [day('Monday')]
      wrapper.vm.isConfirmingDelete = true
      wrapper.vm.deleteWorkDay(day('Tuesday'))
      expect(slaData.value.working_hours).toHaveLength(1)
    })
  })

  describe('displaying a time', () => {
    const fmt = (t) => mount().vm.formatTime(t)

    it('shows a morning time with its period', () => {
      expect(fmt('09:00:00')).toMatch(/^09:00\s?(AM|am)/)
    })

    it('converts an afternoon time to twelve-hour', () => {
      expect(fmt('17:30:00')).toMatch(/^05:30\s?(PM|pm)/)
    })

    it('falls back for a missing time rather than showing NaN', () => {
      expect(fmt('')).toBe('00:00')
      expect(fmt(undefined)).toBe('00:00')
    })

    it('copes with a time that has no seconds', () => {
      expect(fmt('09:00')).toMatch(/^09:00/)
    })
  })

  describe('holiday lists', () => {
    it('opens the desk form to create one', () => {
      // Holiday lists are a Frappe desk doctype with no CRM-side editor.
      mount().vm.createNewHolidayList()
      expect(open).toHaveBeenCalledWith(
        `${window.location.origin}/app/crm-holiday-list`,
      )
    })

    it('opens a specific list for editing', () => {
      mount().vm.editHolidayList({ name: 'India 2026' })
      expect(open).toHaveBeenCalledWith(
        `${window.location.origin}/app/crm-holiday-list/India 2026`,
      )
    })

    it('fetches the available lists', () => {
      mount()
      expect(api.holidayLists.doctype).toBe('CRM Holiday List')
      expect(api.holidayLists.auto).toBe(true)
    })
  })

  describe('the row menu', () => {
    it('offers Edit and a delete option', () => {
      const labels = mount()
        .vm.dropdownOptions(day('Monday'))
        .map((o) => o.label)
      expect(labels).toContain('Edit')
      expect(labels.length).toBeGreaterThan(1)
    })
  })
})
