import { formatError } from '@/utils/formatError'

describe('formatError', () => {
  it('returns the fallback for falsy errors', () => {
    expect(formatError(null)).toBe('An error occurred')
    expect(formatError(undefined)).toBe('An error occurred')
    expect(formatError('')).toBe('An error occurred')
    expect(formatError(0)).toBe('An error occurred')
  })

  it('honours a custom fallback', () => {
    expect(formatError(null, 'Could not save')).toBe('Could not save')
  })

  it('returns a plain string error as-is', () => {
    expect(formatError('Something broke')).toBe('Something broke')
  })

  it('does not translate a string already marked with __', () => {
    // The `__` prefix marks a pre-translated string; passing it through the
    // translator again would double-handle it.
    expect(formatError('__already translated')).toBe('__already translated')
  })

  it('prefers the first entry of the frappe messages array', () => {
    // The frappe API error shape puts the useful text in `messages`, with
    // `message` often holding a generic wrapper.
    expect(
      formatError({
        messages: ['Insufficient permission', 'second'],
        message: 'ValidationError',
      }),
    ).toBe('Insufficient permission')
  })

  it('falls back to message when messages is absent or empty', () => {
    expect(formatError({ message: 'Not found' })).toBe('Not found')
    expect(formatError({ messages: [], message: 'Not found' })).toBe('Not found')
  })

  it('reads the message off a real Error', () => {
    expect(formatError(new Error('boom'))).toBe('boom')
  })

  it('uses toString when it yields something meaningful', () => {
    expect(formatError({ toString: () => 'custom text' })).toBe('custom text')
  })

  it('falls back rather than surfacing [object Object]', () => {
    // The whole point of the toString guard: never show the user
    // "[object Object]".
    expect(formatError({})).toBe('An error occurred')
    expect(formatError({ foo: 'bar' })).toBe('An error occurred')
  })

  it('falls back for an error whose message is blank', () => {
    expect(formatError({ message: '' })).toBe('An error occurred')
  })

  it('handles an array of messages containing a blank first entry', () => {
    expect(formatError({ messages: [''], message: 'real' })).toBe('real')
  })
})
