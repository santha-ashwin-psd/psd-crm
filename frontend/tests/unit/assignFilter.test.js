import {
  isAssignEqualityFilter,
  toAssignMemberFilter,
  fromAssignMemberFilter,
} from '@/utils/assignFilter'

describe('isAssignEqualityFilter', () => {
  it('matches only _assign equality operators', () => {
    expect(
      isAssignEqualityFilter({ fieldname: '_assign', operator: 'equals' }),
    ).toBe(true)
    expect(
      isAssignEqualityFilter({ fieldname: '_assign', operator: 'not equals' }),
    ).toBe(true)
  })

  it('ignores other operators on _assign', () => {
    for (const operator of ['like', 'not like', 'is', 'in']) {
      expect(isAssignEqualityFilter({ fieldname: '_assign', operator })).toBe(
        false,
      )
    }
  })

  it('ignores equality on other fields', () => {
    expect(
      isAssignEqualityFilter({ fieldname: 'status', operator: 'equals' }),
    ).toBe(false)
  })

  it('tolerates missing input', () => {
    expect(isAssignEqualityFilter(null)).toBe(false)
    expect(isAssignEqualityFilter(undefined)).toBe(false)
  })
})

describe('toAssignMemberFilter', () => {
  it('rewrites equals to a quoted LIKE', () => {
    expect(
      toAssignMemberFilter({
        fieldname: '_assign',
        operator: 'equals',
        value: 'bob@example.com',
      }),
    ).toEqual({
      fieldname: '_assign',
      operator: 'like',
      value: '%"bob@example.com"%',
    })
  })

  it('rewrites not equals to a quoted NOT LIKE', () => {
    expect(
      toAssignMemberFilter({
        fieldname: '_assign',
        operator: 'not equals',
        value: 'bob@example.com',
      }),
    ).toEqual({
      fieldname: '_assign',
      operator: 'not like',
      value: '%"bob@example.com"%',
    })
  })

  it('leaves unrelated filters untouched', () => {
    const filter = { fieldname: 'status', operator: 'equals', value: 'Open' }
    expect(toAssignMemberFilter(filter)).toBe(filter)
  })

  it('does not mutate its input', () => {
    const filter = {
      fieldname: '_assign',
      operator: 'equals',
      value: 'bob@example.com',
    }
    toAssignMemberFilter(filter)
    expect(filter.operator).toBe('equals')
    expect(filter.value).toBe('bob@example.com')
  })
})

describe('fromAssignMemberFilter', () => {
  it('restores equals from a quoted LIKE', () => {
    expect(
      fromAssignMemberFilter('_assign', 'like', '%"bob@example.com"%'),
    ).toEqual({ operator: 'equals', value: 'bob@example.com' })
  })

  it('restores not equals from a quoted NOT LIKE', () => {
    expect(
      fromAssignMemberFilter('_assign', 'not like', '%"bob@example.com"%'),
    ).toEqual({ operator: 'not equals', value: 'bob@example.com' })
  })

  it('leaves a user-authored LIKE alone', () => {
    // No surrounding quotes → the user chose "Like" themselves.
    expect(fromAssignMemberFilter('_assign', 'like', '%bob%')).toBeNull()
  })

  it('ignores other fields and non-string values', () => {
    expect(
      fromAssignMemberFilter('status', 'like', '%"bob@example.com"%'),
    ).toBeNull()
    expect(fromAssignMemberFilter('_assign', 'like', null)).toBeNull()
    expect(fromAssignMemberFilter('_assign', 'is', 'set')).toBeNull()
  })
})

describe('_assign equality round trip', () => {
  it('survives serialise → restore unchanged', () => {
    const original = {
      fieldname: '_assign',
      operator: 'not equals',
      value: 'alice@example.com',
    }
    const stored = toAssignMemberFilter(original)
    const restored = fromAssignMemberFilter(
      stored.fieldname,
      stored.operator,
      stored.value,
    )
    expect(restored).toEqual({
      operator: original.operator,
      value: original.value,
    })
  })

  it('matches one whole member, not a prefix of another', () => {
    const { value } = toAssignMemberFilter({
      fieldname: '_assign',
      operator: 'equals',
      value: 'bob@example.com',
    })
    const pattern = value.slice(1, -1) // strip the leading/trailing %
    // A bare LIKE on "bob@example.com" would also hit "bobby@example.com";
    // anchoring on the quotes must not.
    expect('["bob@example.com"]').toContain(pattern)
    expect('["bobby@example.com"]').not.toContain(pattern)
  })
})
