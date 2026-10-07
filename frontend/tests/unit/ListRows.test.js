import ListRowsWrapper from '@/components/ListViews/ListRows.vue'
import { mountComponent } from '../helpers/mount'

/**
 * frappe-ui's ListRow reads an injected `list` context supplied by its own
 * ListView ancestor, so the primitives are stubbed. Stubs apply to children
 * only — the component under test is still the real one, even though it shares
 * the name `ListRows` with the frappe-ui child it renders.
 */
const STUBS = {
  ListRows: {
    name: 'ListRows',
    template: '<div class="flat-rows"><slot /></div>',
  },
  ListRow: {
    name: 'ListRow',
    props: ['row'],
    template: '<div class="row" :data-name="row.name"><slot /></div>',
  },
  ListGroupHeader: {
    name: 'ListGroupHeader',
    props: ['group'],
    template: '<div class="group-header"><slot /></div>',
  },
  ListGroupRows: {
    name: 'ListGroupRows',
    props: ['group'],
    template: '<div class="group-rows"><slot /></div>',
  },
}

function mountRows(rows, doctype = 'CRM Deal') {
  return mountComponent(ListRowsWrapper, {
    props: { rows, doctype },
    global: { stubs: STUBS },
  })
}

const FLAT = [{ name: 'DEAL-1' }, { name: 'DEAL-2' }]
const GROUPED = [
  { group: 'Open', label: 'Status', rows: [{ name: 'DEAL-1' }] },
  { group: 'Won', label: 'Status', rows: [{ name: 'DEAL-2' }, { name: 'DEAL-3' }] },
]

describe('ListRows', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('choosing flat or grouped', () => {
    it('renders a flat list of rows', () => {
      const wrapper = mountRows(FLAT)
      expect(wrapper.find('.flat-rows').exists()).toBe(true)
      expect(wrapper.findAll('.row')).toHaveLength(2)
      expect(wrapper.find('.group-header').exists()).toBe(false)
    })

    it('renders groups when every entry carries one', () => {
      const wrapper = mountRows(GROUPED)
      expect(wrapper.findAll('.group-header')).toHaveLength(2)
      expect(wrapper.findAll('.row')).toHaveLength(3)
    })

    it('falls back to flat when only some entries are grouped', () => {
      // A half-grouped payload is not a grouping; render it as a plain list.
      const wrapper = mountRows([GROUPED[0], { name: 'DEAL-9' }])
      expect(wrapper.find('.flat-rows').exists()).toBe(true)
    })

    it('falls back to flat when a group has no rows array', () => {
      const wrapper = mountRows([{ group: 'Open', label: 'Status' }])
      expect(wrapper.find('.flat-rows').exists()).toBe(true)
    })

    it('takes the grouped branch for an empty list', () => {
      // Quirk worth knowing: `[].every()` is vacuously true, so zero rows reads
      // as "all grouped". Harmless — both branches render nothing — but it does
      // mean the flat scroll container is not mounted, so there is no scroll
      // position to restore until rows arrive.
      const wrapper = mountRows([])
      expect(wrapper.find('.flat-rows').exists()).toBe(false)
      expect(wrapper.findAll('.row')).toHaveLength(0)
    })
  })

  describe('group headers', () => {
    it('labels each group with its field and value', () => {
      const text = mountRows(GROUPED).findAll('.group-header')[0].text()
      expect(text).toContain('Status')
      expect(text).toContain('Open')
    })

    it('reads a blank group as Empty rather than showing nothing', () => {
      const wrapper = mountRows([
        { group: ' ', label: 'Status', rows: [{ name: 'DEAL-1' }] },
      ])
      expect(wrapper.find('.group-header').text()).toContain('Empty')
    })

    it('renders a group icon when one is supplied', () => {
      const wrapper = mountRows([
        {
          group: 'Open',
          label: 'Status',
          icon: { template: '<i class="group-icon" />' },
          rows: [{ name: 'DEAL-1' }],
        },
      ])
      expect(wrapper.find('.group-icon').exists()).toBe(true)
    })
  })

  describe('reacting to new data', () => {
    it('re-renders when the rows prop changes', async () => {
      const wrapper = mountRows(FLAT)
      await wrapper.setProps({ rows: [{ name: 'DEAL-9' }] })
      expect(wrapper.findAll('.row')).toHaveLength(1)
      expect(wrapper.find('.row').attributes('data-name')).toBe('DEAL-9')
    })

    it('switches from flat to grouped when the shape changes', async () => {
      const wrapper = mountRows(FLAT)
      await wrapper.setProps({ rows: GROUPED })
      expect(wrapper.findAll('.group-header')).toHaveLength(2)
    })
  })

  describe('scroll position', () => {
    it('remembers position per doctype, so lists do not share one', () => {
      mountRows(FLAT, 'CRM Deal')
      mountRows(FLAT, 'CRM Lead')
      expect(localStorage.getItem('scrollPositionCRM Deal')).not.toBeNull()
      expect(localStorage.getItem('scrollPositionCRM Lead')).not.toBeNull()
    })

    it('starts at the top when nothing was stored', () => {
      mountRows(FLAT, 'CRM Deal')
      expect(localStorage.getItem('scrollPositionCRM Deal')).toBe('0')
    })
  })
})
