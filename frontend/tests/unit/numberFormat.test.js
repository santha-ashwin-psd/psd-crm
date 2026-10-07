import {
  replaceAll,
  strip,
  lstrip,
  rstrip,
  cstr,
  cint,
  flt,
  formatNumber,
  formatCurrency,
} from '@/utils/numberFormat'

describe('replaceAll', () => {
  it('replaces every occurrence, not just the first', () => {
    expect(replaceAll('a,b,c', ',', '-')).toBe('a-b-c')
  })

  it('returns the string unchanged when the needle is absent', () => {
    expect(replaceAll('abc', ',', '-')).toBe('abc')
  })

  it('handles an empty string', () => {
    expect(replaceAll('', ',', '-')).toBe('')
  })
})

describe('lstrip', () => {
  it('strips whitespace from the left by default', () => {
    expect(lstrip('  abc')).toBe('abc')
    expect(lstrip('\n\tabc')).toBe('abc')
  })

  it('leaves the right side alone', () => {
    expect(lstrip('  abc  ')).toBe('abc  ')
  })

  it('strips the supplied characters instead', () => {
    expect(lstrip('007', ['0'])).toBe('7')
  })

  it('returns an empty string when everything strips away', () => {
    expect(lstrip('000', ['0'])).toBe('')
  })

  it('leaves a string with nothing to strip', () => {
    expect(lstrip('abc')).toBe('abc')
  })
})

describe('rstrip', () => {
  it('strips whitespace from the right by default', () => {
    expect(rstrip('abc  ')).toBe('abc')
    expect(rstrip('abc\n')).toBe('abc')
  })

  it('leaves the left side alone', () => {
    expect(rstrip('  abc  ')).toBe('  abc')
  })

  it('strips the supplied characters instead', () => {
    expect(rstrip('1.00', ['0'])).toBe('1.')
  })
})

describe('strip', () => {
  it('strips both ends', () => {
    expect(strip('  abc  ')).toBe('abc')
  })

  it('returns undefined for falsy input', () => {
    // Documented quirk: the guard is `if (s)`, so there is no return at all
    // for '' / null / undefined / 0. Callers must not assume a string back.
    expect(strip('')).toBeUndefined()
    expect(strip(null)).toBeUndefined()
    expect(strip(undefined)).toBeUndefined()
  })
})

describe('cstr', () => {
  it('returns an empty string for null and undefined', () => {
    expect(cstr(null)).toBe('')
    expect(cstr(undefined)).toBe('')
  })

  it('stringifies numbers, including zero', () => {
    // Zero must not be swallowed by a falsy check.
    expect(cstr(0)).toBe('0')
    expect(cstr(42)).toBe('42')
    expect(cstr(-1.5)).toBe('-1.5')
  })

  it('passes strings through', () => {
    expect(cstr('abc')).toBe('abc')
    expect(cstr('')).toBe('')
  })

  it('stringifies booleans', () => {
    expect(cstr(true)).toBe('true')
    expect(cstr(false)).toBe('false')
  })
})

describe('cint', () => {
  it('maps booleans to 1 and 0', () => {
    expect(cint(true)).toBe(1)
    expect(cint(false)).toBe(0)
  })

  it('parses integers from strings', () => {
    expect(cint('42')).toBe(42)
    expect(cint('-7')).toBe(-7)
  })

  it('strips leading zeros so values are not read as octal', () => {
    expect(cint('007')).toBe(7)
  })

  it('preserves a literal zero', () => {
    // Special-cased in the source: '0' skips the leading-zero strip, which
    // would otherwise leave an empty string.
    expect(cint('0')).toBe(0)
    expect(cint(0)).toBe(0)
  })

  it('truncates floats rather than rounding', () => {
    expect(cint('3.9')).toBe(3)
    expect(cint(3.9)).toBe(3)
  })

  it('falls back to 0 for unparseable input', () => {
    expect(cint('abc')).toBe(0)
    expect(cint(null)).toBe(0)
    expect(cint(undefined)).toBe(0)
    expect(cint('')).toBe(0)
  })

  it('honours an explicit default for unparseable input', () => {
    expect(cint('abc', 5)).toBe(5)
    expect(cint('', 2)).toBe(2)
  })

  it('ignores the default when the value parses', () => {
    expect(cint('9', 5)).toBe(9)
  })
})

describe('flt', () => {
  it('returns 0 for null and empty input', () => {
    expect(flt(null)).toBe(0)
    expect(flt('')).toBe(0)
    expect(flt(undefined)).toBe(0)
  })

  it('passes numbers through untouched when no precision is given', () => {
    expect(flt(3.14159)).toBe(3.14159)
    expect(flt(-2.5)).toBe(-2.5)
    expect(flt(0)).toBe(0)
  })

  it('parses numeric strings', () => {
    expect(flt('3.5')).toBe(3.5)
    expect(flt('-3.5')).toBe(-3.5)
  })

  it('strips group separators using the default format', () => {
    expect(flt('1,234.56')).toBe(1234.56)
    expect(flt('1,234,567.89')).toBe(1234567.89)
  })

  it('honours an explicit number format', () => {
    // European: '.' groups, ',' is the decimal separator.
    expect(flt('1.234,56', null, '#.###,##')).toBe(1234.56)
  })

  it('strips a leading currency symbol', () => {
    expect(flt('$ 1,234.56')).toBe(1234.56)
  })

  it('returns 0 for unparseable strings', () => {
    expect(flt('abc')).toBe(0)
  })

  it('rounds to the requested precision', () => {
    expect(flt(3.14159, 2)).toBe(3.14)
    expect(flt(2.555, 2)).toBe(2.56)
  })

  it('rounds half to even at zero precision (banker’s rounding)', () => {
    // The legacy default: exact .5 goes to the nearest even integer, so
    // repeated rounding does not drift upward.
    expect(flt(0.5, 0)).toBe(0)
    expect(flt(1.5, 0)).toBe(2)
    expect(flt(2.5, 0)).toBe(2)
    expect(flt(3.5, 0)).toBe(4)
  })

  it('keeps the sign when rounding negatives', () => {
    expect(flt(-2.5, 0)).toBe(-2)
    expect(flt(-3.14159, 2)).toBe(-3.14)
  })
})

describe('rounding methods', () => {
  // `flt` resolves the method from window.sysdefaults when none is passed.
  // These are the branches the default (legacy) path never reaches.
  const original = globalThis.window.sysdefaults.rounding_method

  afterEach(() => {
    globalThis.window.sysdefaults.rounding_method = original
  })

  describe("Banker's Rounding", () => {
    beforeEach(() => {
      globalThis.window.sysdefaults.rounding_method = "Banker's Rounding"
    })

    it('rounds half to even', () => {
      expect(flt(0.5, 0)).toBe(0)
      expect(flt(1.5, 0)).toBe(2)
      expect(flt(2.5, 0)).toBe(2)
      expect(flt(3.5, 0)).toBe(4)
    })

    it('rounds normally away from the halfway point', () => {
      expect(flt(2.4, 0)).toBe(2)
      expect(flt(2.6, 0)).toBe(3)
    })

    it('short-circuits on zero', () => {
      expect(flt(0, 2)).toBe(0)
    })

    it('keeps the sign', () => {
      expect(flt(-2.5, 0)).toBe(-2)
      expect(flt(-1.5, 0)).toBe(-2)
    })

    it('honours precision', () => {
      expect(flt(1.005, 2)).toBe(1)
      expect(flt(2.675, 2)).toBe(2.68)
    })
  })

  describe('Commercial Rounding', () => {
    beforeEach(() => {
      globalThis.window.sysdefaults.rounding_method = 'Commercial Rounding'
    })

    it('rounds half away from zero', () => {
      // The commercial convention: .5 always rounds up in magnitude, unlike
      // either banker's variant.
      expect(flt(0.5, 0)).toBe(1)
      expect(flt(1.5, 0)).toBe(2)
      expect(flt(2.5, 0)).toBe(3)
    })

    it('rounds negative halves away from zero too', () => {
      expect(flt(-2.5, 0)).toBe(-3)
      expect(flt(-0.5, 0)).toBe(-1)
    })

    it('short-circuits on zero', () => {
      expect(flt(0, 2)).toBe(0)
    })

    it('honours precision', () => {
      expect(flt(1.235, 2)).toBe(1.24)
    })
  })

  it('throws on an unrecognised rounding method', () => {
    globalThis.window.sysdefaults.rounding_method = 'Nonsense Rounding'
    expect(() => flt(1.5, 0)).toThrow('Unknown rounding method Nonsense Rounding')
  })
})

describe('formatNumber', () => {
  it('groups thousands and fixes the decimals', () => {
    expect(formatNumber(1234567.891, '#,###.##', 2)).toBe('1,234,567.89')
  })

  it('pads to the requested decimal places', () => {
    expect(formatNumber(5, '#,###.##', 2)).toBe('5.00')
  })

  it('formats zero', () => {
    expect(formatNumber(0, '#,###.##', 2)).toBe('0.00')
  })

  it('keeps the minus sign outside the grouping', () => {
    expect(formatNumber(-1234.5, '#,###.##', 2)).toBe('-1,234.50')
  })

  it('groups in lakhs and crores for the Indian format', () => {
    expect(formatNumber(1234567, '#,##,###.##', 2)).toBe('12,34,567.00')
  })

  it('supports the European separators', () => {
    expect(formatNumber(1234.56, '#.###,##', 2)).toBe('1.234,56')
  })

  it('supports space-grouped formats', () => {
    expect(formatNumber(1234.56, '# ###.##', 2)).toBe('1 234.56')
  })

  it('drops decimals when asked for none', () => {
    expect(formatNumber(1234.56, '#,###.##', 0)).toBe('1,235')
  })

  it('handles values below the grouping threshold', () => {
    expect(formatNumber(999, '#,###.##', 0)).toBe('999')
  })
})

describe('formatCurrency', () => {
  it('prefixes the currency symbol', () => {
    expect(formatCurrency(1234.5, '#,###.##', 'USD', 2)).toBe('$ 1,234.50')
  })

  it('resolves other currency symbols', () => {
    expect(formatCurrency(1000, '#,###.##', 'EUR', 2)).toBe('€ 1,000.00')
    expect(formatCurrency(1000, '#,##,###.##', 'INR', 2)).toBe('₹ 1,000.00')
  })

  it('treats null and empty values as zero', () => {
    expect(formatCurrency(null, '#,###.##', 'USD', 2)).toBe('$ 0.00')
    expect(formatCurrency('', '#,###.##', 'USD', 2)).toBe('$ 0.00')
  })

  it('formats without a symbol when currency is falsy', () => {
    expect(formatCurrency(1234.5, '#,###.##', '', 2)).toBe('1,234.50')
  })

  it('falls back to a plain number for an invalid currency code', () => {
    // getCurrencySymbol logs and returns null rather than throwing.
    expect(formatCurrency(1234.5, '#,###.##', 'NOTACURRENCY', 2)).toBe(
      '1,234.50',
    )
  })

  it('honours the precision argument', () => {
    expect(formatCurrency(1234.567, '#,###.##', 'USD', 0)).toBe('$ 1,235')
    expect(formatCurrency(1234.5, '#,###.###', 'USD', 3)).toBe('$ 1,234.500')
  })
})
