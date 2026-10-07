// `callLog.js` calls getMeta('CRM Call Log') at module scope, which fires a
// network fetch on import, and its date branch reaches the settings store.
// Both are mocked so this suite tests only getCallLogDetail's branching.
vi.mock('@/stores/meta', () => ({
  getMeta: () => ({
    getFormattedPercent: (field, doc) => `${doc[field]}%`,
    getFormattedFloat: (field, doc) => `${doc[field]}.00`,
    getFormattedCurrency: (field, doc) => `$ ${doc[field]}`,
  }),
}))

vi.mock('@/composables/useTimelinePreferences', () => ({
  timestampCell: (date) => ({ label: `exact:${date}`, timeAgo: `ago:${date}` }),
}))

import {
  getCallLogDetail,
  statusLabelMap,
  statusColorMap,
} from '@/utils/callLog'

const baseLog = {
  type: 'Incoming',
  status: 'Completed',
  _duration: '2m 30s',
  _caller: { label: 'Ada Lovelace', image: '/ada.png' },
  _receiver: { label: 'Alan Turing', image: '/alan.png' },
  modified: '2026-08-20 10:00:00',
  creation: '2026-08-19 09:00:00',
  annual_revenue: 5000,
  probability: 40,
  score: 7,
  note: 'called back',
}

describe('getCallLogDetail', () => {
  it('renders duration with a clock icon', () => {
    expect(getCallLogDetail('duration', baseLog)).toEqual({
      label: '2m 30s',
      icon: 'clock',
    })
  })

  it('renders caller and receiver with their avatars', () => {
    expect(getCallLogDetail('caller', baseLog)).toEqual({
      label: 'Ada Lovelace',
      image: '/ada.png',
    })
    expect(getCallLogDetail('receiver', baseLog)).toEqual({
      label: 'Alan Turing',
      image: '/alan.png',
    })
  })

  it('survives a log with no caller or receiver', () => {
    expect(getCallLogDetail('caller', { ...baseLog, _caller: undefined })).toEqual({
      label: undefined,
      image: undefined,
    })
  })

  it('picks the arrow direction from the call type', () => {
    expect(getCallLogDetail('type', { ...baseLog, type: 'Incoming' })).toEqual({
      label: 'Incoming',
      icon: 'phone-incoming',
    })
    expect(getCallLogDetail('type', { ...baseLog, type: 'Outgoing' })).toEqual({
      label: 'Outgoing',
      icon: 'phone-outgoing',
    })
  })

  it('maps status to its label and colour', () => {
    expect(getCallLogDetail('status', { ...baseLog, status: 'Completed' })).toEqual({
      label: 'Completed',
      color: 'green',
    })
    expect(getCallLogDetail('status', { ...baseLog, status: 'No Answer' })).toEqual({
      label: 'Missed Call',
      color: 'red',
    })
  })

  it('returns undefined parts for an unknown status', () => {
    expect(getCallLogDetail('status', { ...baseLog, status: 'Zzz' })).toEqual({
      label: undefined,
      color: undefined,
    })
  })

  it('routes modified and creation through the timestamp cell', () => {
    expect(getCallLogDetail('modified', baseLog)).toEqual({
      label: 'exact:2026-08-20 10:00:00',
      timeAgo: 'ago:2026-08-20 10:00:00',
    })
    expect(getCallLogDetail('creation', baseLog)).toEqual({
      label: 'exact:2026-08-19 09:00:00',
      timeAgo: 'ago:2026-08-19 09:00:00',
    })
  })

  it('formats currency, float and percent columns via the meta helpers', () => {
    const columns = [
      { key: 'annual_revenue', type: 'Currency' },
      { key: 'score', type: 'Float' },
      { key: 'probability', type: 'Percent' },
    ]
    expect(getCallLogDetail('annual_revenue', baseLog, columns)).toBe('$ 5000')
    expect(getCallLogDetail('score', baseLog, columns)).toBe('7.00')
    expect(getCallLogDetail('probability', baseLog, columns)).toBe('40%')
  })

  it('accepts columns keyed by `value` as well as `key`', () => {
    const columns = [{ value: 'annual_revenue', type: 'Currency' }]
    expect(getCallLogDetail('annual_revenue', baseLog, columns)).toBe('$ 5000')
  })

  it('returns the raw value when no column type matches', () => {
    expect(getCallLogDetail('note', baseLog)).toBe('called back')
    expect(getCallLogDetail('note', baseLog, [])).toBe('called back')
    expect(getCallLogDetail('missing', baseLog)).toBeUndefined()
  })

  it('formats a Date column without throwing', () => {
    const columns = [{ key: 'call_date', type: 'Date' }]
    const log = { ...baseLog, call_date: '2026-08-20' }
    expect(() => getCallLogDetail('call_date', log, columns)).not.toThrow()
    expect(typeof getCallLogDetail('call_date', log, columns)).toBe('string')
  })
})

describe('status maps', () => {
  it('renames two statuses for the user', () => {
    // The backend words differ from what a salesperson should read.
    expect(statusLabelMap['Busy']).toBe('Declined')
    expect(statusLabelMap['No Answer']).toBe('Missed Call')
  })

  it('colours outcomes by severity', () => {
    expect(statusColorMap['Completed']).toBe('green')
    expect(statusColorMap['Failed']).toBe('red')
    expect(statusColorMap['No Answer']).toBe('red')
    expect(statusColorMap['Busy']).toBe('orange')
    expect(statusColorMap['In Progress']).toBe('blue')
  })

  it('greys the statuses that are merely in-flight', () => {
    ;['Initiated', 'Queued', 'Canceled', 'Ringing'].forEach((status) => {
      expect(statusColorMap[status]).toBe('gray')
    })
  })

  it('gives every labelled status a colour', () => {
    // A status with a label but no colour renders an uncoloured pill.
    Object.keys(statusLabelMap).forEach((status) => {
      expect(statusColorMap[status]).toBeDefined()
    })
  })
})
