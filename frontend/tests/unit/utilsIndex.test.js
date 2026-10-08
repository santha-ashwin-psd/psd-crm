import {
  formatTime,
  formatDuration,
  getFormat,
  getSafeWebsiteUrl,
  website,
  htmlToText,
  startCase,
  validateEmail,
  parseColor,
  isEmoji,
  convertArrayToString,
  interpolateTemplate,
  convertSize,
  isImage,
  validateIsImageFile,
  isNull,
  cstr,
  getRandom,
  runSequentially,
  deepClone,
  copy,
  validateConditions,
  sameArrayContents,
  orderSensitiveEqual,
  getGridTemplateColumnsForTable,
  isTranslatable,
  sanitizeHTML,
  sanitizeText,
} from '@/utils'

describe('formatTime', () => {
  it('shows seconds alone under a minute', () => {
    expect(formatTime(45)).toBe('45s')
    expect(formatTime(0)).toBe('0s')
  })

  it('adds minutes once past a minute', () => {
    expect(formatTime(90)).toBe('1m 30s')
  })

  it('adds hours once past an hour', () => {
    expect(formatTime(3661)).toBe('1h 1m 1s')
  })

  it('adds days once past a day', () => {
    expect(formatTime(90061)).toBe('1d 1h 1m 1s')
  })

  it('keeps zeroed larger units once a bigger one is present', () => {
    // 1h 0m 0s, not "1h 0s" — the units stay contiguous.
    expect(formatTime(3600)).toBe('1h 0m 0s')
  })

  it('truncates fractional seconds', () => {
    expect(formatTime(45.9)).toBe('45s')
  })
})

describe('formatDuration', () => {
  it('returns an empty string for null, undefined and blank', () => {
    expect(formatDuration(null)).toBe('')
    expect(formatDuration(undefined)).toBe('')
    expect(formatDuration('')).toBe('')
  })

  it('returns an empty string for unparseable input', () => {
    expect(formatDuration('abc')).toBe('')
  })

  it('renders zero explicitly in both forms', () => {
    expect(formatDuration(0)).toBe('0s')
    expect(formatDuration(0, true)).toBe('0 seconds')
  })

  it('omits units that are zero', () => {
    // Unlike formatTime, this form drops empty units entirely.
    expect(formatDuration(3600)).toBe('1h')
    expect(formatDuration(3660)).toBe('1h 1m')
  })

  it('renders the short form', () => {
    expect(formatDuration(3661)).toBe('1h 1m 1s')
    expect(formatDuration(59)).toBe('59s')
  })

  it('renders the long form with singular and plural units', () => {
    expect(formatDuration(3661, true)).toBe('1 hour 1 minute 1 second')
    expect(formatDuration(7322, true)).toBe('2 hours 2 minutes 2 seconds')
  })

  it('accepts numeric strings', () => {
    expect(formatDuration('90')).toBe('1m 30s')
  })
})

describe('getFormat', () => {
  const original = globalThis.window.sysdefaults

  afterEach(() => {
    globalThis.window.sysdefaults = original
  })

  it('falls back to a default date format when sysdefaults has none', () => {
    // Regression: the `|| 'YYYY-MM-DD'` used to sit after the replace chain, so
    // an absent date_format threw on `.replace` before the default applied.
    globalThis.window.sysdefaults = {}
    expect(() => getFormat(null, null, true, false, false)).not.toThrow()
    expect(getFormat(null, null, true, false, false)).toBe('YYYY-MM-DD')
  })

  it('normalises the Frappe format tokens to dayjs tokens', () => {
    globalThis.window.sysdefaults = { date_format: 'dd-mm-yyyy' }
    expect(getFormat(null, null, true, false, false)).toBe('DD-MM-YYYY')
  })

  it('returns the time format when only time is asked for', () => {
    globalThis.window.sysdefaults = { time_format: 'HH:mm' }
    expect(getFormat(null, null, false, true, false)).toBe('HH:mm')
  })

  it('combines both when date and time are asked for', () => {
    globalThis.window.sysdefaults = {
      date_format: 'yyyy-mm-dd',
      time_format: 'HH:mm',
    }
    expect(getFormat(null, null, true, true, false)).toBe('YYYY-MM-DD HH:mm')
  })

  it('uses a supplied format over the defaults', () => {
    globalThis.window.sysdefaults = { date_format: 'yyyy-mm-dd' }
    expect(getFormat(null, 'MMM D', false, false, false)).toBe('MMM D')
  })
})

describe('getSafeWebsiteUrl', () => {
  it('accepts http and https', () => {
    expect(getSafeWebsiteUrl('https://example.com')).toBe(
      'https://example.com/',
    )
    expect(getSafeWebsiteUrl('http://example.com')).toBe('http://example.com/')
  })

  it('assumes https for a bare domain', () => {
    expect(getSafeWebsiteUrl('example.com')).toBe('https://example.com/')
    expect(getSafeWebsiteUrl('www.example.com')).toBe(
      'https://www.example.com/',
    )
  })

  it('rejects javascript: urls', () => {
    // The reason this function exists — the result is fed to window.open.
    expect(getSafeWebsiteUrl('javascript:alert(1)')).toBeNull()
    expect(getSafeWebsiteUrl('JavaScript:alert(1)')).toBeNull()
  })

  it('rejects other non-web protocols', () => {
    expect(
      getSafeWebsiteUrl('data:text/html,<script>alert(1)</script>'),
    ).toBeNull()
    expect(getSafeWebsiteUrl('file:///etc/passwd')).toBeNull()
    expect(getSafeWebsiteUrl('ftp://example.com')).toBeNull()
    expect(getSafeWebsiteUrl('vbscript:msgbox(1)')).toBeNull()
  })

  it('rejects empty and whitespace-only input', () => {
    expect(getSafeWebsiteUrl('')).toBeNull()
    expect(getSafeWebsiteUrl('   ')).toBeNull()
    expect(getSafeWebsiteUrl(null)).toBeNull()
    expect(getSafeWebsiteUrl(undefined)).toBeNull()
  })

  it('trims surrounding whitespace', () => {
    expect(getSafeWebsiteUrl('  example.com  ')).toBe('https://example.com/')
  })

  it('preserves the path, query and fragment', () => {
    expect(getSafeWebsiteUrl('example.com/a/b?c=d#e')).toBe(
      'https://example.com/a/b?c=d#e',
    )
  })

  it('rejects a malformed url', () => {
    expect(getSafeWebsiteUrl('http://')).toBeNull()
  })
})

describe('website', () => {
  it('strips the protocol and www prefix for display', () => {
    expect(website('https://www.example.com')).toBe('example.com')
    expect(website('http://example.com')).toBe('example.com')
    expect(website('www.example.com')).toBe('example.com')
  })

  it('leaves a bare domain alone', () => {
    expect(website('example.com')).toBe('example.com')
  })

  it('is case insensitive about the prefix', () => {
    expect(website('HTTPS://WWW.example.com')).toBe('WWW.example.com'.slice(4))
  })

  it('passes falsy values straight through', () => {
    expect(website('')).toBe('')
    expect(website(null)).toBeNull()
    expect(website(undefined)).toBeUndefined()
  })
})

describe('htmlToText', () => {
  it('returns the text content of markup', () => {
    expect(htmlToText('<p>hello <b>world</b></p>')).toBe('hello world')
  })

  it('returns an empty string for empty input', () => {
    expect(htmlToText('')).toBe('')
  })

  it('does not execute embedded scripts', () => {
    // innerHTML does not run <script>, but assert it so nobody swaps this for
    // something that does.
    const spy = vi.fn()
    globalThis.__xss = spy
    htmlToText('<script>globalThis.__xss()</script>')
    expect(spy).not.toHaveBeenCalled()
    delete globalThis.__xss
  })
})

describe('startCase', () => {
  it('capitalises the first character only', () => {
    expect(startCase('hello world')).toBe('Hello world')
  })

  it('leaves an already-capitalised string alone', () => {
    expect(startCase('Hello')).toBe('Hello')
  })

  it('handles an empty string', () => {
    expect(startCase('')).toBe('')
  })

  it('leaves a leading non-letter alone', () => {
    expect(startCase('1st place')).toBe('1st place')
  })
})

describe('validateEmail', () => {
  it('accepts ordinary addresses', () => {
    expect(validateEmail('john@doe.com')).toBe(true)
    expect(validateEmail('first.last@sub.domain.co.uk')).toBe(true)
    expect(validateEmail('user+tag@example.com')).toBe(true)
  })

  it('accepts a bracketed IP domain', () => {
    expect(validateEmail('user@[192.168.1.1]')).toBe(true)
  })

  it('rejects addresses with no domain or no user', () => {
    expect(validateEmail('john@')).toBe(false)
    expect(validateEmail('@doe.com')).toBe(false)
    expect(validateEmail('johndoe.com')).toBe(false)
  })

  it('rejects a single-letter TLD and a trailing dot', () => {
    expect(validateEmail('john@doe.c')).toBe(false)
    expect(validateEmail('john@doe.')).toBe(false)
  })

  it('rejects whitespace and empty input', () => {
    expect(validateEmail('john doe@example.com')).toBe(false)
    expect(validateEmail('')).toBe(false)
  })
})

describe('parseColor', () => {
  it('maps most colours to the 600 shade', () => {
    expect(parseColor('blue')).toBe('!text-blue-600')
    expect(parseColor('red')).toBe('!text-red-600')
  })

  it('darkens gray and green to 700 for contrast', () => {
    expect(parseColor('gray')).toBe('!text-gray-700')
    expect(parseColor('green')).toBe('!text-green-700')
  })

  it('maps black to the ink token', () => {
    expect(parseColor('black')).toBe('!text-ink-gray-9')
  })
})

describe('isEmoji', () => {
  it('recognises an emoji', () => {
    expect(isEmoji('😀')).toBe(true)
  })

  it('rejects ordinary text and empty input', () => {
    expect(isEmoji('abc')).toBe(false)
    expect(isEmoji('')).toBe(false)
  })

  it('rejects an emoji with trailing text', () => {
    expect(isEmoji('😀 hello')).toBe(false)
  })
})

describe('convertArrayToString', () => {
  it('joins with commas', () => {
    expect(convertArrayToString(['a', 'b', 'c'])).toBe('a,b,c')
  })

  it('handles single-item and empty arrays', () => {
    expect(convertArrayToString(['a'])).toBe('a')
    expect(convertArrayToString([])).toBe('')
  })
})

describe('interpolateTemplate', () => {
  it('substitutes placeholders from the document', () => {
    expect(interpolateTemplate('Hi {{ name }}', { name: 'Ada' })).toBe('Hi Ada')
  })

  it('tolerates missing whitespace inside the braces', () => {
    expect(interpolateTemplate('Hi {{name}}', { name: 'Ada' })).toBe('Hi Ada')
  })

  it('replaces every occurrence', () => {
    expect(interpolateTemplate('{{ a }}-{{ a }}', { a: 'x' })).toBe('x-x')
  })

  it('renders missing, null and undefined values as blank', () => {
    expect(interpolateTemplate('Hi {{ name }}', {})).toBe('Hi ')
    expect(interpolateTemplate('Hi {{ name }}', { name: null })).toBe('Hi ')
    expect(interpolateTemplate('Hi {{ name }}', undefined)).toBe('Hi ')
  })

  it('keeps a falsy-but-real value like 0', () => {
    expect(interpolateTemplate('{{ n }}', { n: 0 })).toBe('0')
  })

  it('returns an empty string for a missing template', () => {
    expect(interpolateTemplate('', {})).toBe('')
    expect(interpolateTemplate(null, {})).toBe('')
  })
})

describe('convertSize', () => {
  it('keeps bytes under a kilobyte', () => {
    expect(convertSize(512)).toBe('512.00 B')
    expect(convertSize(0)).toBe('0.00 B')
  })

  it('steps up through the units', () => {
    expect(convertSize(2048)).toBe('2.00 KB')
    expect(convertSize(1048576 * 2)).toBe('2.00 MB')
    expect(convertSize(1073741824 * 2)).toBe('2.00 GB')
  })
})

describe('isImage', () => {
  it('recognises image extensions regardless of case', () => {
    expect(isImage('png')).toBe(true)
    expect(isImage('JPG')).toBe(true)
    expect(isImage('webp')).toBe(true)
    expect(isImage('svg')).toBe(true)
  })

  it('rejects non-image extensions', () => {
    expect(isImage('pdf')).toBe(false)
    expect(isImage('exe')).toBe(false)
  })

  it('rejects empty input', () => {
    expect(isImage('')).toBe(false)
    expect(isImage(null)).toBe(false)
    expect(isImage(undefined)).toBe(false)
  })
})

describe('validateIsImageFile', () => {
  it('returns nothing for an image', () => {
    expect(validateIsImageFile({ name: 'photo.png' })).toBeUndefined()
  })

  it('returns an error message for a non-image', () => {
    expect(validateIsImageFile({ name: 'report.pdf' })).toBe(
      'Only image files are allowed',
    )
  })

  it('reads the extension after the last dot', () => {
    expect(validateIsImageFile({ name: 'my.photo.final.png' })).toBeUndefined()
  })

  it('rejects a file with no extension', () => {
    expect(validateIsImageFile({ name: 'noextension' })).toBe(
      'Only image files are allowed',
    )
  })
})

describe('isNull', () => {
  it('treats undefined, null and blank strings as null', () => {
    expect(isNull(undefined)).toBe(true)
    expect(isNull(null)).toBe(true)
    expect(isNull('')).toBe(true)
    expect(isNull('   ')).toBe(true)
  })

  it('does not treat 0 or false as null', () => {
    // The classic trap: a numeric field holding 0 is a real value.
    expect(isNull(0)).toBe(false)
    expect(isNull(false)).toBe(false)
  })

  it('treats real values as not null', () => {
    expect(isNull('a')).toBe(false)
    expect(isNull(['x'])).toBe(false)
  })

  it('treats an empty array as null', () => {
    // It stringifies to '', and for a table or multi-select field value that
    // is genuinely empty. `[0]` stringifies to '0', so it is not null.
    expect(isNull([])).toBe(true)
    expect(isNull([0])).toBe(false)
  })
})

describe('cstr', () => {
  it('returns an empty string for null and undefined', () => {
    // Regression: a strict `=== null` check left cstr(undefined) throwing on
    // `.toString()`.
    expect(cstr(null)).toBe('')
    expect(cstr(undefined)).toBe('')
  })

  it('does not throw on undefined', () => {
    expect(() => cstr(undefined)).not.toThrow()
  })

  it('stringifies numbers including zero', () => {
    expect(cstr(0)).toBe('0')
    expect(cstr(42)).toBe('42')
  })

  it('passes strings through', () => {
    expect(cstr('abc')).toBe('abc')
  })
})

describe('getRandom', () => {
  it('returns four characters by default', () => {
    expect(getRandom()).toHaveLength(4)
  })

  it('honours the requested length', () => {
    expect(getRandom(10)).toHaveLength(10)
    expect(getRandom(1)).toHaveLength(1)
    expect(getRandom(0)).toHaveLength(0)
  })

  it('uses only letters', () => {
    expect(getRandom(50)).toMatch(/^[A-Za-z]+$/)
  })
})

describe('runSequentially', () => {
  it('runs functions in order, waiting for each', async () => {
    const order = []
    await runSequentially([
      () => new Promise((r) => setTimeout(() => (order.push(1), r()), 10)),
      () => Promise.resolve(order.push(2)),
      () => Promise.resolve(order.push(3)),
    ])
    expect(order).toEqual([1, 2, 3])
  })

  it('resolves for an empty list', async () => {
    await expect(runSequentially([])).resolves.toBeUndefined()
  })

  it('stops at the first rejection', async () => {
    const after = vi.fn()
    await expect(
      runSequentially([() => Promise.reject(new Error('boom')), after]),
    ).rejects.toThrow('boom')
    expect(after).not.toHaveBeenCalled()
  })
})

describe('deepClone', () => {
  it('returns primitives unchanged', () => {
    expect(deepClone(5)).toBe(5)
    expect(deepClone('a')).toBe('a')
    expect(deepClone(null)).toBeNull()
    expect(deepClone(undefined)).toBeUndefined()
  })

  it('clones nested objects so mutation does not leak', () => {
    const source = { a: { b: { c: 1 } } }
    const cloned = deepClone(source)
    cloned.a.b.c = 2
    expect(source.a.b.c).toBe(1)
  })

  it('clones arrays and their contents', () => {
    const source = [{ a: 1 }, { a: 2 }]
    const cloned = deepClone(source)
    cloned[0].a = 99
    expect(source[0].a).toBe(1)
    expect(Array.isArray(cloned)).toBe(true)
  })

  it('clones Date instances by value', () => {
    const date = new Date('2024-01-01T00:00:00Z')
    const cloned = deepClone(date)
    expect(cloned).not.toBe(date)
    expect(cloned.getTime()).toBe(date.getTime())
  })

  it('preserves an explicit undefined value', () => {
    expect(deepClone({ a: undefined })).toEqual({ a: undefined })
  })
})

describe('copy', () => {
  it('deep copies via JSON', () => {
    const source = { a: { b: 1 } }
    const copied = copy(source)
    copied.a.b = 2
    expect(source.a.b).toBe(1)
  })

  it('returns falsy values as they are', () => {
    expect(copy(null)).toBeNull()
    expect(copy(undefined)).toBeUndefined()
    expect(copy(0)).toBe(0)
    expect(copy('')).toBe('')
  })

  it('drops undefined values and Dates become strings', () => {
    // The documented cost of the JSON round trip; deepClone keeps both.
    expect(copy({ a: undefined })).toEqual({})
    expect(typeof copy({ d: new Date() }).d).toBe('string')
  })
})

describe('validateConditions', () => {
  it('rejects anything that is not an array', () => {
    expect(validateConditions(null)).toBe(false)
    expect(validateConditions('a')).toBe(false)
    expect(validateConditions({})).toBe(false)
  })

  it('accepts a complete simple condition', () => {
    expect(validateConditions(['status', '=', 'Open'])).toBe(true)
  })

  it('rejects a simple condition with an empty part', () => {
    expect(validateConditions(['', '=', 'Open'])).toBe(false)
    expect(validateConditions(['status', '', 'Open'])).toBe(false)
    expect(validateConditions(['status', '=', ''])).toBe(false)
  })

  it('rejects an empty array', () => {
    expect(validateConditions([])).toBe(false)
  })

  it('accepts nested conditions joined by a logical operator', () => {
    expect(
      validateConditions([
        ['status', '=', 'Open'],
        'and',
        ['priority', '=', 'High'],
      ]),
    ).toBe(true)
  })

  it('rejects a logical operator at the start or end', () => {
    expect(validateConditions(['and', ['a', '=', 'b']])).toBe(false)
    expect(validateConditions([['a', '=', 'b'], 'or'])).toBe(false)
  })

  it('rejects consecutive logical operators', () => {
    expect(
      validateConditions([['a', '=', 'b'], 'and', 'or', ['c', '=', 'd']]),
    ).toBe(false)
  })

  it('rejects a group containing an invalid nested condition', () => {
    expect(validateConditions([['a', '=', ''], 'and', ['c', '=', 'd']])).toBe(
      false,
    )
  })
})

describe('sameArrayContents', () => {
  it('ignores order', () => {
    expect(sameArrayContents([1, 2, 3], [3, 2, 1])).toBe(true)
  })

  it('counts duplicates', () => {
    expect(sameArrayContents([1, 1, 2], [1, 2, 2])).toBe(false)
    expect(sameArrayContents([1, 1, 2], [1, 2, 1])).toBe(true)
  })

  it('is true for the same reference and for two empty arrays', () => {
    const a = [1]
    expect(sameArrayContents(a, a)).toBe(true)
    expect(sameArrayContents([], [])).toBe(true)
  })

  it('is false for different lengths or non-arrays', () => {
    expect(sameArrayContents([1], [1, 2])).toBe(false)
    expect(sameArrayContents(null, [])).toBe(false)
    expect(sameArrayContents([], 'ab')).toBe(false)
  })

  it('compares by strict equality', () => {
    expect(sameArrayContents([{ a: 1 }], [{ a: 1 }])).toBe(false)
    expect(sameArrayContents(['1'], [1])).toBe(false)
  })
})

describe('orderSensitiveEqual', () => {
  it('requires the same order', () => {
    expect(orderSensitiveEqual([1, 2], [1, 2])).toBe(true)
    expect(orderSensitiveEqual([1, 2], [2, 1])).toBe(false)
  })

  it('is true for the same reference and two empty arrays', () => {
    const a = [1]
    expect(orderSensitiveEqual(a, a)).toBe(true)
    expect(orderSensitiveEqual([], [])).toBe(true)
  })

  it('is false for different lengths or non-arrays', () => {
    expect(orderSensitiveEqual([1], [1, 2])).toBe(false)
    expect(orderSensitiveEqual(undefined, [])).toBe(false)
  })
})

describe('getGridTemplateColumnsForTable', () => {
  it('converts numeric widths to fr and appends the actions column', () => {
    expect(getGridTemplateColumnsForTable([{ width: 2 }, { width: 1 }])).toBe(
      '2fr 1fr 22px',
    )
  })

  it('passes string widths through untouched', () => {
    expect(
      getGridTemplateColumnsForTable([{ width: '200px' }, { width: 1 }]),
    ).toBe('200px 1fr 22px')
  })

  it('defaults a missing width to 1fr', () => {
    expect(getGridTemplateColumnsForTable([{}, {}])).toBe('1fr 1fr 22px')
  })

  it('still emits the actions column for no columns', () => {
    expect(getGridTemplateColumnsForTable([])).toBe(' 22px')
  })
})

describe('isTranslatable', () => {
  const original = globalThis.window.translated_doctypes

  afterEach(() => {
    globalThis.window.translated_doctypes = original
  })

  it('is true for a listed doctype', () => {
    globalThis.window.translated_doctypes = ['CRM Deal']
    expect(isTranslatable('CRM Deal')).toBe(true)
  })

  it('is false for an unlisted doctype', () => {
    globalThis.window.translated_doctypes = ['CRM Deal']
    expect(isTranslatable('CRM Lead')).toBe(false)
  })

  it('is false when the global is absent', () => {
    globalThis.window.translated_doctypes = undefined
    expect(isTranslatable('CRM Deal')).toBe(false)
  })
})

describe('sanitizeHTML', () => {
  it('strips script tags', () => {
    expect(sanitizeHTML('<p>ok</p><script>alert(1)</script>')).toBe('<p>ok</p>')
  })

  it('strips inline event handlers', () => {
    expect(sanitizeHTML('<img src=x onerror=alert(1)>')).not.toContain(
      'onerror',
    )
  })

  it('keeps benign markup', () => {
    expect(sanitizeHTML('<p><b>hi</b></p>')).toBe('<p><b>hi</b></p>')
  })

  it('returns non-strings untouched', () => {
    expect(sanitizeHTML(null)).toBeNull()
    expect(sanitizeHTML(42)).toBe(42)
  })

  it('defaults to an empty string', () => {
    expect(sanitizeHTML()).toBe('')
  })
})

describe('sanitizeText', () => {
  it('strips invisible format characters', () => {
    // Zero-width joiner / RTL overrides can disguise text; they are removed.
    expect(sanitizeText('a‍b')).toBe('ab')
    expect(sanitizeText('a‮b')).toBe('ab')
  })

  it('leaves ordinary text alone', () => {
    expect(sanitizeText('hello world')).toBe('hello world')
  })

  it('returns non-strings untouched', () => {
    expect(sanitizeText(null)).toBeNull()
    expect(sanitizeText(7)).toBe(7)
  })

  it('defaults to an empty string', () => {
    expect(sanitizeText()).toBe('')
  })
})

describe('isEmoji without the emoji database', () => {
  it('recognises flags, keycaps, skin tones and joined emoji', () => {
    for (const e of ['🇮🇳', '1️⃣', '👍🏽', '👨‍👩‍👧', '❤️', '🚀']) {
      expect(isEmoji(e)).toBe(true)
    }
  })

  it('treats icon names, digits and symbols as text', () => {
    for (const t of ['list', 'lucide-search', '123', '#', '*', '→', '©']) {
      expect(isEmoji(t)).toBe(false)
    }
    expect(isEmoji(null)).toBe(false)
  })
})
