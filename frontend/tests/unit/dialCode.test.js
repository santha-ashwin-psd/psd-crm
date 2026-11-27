import {
  DEFAULT_DIAL_CODE,
  DIAL_CODES,
  cleanMobile,
  joinDialCode,
  splitDialCode,
} from '@/utils/pipelineEntry'

describe('mobile country code', () => {
  it('defaults to +91 and lists it first', () => {
    expect(DEFAULT_DIAL_CODE).toBe('+91')
    expect(DIAL_CODES[0].code).toBe('+91')
  })

  it('reads a bare number as local, with the default code', () => {
    expect(splitDialCode('98765 43210')).toEqual({ code: '+91', local: '98765 43210' })
  })

  it('finds the listed code, preferring the longest match', () => {
    expect(splitDialCode('+447911123456')).toEqual({ code: '+44', local: '7911123456' })
    expect(splitDialCode('+971501234567')).toEqual({ code: '+971', local: '501234567' })
    expect(splitDialCode('+12025550123')).toEqual({ code: '+1', local: '2025550123' })
  })

  it('keeps an unlisted code whole', () => {
    expect(splitDialCode('+306912345678')).toEqual({ code: '', local: '+306912345678' })
  })

  it('stores a foreign number with its code and without a trunk 0', () => {
    expect(joinDialCode('+44', '07911 123456')).toBe('+447911 123456')
    expect(cleanMobile(joinDialCode('+44', '07911 123456')).value).toBe('+447911123456')
  })

  it('leaves an Indian number bare for cleanMobile to finish', () => {
    expect(joinDialCode('+91', '98765 43210')).toBe('98765 43210')
    expect(cleanMobile('98765 43210').value).toBe('+919876543210')
  })

  it('keeps a number typed with its own + code', () => {
    expect(joinDialCode('+91', '+44 7911 123456')).toBe('+44 7911 123456')
  })

  it('a US number that looks Indian stays American', () => {
    expect(cleanMobile(joinDialCode('+1', '9876543210')).value).toBe('+19876543210')
  })

  it('round-trips', () => {
    for (const { code } of DIAL_CODES.filter((d) => d.code !== '+91')) {
      const stored = joinDialCode(code, '501234567')
      expect(splitDialCode(stored)).toEqual({ code, local: '501234567' })
    }
  })
})
