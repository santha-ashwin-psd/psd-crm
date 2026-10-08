import QuickFilterField from '@/components/QuickFilterField.vue'
import { mountComponent } from '../helpers/mount'

/**
 * The toolbar's quick filters. One component, five renderings chosen by the
 * field's type, all emitting the same `applyQuickFilter` event.
 */
const CONTROL_STUBS = {
  FormControl: {
    props: ['modelValue', 'type', 'placeholder', 'options'],
    template: `<div class="fc" :data-type="type" :data-placeholder="placeholder">
      <slot name="prefix" />
    </div>`,
  },
  Link: {
    props: ['value', 'doctype', 'placeholder'],
    template: '<div class="link-control" :data-doctype="doctype" />',
  },
  DatePicker: {
    props: ['value', 'placeholder'],
    template: '<div class="date-picker" />',
  },
  DateTimePicker: {
    props: ['value', 'placeholder'],
    template: '<div class="datetime-picker" />',
  },
}

function mountFilter(filter) {
  return mountComponent(QuickFilterField, {
    props: { filter: { label: 'Organization', value: '', ...filter } },
    global: { stubs: CONTROL_STUBS },
  })
}

describe('QuickFilterField', () => {
  describe('choosing a control for the field type', () => {
    it('renders a checkbox for Check', () => {
      expect(
        mountFilter({ fieldtype: 'Check' }).find('.fc').attributes('data-type'),
      ).toBe('checkbox')
    })

    it('renders a select for Select', () => {
      expect(
        mountFilter({ fieldtype: 'Select', options: ['A'] })
          .find('.fc')
          .attributes('data-type'),
      ).toBe('select')
    })

    it('renders the link control for Link, carrying the target doctype', () => {
      const wrapper = mountFilter({
        fieldtype: 'Link',
        options: 'CRM Organization',
      })
      expect(wrapper.find('.link-control').attributes('data-doctype')).toBe(
        'CRM Organization',
      )
    })

    it('renders a date picker for Date', () => {
      const wrapper = mountFilter({ fieldtype: 'Date' })
      expect(wrapper.find('.date-picker').exists()).toBe(true)
      expect(wrapper.find('.datetime-picker').exists()).toBe(false)
    })

    it('renders a datetime picker for Datetime', () => {
      const wrapper = mountFilter({ fieldtype: 'Datetime' })
      expect(wrapper.find('.datetime-picker').exists()).toBe(true)
    })

    it('falls back to a search box for anything else', () => {
      expect(
        mountFilter({ fieldtype: 'Data' }).find('.fc').attributes('data-type'),
      ).toBe('search')
    })

    it('treats a missing fieldtype as a search box', () => {
      expect(mountFilter({}).find('.fc').attributes('data-type')).toBe('search')
    })
  })

  describe('the search field', () => {
    it('carries a magnifier so it reads as search', () => {
      // The toolbar's free-text filter is the list's search box. FeatherIcon is
      // imported rather than globally registered, so the real glyph renders and
      // this asserts the actual svg, not a stub.
      const wrapper = mountFilter({ fieldtype: 'Data' })
      expect(wrapper.find('svg.feather-search').exists()).toBe(true)
    })

    it('does not put a magnifier on a select', () => {
      const wrapper = mountFilter({ fieldtype: 'Select', options: ['A'] })
      expect(wrapper.find('svg.feather-search').exists()).toBe(false)
    })

    it('uses the field label as the placeholder', () => {
      expect(
        mountFilter({ fieldtype: 'Data', label: 'Primary Email' })
          .find('.fc')
          .attributes('data-placeholder'),
      ).toBe('Primary Email')
    })
  })

  describe('emitting', () => {
    it('debounces typing rather than firing per keystroke', async () => {
      vi.useFakeTimers()
      const wrapper = mountFilter({ fieldtype: 'Data', fieldname: 'email' })

      wrapper.vm.debouncedFn(wrapper.props().filter, 'acme')
      expect(wrapper.emitted('applyQuickFilter')).toBeUndefined()

      vi.advanceTimersByTime(600)
      expect(wrapper.emitted('applyQuickFilter')[0][1]).toBe('acme')
      vi.useRealTimers()
    })

    it('applies a non-text filter immediately', () => {
      // Only free text is debounced; picking from a list is a deliberate act.
      const wrapper = mountFilter({ fieldtype: 'Select', options: ['Open'] })
      wrapper.vm.updateFilter(wrapper.props().filter, 'Open')
      expect(wrapper.emitted('applyQuickFilter')[0][1]).toBe('Open')
    })

    it('passes the filter itself alongside the value', () => {
      const wrapper = mountFilter({ fieldtype: 'Select', fieldname: 'status' })
      wrapper.vm.updateFilter(wrapper.props().filter, 'Open')
      expect(wrapper.emitted('applyQuickFilter')[0][0]).toMatchObject({
        fieldname: 'status',
      })
    })
  })
})

describe('QuickFilterField free-text search boxes', () => {
  // Browsers autofilled boxes labelled "Email Address" / "Phone" with the
  // user's own details, which applied (and saved) a filter by accident.
  const box = () =>
    mountFilter({
      fieldtype: 'Data',
      fieldname: 'email_id',
      label: 'Email Address',
    }).find('.fc')

  it('is a search input, which browsers do not autofill', () => {
    expect(box().attributes('data-type')).toBe('search')
  })

  it('carries a neutral name and opts out of autofill and password managers', () => {
    const attrs = box().attributes()
    expect(attrs.name).toBe('crm-quick-filter-email_id')
    expect(attrs.autocomplete).toBe('off')
    expect(attrs['data-lpignore']).toBe('true')
    expect('data-1p-ignore' in attrs).toBe(true)
  })
})
