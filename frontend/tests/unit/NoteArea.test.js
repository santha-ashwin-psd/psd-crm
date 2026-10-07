const api = vi.hoisted(() => ({ call: vi.fn(() => Promise.resolve()) }))
vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    call: api.call,
    toast: { ...actual.toast, promise: vi.fn((p) => p) },
    // TimelineTimestamp's module graph reaches stores/settings.js, which builds
    // an auto-fetching document resource at import time. Stubbing the component
    // does not stop that — the module still runs — so the factory is neutered
    // here or the suite leaves an unhandled fetch rejection behind.
    createDocumentResource: (options) => ({ options, doc: null, get: vi.fn() }),
  }
})

vi.mock('@/stores/users', () => ({
  usersStore: () => ({
    getUser: (email) => ({
      full_name: email === 'ada@example.com' ? 'Ada Lovelace' : email,
    }),
  }),
}))

import NoteArea from '@/components/Activities/NoteArea.vue'
import { mountComponent } from '../helpers/mount'

const STUBS = {
  TextEditor: {
    name: 'TextEditor',
    props: ['content', 'editable'],
    template: '<div class="note-content" v-html="content" />',
  },
  Dropdown: {
    name: 'Dropdown',
    props: ['options'],
    template: '<div class="menu"><slot /></div>',
  },
  UserAvatar: { name: 'UserAvatar', props: ['user'], template: '<span class="avatar" />' },
  TimelineTimestamp: {
    name: 'TimelineTimestamp',
    props: ['date'],
    template: '<span class="timestamp">{{ date }}</span>',
  },
}

const NOTE = {
  name: 'NOTE-1',
  title: 'Kickoff meeting',
  content: '<p>Discussed timeline</p>',
  owner: 'ada@example.com',
  modified: '2026-08-20 09:00:00',
}

const mountNote = (note = NOTE, notes = { reload: vi.fn() }) =>
  mountComponent(NoteArea, {
    props: { note, modelValue: notes },
    global: { stubs: STUBS },
  })

describe('NoteArea', () => {
  beforeEach(() => {
    api.call.mockClear()
  })

  describe('the card', () => {
    it('shows the title and body', () => {
      const wrapper = mountNote()
      expect(wrapper.text()).toContain('Kickoff meeting')
      expect(wrapper.find('.note-content').text()).toContain(
        'Discussed timeline',
      )
    })

    it('carries the amber left stripe from the design', () => {
      expect(mountNote().classes()).toContain('border-l-amber-500')
    })

    it('shows the icon chip', () => {
      expect(mountNote().find('.note-chip').exists()).toBe(true)
    })

    it('labels the card as a Note', () => {
      expect(mountNote().find('.note-badge').text()).toBe('Note')
    })

    it('omits the body when the note has none', () => {
      const wrapper = mountNote({ ...NOTE, content: '' })
      expect(wrapper.find('.note-content').exists()).toBe(false)
    })
  })

  describe('the footer', () => {
    it('credits the author by name', () => {
      expect(mountNote().text()).toContain('Ada Lovelace')
    })

    it('falls back to the address for an unknown author', () => {
      const wrapper = mountNote({ ...NOTE, owner: 'zoe@example.com' })
      expect(wrapper.text()).toContain('zoe@example.com')
    })

    it('pairs the timestamp with a clock', () => {
      const wrapper = mountNote()
      expect(wrapper.find('.timestamp').exists()).toBe(true)
      expect(wrapper.find('svg.feather-clock').exists()).toBe(true)
    })

    it('shows the modified time, not the creation time', () => {
      expect(mountNote().find('.timestamp').text()).toBe('2026-08-20 09:00:00')
    })
  })

  describe('deleting', () => {
    const deleteOption = (wrapper) =>
      wrapper.findComponent({ name: 'Dropdown' }).props('options')[0]

    it('offers delete in the card menu', () => {
      expect(deleteOption(mountNote()).label).toBe('Delete')
    })

    it('deletes the right note', async () => {
      const wrapper = mountNote()
      await deleteOption(wrapper).onClick()
      expect(api.call).toHaveBeenCalledWith('frappe.client.delete', {
        doctype: 'FCRM Note',
        name: 'NOTE-1',
      })
    })

    it('refreshes the list afterwards', async () => {
      const notes = { reload: vi.fn() }
      const wrapper = mountNote(NOTE, notes)
      await deleteOption(wrapper).onClick()
      expect(notes.reload).toHaveBeenCalled()
    })

    it('survives having no list to refresh', async () => {
      const wrapper = mountNote(NOTE, null)
      await expect(deleteOption(wrapper).onClick()).resolves.toBeUndefined()
    })
  })
})
