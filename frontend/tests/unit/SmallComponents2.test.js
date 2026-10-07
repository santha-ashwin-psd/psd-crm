const api = vi.hoisted(() => ({
  toast: null,
  isManager: true,
  isMobileView: null,
  doc: null,
}))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  api.toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
  return { ...actual, toast: api.toast }
})

vi.mock('@/stores/users', () => ({
  usersStore: () => ({
    isManager: () => api.isManager,
    getUser: (e) => ({ name: e, full_name: e, user_image: '' }),
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

vi.mock('@/data/document', async () => {
  const { reactive } = await import('vue')
  return {
    useDocument: () => {
      api.doc = reactive({
        doc: { name: 'DEAL-1', deal_owner: 'ada@x.com' },
        save: { submit: vi.fn() },
      })
      return { document: api.doc }
    },
  }
})

import SalesHierarchyBanner from '@/components/SalesHierarchyBanner.vue'
import CustomActions from '@/components/CustomActions.vue'
import AssignTo from '@/components/AssignTo.vue'
import FadedScrollableDiv from '@/components/FadedScrollableDiv.vue'
import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'

const quiet = { inheritAttrs: false, template: '<div><slot /></div>' }
const STUBS = {
  Dropdown: { ...quiet, name: 'DropdownStub' },
  Popover: { ...quiet, name: 'PopoverStub' },
  MultipleAvatar: { ...quiet, name: 'MultipleAvatarStub' },
  AssignToBody: { ...quiet, name: 'AssignToBodyStub' },
}

describe('SalesHierarchyBanner', () => {
  const mount = () =>
    mountComponent(SalesHierarchyBanner, { global: { stubs: STUBS } })

  beforeEach(() => {
    api.isManager = true
    localStorage.removeItem('salesHierarchyBannerDismissed')
  })

  it('shows for a manager who has not dismissed it', () => {
    expect(mount().vm.showBanner).toBe(true)
  })

  it('never shows for anyone else', () => {
    // It explains a permissions model only managers can configure.
    api.isManager = false
    expect(mount().vm.showBanner).toBe(false)
  })

  it('hides once dismissed', () => {
    const wrapper = mount()
    wrapper.vm.dismiss()
    expect(wrapper.vm.showBanner).toBe(false)
  })

  it('stays dismissed on the next load', async () => {
    // Persisted, so it does not reappear every time the app is opened.
    // vueuse flushes the write on the next tick, hence the await.
    const wrapper = mount()
    wrapper.vm.dismiss()
    await nextTick()
    expect(mount().vm.showBanner).toBe(false)
  })

  it('opens the explainer in a new tab, safely', () => {
    // `noopener` matters for a link to an external site.
    const open = vi.spyOn(window, 'open').mockImplementation(() => {})
    mount().vm.openBlog()
    expect(open).toHaveBeenCalledWith(
      expect.stringContaining('frappe.io'),
      '_blank',
      'noopener',
    )
    open.mockRestore()
  })
})

describe('CustomActions', () => {
  const mount = (actions = []) =>
    mountComponent(CustomActions, {
      props: { actions, close: vi.fn() },
      global: { stubs: STUBS },
    })

  beforeEach(() => {
    api.isMobileView.value = false
  })

  const action = (label, over = {}) => ({ label, onClick: vi.fn(), ...over })

  it('treats an action with no group as a plain button', () => {
    const wrapper = mount([action('Convert'), action('Merge')])
    expect(wrapper.vm.normalActions).toHaveLength(2)
  })

  it('keeps grouped actions out of the plain list', () => {
    const wrapper = mount([
      action('Convert'),
      action('Export', { group: 'Data', buttonLabel: 'More', items: [] }),
    ])
    expect(wrapper.vm.normalActions.map((a) => a.label)).toEqual(['Convert'])
  })

  it('collects grouped actions under their button label', () => {
    const wrapper = mount([
      action('Export', { group: 'Data', buttonLabel: 'More', items: [] }),
      action('Import', { group: 'Data', buttonLabel: 'More', items: [] }),
    ])
    expect(wrapper.vm.groupedWithLabelActions).toHaveLength(1)
    expect(wrapper.vm.groupedWithLabelActions[0].action).toHaveLength(2)
  })

  it('keeps separate button labels apart', () => {
    const wrapper = mount([
      action('Export', { group: 'Data', buttonLabel: 'More', items: [] }),
      action('Archive', { group: 'Admin', buttonLabel: 'Admin', items: [] }),
    ])
    expect(wrapper.vm.groupedWithLabelActions.map((a) => a.label)).toEqual([
      'More',
      'Admin',
    ])
  })

  it('closes the menu when a grouped item is chosen', () => {
    // The item's own handler takes `close`, so a script can keep it open.
    const close = vi.fn()
    const item = { label: 'Export', onClick: vi.fn() }
    const wrapper = mountComponent(CustomActions, {
      props: {
        actions: [
          action('Export', { group: 'Data', buttonLabel: 'More', items: [item] }),
        ],
        close,
      },
      global: { stubs: STUBS },
    })
    wrapper.vm.groupedWithLabelActions[0].action[0].items[0].onClick()
    expect(item.onClick).toHaveBeenCalledWith(close)
  })

  it('folds the plain buttons into a menu on mobile', async () => {
    // There is no room for a row of buttons on a phone.
    api.isMobileView.value = true
    const wrapper = mount([action('Convert')])
    await nextTick()
    expect(wrapper.vm.groupedActions[0].group).toBe('Actions')
  })

  it('adds no menu group on mobile when there is nothing to fold', async () => {
    api.isMobileView.value = true
    const wrapper = mount([])
    await nextTick()
    expect(wrapper.vm.groupedActions).toEqual([])
  })

  it('copes with no actions at all', () => {
    const wrapper = mount([])
    expect(wrapper.vm.normalActions).toEqual([])
    expect(wrapper.vm.groupedWithLabelActions).toEqual([])
  })
})

describe('AssignTo', () => {
  const mount = (doctype = 'CRM Deal', assignees = []) =>
    mountComponent(AssignTo, {
      props: { doctype, docname: 'DEAL-1', modelValue: assignees },
      global: { stubs: STUBS },
    })

  beforeEach(() => {
    api.toast.info.mockClear()
  })

  describe('which field holds the owner', () => {
    it('is the lead owner for a lead', () => {
      expect(mount('CRM Lead').vm.ownerField).toBe('lead_owner')
    })

    it('is the deal owner for a deal', () => {
      expect(mount('CRM Deal').vm.ownerField).toBe('deal_owner')
    })

    it('is null for anything else', () => {
      // Only leads and deals have an owner field. Nothing mounts this
      // component for another doctype today — but `saveAssignees` goes on to
      // call `.replace()` on this value unconditionally, so if one ever did,
      // assigning anyone would throw. Recorded rather than guessed at: what
      // the message should say with no owner field is a design question.
      expect(mount('Contact').vm.ownerField).toBeNull()
    })
  })

  describe('when the owner is removed from the assignees', () => {
    const save = async (assignees, removed) => {
      const wrapper = mount('CRM Deal', assignees)
      const add = { submit: vi.fn() }
      const remove = { submit: vi.fn() }
      await wrapper.vm.saveAssignees([], removed, add, remove)
      return { wrapper, add, remove }
    }

    it('hands the owner to the next assignee', async () => {
      await save(
        [{ name: 'grace@x.com', label: 'Grace' }],
        ['ada@x.com'],
      )
      expect(api.doc.doc.deal_owner).toBe('grace@x.com')
      expect(api.doc.save.submit).toHaveBeenCalled()
    })

    it('says so, naming who took it over', async () => {
      await save([{ name: 'grace@x.com', label: 'Grace' }], ['ada@x.com'])
      expect(api.toast.info).toHaveBeenCalledWith(
        expect.stringContaining('Grace'),
      )
    })

    it('clears the owner when nobody is left', async () => {
      await save([], ['ada@x.com'])
      expect(api.doc.doc.deal_owner).toBe('')
      expect(api.toast.info).toHaveBeenCalledWith(
        expect.stringContaining('has also been removed'),
      )
    })

    it('submits the removals before the additions', async () => {
      // Order matters on the server: a stale assignment would otherwise
      // survive its replacement.
      const wrapper = mount('CRM Deal', [])
      const calls = []
      const add = { submit: vi.fn(() => calls.push('add')) }
      const remove = { submit: vi.fn(() => calls.push('remove')) }
      await wrapper.vm.saveAssignees(['a@x.com'], ['b@x.com'], add, remove)
      expect(calls).toEqual(['remove', 'add'])
    })

    it('skips an empty batch entirely', async () => {
      const wrapper = mount('CRM Deal', [])
      const add = { submit: vi.fn() }
      const remove = { submit: vi.fn() }
      await wrapper.vm.saveAssignees([], [], add, remove)
      expect(add.submit).not.toHaveBeenCalled()
      expect(remove.submit).not.toHaveBeenCalled()
    })
  })

  describe('when there is no owner yet', () => {
    it('gives it to the first assignee added', async () => {
      const wrapper = mount('CRM Deal', [{ name: 'grace@x.com', label: 'Grace' }])
      api.doc.doc.deal_owner = ''
      await wrapper.vm.saveAssignees(
        ['grace@x.com'],
        [],
        { submit: vi.fn() },
        { submit: vi.fn() },
      )
      expect(api.doc.doc.deal_owner).toBe('grace@x.com')
      expect(api.toast.info).toHaveBeenCalledWith(
        expect.stringContaining('has been set to'),
      )
    })
  })
})

describe('FadedScrollableDiv', () => {
  const mount = (props = {}) =>
    mountComponent(FadedScrollableDiv, { props, global: { stubs: STUBS } })

  it('fades the bottom by default', () => {
    expect(mount().vm.side).toBe('bottom')
  })

  it('fades the right when laid out horizontally', () => {
    expect(mount({ orientation: 'horizontal' }).vm.side).toBe('right')
  })

  it('applies no mask when the content fits', () => {
    // A gradient over content that does not scroll just dims its edges.
    const wrapper = mount()
    wrapper.vm.updateMaskStyle()
    expect(wrapper.vm.maskStyle).toBe('none')
  })

  it('does nothing before the element exists', () => {
    const wrapper = mount()
    wrapper.vm.scrollableDiv = null
    expect(() => wrapper.vm.updateMaskStyle()).not.toThrow()
  })

  // The four branches run in order and each overwrites the last, so the mask
  // is decided by scroll position, not by which branch matched first. The test
  // environment reports every element as zero-sized, so the geometry is
  // supplied directly.
  describe('where the fade sits as you scroll', () => {
    const scrolled = (geometry, props = {}) => {
      const wrapper = mount(props)
      wrapper.vm.scrollableDiv = {
        scrollWidth: 0, clientWidth: 0, scrollHeight: 0,
        clientHeight: 0, scrollTop: 0, scrollLeft: 0,
        ...geometry,
      }
      wrapper.vm.updateMaskStyle()
      return wrapper.vm.maskStyle
    }

    it('fades only the bottom at the top of the list', () => {
      const mask = scrolled({ scrollHeight: 500, clientHeight: 100, scrollTop: 0 })
      expect(mask).toContain('black calc(100% - 30px), transparent 100%')
      expect(mask).not.toContain('transparent, black 30px')
    })

    it('fades only the top once scrolled to the end', () => {
      // scrollTop + clientHeight === scrollHeight is the bottom of the list;
      // fading below it would suggest there is more to scroll to.
      const mask = scrolled({ scrollHeight: 500, clientHeight: 100, scrollTop: 400 })
      expect(mask).toContain('transparent, black 30px, black 100%')
    })

    it('fades both ends in the middle', () => {
      const mask = scrolled({ scrollHeight: 500, clientHeight: 100, scrollTop: 200 })
      expect(mask).toContain('transparent, black 30px, black calc(100% - 30px)')
    })

    it('respects a caller-set mask length', () => {
      const mask = scrolled(
        { scrollHeight: 500, clientHeight: 100, scrollTop: 0 },
        { maskLength: 8 },
      )
      expect(mask).toContain('black calc(100% - 8px)')
    })

    it('applies no mask when the content exactly fits', () => {
      expect(
        scrolled({ scrollHeight: 100, clientHeight: 100, scrollTop: 0 }),
      ).toBe('none')
    })
  })
})
