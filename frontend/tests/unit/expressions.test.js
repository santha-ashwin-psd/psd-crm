import {
  _eval,
  evaluateDependsOnValue,
  evaluateExpression,
} from '@/utils/expressions'

describe('_eval', () => {
  it('evaluates a bare expression', () => {
    expect(_eval('1 + 1')).toBe(2)
    expect(_eval('"a" + "b"')).toBe('ab')
  })

  it('exposes context keys as variables', () => {
    expect(_eval('doc.status', { doc: { status: 'Open' } })).toBe('Open')
    expect(_eval('a + b', { a: 2, b: 3 })).toBe(5)
  })

  it('evaluates comparisons to booleans', () => {
    expect(_eval('doc.value > 3', { doc: { value: 5 } })).toBe(true)
    expect(_eval('doc.value > 3', { doc: { value: 1 } })).toBe(false)
  })

  it('rethrows on a syntax error, after logging', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => _eval('this is not valid js')).toThrow()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('rethrows when the expression references something missing', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => _eval('doc.status', {})).toThrow()
    spy.mockRestore()
  })
})

describe('evaluateDependsOnValue', () => {
  it('defaults to visible when there is no expression', () => {
    // A field with no depends_on should show, not hide.
    expect(evaluateDependsOnValue(null, { a: 1 })).toBe(true)
    expect(evaluateDependsOnValue('', { a: 1 })).toBe(true)
    expect(evaluateDependsOnValue(undefined, { a: 1 })).toBe(true)
  })

  it('defaults to visible when there is no doc', () => {
    expect(evaluateDependsOnValue('eval:doc.a', null)).toBe(true)
    expect(evaluateDependsOnValue('a', undefined)).toBe(true)
  })

  it('returns true for a boolean expression either way', () => {
    // Asymmetry worth knowing about: the `if (!expression) return true` guard
    // catches literal `false` before the boolean branch can, so BOTH booleans
    // resolve to visible. Unreachable in practice — every caller passes a
    // doctype field property (depends_on, mandatory_depends_on, …), which is
    // always a string or undefined. Left as-is rather than changing
    // field-visibility semantics for a path nothing takes.
    expect(evaluateDependsOnValue(true, { a: 1 })).toBe(true)
    expect(evaluateDependsOnValue(false, { a: 1 })).toBe(true)
  })

  it('calls a function expression with the doc', () => {
    const fn = vi.fn(() => true)
    const doc = { a: 1 }
    expect(evaluateDependsOnValue(fn, doc)).toBe(true)
    expect(fn).toHaveBeenCalledWith(doc)
  })

  it('evaluates an eval: expression against the doc', () => {
    expect(evaluateDependsOnValue('eval:doc.status == "Open"', { status: 'Open' })).toBe(true)
    expect(evaluateDependsOnValue('eval:doc.status == "Open"', { status: 'Won' })).toBe(false)
  })

  it('falls back to visible when an eval: expression throws', () => {
    // A broken customisation must not hide the field it guards.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(evaluateDependsOnValue('eval:doc.a.b.c', { a: null })).toBe(true)
    spy.mockRestore()
  })

  it('treats a bare fieldname as a truthiness check', () => {
    expect(evaluateDependsOnValue('status', { status: 'Open' })).toBe(true)
    expect(evaluateDependsOnValue('status', { status: '' })).toBe(false)
    expect(evaluateDependsOnValue('status', { status: 0 })).toBe(false)
    expect(evaluateDependsOnValue('missing', { status: 'Open' })).toBe(false)
  })

  it('treats an array field as truthy only when it has entries', () => {
    expect(evaluateDependsOnValue('items', { items: [1] })).toBe(true)
    expect(evaluateDependsOnValue('items', { items: [] })).toBe(false)
  })
})

describe('evaluateExpression', () => {
  it('defaults to false when there is no expression or no doc', () => {
    // Opposite default to evaluateDependsOnValue — this one gates an action,
    // so absent means "no".
    expect(evaluateExpression(null, { a: 1 })).toBe(false)
    expect(evaluateExpression('', { a: 1 })).toBe(false)
    expect(evaluateExpression('eval:doc.a', null)).toBe(false)
  })

  it('returns a boolean expression unchanged', () => {
    expect(evaluateExpression(true, { a: 1 })).toBe(true)
    expect(evaluateExpression(false, { a: 1 })).toBe(false)
  })

  it('calls a function expression with the doc', () => {
    const fn = vi.fn(() => false)
    const doc = { a: 1 }
    expect(evaluateExpression(fn, doc)).toBe(false)
    expect(fn).toHaveBeenCalledWith(doc)
  })

  it('evaluates an eval: expression with doc and parent in scope', () => {
    expect(
      evaluateExpression('eval:doc.a && parent.b', { a: 1 }, { b: 1 }),
    ).toBeTruthy()
  })

  it('forces true for is_submittable checks inside a child table', () => {
    // Child tables are never submittable on their own, so the guard short
    // circuits rather than letting the expression decide.
    expect(
      evaluateExpression(
        'eval:doc.is_submittable',
        { is_submittable: 0 },
        { istable: 1 },
      ),
    ).toBe(true)
  })

  it('does not force true when the parent is not a table', () => {
    // Note the return is the raw evaluated value (0), not a coerced boolean —
    // the eval: branch passes through whatever the expression produced.
    expect(
      evaluateExpression(
        'eval:doc.is_submittable',
        { is_submittable: 0 },
        { istable: 0 },
      ),
    ).toBe(0)
  })

  it('returns the raw value of an eval: expression, not a boolean', () => {
    expect(evaluateExpression('eval:doc.count', { count: 5 })).toBe(5)
    expect(evaluateExpression('eval:doc.name', { name: 'ACME' })).toBe('ACME')
  })

  it('falls back to true when an eval: expression throws', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(evaluateExpression('eval:doc.a.b.c', { a: null })).toBe(true)
    spy.mockRestore()
  })

  it('treats a bare fieldname as a truthiness check', () => {
    expect(evaluateExpression('status', { status: 'Open' })).toBe(true)
    expect(evaluateExpression('status', { status: '' })).toBe(false)
  })

  it('treats an array field as truthy only when it has entries', () => {
    expect(evaluateExpression('items', { items: [1] })).toBe(true)
    expect(evaluateExpression('items', { items: [] })).toBe(false)
  })
})
