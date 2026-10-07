const api = vi.hoisted(() => ({
  doc: null,
  save: null,
  triggerOnChange: null,
  triggerButton: null,
  isManager: true,
  isMobileView: null,
  overrides: undefined,
}))

vi.mock('@/data/document', async () => {
  const { reactive } = await import('vue')
  return {
    useDocument: () => {
      api.save = { submit: vi.fn() }
      api.doc = reactive({
        doc: { name: 'DEAL-1', status: 'Open', deal_owner: 'ada@x.com' },
        save: api.save,
        get fieldPropertyOverrides() {
          return api.overrides
        },
      })
      return {
        document: api.doc,
        triggerOnChange: api.triggerOnChange,
        triggerButton: api.triggerButton,
      }
    },
  }
})

vi.mock('@/stores/users', () => ({
  usersStore: () => ({
    users: { data: { crmUsers: [{ name: 'ada@x.com' }, { name: 'grace@x.com' }] } },
    isManager: () => api.isManager,
    getUser: (e) => ({ name: e, full_name: e === 'ada@x.com' ? 'Ada' : e }),
  }),
}))

vi.mock('@/composables/settings', async () => {
  const { ref } = await import('vue')
  api.isMobileView = ref(false)
  return {
    isMobileView: api.isMobileView,
    showSettings: ref(false),
    activeSettingsPage: ref(''),
    disableSettingModalOutsideClick: ref(false),
  }
})

vi.mock('@/stores/meta', () => ({
  getMeta: () => ({
    getFormattedPercent: (f, d) => `${d[f]}%`,
    getFormattedFloat: (f, d) => String(d[f]),
    getFormattedCurrency: (f, d) => `$${d[f]}`,
    getFields: () => [],
  }),
}))

import SidePanelLayout from '@/components/SidePanelLayout.vue'
import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'

const quiet = { inheritAttrs: false, template: '<div><slot /></div>' }
const STUBS = {
  // Renders #actions and the default slot: the edit button and every field
  // live inside them, and a slot-less stub would hide the entire panel.
  CollapsibleSection: {
    name: 'CollapsibleSectionStub',
    inheritAttrs: false,
    props: ['label', 'hideLabel', 'opened'],
    template: '<div><slot name="actions" /><slot /></div>',
  },
  FadedScrollableDiv: { ...quiet, name: 'FadedScrollableDivStub' },
  Tooltip: { ...quiet, name: 'TooltipStub' },
  FeatherIcon: {
    name: 'FeatherIconStub',
    inheritAttrs: false,
    props: ['name'],
    template: '<i />',
  },
  Link: { ...quiet, name: 'LinkStub' },
  UserAvatar: { ...quiet, name: 'UserAvatarStub' },
  PrimaryDropdown: { ...quiet, name: 'PrimaryDropdownStub' },
  SidePanelModal: { ...quiet, name: 'SidePanelModalStub' },
  ButtonControl: { ...quiet, name: 'ButtonControlStub' },
  HtmlControl: { ...quiet, name: 'HtmlControlStub' },
  GeolocationControl: { ...quiet, name: 'GeolocationControlStub' },
  TextEditorControl: { ...quiet, name: 'TextEditorControlStub' },
  DateTimePicker: { ...quiet, name: 'S1' },
  DatePicker: { ...quiet, name: 'S2' },
  TimePicker: { ...quiet, name: 'S3' },
  EditIcon: { ...quiet, name: 'S4' },
  ArrowUpRightIcon: { ...quiet, name: 'S5' },
}

const field = (over = {}) => ({
  fieldname: 'status',
  label: 'Status',
  fieldtype: 'Data',
  ...over,
})

const section = (fields, over = {}) => ({
  name: 'sec',
  label: 'Details',
  opened: true,
  columns: [{ name: 'col', fields }],
  ...over,
})

describe('SidePanelLayout', () => {
  const mount = (sections = [], props = {}, extra = {}) =>
    mountComponent(SidePanelLayout, {
      props: { sections, doctype: 'CRM Deal', docname: 'DEAL-1', ...props },
      global: { stubs: STUBS },
      ...extra,
    })

  beforeEach(() => {
    api.isManager = true
    api.isMobileView.value = false
    api.overrides = undefined
    api.triggerOnChange = vi.fn(async () => {})
    api.triggerButton = vi.fn(async () => {})
    window.sysdefaults = { hide_empty_read_only_fields: 1 }
  })

  describe('parsing a field', () => {
    const parse = (f, sections) => mount(sections || []).vm.parsedField(f)

    it('does not touch the layout it was given', () => {
      // The layout is cached and shared; parsing must not write into it.
      const original = field({ label: 'Status' })
      const copy = { ...original }
      parse(original)
      expect(original).toEqual(copy)
    })

    it('falls back to the label for a placeholder', () => {
      expect(parse(field()).placeholder).toBe('Status')
    })

    it('keeps an explicit placeholder', () => {
      expect(parse(field({ placeholder: 'Pick one' })).placeholder).toBe(
        'Pick one',
      )
    })

    it('splits select options into a list', () => {
      const parsed = parse(
        field({ fieldtype: 'Select', options: 'Open\nWon', reqd: 1 }),
      )
      expect(parsed.options).toEqual([
        { label: 'Open', value: 'Open' },
        { label: 'Won', value: 'Won' },
      ])
    })

    it('offers a blank option for an optional select', () => {
      // Otherwise the field cannot be cleared once set.
      const parsed = parse(field({ fieldtype: 'Select', options: 'Open\nWon' }))
      expect(parsed.options[0]).toEqual({ label: '', value: '' })
    })

    it('does not add a second blank when the list already starts with one', () => {
      const parsed = parse(field({ fieldtype: 'Select', options: '\nOpen' }))
      expect(parsed.options.filter((o) => o.value === '')).toHaveLength(1)
    })

    it('leaves an already-parsed option list alone', () => {
      const parsed = parse(
        field({ fieldtype: 'Select', options: [{ label: 'Open', value: 'Open' }] }),
      )
      expect(parsed.options).toEqual([{ label: 'Open', value: 'Open' }])
    })

    it('turns a link to User into a user picker', () => {
      const parsed = parse(field({ fieldtype: 'Link', options: 'User' }))
      expect(parsed.fieldtype).toBe('User')
      expect(JSON.parse(parsed.link_filters).name).toEqual([
        'in',
        ['ada@x.com', 'grace@x.com'],
      ])
    })

    it('keeps the filters the field already had', () => {
      const parsed = parse(
        field({
          fieldtype: 'Link',
          options: 'User',
          link_filters: '{"enabled":1}',
        }),
      )
      expect(JSON.parse(parsed.link_filters).enabled).toBe(1)
    })

    it('leaves a link to anything else as a link', () => {
      expect(parse(field({ fieldtype: 'Link', options: 'Contact' })).fieldtype).toBe(
        'Link',
      )
    })

    describe('read-only', () => {
      it('honours the flag on the field', () => {
        expect(parse(field({ read_only: 1 })).read_only).toBe(1)
      })

      it('applies a depends-on condition', () => {
        api.doc = null
        const wrapper = mount([])
        wrapper.vm.doc.status = 'Won'
        expect(
          wrapper.vm.parsedField(
            field({ read_only_depends_on: 'eval:doc.status == "Won"' }),
          ).read_only,
        ).toBe(true)
      })

      it('lets a condition that stops holding make the field editable again', () => {
        // Regression: the parsed field used to be written back into the
        // layout, so `read_only` — the *result* of the condition — became the
        // field's own flag and every later pass OR'd against it. A field that
        // went read-only once stayed locked for the rest of the page's life.
        const f = field({ read_only_depends_on: 'eval:doc.status == "Won"' })
        const s = section([f])
        const wrapper = mount([s])

        wrapper.vm.doc.status = 'Won'
        expect(wrapper.vm._sections[0].columns[0].fields[0].read_only).toBe(true)

        wrapper.vm.doc.status = 'Open'
        expect(wrapper.vm._sections[0].columns[0].fields[0].read_only).toBe(false)
      })

      it('lets a script override win over the condition', () => {
        api.overrides = { status: { read_only: false } }
        const wrapper = mount([])
        wrapper.vm.doc.status = 'Won'
        expect(
          wrapper.vm.parsedField(
            field({ read_only_depends_on: 'eval:doc.status == "Won"' }),
          ).read_only,
        ).toBe(false)
      })

      it('lets a script override make a plain field read-only', () => {
        api.overrides = { status: { read_only: true } }
        expect(mount([]).vm.parsedField(field()).read_only).toBe(true)
      })
    })

    it('merges other script overrides onto the field', () => {
      api.overrides = { status: { label: 'Stage' } }
      expect(mount([]).vm.parsedField(field()).label).toBe('Stage')
    })
  })

  describe('deciding whether a field shows', () => {
    const visible = (f, sections) =>
      mount(sections || []).vm.parsedField(f).visible

    it('shows an ordinary editable field', () => {
      expect(visible(field())).toBe(true)
    })

    it('hides a field marked hidden', () => {
      expect(visible(field({ hidden: 1 }))).toBe(false)
    })

    it('hides a read-only field with nothing in it', () => {
      // An empty read-only row is noise; there is nothing to read and nothing
      // to do with it.
      expect(visible(field({ fieldname: 'blank', read_only: 1 }))).toBe(false)
    })

    it('shows a read-only field that has a value', () => {
      expect(visible(field({ fieldname: 'status', read_only: 1 }))).toBe(true)
    })

    it('shows an empty read-only field when the site says to', () => {
      window.sysdefaults = { hide_empty_read_only_fields: 0 }
      expect(visible(field({ fieldname: 'blank', read_only: 1 }))).toBe(true)
    })

    it('always shows a checkbox, empty or not', () => {
      // False is a real value, so an unticked box is not "empty".
      expect(visible(field({ fieldname: 'blank', fieldtype: 'Check', read_only: 1 }))).toBe(
        true,
      )
    })

    it('always shows a button', () => {
      expect(
        visible(field({ fieldname: 'blank', fieldtype: 'Button', read_only: 1 })),
      ).toBe(true)
    })

    it('hides a field whose depends-on does not hold', () => {
      expect(visible(field({ depends_on: 'eval:doc.status == "Won"' }))).toBe(false)
    })

    it('shows it once the condition holds', () => {
      const wrapper = mount([])
      wrapper.vm.doc.status = 'Won'
      expect(
        wrapper.vm.parsedField(field({ depends_on: 'eval:doc.status == "Won"' }))
          .visible,
      ).toBe(true)
    })

    it('reports a plain boolean, never a truthy string', () => {
      // The result is counted to decide whether a whole section renders.
      expect(typeof visible(field({ depends_on: 'doc.status' }))).toBe('boolean')
    })

    it('shows everything in preview mode', () => {
      const wrapper = mount([], { preview: true })
      expect(wrapper.vm.parsedField(field({ hidden: 1 })).visible).toBe(true)
    })

    it('lets a script hide a field outright', () => {
      api.overrides = { status: { hidden: true } }
      expect(mount([]).vm.parsedField(field()).visible).toBe(false)
    })

    it('lets a script show a field the rules would hide', () => {
      api.overrides = { status: { hidden: false } }
      expect(mount([]).vm.parsedField(field({ hidden: 1 })).visible).toBe(true)
    })
  })

  describe('deciding whether a section shows', () => {
    it('shows a section with at least one visible field', () => {
      expect(mount([section([field()])]).vm._sections[0].visible).toBe(true)
    })

    it('hides a section whose fields are all hidden', () => {
      expect(
        mount([section([field({ hidden: 1 })])]).vm._sections[0].visible,
      ).toBe(false)
    })

    it('always shows the contacts section', () => {
      // Its content comes from a slot, not from fields.
      const s = section([], { name: 'contacts_section' })
      expect(mount([s]).vm._sections[0].visible).toBe(true)
    })

    it('survives a section saved with no columns', () => {
      // Regression: panel layouts are user-editable and a section can be left
      // with none; this used to throw and take the whole panel down.
      const s = { name: 'sec', label: 'Empty', columns: [] }
      expect(() => mount([s])).not.toThrow()
      expect(mount([s]).vm._sections[0].visible).toBe(false)
    })

    it('survives a column with no fields', () => {
      const s = { name: 'sec', label: 'Empty', columns: [{ name: 'col' }] }
      expect(() => mount([s])).not.toThrow()
    })

    it('reports a plain boolean', () => {
      expect(typeof mount([section([field()])]).vm._sections[0].visible).toBe(
        'boolean',
      )
    })

    it('lets a script hide a whole section', () => {
      api.overrides = { sec: { hidden: true } }
      expect(mount([section([field()])]).vm._sections[0].visible).toBe(false)
    })

    it('renders nothing when there are no sections', () => {
      expect(mount([]).vm._sections).toEqual([])
    })
  })

  describe('the edit button', () => {
    it('appears on the first eligible section only', () => {
      // One entry point per panel; a button on every section is clutter.
      const sections = [
        { ...section([field()]), name: 'a' },
        { ...section([field()]), name: 'b' },
      ]
      const parsed = mount(sections).vm._sections
      expect(parsed.map((s) => s.showEditButton)).toEqual([true, false])
    })

    it('never appears on the contacts section', () => {
      const sections = [
        { ...section([field()]), name: 'contacts_section' },
        { ...section([field()]), name: 'b' },
      ]
      const parsed = mount(sections).vm._sections
      expect(parsed.map((s) => s.showEditButton)).toEqual([false, true])
    })

    it('is hidden from non-managers', () => {
      api.isManager = false
      expect(mount([section([field()])]).vm._sections[0].showEditButton).toBe(
        false,
      )
    })

    it('is hidden on mobile', async () => {
      api.isMobileView.value = true
      await nextTick()
      expect(mount([section([field()])]).vm._sections[0].showEditButton).toBe(
        false,
      )
    })

    it('opens the layout editor', async () => {
      const wrapper = mount([section([field()])])
      await wrapper.find('button').trigger('click')
      expect(wrapper.vm.showSidePanelModal).toBe(true)
    })

    it('is not offered in preview mode', () => {
      const wrapper = mount([section([field()])], { preview: true })
      expect(wrapper.findAll('button')).toHaveLength(0)
    })
  })

  describe('changing a field', () => {
    it('runs the doctype script before saving', () => {
      const wrapper = mount([section([field()])])
      wrapper.vm.fieldChange('Won', field())
      expect(api.triggerOnChange).toHaveBeenCalledWith('status', 'Won')
    })

    it('saves the document', async () => {
      const wrapper = mount([section([field()])])
      await wrapper.vm.fieldChange('Won', field())
      expect(api.save.submit).toHaveBeenCalled()
    })

    it('changes nothing in preview mode', async () => {
      const wrapper = mount([section([field()])], { preview: true })
      await wrapper.vm.fieldChange('Won', field())
      expect(api.triggerOnChange).not.toHaveBeenCalled()
      expect(api.save.submit).not.toHaveBeenCalled()
    })

    it('hands the change to the parent when it wants to own the save', async () => {
      // Quick-entry and conversion flows batch changes instead of saving each.
      const wrapper = mount([section([field()])], {}, {
        attrs: { onBeforeFieldChange: () => {} },
      })
      await wrapper.vm.fieldChange('Won', field())
      expect(wrapper.emitted('beforeFieldChange').at(-1)).toEqual([
        { status: 'Won' },
      ])
      expect(api.save.submit).not.toHaveBeenCalled()
    })

    it('marks the field as saving', async () => {
      const wrapper = mount([section([field()])])
      await wrapper.vm.fieldChange('Won', field())
      expect(wrapper.vm.activeFieldSaving).toBe('status')
    })

    it('clears any previous error for the field', async () => {
      const wrapper = mount([section([field()])])
      wrapper.vm.fieldErrors.status = 'Old failure'
      await wrapper.vm.fieldChange('Won', field())
      expect(wrapper.vm.fieldErrors.status).toBeUndefined()
    })

    describe('once the save comes back', () => {
      const settle = async (outcome, err) => {
        const wrapper = mount([section([field()])])
        await wrapper.vm.fieldChange('Won', field())
        api.save.submit.mock.calls.at(-1)[1][outcome](err)
        await nextTick()
        return wrapper
      }

      it('stops showing it as saving', async () => {
        const wrapper = await settle('onSuccess')
        expect(wrapper.vm.activeFieldSaving).toBe('')
      })

      it('ticks the field', async () => {
        const wrapper = await settle('onSuccess')
        expect(wrapper.vm.showSuccessCheck).toBe('status')
      })

      it('announces the change', async () => {
        const wrapper = await settle('onSuccess')
        expect(wrapper.emitted('afterFieldChange').at(-1)).toEqual([
          { status: 'Won' },
        ])
      })

      it('clears the tick after a moment', async () => {
        vi.useFakeTimers()
        const wrapper = mount([section([field()])])
        await wrapper.vm.fieldChange('Won', field())
        api.save.submit.mock.calls.at(-1)[1].onSuccess()
        expect(wrapper.vm.showSuccessCheck).toBe('status')
        vi.advanceTimersByTime(2000)
        expect(wrapper.vm.showSuccessCheck).toBe('')
        vi.useRealTimers()
      })

      it('leaves a newer tick alone', async () => {
        // Two fields saved in quick succession: the first field's timer must
        // not clear the second field's tick.
        vi.useFakeTimers()
        const wrapper = mount([section([field()])])
        await wrapper.vm.fieldChange('Won', field())
        api.save.submit.mock.calls.at(-1)[1].onSuccess()
        wrapper.vm.showSuccessCheck = 'deal_owner'
        vi.advanceTimersByTime(2000)
        expect(wrapper.vm.showSuccessCheck).toBe('deal_owner')
        vi.useRealTimers()
      })

      it('stops showing it as saving after a failure', async () => {
        const wrapper = await settle('onError', new Error('nope'))
        expect(wrapper.vm.activeFieldSaving).toBe('')
      })

      it('shows why it failed against the field', async () => {
        const wrapper = await settle('onError', new Error('Status is locked'))
        expect(wrapper.vm.fieldErrors.status).toBe('Status is locked')
      })

      it('reads a Frappe error rather than printing an object', async () => {
        // Regression: the fallback was `err?.message || err`, which put the
        // error object itself under the field as "[object Object]".
        const wrapper = await settle('onError', {
          messages: ['Status cannot be changed after closing'],
        })
        expect(wrapper.vm.fieldErrors.status).toBe(
          'Status cannot be changed after closing',
        )
      })

      it('says something when the error carries no text', async () => {
        const wrapper = await settle('onError', {})
        expect(wrapper.vm.fieldErrors.status).toBe('Failed to save field value')
      })
    })
  })

  describe('buttons in the panel', () => {
    it('runs the field-supplied handler', async () => {
      const click = vi.fn()
      await mount([]).vm.handleButtonClick(field({ fieldtype: 'Button', click }))
      expect(click).toHaveBeenCalled()
      expect(api.triggerButton).not.toHaveBeenCalled()
    })

    it('falls back to the doctype script', async () => {
      await mount([]).vm.handleButtonClick(field({ fieldtype: 'Button' }))
      expect(api.triggerButton).toHaveBeenCalledWith('status')
    })

    it('does nothing in preview mode', async () => {
      const click = vi.fn()
      const wrapper = mount([], { preview: true })
      await wrapper.vm.handleButtonClick(field({ click }))
      expect(click).not.toHaveBeenCalled()
    })
  })

  describe('external links', () => {
    it('recognises an http address', () => {
      const wrapper = mount([])
      expect(wrapper.vm.isExternalUrl('https://example.com')).toBe(true)
      expect(wrapper.vm.isExternalUrl('  http://example.com  ')).toBe(true)
    })

    it('does not treat ordinary text as a link', () => {
      const wrapper = mount([])
      expect(wrapper.vm.isExternalUrl('example.com')).toBe(false)
      expect(wrapper.vm.isExternalUrl('')).toBe(false)
      expect(wrapper.vm.isExternalUrl(null)).toBe(false)
      expect(wrapper.vm.isExternalUrl(42)).toBe(false)
    })

    it('opens one without handing over the opener', () => {
      const open = vi.spyOn(window, 'open').mockImplementation(() => {})
      mount([]).vm.openExternalUrl('  https://example.com ')
      expect(open).toHaveBeenCalledWith(
        'https://example.com',
        '_blank',
        'noopener,noreferrer',
      )
      open.mockRestore()
    })
  })

  describe('the leading icon', () => {
    const icon = (f) => mount([]).vm.iconForField(f)

    it('matches on what the field means before what it stores', () => {
      // Panels are user-configurable, so a custom "Work Email" Data field
      // should still get an envelope.
      expect(icon({ fieldname: 'email_id', fieldtype: 'Data' })).toBe('mail')
      expect(icon({ fieldname: 'custom', label: 'E-Mail' })).toBe('mail')
      expect(icon({ fieldname: 'mobile_no' })).toBe('phone')
      expect(icon({ fieldname: 'website' })).toBe('globe')
      expect(icon({ fieldname: 'organization' })).toBe('briefcase')
      expect(icon({ fieldname: 'territory' })).toBe('map-pin')
      expect(icon({ fieldname: 'industry' })).toBe('layers')
      expect(icon({ fieldname: 'no_of_employees' })).toBe('users')
      expect(icon({ fieldname: 'deal_owner' })).toBe('user')
      expect(icon({ fieldname: 'status' })).toBe('activity')
      expect(icon({ fieldname: 'source' })).toBe('git-branch')
      expect(icon({ fieldname: 'annual_revenue' })).toBe('dollar-sign')
      expect(icon({ fieldname: 'probability' })).toBe('percent')
      expect(icon({ fieldname: 'closure_date' })).toBe('calendar')
      expect(icon({ fieldname: 'notes' })).toBe('file-text')
    })

    it('falls back to the field type', () => {
      expect(icon({ fieldname: 'custom_x', fieldtype: 'Check' })).toBe(
        'check-square',
      )
      expect(icon({ fieldname: 'custom_x', fieldtype: 'Rating' })).toBe('star')
    })

    it('falls back again for a type it does not know', () => {
      expect(icon({ fieldname: 'custom_x', fieldtype: 'Barcode' })).toBe('circle')
    })

    it('copes with a field that has neither name nor label', () => {
      expect(() => icon({})).not.toThrow()
    })
  })

  describe('the divider between sections', () => {
    it('is not drawn above the first visible section', () => {
      const sections = [
        { ...section([field({ hidden: 1 })]), name: 'a' },
        { ...section([field()]), name: 'b' },
      ]
      expect(mount(sections).vm.firstVisibleIndex()).toBe(1)
    })

    it('reports none when nothing is visible', () => {
      expect(
        mount([section([field({ hidden: 1 })])]).vm.firstVisibleIndex(),
      ).toBe(-1)
    })
  })

  describe('rendering', () => {
    it('draws a row per visible field', () => {
      const wrapper = mount([
        section([field(), field({ fieldname: 'deal_owner', label: 'Owner' })]),
      ])
      expect(wrapper.findAll('.field')).toHaveLength(2)
    })

    it('leaves out the hidden ones', () => {
      const wrapper = mount([section([field(), field({ hidden: 1 })])])
      expect(wrapper.findAll('.field')).toHaveLength(1)
    })

    it('marks a mandatory field', () => {
      const wrapper = mount([section([field({ reqd: 1 })])])
      expect(wrapper.find('.field').text()).toContain('*')
    })

    it('marks a field made mandatory by a condition', () => {
      const wrapper = mount([
        section([
          field({ mandatory_depends_on: 'eval:doc.status == "Open"' }),
        ]),
      ])
      expect(wrapper.find('.field').text()).toContain('*')
    })

    it('draws no section when none is visible', () => {
      const wrapper = mount([section([field({ hidden: 1 })])])
      expect(wrapper.findAll('.section')).toHaveLength(0)
    })

    it('renders with no document name', () => {
      // The panel is mounted in preview before a record exists.
      expect(() =>
        mountComponent(SidePanelLayout, {
          props: { sections: [section([field()])], docname: '', preview: true },
          global: { stubs: STUBS },
        }),
      ).not.toThrow()
    })
  })
})
