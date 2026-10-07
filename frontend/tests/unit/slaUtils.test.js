import {
  slaData,
  slaDataErrors,
  resetSlaData,
  resetSlaDataErrors,
  validateSlaData,
  defaultWorkingHours,
} from '@/components/Settings/Sla/utils'

const priority = (name, over = {}) => ({
  priority: name,
  first_response_time: 3600,
  default_priority: false,
  ...over,
})

const day = (workday, start = '09:00:00', end = '17:00:00') => ({
  workday,
  start_time: start,
  end_time: end,
})

describe('SLA utils', () => {
  beforeEach(() => {
    resetSlaData()
    resetSlaDataErrors()
  })

  describe('the default working hours', () => {
    it('cover the working week', () => {
      expect(defaultWorkingHours().map((d) => d.workday)).toEqual([
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
      ])
    })

    it('hand back a new array each time', () => {
      expect(defaultWorkingHours()).not.toBe(defaultWorkingHours())
    })

    it('hand back new day objects, not shared ones', () => {
      // Regression: `slaData` referenced the module-level array directly, and
      // both SlaHolidays and WorkDayModal push/splice/edit it in place — so
      // editing one policy rewrote the defaults for every policy after it.
      expect(defaultWorkingHours()[0]).not.toBe(defaultWorkingHours()[0])
    })

    it('survive a policy that edits its hours', () => {
      slaData.value.working_hours.splice(0, 1)
      slaData.value.working_hours.push(day('Saturday'))
      slaData.value.working_hours[0].end_time = '23:00:00'

      resetSlaData()
      expect(slaData.value.working_hours.map((d) => d.workday)).toEqual([
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
      ])
      expect(slaData.value.working_hours[0].end_time).toBe('17:00:00')
    })

    it('are what a fresh policy starts with', () => {
      expect(slaData.value.working_hours).toHaveLength(5)
    })
  })

  describe('resetting', () => {
    it('clears the policy back to its defaults', () => {
      slaData.value.sla_name = 'Gold'
      slaData.value.priorities = [priority('High')]
      resetSlaData()
      expect(slaData.value.sla_name).toBe('')
      expect(slaData.value.priorities).toEqual([])
      expect(slaData.value.apply_on).toBe('CRM Lead')
    })

    it('clears every error', () => {
      slaDataErrors.value.sla_name = 'something'
      resetSlaDataErrors()
      expect(Object.values(slaDataErrors.value).every((v) => v === '')).toBe(true)
    })
  })

  describe('the policy name', () => {
    it('is required', () => {
      validateSlaData('sla_name')
      expect(slaDataErrors.value.sla_name).toBe('SLA Policy Name is required')
    })

    it('rejects whitespace alone', () => {
      slaData.value.sla_name = '   '
      validateSlaData('sla_name')
      expect(slaDataErrors.value.sla_name).toBeTruthy()
    })

    it('accepts a real name', () => {
      slaData.value.sla_name = 'Gold'
      validateSlaData('sla_name')
      expect(slaDataErrors.value.sla_name).toBe('')
    })
  })

  describe('priorities', () => {
    it('need at least one', () => {
      validateSlaData('priorities')
      expect(slaDataErrors.value.priorities).toBe(
        'At least one priority is required',
      )
    })

    it('each need a name', () => {
      slaData.value.priorities = [priority('')]
      validateSlaData('priorities')
      expect(slaDataErrors.value.priorities).toContain(
        'Priority 1: Priority Name is required',
      )
    })

    it('number the complaint from one, not zero', () => {
      // The number is meant to point at a row on screen.
      slaData.value.priorities = [priority('High'), priority('')]
      validateSlaData('priorities')
      expect(slaDataErrors.value.priorities).toContain('Priority 2:')
    })

    it('each need a response time', () => {
      slaData.value.priorities = [priority('High', { first_response_time: 0 })]
      validateSlaData('priorities')
      expect(slaDataErrors.value.priorities).toContain(
        'Priority 1: Response Time is required',
      )
    })

    it('must be unique', () => {
      slaData.value.priorities = [priority('High'), priority('High')]
      validateSlaData('priorities')
      expect(slaDataErrors.value.priorities).toContain(
        'Priorities must be unique',
      )
    })

    it('treat case and padding as the same priority', () => {
      slaData.value.priorities = [priority('High'), priority(' high ')]
      validateSlaData('priorities')
      expect(slaDataErrors.value.priorities).toContain(
        'Priorities must be unique',
      )
    })

    it('report every problem at once', () => {
      slaData.value.priorities = [priority('', { first_response_time: 0 })]
      validateSlaData('priorities')
      expect(slaDataErrors.value.priorities).toContain('Priority Name')
      expect(slaDataErrors.value.priorities).toContain('Response Time')
    })

    it('pass when they are complete and distinct', () => {
      slaData.value.priorities = [priority('High'), priority('Low')]
      validateSlaData('priorities')
      expect(slaDataErrors.value.priorities).toBe('')
    })
  })

  describe('the date range', () => {
    it('rejects an end before the start', () => {
      slaData.value.start_date = '2026-03-10'
      slaData.value.end_date = '2026-03-01'
      validateSlaData('end_date')
      expect(slaDataErrors.value.end_date).toBe(
        'End Date cannot be before start date',
      )
    })

    it('accepts an end after the start', () => {
      slaData.value.start_date = '2026-03-01'
      slaData.value.end_date = '2026-03-10'
      validateSlaData('end_date')
      expect(slaDataErrors.value.end_date).toBe('')
    })

    it('ignores an end date with no start', () => {
      slaData.value.end_date = '2026-03-01'
      validateSlaData('end_date')
      expect(slaDataErrors.value.end_date).toBe('')
    })

    it('flags the start date too', () => {
      slaData.value.start_date = '2026-03-10'
      slaData.value.end_date = '2026-03-01'
      validateSlaData('start_date')
      expect(slaDataErrors.value.start_date).toBe(
        'Start Date cannot be after end date',
      )
    })
  })

  describe('working hours', () => {
    it('need at least one complete day', () => {
      slaData.value.working_hours = []
      validateSlaData('working_hours')
      expect(slaDataErrors.value.working_hours).toContain(
        'At least one valid Workday',
      )
    })

    it('ignore a half-filled row when judging emptiness', () => {
      slaData.value.working_hours = [day('Monday', '', '')]
      validateSlaData('working_hours')
      expect(slaDataErrors.value.working_hours).toContain(
        'At least one valid Workday',
      )
    })

    it('reject the same day twice', () => {
      slaData.value.working_hours = [day('Monday'), day('Monday')]
      validateSlaData('working_hours')
      expect(slaDataErrors.value.working_hours).toContain('Duplicate Workday')
      expect(slaDataErrors.value.working_hours).toContain('Monday')
    })

    it('reject an end time before the start', () => {
      slaData.value.working_hours = [day('Monday', '17:00:00', '09:00:00')]
      validateSlaData('working_hours')
      expect(slaDataErrors.value.working_hours).toBeTruthy()
    })

    it('accept the defaults', () => {
      validateSlaData('working_hours')
      expect(slaDataErrors.value.working_hours).toBe('')
    })
  })

  describe('conditions', () => {
    it('pass when there are none', () => {
      validateSlaData('condition')
      expect(slaDataErrors.value.condition).toBe('')
    })

    it('reject an incomplete condition', () => {
      slaData.value.condition_json = [['', '', '']]
      validateSlaData('condition')
      expect(slaDataErrors.value.condition).toBe('Valid conditions are required')
    })

    it('can be skipped on request', () => {
      // The conditions editor validates as you type; the save path asks for
      // them to be skipped so a half-typed filter does not block everything.
      slaData.value.condition_json = [['', '', '']]
      validateSlaData('condition', true)
      expect(slaDataErrors.value.condition).toBe('')
    })
  })

  describe('validating everything at once', () => {
    it('checks every field when no key is given', () => {
      validateSlaData()
      expect(slaDataErrors.value.sla_name).toBeTruthy()
      expect(slaDataErrors.value.priorities).toBeTruthy()
    })

    it('touches only the named field otherwise', () => {
      validateSlaData('sla_name')
      expect(slaDataErrors.value.sla_name).toBeTruthy()
      expect(slaDataErrors.value.priorities).toBe('')
    })

    it('clears stale errors before re-checking', () => {
      validateSlaData('sla_name')
      slaData.value.sla_name = 'Gold'
      validateSlaData('sla_name')
      expect(slaDataErrors.value.sla_name).toBe('')
    })
  })
})
