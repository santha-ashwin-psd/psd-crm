import {
  cleanMobile,
  isValidEmail,
  validateEntry,
  extraTabs,
  saveDraft,
  loadDraft,
  clearDraft,
  draftKey,
  hasContent,
} from '@/utils/pipelineEntry'

describe('cleanMobile', () => {
  it('turns any Indian format into +91XXXXXXXXXX', () => {
    for (const raw of [
      '9876543210',
      '98765 43210',
      '+91 98765-43210',
      '09876543210',
      '919876543210',
    ]) {
      expect(cleanMobile(raw)).toEqual({ value: '+919876543210', error: null })
    }
  })
  it('keeps international numbers that start with +', () => {
    expect(cleanMobile('+44 20 7946 0958').value).toBe('+442079460958')
  })
  it('flags anything else', () => {
    for (const raw of ['12345', 'abc', '5555555555'])
      expect(cleanMobile(raw).error).toBeTruthy()
  })
  it('accepts an empty field', () => {
    expect(cleanMobile('')).toEqual({ value: '', error: null })
  })
})

describe('isValidEmail', () => {
  it('needs a name, @ and a domain', () => {
    expect(isValidEmail('riya@acme.in')).toBe(true)
    for (const bad of [
      'riya',
      'riya@',
      'riya@acme',
      '@acme.in',
      'ri ya@acme.in',
    ]) {
      expect(isValidEmail(bad)).toBe(false)
    }
  })
})

describe('validateEntry', () => {
  const ok = { status: 'Qualification' }

  it('passes a minimal entry', () => {
    expect(validateEntry(ok)).toEqual({})
  })
  it('reports every problem at once, per field', () => {
    const errors = validateEntry({
      email: 'bad',
      mobile_no: '123',
      deal_value: '-5',
      probability: '140',
    })
    expect(Object.keys(errors).sort()).toEqual(
      [
        'deal_value',
        'email',
        'first_name',
        'mobile_no',
        'probability',
        'status',
      ].sort(),
    )
  })
  it('needs a first name only when a new contact is being typed', () => {
    expect(
      validateEntry({ ...ok, mobile_no: '9876543210' }).first_name,
    ).toBeTruthy()
    expect(
      validateEntry(
        { ...ok, mobile_no: '9876543210' },
        { existingContact: true },
      ),
    ).toEqual({})
  })
  it('accepts a value with thousands separators', () => {
    expect(validateEntry({ ...ok, deal_value: '2,50,000' })).toEqual({})
  })
})

describe('extraTabs', () => {
  const layout = [
    {
      sections: [
        {
          name: 'contact_details_section',
          columns: [
            { fields: [{ fieldname: 'first_name' }, { fieldname: 'gender' }] },
          ],
        },
        {
          name: 'deal_section',
          columns: [
            { fields: [{ fieldname: 'status' }] },
            { fields: [{ fieldname: 'deal_owner' }] },
          ],
        },
        {
          name: 'organization_section',
          hidden: true,
          columns: [{ fields: [{ fieldname: 'linkedin' }] }],
        },
      ],
    },
  ]
  it('keeps only the fields the form does not lay out itself', () => {
    const fields = extraTabs(layout).flatMap((t) =>
      t.sections.flatMap((s) =>
        s.columns.flatMap((c) => c.fields.map((f) => f.fieldname)),
      ),
    )
    expect(fields).toEqual(['gender', 'linkedin'])
  })
  it('drops sections left empty and un-hides the rest', () => {
    const sections = extraTabs(layout)[0].sections
    expect(sections.map((s) => s.name)).toEqual([
      'contact_details_section',
      'organization_section',
    ])
    expect(sections.every((s) => !s.hidden)).toBe(true)
  })
  it('handles no layout', () => {
    expect(extraTabs(undefined)).toEqual([])
  })
})

describe('draft', () => {
  beforeEach(() => localStorage.clear())

  it('is saved per user and read back', () => {
    saveDraft('ada', { first_name: 'Riya' }, 'call back')
    expect(loadDraft('ada')).toMatchObject({
      doc: { first_name: 'Riya' },
      note: 'call back',
    })
    expect(loadDraft('bob')).toBeNull()
  })
  it('is not kept when only defaults are filled', () => {
    saveDraft('ada', { status: 'Qualification', deal_owner: 'ada' }, '')
    expect(loadDraft('ada')).toBeNull()
    expect(hasContent({ status: 'x' }, '')).toBe(false)
  })
  it('expires after a week', () => {
    localStorage.setItem(
      draftKey('ada'),
      JSON.stringify({
        savedAt: Date.now() - 8 * 864e5,
        doc: { first_name: 'Old' },
      }),
    )
    expect(loadDraft('ada')).toBeNull()
  })
  it('is cleared', () => {
    saveDraft('ada', { first_name: 'Riya' }, '')
    clearDraft('ada')
    expect(loadDraft('ada')).toBeNull()
  })
})
