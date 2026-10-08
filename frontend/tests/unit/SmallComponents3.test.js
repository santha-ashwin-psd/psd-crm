const api = vi.hoisted(() => ({ toast: null, call: vi.fn(async () => ({})) }))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  api.toast = {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  }
  return { ...actual, toast: api.toast, call: (...a) => api.call(...a) }
})

import IconPicker from '@/components/IconPicker.vue'
import PrimaryDropdown from '@/components/PrimaryDropdown.vue'
import PrimaryDropdownItem from '@/components/PrimaryDropdownItem.vue'
import BulkDeleteLinkedDocModal from '@/components/BulkDeleteLinkedDocModal.vue'
import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'
import { flushPromises } from '@vue/test-utils'

const quiet = { inheritAttrs: false, template: '<div><slot /></div>' }
const STUBS = {
  // Forwards #target and #body: PrimaryDropdown renders its items in #body,
  // which a default-slot-only stub would drop entirely.
  Popover: {
    name: 'PopoverStub',
    inheritAttrs: false,
    template:
      '<div><slot name="target" :isOpen="false" :togglePopover="() => {}" /><slot name="body" /><slot /></div>',
  },
  // Exposes `el`: the real TextInput does, and the component focuses through
  // it on mount.
  TextInput: {
    name: 'TextInputStub',
    inheritAttrs: false,
    template: '<input ref="el" />',
    computed: {
      el() {
        return this.$refs.el
      },
    },
  },
  SuccessIcon: { ...quiet, name: 'S1' },
  EditIcon: { ...quiet, name: 'S2' },
  PrimaryDropdownItem: { ...quiet, name: 'PrimaryDropdownItemStub' },
}

describe('IconPicker', () => {
  const mount = (props = {}) =>
    mountComponent(IconPicker, { props, global: { stubs: STUBS } })
  // The emoji database now loads after mount; wait for it.
  const mountLoaded = async (props = {}) => {
    const wrapper = mount(props)
    await wrapper.vm.loadEmojis()
    return wrapper
  }

  describe('the emoji list', () => {
    it('groups every emoji by category', async () => {
      const groups = (await mountLoaded()).vm.emojiGroups
      expect(Object.keys(groups).length).toBeGreaterThan(1)
      for (const list of Object.values(groups)) {
        expect(list.length).toBeGreaterThan(0)
      }
    })

    it('narrows to a search term', async () => {
      const wrapper = await mountLoaded()
      wrapper.vm.search = 'rocket'
      const all = Object.values(wrapper.vm.emojiGroups).flat()
      expect(all.length).toBeGreaterThan(0)
      expect(all.length).toBeLessThan(100)
    })

    it('matches on name, description or tag, not just the character', async () => {
      const wrapper = await mountLoaded()
      wrapper.vm.search = 'rocket'
      const all = Object.values(wrapper.vm.emojiGroups).flat()
      expect(all.some((e) => e.emoji === '🚀')).toBe(true)
    })

    it('ignores case', async () => {
      const wrapper = await mountLoaded()
      wrapper.vm.search = 'ROCKET'
      expect(
        Object.values(wrapper.vm.emojiGroups).flat().length,
      ).toBeGreaterThan(0)
    })

    it('says so when nothing matches, rather than showing an empty panel', async () => {
      const wrapper = await mountLoaded()
      wrapper.vm.search = 'zzzzzznotanemoji'
      expect(Object.keys(wrapper.vm.emojiGroups)).toEqual(['No results'])
    })
  })

  describe('the quick reactions', () => {
    it('offers six', () => {
      expect(mount().vm.reactionEmojis).toHaveLength(6)
    })
  })

  describe('picking at random', () => {
    it('sets an emoji', async () => {
      const wrapper = await mountLoaded()
      await wrapper.vm.setRandom()
      expect(wrapper.vm.emoji).toBeTruthy()
    })

    it('stays in range across many draws', async () => {
      // `randomInt(0, total - 1)` is inclusive at both ends; an off-by-one
      // would occasionally index past the array and set undefined.
      const wrapper = await mountLoaded()
      for (let i = 0; i < 200; i++) {
        await wrapper.vm.setRandom()
        expect(wrapper.vm.emoji).toBeTruthy()
      }
    })

    it('draws within the requested bounds', () => {
      const wrapper = mount()
      for (let i = 0; i < 100; i++) {
        const n = wrapper.vm.randomInt(3, 5)
        expect(n).toBeGreaterThanOrEqual(3)
        expect(n).toBeLessThanOrEqual(5)
      }
    })
  })
})

describe('PrimaryDropdown', () => {
  const mount = (props = {}) =>
    mountComponent(PrimaryDropdown, {
      props: { options: [], ...props },
      global: { stubs: STUBS },
    })

  it('renders an item per option', () => {
    const wrapper = mount({ options: [{ value: 'a' }, { value: 'b' }] })
    expect(
      wrapper.findAllComponents({ name: 'PrimaryDropdownItemStub' }),
    ).toHaveLength(2)
  })

  it('renders with no options', () => {
    expect(() => mount()).not.toThrow()
  })
})

describe('PrimaryDropdownItem', () => {
  const mount = (option) =>
    mountComponent(PrimaryDropdownItem, {
      props: { option },
      global: { stubs: STUBS },
    })

  it('shows an existing option read-only', () => {
    expect(mount({ value: 'Open', onSave: vi.fn() }).vm.editMode).toBe(false)
  })

  it('opens straight into editing for a new option', () => {
    // A blank row exists only to be typed into.
    const wrapper = mount({ value: '', onSave: vi.fn() })
    expect(wrapper.vm.editMode).toBe(true)
    expect(wrapper.vm.isNew).toBe(true)
  })

  it('edits a copy, so cancelling changes nothing', () => {
    const option = { value: 'Open', onSave: vi.fn() }
    const wrapper = mount(option)
    wrapper.vm.localOption.value = 'Closed'
    expect(option.value).toBe('Open')
  })

  it('follows the option if the parent replaces it', async () => {
    const wrapper = mount({ value: 'Open', onSave: vi.fn() })
    await wrapper.setProps({ option: { value: 'Closed', onSave: vi.fn() } })
    expect(wrapper.vm.localOption.value).toBe('Closed')
  })

  it('ignores a save with nothing typed', () => {
    // Blur fires whether or not anything was entered.
    const onSave = vi.fn()
    const wrapper = mount({ value: 'Open', onSave })
    wrapper.vm.saveOption({ target: { value: '' } })
    expect(onSave).not.toHaveBeenCalled()
  })

  it('reports whether the option is new when saving', () => {
    const onSave = vi.fn()
    const wrapper = mount({ value: '', onSave })
    wrapper.vm.localOption.value = 'Backlog'
    wrapper.vm.saveOption({ target: { value: 'Backlog' } })
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ value: 'Backlog' }),
      true,
    )
  })

  it('reports an edit as not new', () => {
    const onSave = vi.fn()
    const wrapper = mount({ value: 'Open', onSave })
    wrapper.vm.toggleEditMode()
    wrapper.vm.localOption.value = 'Reopened'
    wrapper.vm.saveOption({ target: { value: 'Reopened' } })
    expect(onSave).toHaveBeenCalledWith(expect.anything(), false)
  })
})

describe('BulkDeleteLinkedDocModal', () => {
  const mount = (items = ['A', 'B']) => {
    const reload = vi.fn()
    const wrapper = mountComponent(BulkDeleteLinkedDocModal, {
      props: { modelValue: true, doctype: 'CRM Deal', items, reload },
      global: { stubs: STUBS },
    })
    return { wrapper, reload }
  }

  beforeEach(() => {
    api.toast.error.mockClear()
    api.call.mockReset().mockResolvedValue({})
  })

  describe('confirming', () => {
    it('counts what is about to be deleted', () => {
      const { wrapper } = mount(['A', 'B', 'C'])
      wrapper.vm.confirmDelete()
      expect(wrapper.vm.confirmDeleteInfo.message).toContain('3')
      expect(wrapper.vm.confirmDeleteInfo.title).toBe('Delete')
    })

    it('distinguishes unlinking from deleting', () => {
      // Unlinking leaves the records; deleting does not. The flag decides.
      const { wrapper } = mount()
      wrapper.vm.confirmUnlink()
      expect(wrapper.vm.confirmDeleteInfo.title).toBe('Unlink')
      expect(wrapper.vm.confirmDeleteInfo.delete).toBe(false)

      wrapper.vm.confirmDelete()
      expect(wrapper.vm.confirmDeleteInfo.delete).toBe(true)
    })
  })

  describe('carrying it out', () => {
    it('sends the items and which mode was chosen', async () => {
      const { wrapper } = mount(['A', 'B'])
      wrapper.vm.confirmDelete()
      wrapper.vm.deleteDocs()
      await flushPromises()
      expect(api.call).toHaveBeenCalledWith(
        'xbr_crm.api.doc.delete_bulk_docs',
        {
          items: ['A', 'B'],
          doctype: 'CRM Deal',
          delete_linked: true,
        },
      )
    })

    it('closes and refreshes once done', async () => {
      const { wrapper, reload } = mount()
      wrapper.vm.confirmDelete()
      wrapper.vm.deleteDocs()
      await flushPromises()
      expect(reload).toHaveBeenCalled()
      expect(wrapper.emitted('update:modelValue').at(-1)).toEqual([false])
    })

    it('says why it could not, instead of rejecting into nothing', async () => {
      // Regression: no catch at all — the confirmation sat there with no
      // indication anything had happened.
      api.call.mockRejectedValue({ messages: ['Linked to an open deal'] })
      const { wrapper, reload } = mount()
      wrapper.vm.confirmDelete()
      wrapper.vm.deleteDocs()
      await flushPromises()
      expect(api.toast.error).toHaveBeenCalledWith('Linked to an open deal')
      expect(reload).not.toHaveBeenCalled()
    })

    it('closes the confirmation even after a failure', async () => {
      api.call.mockRejectedValue({})
      const { wrapper } = mount()
      wrapper.vm.confirmDelete()
      wrapper.vm.deleteDocs()
      await flushPromises()
      expect(wrapper.vm.confirmDeleteInfo.show).toBe(false)
    })
  })
})
