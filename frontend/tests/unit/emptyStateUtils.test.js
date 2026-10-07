import {
  splitDescriptionLines,
  notesSubtitle,
  DOCTYPE_NOUNS,
} from '@/utils/emptyState'

describe('splitDescriptionLines', () => {
  it('splits a two-sentence description onto separate lines', () => {
    expect(
      splitDescriptionLines(
        'No emails found in your inbox. New messages will appear here soon.',
      ),
    ).toEqual([
      'No emails found in your inbox.',
      'New messages will appear here soon.',
    ])
  })

  it('restores the period the split consumed', () => {
    const [first] = splitDescriptionLines('One. Two.')
    expect(first).toBe('One.')
  })

  it('leaves the trailing fragment exactly as written', () => {
    // Whatever punctuation the author ended with is preserved, including none.
    expect(splitDescriptionLines('One. Two')).toEqual(['One.', 'Two'])
    expect(splitDescriptionLines('One. Two!')).toEqual(['One.', 'Two!'])
  })

  it('returns a single-sentence description untouched', () => {
    expect(splitDescriptionLines('You have no new notifications')).toEqual([
      'You have no new notifications',
    ])
  })

  it('does not add punctuation to a single sentence', () => {
    // Regression guard: an earlier approach appended a period to every part,
    // silently rewriting copy that deliberately had none.
    expect(splitDescriptionLines('No content')).toEqual(['No content'])
  })

  it('keeps a trailing period on a single sentence', () => {
    expect(splitDescriptionLines('All done.')).toEqual(['All done.'])
  })

  it('splits three sentences', () => {
    expect(splitDescriptionLines('A. B. C.')).toEqual(['A.', 'B.', 'C.'])
  })

  it('does not split on a period without a following space', () => {
    // Decimals, file names and abbreviations must survive intact.
    expect(splitDescriptionLines('Upload a .csv file to begin')).toEqual([
      'Upload a .csv file to begin',
    ])
    expect(splitDescriptionLines('Version 1.2 is required')).toEqual([
      'Version 1.2 is required',
    ])
  })

  it('splits across a newline as well as a space', () => {
    expect(splitDescriptionLines('One.\nTwo.')).toEqual(['One.', 'Two.'])
  })

  it('handles empty and missing input', () => {
    expect(splitDescriptionLines('')).toEqual([''])
    expect(splitDescriptionLines(null)).toEqual([''])
    expect(splitDescriptionLines(undefined)).toEqual([''])
  })

  it('uses no lookbehind assertion', () => {
    // Lookbehind is a parse-time error on older Safari and would take down the
    // whole chunk, not just this function.
    expect(splitDescriptionLines.toString()).not.toContain('(?<')
  })
})

describe('notesSubtitle', () => {
  it('uses the noun matching the doctype', () => {
    expect(notesSubtitle('CRM Deal')).toBe(
      'Capture important details and updates about this deal.',
    )
    expect(notesSubtitle('CRM Lead')).toBe(
      'Capture important details and updates about this lead.',
    )
    expect(notesSubtitle('Contact')).toBe(
      'Capture important details and updates about this contact.',
    )
    expect(notesSubtitle('CRM Organization')).toBe(
      'Capture important details and updates about this organization.',
    )
  })

  it('falls back to "record" for an unmapped doctype', () => {
    // The header is shared, so an unknown doctype must not read "about this
    // undefined."
    expect(notesSubtitle('CRM Task')).toBe(
      'Capture important details and updates about this record.',
    )
    expect(notesSubtitle(undefined)).toBe(
      'Capture important details and updates about this record.',
    )
  })

  it('covers every doctype in the noun map', () => {
    Object.keys(DOCTYPE_NOUNS).forEach((doctype) => {
      expect(notesSubtitle(doctype)).not.toContain('record')
    })
  })
})
