const api = vi.hoisted(() => ({
  toast: null,
  call: vi.fn(async () => ({})),
  capture: vi.fn(),
  dialog: vi.fn(),
  users: null,
  roles: {},
  isAdmin: true,
  settings: null,
  nodes: null,
}))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  api.toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn() }
  return {
    ...actual,
    toast: api.toast,
    call: (...args) => api.call(...args),
    createDocumentResource: (options = {}) => {
      api.settings = reactive({
        ...options,
        doc: { enable_sales_hierarchy: 0 },
        setValue: { submit: vi.fn() },
        reload: vi.fn(),
      })
      return api.settings
    },
    createListResource: (options = {}) => {
      api.nodes = reactive({
        ...options,
        data: [],
        loading: false,
        reload: vi.fn(async () => ({})),
      })
      return api.nodes
    },
  }
})

vi.mock('frappe-ui/frappe', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useTelemetry: () => ({ capture: api.capture }) }
})

vi.mock('@/stores/global', () => ({
  globalStore: () => ({ $dialog: api.dialog, $socket: { on: vi.fn(), off: vi.fn() } }),
}))

vi.mock('@/stores/users', async () => {
  const { reactive } = await import('vue')
  api.users = reactive({ data: { crmUsers: [] }, loading: false })
  return {
    usersStore: () => ({
      users: api.users,
      getUserRole: (name) => api.roles[name],
      isAdmin: () => api.isAdmin,
      getUser: (e) => ({ name: e, email: e, full_name: e }),
      isManager: () => true,
    }),
  }
})

import Hierarchy from '@/components/Settings/Hierarchy/Hierarchy.vue'
import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'
import { flushPromises } from '@vue/test-utils'

const crmUser = (name, over = {}) => ({
  name,
  email: name,
  full_name: name.split('@')[0],
  user_image: '',
  enabled: 1,
  ...over,
})

const node = (name, over = {}) => ({
  name: `H-${name}`,
  user: name,
  full_name: name.split('@')[0],
  reports_to: '',
  is_group: 0,
  ...over,
})

const mount = () =>
  mountComponent(Hierarchy, {
    global: {
      stubs: {
        EmptyState: true, HierarchyRow: true, HierarchyTree: true,
        UserMultiSelect: true, Dialog: true, LoadingIndicator: true,
        Tooltip: true,
      },
    },
  })

describe('Hierarchy', () => {
  beforeEach(() => {
    api.toast.success.mockClear()
    api.toast.error.mockClear()
    api.capture.mockClear()
    api.dialog.mockClear()
    api.call.mockReset().mockResolvedValue({})
    api.isAdmin = true
    api.roles = {
      'boss@x.com': 'Sales Manager',
      'ada@x.com': 'Sales User',
      'grace@x.com': 'Sales User',
      'norole@x.com': undefined,
    }
    api.users.data = {
      crmUsers: [
        crmUser('boss@x.com'),
        crmUser('ada@x.com'),
        crmUser('grace@x.com'),
      ],
    }
  })

  const withNodes = (list) => {
    const wrapper = mount()
    api.nodes.data = list
    return wrapper
  }

  describe('enriching a node', () => {
    it('fills in the name and role from the user record', () => {
      const wrapper = withNodes([node('ada@x.com')])
      const [n] = wrapper.vm.enrichedNodes
      expect(n.full_name).toBe('ada')
      expect(n.role).toBe('Sales User')
      expect(n.role_rank).toBe(1)
    })

    it('ranks a manager above a user', () => {
      const wrapper = withNodes([node('boss@x.com'), node('ada@x.com')])
      const ranks = wrapper.vm.enrichedNodes.map((n) => n.role_rank)
      expect(ranks).toEqual([0, 1])
    })

    it('drops a node whose role has no place in the hierarchy', () => {
      // A role outside the sales pair has no rank to compare against, so the
      // node is dropped rather than given an undefined position.
      api.roles['support@x.com'] = 'Support Agent'
      const wrapper = withNodes([node('ada@x.com'), node('support@x.com')])
      expect(wrapper.vm.enrichedNodes.map((n) => n.user)).toEqual(['ada@x.com'])
    })

    it('treats a missing role as Sales User rather than dropping the node', () => {
      // Distinct from the case above: no role at all falls back, so somebody
      // whose roles have not loaded yet still appears in the tree.
      const wrapper = withNodes([node('norole@x.com')])
      expect(wrapper.vm.enrichedNodes.map((n) => n.role)).toEqual(['Sales User'])
    })

    it('falls back to the stored name when the user record is missing', () => {
      api.users.data = { crmUsers: [] }
      const wrapper = withNodes([node('ada@x.com')])
      expect(wrapper.vm.enrichedNodes[0].full_name).toBe('ada')
    })
  })

  describe('building the tree', () => {
    it('puts everyone without a manager at the top', () => {
      const wrapper = withNodes([node('boss@x.com'), node('ada@x.com')])
      expect(wrapper.vm.tree).toHaveLength(2)
    })

    it('nests a report under their manager', () => {
      const wrapper = withNodes([
        node('boss@x.com'),
        node('ada@x.com', { reports_to: 'H-boss@x.com' }),
      ])
      expect(wrapper.vm.tree).toHaveLength(1)
      expect(wrapper.vm.tree[0].children.map((c) => c.user)).toEqual([
        'ada@x.com',
      ])
    })

    it('promotes a node whose manager is not in the list', () => {
      // Otherwise it would vanish from the tree entirely.
      const wrapper = withNodes([node('ada@x.com', { reports_to: 'H-gone' })])
      expect(wrapper.vm.tree).toHaveLength(1)
      expect(wrapper.vm.tree[0].user).toBe('ada@x.com')
    })

    it('handles two levels', () => {
      const wrapper = withNodes([
        node('boss@x.com'),
        node('ada@x.com', { reports_to: 'H-boss@x.com' }),
        node('grace@x.com', { reports_to: 'H-ada@x.com' }),
      ])
      expect(wrapper.vm.tree[0].children[0].children[0].user).toBe(
        'grace@x.com',
      )
    })
  })

  describe('filtering the tree', () => {
    const built = () =>
      withNodes([
        node('boss@x.com'),
        node('ada@x.com', { reports_to: 'H-boss@x.com' }),
        node('grace@x.com'),
      ])

    it('shows everything with no filter', () => {
      expect(built().vm.visibleRoots).toHaveLength(2)
    })

    it('keeps a manager whose report matches', () => {
      // Dropping the manager would detach the match from its context and make
      // the tree misleading.
      const wrapper = built()
      wrapper.vm.search = 'ada'
      expect(wrapper.vm.visibleRoots).toHaveLength(1)
      expect(wrapper.vm.visibleRoots[0].user).toBe('boss@x.com')
      expect(wrapper.vm.visibleRoots[0].children[0].user).toBe('ada@x.com')
    })

    it('keeps every report of a matching manager', () => {
      const wrapper = built()
      wrapper.vm.search = 'boss'
      expect(wrapper.vm.visibleRoots[0].children).toHaveLength(1)
    })

    it('ignores case and padding', () => {
      const wrapper = built()
      wrapper.vm.search = '  ADA '
      expect(wrapper.vm.visibleRoots).toHaveLength(1)
    })

    it('shows nothing when nothing matches', () => {
      const wrapper = built()
      wrapper.vm.search = 'zzz'
      expect(wrapper.vm.visibleRoots).toEqual([])
    })

    it('narrows by role', () => {
      const wrapper = built()
      wrapper.vm.roleFilter = 'Sales Manager'
      expect(wrapper.vm.visibleRoots.map((n) => n.user)).toEqual([
        'boss@x.com',
      ])
    })
  })

  describe('who can be added under a node', () => {
    it('offers anyone unplaced at the top level', () => {
      const wrapper = withNodes([])
      expect(wrapper.vm.getCandidates(null).map((c) => c.value)).toEqual([
        'boss@x.com',
        'ada@x.com',
        'grace@x.com',
      ])
    })

    it('never offers someone already in the tree', () => {
      const wrapper = withNodes([node('ada@x.com')])
      expect(wrapper.vm.getCandidates(null).map((c) => c.value)).not.toContain(
        'ada@x.com',
      )
    })

    it('never offers Administrator', () => {
      api.users.data.crmUsers.push(crmUser('Administrator'))
      api.roles['Administrator'] = 'Sales Manager'
      const wrapper = withNodes([])
      expect(wrapper.vm.getCandidates(null).map((c) => c.value)).not.toContain(
        'Administrator',
      )
    })

    it('never offers someone without a sales role', () => {
      api.users.data.crmUsers.push(crmUser('norole@x.com'))
      const wrapper = withNodes([])
      expect(wrapper.vm.getCandidates(null).map((c) => c.value)).not.toContain(
        'norole@x.com',
      )
    })

    it('lets a manager take managers or users as reports', () => {
      const wrapper = withNodes([])
      const candidates = wrapper.vm.getCandidates({ role_rank: 0 })
      expect(candidates.map((c) => c.value)).toEqual([
        'boss@x.com',
        'ada@x.com',
        'grace@x.com',
      ])
    })

    it('does not let a manager report to a user', () => {
      // Rank must not increase going down the tree, or the hierarchy stops
      // meaning anything for visibility.
      const wrapper = withNodes([])
      const candidates = wrapper.vm.getCandidates({ role_rank: 1 })
      expect(candidates.map((c) => c.value)).toEqual([
        'ada@x.com',
        'grace@x.com',
      ])
    })
  })

  describe('counting what a removal affects', () => {
    it('counts just the node itself for a leaf', () => {
      const wrapper = withNodes([node('ada@x.com')])
      wrapper.vm.removeTarget = { name: 'H-ada@x.com' }
      expect(wrapper.vm.unlinkCount).toBe(1)
    })

    it('counts the whole subtree', () => {
      const wrapper = withNodes([
        node('boss@x.com'),
        node('ada@x.com', { reports_to: 'H-boss@x.com' }),
        node('grace@x.com', { reports_to: 'H-ada@x.com' }),
      ])
      wrapper.vm.removeTarget = { name: 'H-boss@x.com' }
      expect(wrapper.vm.unlinkCount).toBe(3)
    })

    it('is zero when nothing is targeted', () => {
      expect(withNodes([]).vm.unlinkCount).toBe(0)
    })

    it('knows whether the target has reports', () => {
      const wrapper = withNodes([
        node('boss@x.com'),
        node('ada@x.com', { reports_to: 'H-boss@x.com' }),
      ])
      wrapper.vm.removeTarget = { name: 'H-boss@x.com' }
      expect(wrapper.vm.checkTargetChild).toBe(true)
      wrapper.vm.removeTarget = { name: 'H-ada@x.com' }
      expect(wrapper.vm.checkTargetChild).toBe(false)
    })
  })

  describe('adding users', () => {
    it('does nothing when nobody was picked', async () => {
      const wrapper = withNodes([])
      expect(await wrapper.vm.bulkAdd(null, [])).toBe(false)
      expect(api.call).not.toHaveBeenCalled()
    })

    it('inserts one row per user', async () => {
      const wrapper = withNodes([])
      await wrapper.vm.bulkAdd(null, ['ada@x.com', 'grace@x.com'])
      expect(api.call).toHaveBeenCalledTimes(2)
    })

    it('records the parent it was added under', async () => {
      const wrapper = withNodes([])
      await wrapper.vm.bulkAdd({ name: 'H-boss@x.com' }, ['ada@x.com'])
      expect(api.call.mock.calls[0][1].doc.reports_to).toBe('H-boss@x.com')
    })

    it('adds at the top level when there is no parent', async () => {
      const wrapper = withNodes([])
      await wrapper.vm.bulkAdd(null, ['ada@x.com'])
      expect(api.call.mock.calls[0][1].doc.reports_to).toBeNull()
    })

    it('reports how many were added', async () => {
      const wrapper = withNodes([])
      await wrapper.vm.bulkAdd(null, ['ada@x.com', 'grace@x.com'])
      expect(api.toast.success).toHaveBeenCalledWith('2 users added to hierarchy')
    })

    it('uses the singular for one', async () => {
      const wrapper = withNodes([])
      await wrapper.vm.bulkAdd(null, ['ada@x.com'])
      expect(api.toast.success).toHaveBeenCalledWith('User added to hierarchy')
    })

    it('keeps going after one user fails', async () => {
      // A partial batch is better than abandoning the rest.
      let n = 0
      api.call.mockImplementation(async () => {
        if (++n === 1) throw { messages: ['Already placed'] }
        return {}
      })
      const wrapper = withNodes([])
      await wrapper.vm.bulkAdd(null, ['ada@x.com', 'grace@x.com'])
      expect(api.call).toHaveBeenCalledTimes(2)
      expect(api.toast.success).toHaveBeenCalledWith('User added to hierarchy')
      expect(api.toast.error).toHaveBeenCalledWith('Already placed')
    })

    it('reports a partial batch as unsuccessful', async () => {
      // The dialog stays open so the user can see which ones did not land.
      let n = 0
      api.call.mockImplementation(async () => {
        if (++n === 1) throw {}
        return {}
      })
      const wrapper = withNodes([])
      expect(await wrapper.vm.bulkAdd(null, ['ada@x.com', 'grace@x.com'])).toBe(
        false,
      )
    })

    it('clears the busy flag even when everything fails', async () => {
      api.call.mockRejectedValue(new Error('offline'))
      const wrapper = withNodes([])
      await wrapper.vm.bulkAdd(null, ['ada@x.com'])
      expect(wrapper.vm.saving).toBe(false)
    })

    it('shows a plain Error message rather than burying it', async () => {
      api.call.mockRejectedValue(new Error('offline'))
      const wrapper = withNodes([])
      await wrapper.vm.bulkAdd(null, ['ada@x.com'])
      expect(api.toast.error).toHaveBeenCalledWith('offline')
    })
  })

  describe('moving someone', () => {
    it('writes the new manager', async () => {
      const wrapper = withNodes([])
      await wrapper.vm.reparent('H-ada@x.com', 'H-boss@x.com')
      expect(api.call).toHaveBeenCalledWith('frappe.client.set_value', {
        doctype: 'CRM Sales Hierarchy',
        name: 'H-ada@x.com',
        fieldname: 'reports_to',
        value: 'H-boss@x.com',
      })
    })

    it('clears the manager when moved to the top', () => {
      const wrapper = withNodes([])
      wrapper.vm.reparent('H-ada@x.com', null)
      expect(api.call.mock.calls[0][1].value).toBe('')
    })

    it('reports a failure with the server reason', async () => {
      api.call.mockRejectedValue({ messages: ['Would create a cycle'] })
      const wrapper = withNodes([])
      await wrapper.vm.reparent('H-ada@x.com', 'H-boss@x.com')
      expect(api.toast.error).toHaveBeenCalledWith('Would create a cycle')
      expect(api.toast.success).not.toHaveBeenCalled()
    })
  })

  describe('turning the hierarchy on and off', () => {
    it('enables without asking', () => {
      const wrapper = withNodes([])
      wrapper.vm.toggleEnable(false)
      expect(api.settings.setValue.submit).toHaveBeenCalledWith(
        { enable_sales_hierarchy: 1 },
        expect.any(Object),
      )
    })

    it('asks before disabling', () => {
      // Disabling widens who can see every lead and deal, so it is not a
      // change to make on a stray click.
      const wrapper = withNodes([])
      wrapper.vm.toggleEnable(true)
      expect(api.dialog).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Disable Sales Hierarchy' }),
      )
      expect(api.settings.setValue.submit).not.toHaveBeenCalled()
    })

    it('records the enablement', () => {
      const wrapper = withNodes([])
      wrapper.vm.toggleEnable(false)
      api.settings.setValue.submit.mock.calls[0][1].onSuccess()
      expect(api.capture).toHaveBeenCalledWith('sales_hierarchy_enabled')
    })

    it('reflects the stored setting', async () => {
      const wrapper = withNodes([])
      expect(wrapper.vm.hierarchyEnabled).toBe(false)
      api.settings.doc.enable_sales_hierarchy = 1
      await nextTick()
      expect(wrapper.vm.hierarchyEnabled).toBe(true)
    })
  })

  describe('editing rights', () => {
    it('are limited to administrators', () => {
      expect(withNodes([]).vm.canEdit).toBe(true)
      api.isAdmin = false
      expect(withNodes([]).vm.canEdit).toBe(false)
    })
  })

  // Two resources feed the reparent picker. It has to say "loading" while
  // *either* is in flight — waiting for both means the picker renders an empty
  // list as though nobody could be chosen.
  describe('the candidate picker while data is arriving', () => {
    const loadingWith = async (users, nodes) => {
      const wrapper = withNodes([])
      api.users.loading = users
      api.nodes.loading = nodes
      await nextTick()
      return wrapper.vm.candidatesLoading
    }

    it('waits while the user list is still coming', async () => {
      expect(await loadingWith(true, false)).toBe(true)
    })

    it('waits while the hierarchy is still coming', async () => {
      expect(await loadingWith(false, true)).toBe(true)
    })

    it('waits while both are', async () => {
      expect(await loadingWith(true, true)).toBe(true)
    })

    it('stops once both have landed', async () => {
      expect(await loadingWith(false, false)).toBe(false)
    })
  })
})
