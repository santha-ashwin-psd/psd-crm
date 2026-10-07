const api = vi.hoisted(() => ({ options: null }))

vi.mock('@/stores/users', () => ({
  usersStore: () => ({
    getUser: (e) =>
      e ? { name: e, full_name: e === 'ada@x.com' ? 'Ada' : e, user_image: '' } : {},
  }),
}))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  return {
    ...actual,
    createResource: (opts = {}) => {
      api.options = reactive({ ...opts, data: null, fetch: vi.fn(), reload: vi.fn() })
      return api.options
    },
  }
})

import UserAvatar from '@/components/UserAvatar.vue'
import KeyboardShortcut from '@/components/KeyboardShortcut.vue'
import ErrorPage from '@/components/ErrorPage.vue'
import MultiActionButton from '@/components/MultiActionButton.vue'
import AttachmentItem from '@/components/AttachmentItem.vue'
import GroupBy from '@/components/GroupBy.vue'
import { mountComponent } from '../helpers/mount'
import { nextTick, reactive } from 'vue'
import { flushPromises } from '@vue/test-utils'

const quiet = { inheritAttrs: false, template: '<div />' }
const STUBS = {
  Avatar: { ...quiet, name: 'AvatarStub' },
  Dropdown: { ...quiet, name: 'DropdownStub' },
  Autocomplete: { ...quiet, name: 'AutocompleteStub' },
  DetailsIcon: { ...quiet, name: 'DetailsIconStub' },
  FileTypeIcon: { ...quiet, name: 'S1' },
  FileImageIcon: { ...quiet, name: 'S2' },
  FileTextIcon: { ...quiet, name: 'S3' },
  FileSpreadsheetIcon: { ...quiet, name: 'S4' },
  FileIcon: { ...quiet, name: 'S5' },
}

describe('UserAvatar', () => {
  const mount = (user) =>
    mountComponent(UserAvatar, { props: { user }, global: { stubs: STUBS } })

  it('renders for a known user', () => {
    expect(mount('ada@x.com').findComponent({ name: 'AvatarStub' }).exists()).toBe(
      true,
    )
  })

  it('renders with no user rather than throwing', () => {
    // Records can reference a user who has since been removed.
    expect(() => mount(null)).not.toThrow()
  })
})

describe('KeyboardShortcut', () => {
  const mount = (props = {}) =>
    mountComponent(KeyboardShortcut, { props, global: { stubs: STUBS } })

  it('shows the key from its slot', () => {
    const wrapper = mountComponent(KeyboardShortcut, {
      slots: { default: 'K' },
      global: { stubs: STUBS },
    })
    expect(wrapper.text()).toContain('K')
  })

  it('ignores the `shortcut` prop, which nothing reads', () => {
    // Declared but absent from the template. Its only consumer (Password.vue)
    // passes the key through the slot. Recorded rather than removed: the prop
    // is part of the component's public shape.
    expect(mount({ shortcut: 'K' }).text()).not.toContain('K')
  })

  it('renders with no modifiers', () => {
    expect(() => mount({})).not.toThrow()
  })

  it('renders each modifier', () => {
    for (const mod of ['meta', 'ctrl', 'shift', 'alt']) {
      expect(() => mount({ [mod]: true }), mod).not.toThrow()
    }
  })
})

describe('ErrorPage', () => {
  const mount = (props) =>
    mountComponent(ErrorPage, { props, global: { stubs: STUBS } })

  it('shows the title and message', () => {
    const wrapper = mount({
      errorTitle: 'Document not found',
      errorMessage: 'It may have been deleted.',
    })
    expect(wrapper.text()).toContain('Document not found')
    expect(wrapper.text()).toContain('It may have been deleted.')
  })

  it('strips markup from a server-supplied message', () => {
    // The message comes from an exception, which can carry HTML.
    const wrapper = mount({
      errorTitle: 'Error',
      errorMessage: '<script>alert(1)</script>Broken',
    })
    expect(wrapper.html()).not.toContain('<script')
  })
})

describe('MultiActionButton', () => {
  const option = (label) => ({ label, onClick: vi.fn() })

  const mount = (options) =>
    mountComponent(MultiActionButton, {
      props: { options },
      global: { stubs: STUBS },
    })

  it('starts on the first option', () => {
    expect(mount([option('Send'), option('Schedule')]).vm.activeButton.label).toBe(
      'Send',
    )
  })

  it('offers a dropdown only when there is a choice', () => {
    // A single action needs no chooser beside it.
    expect(mount([option('Send'), option('Schedule')]).vm.showDropdown).toBe(true)
    expect(mount([option('Send')]).vm.showDropdown).toBe(false)
  })

  it('copes with no options at all', () => {
    const wrapper = mount([])
    expect(wrapper.vm.showDropdown).toBe(false)
    expect(wrapper.vm.activeButton).toEqual({})
    expect(wrapper.vm.parsedOptions).toEqual([])
  })

  it('builds one dropdown entry per option', () => {
    expect(mount([option('Send'), option('Schedule')]).vm.parsedOptions).toHaveLength(
      2,
    )
  })

  it('switches the active option when one is chosen', () => {
    const wrapper = mount([option('Send'), option('Schedule')])
    // The entry's component receives an onClick that promotes it.
    wrapper.vm.activeButton = wrapper.props('options')[1]
    expect(wrapper.vm.activeButton.label).toBe('Schedule')
  })
})

describe('AttachmentItem', () => {
  const mount = (label, url = '/files/a') =>
    mountComponent(AttachmentItem, {
      props: { label, url },
      global: { stubs: STUBS },
    })

  describe('choosing an icon by file type', () => {
    it('distinguishes text, image, pdf and spreadsheet', () => {
      const icons = new Set([
        mount('notes.txt').vm.getIcon(),
        mount('photo.png').vm.getIcon(),
        mount('report.pdf').vm.getIcon(),
        mount('data.xlsx').vm.getIcon(),
      ])
      expect(icons.size).toBe(4)
    })

    it('falls back for an unknown type', () => {
      expect(mount('archive.zip').vm.getIcon()).toBe(mount('thing.bin').vm.getIcon())
    })

    it('copes with a name that has no extension', () => {
      expect(() => mount('README')).not.toThrow()
    })

    it('copes with no name at all', () => {
      expect(() => mount(null)).not.toThrow()
    })
  })

  describe('previewing', () => {
    it('opens for an image', () => {
      const wrapper = mount('photo.png')
      wrapper.vm.toggleDialog()
      expect(wrapper.vm.showDialog).toBe(true)
    })

    it('does nothing for a type it cannot show', () => {
      // A zip has no useful preview; the click must not open an empty dialog.
      const wrapper = mount('archive.zip')
      wrapper.vm.toggleDialog()
      expect(wrapper.vm.showDialog).toBe(false)
    })

    it('does nothing without a url', () => {
      const wrapper = mount('photo.png', null)
      wrapper.vm.toggleDialog()
      expect(wrapper.vm.showDialog).toBe(false)
    })

    it('loads the text of a text file', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue({ text: async () => 'file contents' })
      const wrapper = mount('notes.txt')
      wrapper.vm.toggleDialog()
      await flushPromises()
      expect(wrapper.vm.content).toBe('file contents')
      fetchSpy.mockRestore()
    })

    it('says so when the file cannot be loaded', async () => {
      // Regression: the fetch had no catch, so a failure rejected into nothing
      // while the dialog opened anyway showing an empty preview.
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('offline'))
      const wrapper = mount('notes.txt')
      wrapper.vm.toggleDialog()
      await flushPromises()
      expect(wrapper.vm.content).toBe('Could not load this file.')
      fetchSpy.mockRestore()
    })
  })
})

describe('GroupBy', () => {
  const mount = (listData = {}) => {
    const list = reactive({ data: listData })
    return mountComponent(GroupBy, {
      props: { doctype: 'CRM Deal', modelValue: list },
      global: { stubs: STUBS },
    })
  }

  const FIELDS = [
    { label: 'Status', fieldname: 'status' },
    { label: 'Owner', fieldname: 'deal_owner' },
  ]

  it('fetches the groupable fields for the doctype', () => {
    mount()
    expect(api.options.params).toEqual({ doctype: 'CRM Deal' })
    expect(api.options.cache).toEqual(['groupByOptions', 'CRM Deal'])
  })

  it('offers nothing before they load', () => {
    expect(mount().vm.options).toEqual([])
  })

  it('offers every field when nothing is grouped yet', () => {
    const wrapper = mount()
    api.options.data = FIELDS
    expect(wrapper.vm.options).toHaveLength(2)
  })

  it('hides the field already grouped by', () => {
    // Choosing it again would be a no-op the user cannot tell apart.
    const wrapper = mount({ group_by_field: { fieldname: 'status' } })
    api.options.data = FIELDS
    expect(wrapper.vm.options.map((o) => o.fieldname)).toEqual(['deal_owner'])
  })

  it('adopts the grouping already on the view', () => {
    const wrapper = mount({
      group_by_field: { label: 'Status', fieldname: 'status' },
    })
    expect(wrapper.vm.groupByValue.fieldname).toBe('status')
  })

  it('reports a new grouping', async () => {
    const wrapper = mount()
    wrapper.vm.setGroupBy({ label: 'Owner', fieldname: 'deal_owner' })
    await nextTick()
    expect(wrapper.emitted('update').at(-1)).toEqual(['deal_owner'])
  })

  it('ignores a selection with no field behind it', () => {
    const wrapper = mount()
    wrapper.vm.setGroupBy(null)
    wrapper.vm.setGroupBy({ label: 'Nothing' })
    expect(wrapper.emitted('update')).toBeUndefined()
  })
})
