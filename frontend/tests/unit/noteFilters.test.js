import {
  filterNotes,
  noteScopeOptions,
  stripHtml,
  NOTE_SCOPE,
} from '@/utils/noteFilters'

const notes = [
  {
    name: 'n1',
    title: 'Kickoff meeting',
    content: '<p>Discussed <strong>timeline</strong> and budget</p>',
    owner: 'alice@example.com',
  },
  {
    name: 'n2',
    title: 'Follow up',
    content: '<p>Send the revised quote</p>',
    owner: 'bob@example.com',
  },
  {
    name: 'n3',
    title: 'Pricing',
    content: '',
    owner: 'alice@example.com',
  },
]

describe('stripHtml', () => {
  it('replaces tags with spaces', () => {
    expect(stripHtml('<p>hello</p>')).toBe(' hello ')
  })

  it('keeps words separated so adjacent tags do not fuse them', () => {
    // "<b>meet</b><b>ing</b>" must not become "meeting" — that would produce a
    // false positive that the rendered note never shows.
    expect(stripHtml('<b>meet</b><b>ing</b>').replace(/\s+/g, ' ')).toBe(
      ' meet ing ',
    )
  })

  it('handles attributes and self-closing tags', () => {
    expect(stripHtml('<a href="http://x.com">link</a><br/>').trim()).toBe(
      'link',
    )
  })

  it('leaks a fragment when an attribute value contains ">"', () => {
    // Known limitation: the regex closes at the first ">", which here sits
    // inside the href. Documented rather than fixed — this only affects which
    // notes a free-text search matches, and a real parser is not worth the
    // weight for that. Change this test if the behaviour is ever tightened.
    expect(stripHtml('<a href="http://x.com/a>b">link</a>')).toContain('b">')
  })

  it('returns an empty string for empty input', () => {
    expect(stripHtml('')).toBe('')
    expect(stripHtml(null)).toBe('')
    expect(stripHtml(undefined)).toBe('')
  })
})

describe('noteScopeOptions', () => {
  it('offers all notes and my notes, in that order', () => {
    expect(noteScopeOptions()).toEqual([
      { label: 'All Notes', value: 'all' },
      { label: 'My Notes', value: 'mine' },
    ])
  })
})

describe('filterNotes', () => {
  it('returns everything by default', () => {
    expect(filterNotes(notes)).toHaveLength(3)
  })

  it('returns everything for an explicit "all" scope and blank query', () => {
    expect(
      filterNotes(notes, { scope: NOTE_SCOPE.ALL, query: '' }),
    ).toHaveLength(3)
  })

  it('narrows to the current user for the "mine" scope', () => {
    const result = filterNotes(notes, {
      scope: NOTE_SCOPE.MINE,
      currentUser: 'alice@example.com',
    })
    expect(result.map((n) => n.name)).toEqual(['n1', 'n3'])
  })

  it('returns nothing for "mine" when the user owns none', () => {
    expect(
      filterNotes(notes, {
        scope: NOTE_SCOPE.MINE,
        currentUser: 'carol@example.com',
      }),
    ).toEqual([])
  })

  it('returns nothing for "mine" when the user is unknown', () => {
    // Guards against every note matching `undefined === undefined`.
    expect(filterNotes(notes, { scope: NOTE_SCOPE.MINE })).toEqual([])
  })

  it('matches on the title', () => {
    const result = filterNotes(notes, { query: 'kickoff' })
    expect(result.map((n) => n.name)).toEqual(['n1'])
  })

  it('matches on content with the markup stripped', () => {
    // "timeline" is wrapped in <strong> in the source HTML.
    const result = filterNotes(notes, { query: 'timeline' })
    expect(result.map((n) => n.name)).toEqual(['n1'])
  })

  it('does not match on tag names', () => {
    // "strong" and "href" appear only in the markup, never in the rendered
    // text, so searching for them must find nothing.
    expect(filterNotes(notes, { query: 'strong' })).toEqual([])
    expect(filterNotes(notes, { query: 'href' })).toEqual([])
  })

  it('is case insensitive', () => {
    expect(filterNotes(notes, { query: 'KICKOFF' })).toHaveLength(1)
    expect(filterNotes(notes, { query: 'kIcKoFf' })).toHaveLength(1)
  })

  it('ignores surrounding whitespace in the query', () => {
    expect(filterNotes(notes, { query: '   ' })).toHaveLength(3)
    expect(filterNotes(notes, { query: '  pricing  ' })).toHaveLength(1)
  })

  it('combines scope and query', () => {
    const result = filterNotes(notes, {
      scope: NOTE_SCOPE.MINE,
      query: 'pricing',
      currentUser: 'alice@example.com',
    })
    expect(result.map((n) => n.name)).toEqual(['n3'])
  })

  it('returns nothing when scope and query disagree', () => {
    expect(
      filterNotes(notes, {
        scope: NOTE_SCOPE.MINE,
        query: 'follow up',
        currentUser: 'alice@example.com',
      }),
    ).toEqual([])
  })

  it('tolerates notes with missing title or content', () => {
    const sparse = [{ name: 'x' }, { name: 'y', title: null, content: null }]
    expect(filterNotes(sparse, { query: 'anything' })).toEqual([])
    expect(filterNotes(sparse)).toHaveLength(2)
  })

  it('tolerates an empty or missing list', () => {
    expect(filterNotes([])).toEqual([])
    expect(filterNotes(null)).toEqual([])
    expect(filterNotes(undefined)).toEqual([])
  })

  it('does not mutate the input array', () => {
    const input = [...notes]
    filterNotes(input, { query: 'kickoff' })
    expect(input).toHaveLength(3)
  })
})
