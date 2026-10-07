const api = vi.hoisted(() => ({ user: 'ada@x.com', translatable: false }))

vi.mock('@/stores/session', () => ({
  sessionStore: () => ({ user: api.user }),
}))

vi.mock('@/stores/settings', async () => {
  const { ref } = await import('vue')
  return {
    getSettings: () => ({ brand: ref({}), _settings: { doc: {} } }),
    isTranslatable: () => api.translatable,
  }
})

vi.mock('@/utils', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, isTranslatable: () => api.translatable }
})

const ROUTE = vi.hoisted(() => ({
  name: 'Deals',
  params: {},
  query: {},
  hash: '',
}))
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useRoute: () => ROUTE }
})

import DealsListView from '@/components/ListViews/DealsListView.vue'
import LeadsListView from '@/components/ListViews/LeadsListView.vue'
import ContactsListView from '@/components/ListViews/ContactsListView.vue'
import OrganizationsListView from '@/components/ListViews/OrganizationsListView.vue'
import TasksListView from '@/components/ListViews/TasksListView.vue'
import CallLogsListView from '@/components/ListViews/CallLogsListView.vue'
import LinkedDocsListView from '@/components/ListViews/LinkedDocsListView.vue'
import { mountComponent } from '../helpers/mount'

const STUBS = {
  ListView: true,
  ListHeader: true,
  ListHeaderItem: true,
  ListRowItem: true,
  ListSelectBanner: true,
  ListRows: true,
  ListBulkActions: true,
  ListPagination: true,
  Dropdown: true,
  Tooltip: true,
  Avatar: true,
  MultipleAvatar: true,
  RatingInput: true,
  HeartIcon: true,
  IndicatorIcon: true,
  PhoneIcon: true,
}

const VIEWS = [
  ['DealsListView', DealsListView],
  ['LeadsListView', LeadsListView],
  ['ContactsListView', ContactsListView],
  ['OrganizationsListView', OrganizationsListView],
  ['TasksListView', TasksListView],
  ['CallLogsListView', CallLogsListView],
]

const mount = (Component, props = {}) =>
  mountComponent(Component, {
    props: {
      rows: [],
      columns: [],
      modelValue: 20,
      list: { params: { filters: {} } },
      ...props,
    },
    global: { stubs: STUBS, mocks: { $route: ROUTE } },
  })

describe('the shared list-view helpers', () => {
  beforeEach(() => {
    api.user = 'ada@x.com'
    api.translatable = false
  })

  describe.each(VIEWS)('%s', (_name, Component) => {
    describe('column widths', () => {
      it('applies a resize to the column', () => {
        const wrapper = mount(Component)
        const column = { key: 'name', width: '10rem' }
        wrapper.vm.onColumnWidthUpdated({ width: '20rem', save: false }, column)
        expect(column.width).toBe('20rem')
      })

      it('persists it only when asked', () => {
        // Dragging fires continuously; only the drop should hit the server.
        const wrapper = mount(Component)
        wrapper.vm.onColumnWidthUpdated(
          { width: '20rem', save: false },
          { key: 'a' },
        )
        expect(wrapper.emitted('columnWidthUpdated')).toBeUndefined()

        wrapper.vm.onColumnWidthUpdated(
          { width: '20rem', save: true },
          { key: 'a' },
        )
        expect(wrapper.emitted('columnWidthUpdated')).toHaveLength(1)
      })
    })

    describe('cell labels', () => {
      it('passes an ordinary value through', () => {
        const wrapper = mount(Component)
        expect(wrapper.vm.getLabel('Acme', { type: 'Data' })).toBe('Acme')
      })

      it('translates a value whose doctype is translatable', () => {
        api.translatable = true
        const wrapper = mount(Component)
        expect(
          wrapper.vm.getLabel('Open', {
            type: 'Select',
            options: 'CRM Deal Status',
          }),
        ).toBe('Open')
      })

      it('leaves a value alone when its doctype is not translatable', () => {
        const wrapper = mount(Component)
        expect(
          wrapper.vm.getLabel('Open', {
            type: 'Select',
            options: 'CRM Deal Status',
          }),
        ).toBe('Open')
      })

      it('does not try to translate a column with no options', () => {
        api.translatable = true
        const wrapper = mount(Component)
        expect(wrapper.vm.getLabel('Acme', { type: 'Data' })).toBe('Acme')
      })
    })

    describe('the liked filter', () => {
      it('is off by default', () => {
        expect(mount(Component).vm.isLikeFilterApplied).toBe(false)
      })

      it('is on when the list is filtered by liker', () => {
        const wrapper = mount(Component, {
          list: { params: { filters: { _liked_by: '["ada@x.com"]' } } },
        })
        expect(wrapper.vm.isLikeFilterApplied).toBe(true)
      })

      it('copes with a list that has no params yet', () => {
        const wrapper = mount(Component, { list: {} })
        expect(wrapper.vm.isLikeFilterApplied).toBe(false)
      })
    })

    describe('whether a row is liked', () => {
      it('is true when the current user is in the list', () => {
        const wrapper = mount(Component)
        expect(wrapper.vm.isLiked('["ada@x.com","grace@x.com"]')).toBe(true)
      })

      it('is false when they are not', () => {
        const wrapper = mount(Component)
        expect(wrapper.vm.isLiked('["grace@x.com"]')).toBe(false)
      })

      it('is false for an empty list', () => {
        const wrapper = mount(Component)
        expect(wrapper.vm.isLiked('[]')).toBe(false)
      })

      it('says nothing for a row with no likers recorded', () => {
        // The field is only populated once someone likes the record.
        const wrapper = mount(Component)
        expect(wrapper.vm.isLiked('')).toBeUndefined()
        expect(wrapper.vm.isLiked(undefined)).toBeUndefined()
      })
    })
  })

  describe('duration columns', () => {
    // Five of the six format durations here. Call logs do not, and that is
    // correct rather than an omission: `crm_call_log.py` pre-formats the field
    // into `_duration` with `seconds_to_duration`, and `utils/callLog.js`
    // renders that string — so raw seconds never reach getLabel there.
    const FORMATTING = VIEWS.filter(([name]) => name !== 'CallLogsListView')

    it.each(FORMATTING)('%s formats raw seconds', (_name, Component) => {
      expect(
        mount(Component).vm.getLabel(3661, { type: 'Duration' }),
      ).toContain('1h')
    })

    it('CallLogsListView leaves the value alone, having been formatted already', () => {
      expect(
        mount(CallLogsListView).vm.getLabel('1h 1m 1s', { type: 'Duration' }),
      ).toBe('1h 1m 1s')
    })
  })

  describe('page size', () => {
    it.each(VIEWS)('%s reports a change', async (_name, Component) => {
      const wrapper = mount(Component)
      await wrapper.setProps({ modelValue: 50 })
      expect(wrapper.emitted('updatePageCount').at(-1)).toEqual([50])
    })

    it.each(VIEWS)('%s ignores a no-op change', async (_name, Component) => {
      const wrapper = mount(Component)
      await wrapper.setProps({ modelValue: 20 })
      expect(wrapper.emitted('updatePageCount')).toBeUndefined()
    })
  })
})

describe('status colours', () => {
  // The four bespoke per-view colour maps these used to test
  // (contactStatusColor, orgStatusColor, taskStatusColorClass,
  // callStatusColorClass) are gone. Every list now renders its status through
  // the shared StatusBadge, which takes its tone from utils/statusTheme — so
  // the behaviour worth asserting here is that each view actually delegates,
  // rather than that it owns a colour table. The tone mapping itself is
  // covered exhaustively in statusTheme.test.js.

  it.each([
    ['contacts', ContactsListView],
    ['organizations', OrganizationsListView],
    ['tasks', TasksListView],
    ['call logs', CallLogsListView],
  ])('%s renders statuses through the shared badge', (_name, Component) => {
    const wrapper = mount(Component)
    expect(wrapper.vm.$options.components?.StatusBadge ?? true).toBeTruthy()
    // No view may reintroduce a private colour map.
    for (const gone of [
      'contactStatusColor',
      'orgStatusColor',
      'taskStatusColorClass',
      'callStatusColorClass',
    ]) {
      expect(wrapper.vm[gone]).toBeUndefined()
    }
  })
})

describe('LinkedDocsListView', () => {
  const mount = () =>
    mountComponent(LinkedDocsListView, {
      props: {
        rows: [],
        columns: [],
        linkedDocsResource: { data: [], reload: vi.fn() },
        unlinkLinkedDoc: vi.fn(),
      },
      global: { stubs: STUBS },
    })

  let open

  beforeEach(() => {
    open = vi.spyOn(window, 'open').mockImplementation(() => {})
  })

  afterEach(() => open.mockRestore())

  const view = (reference_doctype, reference_docname = 'REC-1') =>
    mount().vm.viewLinkedDoc({ reference_doctype, reference_docname })

  describe('opening a linked record', () => {
    it.each([
      ['CRM Lead', '/leads/REC-1'],
      ['CRM Deal', '/deals/REC-1'],
      ['Contact', '/contacts/REC-1'],
      ['CRM Organization', '/organizations/REC-1'],
    ])('sends %s to its own page', (doctype, expected) => {
      view(doctype)
      expect(open).toHaveBeenCalledWith(expected)
    })

    it.each([
      ['CRM Call Log', '/call-logs/view?open=REC-1'],
      ['CRM Task', '/tasks/view?open=REC-1'],
      ['FCRM Note', '/notes/view?open=REC-1'],
    ])('deep-links %s, which opens in a modal', (doctype, expected) => {
      view(doctype)
      expect(open).toHaveBeenCalledWith(expected)
    })

    it('sends a notification to the desk, which is the only place it renders', () => {
      view('CRM Notification')
      expect(open).toHaveBeenCalledWith('/app/crm-notification/REC-1')
    })

    it('opens nothing for a doctype it does not know', () => {
      // Regression: `get_linked_docs` returns any linking doctype —
      // Communication, ToDo, File — and the default branch left both parts
      // empty, opening a blank tab at `//`.
      view('Communication')
      expect(open).not.toHaveBeenCalled()
    })

    it('opens nothing for a row with no record name', () => {
      mount().vm.viewLinkedDoc({ reference_doctype: 'CRM Lead' })
      expect(open).not.toHaveBeenCalled()
    })
  })

  describe('naming a doctype for display', () => {
    it('drops the CRM prefix', () => {
      expect(mount().vm.getDoctypeName('CRM Deal')).toBe('Deal')
    })

    it('drops the FCRM prefix', () => {
      expect(mount().vm.getDoctypeName('FCRM Note')).toBe('Note')
    })

    it('leaves an unprefixed doctype alone', () => {
      expect(mount().vm.getDoctypeName('Contact')).toBe('Contact')
    })

    it('does not strip a prefix from the middle of a name', () => {
      expect(mount().vm.getDoctypeName('Sales CRM Thing')).toBe(
        'Sales CRM Thing',
      )
    })
  })

  describe('column widths', () => {
    it('persists a resize only when asked', () => {
      const wrapper = mount()
      wrapper.vm.onColumnWidthUpdated(
        { width: '20rem', save: false },
        { key: 'a' },
      )
      expect(wrapper.emitted('columnWidthUpdated')).toBeUndefined()
      wrapper.vm.onColumnWidthUpdated(
        { width: '20rem', save: true },
        { key: 'a' },
      )
      expect(wrapper.emitted('columnWidthUpdated')).toHaveLength(1)
    })
  })
})
