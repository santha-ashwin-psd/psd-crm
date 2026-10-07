// parseEventDoc reaches the users store for owner display data; the rest of
// this module's exports are pure.
vi.mock('@/stores/users', () => ({
  usersStore: () => ({
    getUser: (email) => ({
      full_name: email === 'ada@example.com' ? 'Ada Lovelace' : '',
      user_image: email === 'ada@example.com' ? '/ada.png' : '',
    }),
  }),
}))

import {
  eventOwner,
  normalizeParticipants,
  formatDuration,
  buildEndTimeOptions,
  computeAutoToTime,
  validateTimeRange,
  parseEventDoc,
} from '@/composables/event'

describe('normalizeParticipants', () => {
  it('keeps one entry per email', () => {
    const result = normalizeParticipants([
      { email: 'a@x.com' },
      { email: 'a@x.com' },
      { email: 'b@x.com' },
    ])
    expect(result.map((p) => p.email)).toEqual(['a@x.com', 'b@x.com'])
  })

  it('keeps the first occurrence of a duplicate', () => {
    const result = normalizeParticipants([
      { email: 'a@x.com', reference_docname: 'first' },
      { email: 'a@x.com', reference_docname: 'second' },
    ])
    expect(result[0].reference_docname).toBe('first')
  })

  it('defaults the reference doctype to Contact', () => {
    expect(normalizeParticipants([{ email: 'a@x.com' }])[0]).toEqual({
      email: 'a@x.com',
      reference_doctype: 'Contact',
      reference_docname: '',
    })
  })

  it('preserves an explicit reference', () => {
    expect(
      normalizeParticipants([
        {
          email: 'a@x.com',
          reference_doctype: 'CRM Lead',
          reference_docname: 'LEAD-1',
        },
      ])[0],
    ).toEqual({
      email: 'a@x.com',
      reference_doctype: 'CRM Lead',
      reference_docname: 'LEAD-1',
    })
  })

  it('drops entries with no email, and null entries', () => {
    expect(
      normalizeParticipants([null, {}, { email: '' }, { email: 'a@x.com' }]),
    ).toHaveLength(1)
  })

  it('strips any extra keys rather than passing them through', () => {
    const result = normalizeParticipants([{ email: 'a@x.com', junk: 1 }])
    expect(result[0]).not.toHaveProperty('junk')
  })

  it('handles empty and missing input', () => {
    expect(normalizeParticipants([])).toEqual([])
    expect(normalizeParticipants()).toEqual([])
    expect(normalizeParticipants(null)).toEqual([])
  })
})

describe('formatDuration', () => {
  it('renders under an hour in minutes', () => {
    expect(formatDuration(45)).toBe('45 mins')
    expect(formatDuration(5)).toBe('5 mins')
    expect(formatDuration(0)).toBe('0 mins')
  })

  it('renders a whole hour in the singular', () => {
    expect(formatDuration(60)).toBe('1 hr')
  })

  it('renders whole hours in the plural', () => {
    expect(formatDuration(120)).toBe('2 hrs')
    expect(formatDuration(180)).toBe('3 hrs')
  })

  it('keeps a clean half hour unrounded', () => {
    // 1.5 and 2.5 are left alone; only untidy fractions get 2dp.
    expect(formatDuration(90)).toBe('1.5 hrs')
    expect(formatDuration(150)).toBe('2.5 hrs')
  })

  it('rounds an untidy fraction to two decimals', () => {
    expect(formatDuration(80)).toBe('1.33 hrs')
    expect(formatDuration(100)).toBe('1.67 hrs')
  })

  it('treats exactly 59 minutes as minutes', () => {
    expect(formatDuration(59)).toBe('59 mins')
  })
})

describe('computeAutoToTime', () => {
  it('adds an hour', () => {
    expect(computeAutoToTime('09:00')).toBe('10:00')
    expect(computeAutoToTime('14:30')).toBe('15:30')
  })

  it('zero-pads the hour', () => {
    expect(computeAutoToTime('08:15')).toBe('09:15')
    expect(computeAutoToTime('00:00')).toBe('01:00')
  })

  it('clamps to the end of the day rather than rolling over', () => {
    // An event must not silently end the next morning.
    expect(computeAutoToTime('23:00')).toBe('23:59')
    expect(computeAutoToTime('23:30')).toBe('23:59')
  })

  it('returns an empty string for no input', () => {
    expect(computeAutoToTime('')).toBe('')
    expect(computeAutoToTime(null)).toBe('')
    expect(computeAutoToTime(undefined)).toBe('')
  })
})

describe('buildEndTimeOptions', () => {
  it('returns every slot when no start time is given', () => {
    // 24 hours at quarter-hour resolution.
    expect(buildEndTimeOptions()).toHaveLength(96)
  })

  it('only offers slots after the start time', () => {
    const options = buildEndTimeOptions('09:00')
    expect(options[0].value).toBe('09:15')
    expect(options.every((o) => o.value > '09:00')).toBe(true)
  })

  it('annotates each slot with the resulting duration', () => {
    const options = buildEndTimeOptions('09:00')
    expect(options[0].label).toBe('9:15 am (15 mins)')
    expect(options[3].label).toBe('10:00 am (1 hr)')
  })

  it('returns nothing when the start is the last slot of the day', () => {
    expect(buildEndTimeOptions('23:45')).toEqual([])
  })

  it('spans across midday correctly', () => {
    const options = buildEndTimeOptions('11:45')
    expect(options[0].label).toBe('12:00 pm (15 mins)')
  })
})

describe('validateTimeRange', () => {
  it('accepts an all-day event without times', () => {
    expect(validateTimeRange({ isFullDay: true })).toEqual({
      valid: true,
      error: null,
    })
  })

  it('accepts a normal range', () => {
    expect(
      validateTimeRange({
        fromDate: '2026-08-20',
        fromTime: '09:00',
        toTime: '10:00',
      }),
    ).toEqual({ valid: true, error: null })
  })

  it('requires both times', () => {
    expect(
      validateTimeRange({ fromDate: '2026-08-20', fromTime: '09:00' }),
    ).toEqual({
      valid: false,
      error: 'Start & End Time Are Required',
    })
    expect(
      validateTimeRange({ fromDate: '2026-08-20', toTime: '10:00' }),
    ).toEqual({
      valid: false,
      error: 'Start & End Time Are Required',
    })
  })

  it('rejects an end at or before the start', () => {
    expect(
      validateTimeRange({
        fromDate: '2026-08-20',
        fromTime: '10:00',
        toTime: '09:00',
      }).error,
    ).toBe('End Time Should Be After Start Time')

    expect(
      validateTimeRange({
        fromDate: '2026-08-20',
        fromTime: '10:00',
        toTime: '10:00',
      }).error,
    ).toBe('End Time Should Be After Start Time')
  })

  it('accepts a one-minute event', () => {
    expect(
      validateTimeRange({
        fromDate: '2026-08-20',
        fromTime: '10:00',
        toTime: '10:01',
      }).valid,
    ).toBe(true)
  })

  it('rejects an unparseable time', () => {
    expect(
      validateTimeRange({
        fromDate: '2026-08-20',
        fromTime: 'not-a-time',
        toTime: '10:00',
      }).error,
    ).toBe('Invalid Start Or End Time')
  })

  it('accepts an event that runs past midnight', () => {
    // The end belongs to toDate. Comparing it against fromDate rejected every
    // overnight event, and also the 23:00→00:00 default a new event opens with.
    expect(
      validateTimeRange({
        fromDate: '2026-08-20',
        toDate: '2026-08-21',
        fromTime: '22:00',
        toTime: '02:00',
      }).valid,
    ).toBe(true)
  })

  it('still rejects an end before the start on the same day', () => {
    expect(
      validateTimeRange({
        fromDate: '2026-08-20',
        toDate: '2026-08-20',
        fromTime: '10:00',
        toTime: '09:00',
      }).error,
    ).toBe('End Time Should Be After Start Time')
  })

  it('rejects an end date before the start date', () => {
    expect(
      validateTimeRange({
        fromDate: '2026-08-20',
        toDate: '2026-08-19',
        fromTime: '10:00',
        toTime: '11:00',
      }).error,
    ).toBe('End Time Should Be After Start Time')
  })

  it('falls back to the start date when no end date is given', () => {
    expect(
      validateTimeRange({
        fromDate: '2026-08-20',
        fromTime: '09:00',
        toTime: '10:00',
      }).valid,
    ).toBe(true)
  })
})

describe('parseEventDoc', () => {
  const DOC = {
    name: 'EVENT-001',
    subject: 'Discovery call',
    description: 'Intro chat',
    status: 'Open',
    starts_on: '2026-08-20 09:00:00',
    ends_on: '2026-08-20 10:30:00',
    all_day: 0,
    event_type: 'Private',
    location: 'Zoom',
    color: '#2563eb',
    attending: 1,
    reference_doctype: 'CRM Deal',
    reference_docname: 'DEAL-1',
    owner: 'ada@example.com',
  }

  it('returns an empty object for no doc', () => {
    expect(parseEventDoc(null)).toEqual({})
    expect(parseEventDoc(undefined)).toEqual({})
  })

  it('splits the timestamps into date and time parts', () => {
    const parsed = parseEventDoc(DOC)
    expect(parsed.fromDate).toBe('2026-08-20')
    expect(parsed.toDate).toBe('2026-08-20')
    expect(parsed.fromTime).toBe('09:00')
    expect(parsed.toTime).toBe('10:30')
  })

  it('maps the plain fields across', () => {
    const parsed = parseEventDoc(DOC)
    expect(parsed).toMatchObject({
      id: 'EVENT-001',
      title: 'Discovery call',
      description: 'Intro chat',
      status: 'Open',
      isFullDay: 0,
      eventType: 'Private',
      location: 'Zoom',
      color: '#2563eb',
      attending: 1,
      referenceDoctype: 'CRM Deal',
      referenceDocname: 'DEAL-1',
    })
  })

  it('resolves the owner into a display record', () => {
    expect(parseEventDoc(DOC).owner).toEqual({
      label: 'Ada Lovelace',
      image: '/ada.png',
      value: 'ada@example.com',
    })
  })

  it('leaves the owner null when the doc has none', () => {
    expect(parseEventDoc({ ...DOC, owner: null }).owner).toBeNull()
  })

  it('defaults location, participants and notifications', () => {
    const parsed = parseEventDoc({ ...DOC, location: null })
    expect(parsed.location).toBe('')
    expect(parsed.event_participants).toEqual([])
    expect(parsed.notifications).toEqual([])
  })

  it('passes through participants and notifications when present', () => {
    const parsed = parseEventDoc({
      ...DOC,
      event_participants: [{ email: 'a@x.com' }],
      notifications: [{ interval: 'minutes' }],
    })
    expect(parsed.event_participants).toHaveLength(1)
    expect(parsed.notifications).toHaveLength(1)
  })
})

describe('eventOwner', () => {
  // The bug this guards: the timeline resolved the owner only inside the
  // branch that runs once participants have loaded, so an event with NO
  // participants kept its owner as a raw user id — `owner.label` and
  // `owner.image` were both undefined and the row rendered nameless with a
  // blank avatar.
  const store = (users) => (id) => users[id]

  it('resolves a known user to their name and image', () => {
    const getUser = store({
      'ada@example.com': { full_name: 'Ada Lovelace', user_image: '/ada.png' },
    })
    expect(eventOwner('ada@example.com', getUser)).toEqual({
      label: 'Ada Lovelace',
      image: '/ada.png',
    })
  })

  it('falls back to the id when the store has no name', () => {
    // Avatar draws its initials from the label, so an empty one is a blank
    // circle — exactly what a nameless row looked like.
    const getUser = store({
      Administrator: { full_name: '', user_image: null },
    })
    expect(eventOwner('Administrator', getUser).label).toBe('Administrator')
  })

  it('falls back when the store does not know the user at all', () => {
    expect(eventOwner('ghost@example.com', store({})).label).toBe(
      'ghost@example.com',
    )
  })

  it('always returns a label, never undefined', () => {
    const getUser = store({ x: { user_image: '/x.png' } })
    expect(eventOwner('x', getUser).label).toBeTruthy()
  })
})
