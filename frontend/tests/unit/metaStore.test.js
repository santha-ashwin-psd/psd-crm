// getMeta creates a resource and fetches immediately when the doctype is not
// already cached; the fake keeps that off the network.
vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { fakeResource } = await import('../helpers/pinia.js')
  return { ...actual, createResource: (options) => fakeResource(options) }
})

import { getMeta } from '@/stores/meta'

const DOCTYPE = 'CRM Deal'

/**
 * Seed the module-level meta cache the way a real response would, by pushing a
 * payload through the resource's own onSuccess.
 */
function seed(fields, { userSettings = {}, translated = 0, dt = DOCTYPE } = {}) {
  const store = getMeta(dt)
  store.meta._seed({
    docs: [{ name: dt, fields, translated_doctype: translated }],
    user_settings: JSON.stringify(userSettings),
  })
  return store
}

const FIELDS = [
  { fieldname: 'organization', label: 'Organization', fieldtype: 'Data' },
  { fieldname: 'annual_revenue', label: 'Revenue', fieldtype: 'Currency' },
  { fieldname: 'probability', label: 'Probability', fieldtype: 'Percent' },
  { fieldname: 'secret', label: 'Secret', fieldtype: 'Data', hidden: 1 },
  { fieldname: 'sb1', label: '', fieldtype: 'Section Break' },
  { fieldname: 'items', label: 'Items', fieldtype: 'Table' },
]

describe('meta store', () => {
  describe('getFields', () => {
    it('drops hidden fields', () => {
      const store = seed(structuredClone(FIELDS))
      const names = store.getFields().map((f) => f.fieldname)
      expect(names).not.toContain('secret')
    })

    it('drops layout and no-value field types by default', () => {
      const store = seed(structuredClone(FIELDS))
      const names = store.getFields().map((f) => f.fieldname)
      expect(names).not.toContain('sb1')
      expect(names).not.toContain('items')
    })

    it('keeps no-value types when asked to', () => {
      const store = seed(structuredClone(FIELDS))
      const names = store
        .getFields({ restrictNoValueFields: false })
        .map((f) => f.fieldname)
      expect(names).toContain('sb1')
      expect(names).toContain('items')
    })

    it('honours an explicit restricted-type list', () => {
      const store = seed(structuredClone(FIELDS))
      const names = store
        .getFields({ restrictedFieldTypes: ['Currency'] })
        .map((f) => f.fieldname)
      expect(names).not.toContain('annual_revenue')
      expect(names).toContain('organization')
    })

    it('appends the standard fields on request', () => {
      const store = seed(structuredClone(FIELDS))
      const names = store
        .getFields({ withStandardFields: true })
        .map((f) => f.fieldname)
      expect(names).toContain('modified')
      expect(names).toContain('owner')
      expect(names).toContain('_assign')
    })

    it('returns an empty array for an unknown doctype', () => {
      const store = seed(structuredClone(FIELDS))
      expect(store.getFields({ dt: 'Nonexistent Doctype' })).toEqual([])
    })

    it('splits Select options into label/value pairs', () => {
      const store = seed([
        { fieldname: 'stage', fieldtype: 'Select', options: 'Open\nWon\nLost' },
      ])
      expect(store.getFields()[0].options).toEqual([
        { label: '', value: '' },
        { label: 'Open', value: 'Open' },
        { label: 'Won', value: 'Won' },
        { label: 'Lost', value: 'Lost' },
      ])
    })

    it('prepends a blank option so an optional Select can be cleared', () => {
      const store = seed([
        { fieldname: 'stage', fieldtype: 'Select', options: 'Open\nWon' },
      ])
      expect(store.getFields()[0].options[0]).toEqual({ label: '', value: '' })
    })

    it('omits the blank option on a mandatory Select', () => {
      const store = seed([
        {
          fieldname: 'stage',
          fieldtype: 'Select',
          options: 'Open\nWon',
          reqd: 1,
        },
      ])
      expect(store.getFields()[0].options[0]).toEqual({
        label: 'Open',
        value: 'Open',
      })
    })

    it('does not double-prepend when the options already start blank', () => {
      const store = seed([
        { fieldname: 'stage', fieldtype: 'Select', options: '\nOpen' },
      ])
      const options = store.getFields()[0].options
      expect(options.filter((o) => o.value === '')).toHaveLength(1)
    })

    it('promotes a Link to User into its own field type', () => {
      // The app renders user pickers differently from generic links.
      const store = seed([
        { fieldname: 'deal_owner', fieldtype: 'Link', options: 'User' },
      ])
      expect(store.getFields()[0].fieldtype).toBe('User')
    })

    it('leaves other Link fields alone', () => {
      const store = seed([
        { fieldname: 'territory', fieldtype: 'Link', options: 'CRM Territory' },
      ])
      expect(store.getFields()[0].fieldtype).toBe('Link')
    })

    it('is stable when called twice', () => {
      // getFields rewrites Select options and Link types in place on the
      // cached meta, so a second call must not re-process them — no extra
      // blank option, no re-splitting an already-split list.
      // (Plain-object copy, not structuredClone: the cached fields are
      // reactive proxies, which structuredClone refuses.)
      const store = seed([
        { fieldname: 'stage', fieldtype: 'Select', options: 'Open\nWon' },
        { fieldname: 'deal_owner', fieldtype: 'Link', options: 'User' },
      ])
      const snapshot = () => JSON.parse(JSON.stringify(store.getFields()))
      const first = snapshot()
      const second = snapshot()
      expect(second).toEqual(first)
      expect(second[0].options).toHaveLength(3)
      expect(second[1].fieldtype).toBe('User')
    })
  })

  describe('formatters', () => {
    it('formats a float using the field precision', () => {
      const store = seed([
        { fieldname: 'score', fieldtype: 'Float', precision: 2 },
      ])
      expect(store.getFormattedFloat('score', { score: 1234.5 })).toBe(
        '1,234.50',
      )
    })

    it('falls back to the system float precision when the field has none', () => {
      const store = seed([{ fieldname: 'score', fieldtype: 'Float' }])
      expect(store.getFormattedFloat('score', { score: 1234.5 })).toBe(
        '1,234.500',
      )
    })

    it('appends a percent sign', () => {
      const store = seed([
        { fieldname: 'probability', fieldtype: 'Percent', precision: '0' },
      ])
      expect(
        store.getFormattedPercent('probability', { probability: 40 }),
      ).toBe('40%')
    })

    it('ignores a numeric precision of 0 and uses the system default', () => {
      // Quirk worth pinning: precision is read as `df?.precision || null`, so a
      // numeric 0 is falsy and falls through to the 3-decimal default. It works
      // as '0' because Frappe stores precision in a Select, i.e. as a string —
      // which is why this has never bitten in practice.
      //
      // Not "fixed" to `??`, because the `||` is also deliberately swallowing
      // '' (Frappe's "use the default"); `??` would pass '' through and turn
      // every default-precision field into 0 decimals. A real fix has to
      // distinguish 0 from '', which is a bigger change than the bug warrants.
      const store = seed([
        { fieldname: 'probability', fieldtype: 'Percent', precision: 0 },
      ])
      expect(
        store.getFormattedPercent('probability', { probability: 40 }),
      ).toBe('40.000%')
    })

    it('formats currency with the system currency by default', () => {
      const store = seed([
        { fieldname: 'annual_revenue', fieldtype: 'Currency', precision: 2 },
      ])
      expect(
        store.getFormattedCurrency('annual_revenue', { annual_revenue: 1000 }),
      ).toBe('$ 1,000.00')
    })

    it('prefers a currency named by the field options on the doc', () => {
      const store = seed([
        {
          fieldname: 'annual_revenue',
          fieldtype: 'Currency',
          precision: 2,
          options: 'currency',
        },
      ])
      expect(
        store.getFormattedCurrency('annual_revenue', {
          annual_revenue: 1000,
          currency: 'EUR',
        }),
      ).toBe('€ 1,000.00')
    })

    it('falls back to the parent doc for the currency', () => {
      const store = seed([
        {
          fieldname: 'annual_revenue',
          fieldtype: 'Currency',
          precision: 2,
          options: 'currency',
        },
      ])
      expect(
        store.getFormattedCurrency(
          'annual_revenue',
          { annual_revenue: 1000 },
          { currency: 'EUR' },
        ),
      ).toBe('€ 1,000.00')
    })

    it('handles a missing value as zero', () => {
      const store = seed([
        { fieldname: 'annual_revenue', fieldtype: 'Currency', precision: 2 },
      ])
      expect(store.getFormattedCurrency('annual_revenue', {})).toBe('$ 0.00')
    })

    // Every formatter looks the field up with `.find()`, which returns
    // undefined for a fieldname the doctype no longer has — a saved list view
    // still naming a deleted column, for instance. The lookup result is then
    // dereferenced, so a throw here happens inside a cell renderer and takes
    // the whole list down rather than blanking one cell.
    describe('a fieldname the doctype does not have', () => {
      const store = () =>
        seed([{ fieldname: 'annual_revenue', fieldtype: 'Currency', precision: 2 }])

      it('formats currency at the default precision', () => {
        expect(store().getFormattedCurrency('gone', { gone: 1000 })).toBe(
          '$ 1,000.00',
        )
      })

      it('formats currency with precision without throwing', () => {
        expect(() =>
          store().getCurrencyWithPrecision('gone', { gone: 1000 }),
        ).not.toThrow()
      })

      it('formats a float without throwing', () => {
        expect(() => store().getFormattedFloat('gone', { gone: 1.5 })).not.toThrow()
      })

      it('formats a percent without throwing', () => {
        expect(() => store().getFormattedPercent('gone', { gone: 40 })).not.toThrow()
      })
    })
  })

  describe('user settings', () => {
    it('returns an empty object when there are no grid settings', () => {
      const store = seed(structuredClone(FIELDS))
      expect(store.getGridViewSettings('CRM Deal')).toEqual({})
    })

    it('returns the stored grid settings for the parent doctype', () => {
      const store = seed(structuredClone(FIELDS), {
        userSettings: { GridView: { [DOCTYPE]: { columns: ['a'] } } },
      })
      expect(store.getGridViewSettings(DOCTYPE)).toEqual({ columns: ['a'] })
    })

    it('invokes the callback directly when nothing changed', () => {
      const store = seed(structuredClone(FIELDS), {
        userSettings: { GridView: { [DOCTYPE]: { columns: ['a'] } } },
      })
      const callback = vi.fn()
      store.saveUserSettings(DOCTYPE, 'GridView', { columns: ['a'] }, callback)
      expect(callback).toHaveBeenCalled()
    })

    it('persists when the settings actually changed', () => {
      const store = seed(structuredClone(FIELDS), {
        userSettings: { GridView: { [DOCTYPE]: { columns: ['a'] } } },
      })
      const result = store.saveUserSettings(DOCTYPE, 'GridView', {
        columns: ['a', 'b'],
      })
      // A resource is returned only on the save path.
      expect(result).toBeTruthy()
      expect(result.options.url).toBe('frappe.model.utils.user_settings.save')
    })
  })

  describe('isTranslatable', () => {
    it('reports the flag from the doctype meta', () => {
      const store = seed(structuredClone(FIELDS), {
        translated: 1,
        dt: 'CRM Translated',
      })
      expect(store.isTranslatable()).toBe(1)
    })

    it('is falsy for an untranslated doctype', () => {
      const store = seed(structuredClone(FIELDS), { dt: 'CRM Plain' })
      expect(store.isTranslatable()).toBeFalsy()
    })

    it('is falsy for a doctype that was never loaded', () => {
      const store = seed(structuredClone(FIELDS))
      expect(store.isTranslatable('Nonexistent Doctype')).toBeFalsy()
    })
  })
})
