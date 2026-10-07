const api = vi.hoisted(() => ({
  fields: [],
  createDocument: vi.fn(),
}))

vi.mock('@/stores/meta', () => ({
  getMeta: () => ({ getFields: () => api.fields }),
}))

vi.mock('@/composables/document', () => ({
  createDocument: api.createDocument,
}))

import TableMultiselectInput from '@/components/Controls/TableMultiselectInput.vue'
import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'

const LinkStub = {
  name: 'LinkStub',
  props: ['value', 'filters', 'doctype', 'onCreate', 'hideMe'],
  emits: ['change'],
  template: '<div class="local-link"><slot name="target" :togglePopover="() => {}" /></div>',
}

// The shared Button stub renders only the default slot; the remove cross lives
// in this component's #suffix slot, so it needs forwarding to be clickable.
const ButtonStub = {
  props: ['label'],
  template:
    '<button class="stub-button">{{ label }}<slot /><slot name="suffix" /></button>',
}

const LINK_FIELD = { fieldname: 'user', fieldtype: 'Link', options: 'User' }

const mount = (modelValue = []) =>
  mountComponent(TableMultiselectInput, {
    props: { doctype: 'CRM Task Assignee', modelValue },
    global: { stubs: { Link: LinkStub, Button: ButtonStub } },
  })

const link = (w) => w.findComponent(LinkStub)
const chips = (w) => w.findAll('.stub-button').map((b) => b.text())

describe('TableMultiselectInput', () => {
  beforeEach(() => {
    api.fields = [
      { fieldname: 'idx', fieldtype: 'Int' },
      LINK_FIELD,
      { fieldname: 'other', fieldtype: 'Link', options: 'Contact' },
    ]
    api.createDocument.mockReset()
  })

  describe('finding the link field', () => {
    it('uses the first Link field in the child table', () => {
      expect(link(mount()).props('doctype')).toBe('User')
    })

    it('accepts a User field as the link field too', () => {
      api.fields = [{ fieldname: 'owner', fieldtype: 'User', options: 'User' }]
      expect(link(mount()).props('doctype')).toBe('User')
    })

    it('explains itself when the table has no link field at all', () => {
      // Without one there is nothing to select, so an empty box with no
      // explanation would look like a loading failure.
      api.fields = [{ fieldname: 'idx', fieldtype: 'Int' }]
      const wrapper = mount()
      expect(wrapper.find('.stub-error').text()).toContain(
        'atleast one Link field',
      )
    })

    it('offers no picker in that case', () => {
      api.fields = [{ fieldname: 'idx', fieldtype: 'Int' }]
      expect(link(mount()).exists()).toBe(false)
    })
  })

  describe('showing the current values', () => {
    it('renders one chip per row, labelled by the link field', () => {
      expect(chips(mount([{ user: 'ada@x.com' }, { user: 'bob@x.com' }]))).toEqual([
        'ada@x.com',
        'bob@x.com',
      ])
    })

    it('renders nothing for an empty table', () => {
      expect(chips(mount())).toEqual([])
    })
  })

  describe('what the picker may offer', () => {
    it('excludes values already chosen', () => {
      // Otherwise the list keeps offering rows that would be rejected as
      // duplicates the moment they are picked.
      const wrapper = mount([{ user: 'ada@x.com' }])
      expect(link(wrapper).props('filters')).toEqual({
        name: ['not in', ['ada@x.com']],
      })
    })

    it('filters on nothing when the table is empty', () => {
      expect(link(mount()).props('filters')).toEqual({
        name: ['not in', []],
      })
    })
  })

  describe('adding a value', () => {
    it('appends a row keyed by the link fieldname', async () => {
      const wrapper = mount([])
      await link(wrapper).vm.$emit('change', 'ada@x.com')
      expect(wrapper.emitted('change').at(-1)[0]).toEqual([
        { user: 'ada@x.com' },
      ])
    })

    it('refuses a duplicate and says why', async () => {
      const wrapper = mount([{ user: 'ada@x.com' }])
      await link(wrapper).vm.$emit('change', 'ada@x.com')
      expect(wrapper.find('.stub-error').text()).toBe('Value already exists')
      expect(wrapper.emitted('change')).toBeUndefined()
    })

    it('ignores an empty selection', async () => {
      const wrapper = mount([])
      await link(wrapper).vm.$emit('change', '')
      expect(wrapper.emitted('change')).toBeUndefined()
    })

    it('clears the duplicate warning once a valid value is added', async () => {
      const wrapper = mount([{ user: 'ada@x.com' }])
      await link(wrapper).vm.$emit('change', 'ada@x.com')
      expect(wrapper.find('.stub-error').exists()).toBe(true)
      await link(wrapper).vm.$emit('change', 'bob@x.com')
      await nextTick()
      expect(wrapper.find('.stub-error').exists()).toBe(false)
    })
  })

  describe('removing a value', () => {
    it('emits the remaining rows', async () => {
      const wrapper = mount([{ user: 'ada@x.com' }, { user: 'bob@x.com' }])
      await wrapper.findAll('.lucide-x')[0].trigger('click')
      expect(wrapper.emitted('change').at(-1)[0]).toEqual([
        { user: 'bob@x.com' },
      ])
    })

    it('leaves the model untouched, unlike adding', async () => {
      // Worth pinning: `addValue` pushes onto the model *and* emits, while
      // `removeValue` only emits and relies on the parent to write back. A
      // parent that ignores @change would see additions stick and removals not.
      const rows = [{ user: 'ada@x.com' }, { user: 'bob@x.com' }]
      const wrapper = mount(rows)
      await wrapper.findAll('.lucide-x')[0].trigger('click')
      expect(chips(wrapper)).toEqual(['ada@x.com', 'bob@x.com'])
    })
  })

  describe('creating a new linked record', () => {
    it('hands the picker a create handler', () => {
      expect(typeof link(mount()).props('onCreate')).toBe('function')
    })

    it('creates against the link field doctype, not the child table', () => {
      const wrapper = mount()
      const close = vi.fn()
      link(wrapper).props('onCreate')('Ada', close)
      expect(api.createDocument).toHaveBeenCalledWith(
        'User',
        'Ada',
        close,
        expect.any(Function),
      )
    })

    it('adds the created record once it comes back', () => {
      const wrapper = mount([])
      link(wrapper).props('onCreate')('Ada', vi.fn())
      const callback = api.createDocument.mock.calls[0][3]
      callback({ name: 'ada@x.com' })
      expect(wrapper.emitted('change').at(-1)[0]).toEqual([
        { user: 'ada@x.com' },
      ])
    })

    it('does nothing when creation was cancelled', () => {
      const wrapper = mount([])
      link(wrapper).props('onCreate')('Ada', vi.fn())
      api.createDocument.mock.calls[0][3](null)
      expect(wrapper.emitted('change')).toBeUndefined()
    })
  })
})
