const api = vi.hoisted(() => ({
  call: vi.fn(),
  capture: vi.fn(),
  onboarding: vi.fn(),
  showModal: vi.fn(),
}))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, call: api.call }
})

vi.mock('frappe-ui/frappe', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useTelemetry: () => ({ capture: api.capture }),
    useOnboarding: () => ({ updateOnboardingStep: api.onboarding }),
  }
})

// stores/settings.js builds a createDocumentResource with `auto: true` at
// module scope, and the frappe-ui mock above passes that factory through — so
// merely importing this page fired a real fetch at localhost:3000 and left an
// unhandled rejection behind the (otherwise green) run.
vi.mock('@/stores/settings', async () => {
  const { ref } = await import('vue')
  return {
    getSettings: () => ({
      brand: ref({ favicon: '/f.ico' }),
      _settings: { doc: {} },
    }),
    isTranslatable: () => false,
  }
})

vi.mock('@/composables/doctypeModal', () => ({
  useDoctypeModal: () => ({ showModal: api.showModal }),
}))

vi.mock('@/stores/users', () => ({
  usersStore: () => ({ getUser: () => ({ full_name: 'Ada', user_image: '' }) }),
}))

import NotesPage from '@/pages/Notes.vue'
import { pageCreateAction } from '@/composables/pageActions'
import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'

const STUBS = {
  ViewBreadcrumbs: true,
  LayoutHeader: true,
  UserAvatar: true,
  NoteIcon: true,
  ViewControls: true,
  EmptyState: true,
  ListPagination: true,
  TextEditor: true,
  Dropdown: true,
  Tooltip: true,
}

const mountPage = () => mountComponent(NotesPage, { global: { stubs: STUBS } })

/** Points the fake browser at a URL so openNoteFromURL can read it. */
const setUrl = (url) => window.history.replaceState(null, '', url)

const withNotes = (wrapper, rows) => {
  wrapper.vm.notes = { data: { data: rows }, reload: vi.fn() }
  return wrapper.vm.notes
}

describe('Notes page', () => {
  beforeEach(() => {
    api.call.mockReset().mockResolvedValue({})
    api.capture.mockClear()
    api.onboarding.mockClear()
    api.showModal.mockClear()
    setUrl('/crm/notes')
  })

  describe('card colour', () => {
    // The index-keyed palette these used to assert is gone. FCRM Note stores
    // only a title, content and an optional reference — no category, tag or
    // colour — so a per-card hue could only ever be decoration, and being
    // keyed to array position it changed a note's colour when another note
    // was inserted before it. Cards are now a neutral shared surface.
    it('exposes no per-note colour function', () => {
      const wrapper = mountPage()
      expect(wrapper.vm.noteColor).toBeUndefined()
      expect(wrapper.vm.notePalette).toBeUndefined()
    })

    it('renders every card on the shared neutral card primitive', async () => {
      const wrapper = mountPage()
      withNotes(wrapper, [
        { name: 'n1', title: 'One', owner: 'a@b.c', modified: '2026-09-01' },
        { name: 'n2', title: 'Two', owner: 'a@b.c', modified: '2026-09-02' },
      ])
      await nextTick()
      const cards = wrapper.findAll('.note-card')
      expect(cards.length).toBeGreaterThan(0)
      for (const card of cards) {
        expect(card.classes()).toContain('crm-card')
        expect(card.classes()).toContain('crm-card--interactive')
        // No inline accent custom property driving a tint.
        expect(card.attributes('style') || '').not.toContain('--note-accent')
      }
    })

    it('makes each card reachable by keyboard', async () => {
      const wrapper = mountPage()
      withNotes(wrapper, [
        { name: 'n1', title: 'One', owner: 'a@b.c', modified: '2026-09-01' },
      ])
      await nextTick()
      const cards = wrapper.findAll('.note-card')
      expect(cards.length).toBeGreaterThan(0)
      for (const card of cards) {
        expect(card.attributes('tabindex')).toBe('0')
        expect(card.attributes('role')).toBe('button')
        expect(card.attributes('aria-label')).toBeTruthy()
      }
    })
  })

  describe('creating and editing', () => {
    it('opens an empty note editor', () => {
      const wrapper = mountPage()
      wrapper.vm.createNote()
      expect(api.showModal).toHaveBeenCalledWith(
        expect.objectContaining({ doctype: 'FCRM Note', title: 'Note' }),
      )
      expect(api.showModal.mock.calls[0][0].name).toBeUndefined()
    })

    it('opens an existing note by name', () => {
      const wrapper = mountPage()
      wrapper.vm.editNote('NOTE-1')
      expect(api.showModal).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'NOTE-1', doctype: 'FCRM Note' }),
      )
    })

    it('refreshes and reports after a new note', () => {
      const wrapper = mountPage()
      const notes = withNotes(wrapper, [])
      wrapper.vm.createNote()
      api.showModal.mock.calls[0][0].callbacks.afterInsert()
      expect(notes.reload).toHaveBeenCalled()
      expect(api.onboarding).toHaveBeenCalledWith('create_first_note')
      expect(api.capture).toHaveBeenCalledWith('note_created')
    })

    it('does not re-tick onboarding on an edit', () => {
      // The step is "create your first note", not "touch a note".
      const wrapper = mountPage()
      const notes = withNotes(wrapper, [])
      wrapper.vm.editNote('NOTE-1')
      api.showModal.mock.calls[0][0].callbacks.afterUpdate()
      expect(notes.reload).toHaveBeenCalled()
      expect(api.onboarding).not.toHaveBeenCalled()
      expect(api.capture).toHaveBeenCalledWith('note_updated')
    })
  })

  describe('deleting', () => {
    it('deletes the note and refreshes', async () => {
      const wrapper = mountPage()
      const notes = withNotes(wrapper, [])
      await wrapper.vm.deleteNote('NOTE-1')
      expect(api.call).toHaveBeenCalledWith('frappe.client.delete', {
        doctype: 'FCRM Note',
        name: 'NOTE-1',
      })
      expect(notes.reload).toHaveBeenCalled()
    })
  })

  describe('the header create button', () => {
    it('is wired to this page while it is open', () => {
      const wrapper = mountPage()
      expect(pageCreateAction.value).toBe(wrapper.vm.createNote)
    })

    it('is released when the page goes away', () => {
      // Otherwise +Create on the next page would still make a note.
      const wrapper = mountPage()
      wrapper.unmount()
      expect(pageCreateAction.value).toBeNull()
    })
  })

  describe('opening a note from a deep link', () => {
    it('opens the note named in ?open', () => {
      setUrl('/crm/notes?open=NOTE-1')
      const wrapper = mountPage()
      withNotes(wrapper, [{ name: 'NOTE-1' }, { name: 'NOTE-2' }])
      wrapper.vm.openNoteFromURL()
      expect(api.showModal).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'NOTE-1' }),
      )
    })

    it('does nothing when the note is not on this page', () => {
      setUrl('/crm/notes?open=NOTE-9')
      const wrapper = mountPage()
      withNotes(wrapper, [{ name: 'NOTE-1' }])
      wrapper.vm.openNoteFromURL()
      expect(api.showModal).not.toHaveBeenCalled()
    })

    it('does nothing without the parameter', () => {
      setUrl('/crm/notes')
      const wrapper = mountPage()
      withNotes(wrapper, [{ name: 'NOTE-1' }])
      wrapper.vm.openNoteFromURL()
      expect(api.showModal).not.toHaveBeenCalled()
    })

    it('waits until the notes have loaded', () => {
      setUrl('/crm/notes?open=NOTE-1')
      const wrapper = mountPage()
      wrapper.vm.notes = {}
      wrapper.vm.openNoteFromURL()
      expect(api.showModal).not.toHaveBeenCalled()
    })

    it('takes the parameter out of the address bar', () => {
      // Otherwise a refresh reopens the note every time.
      setUrl('/crm/notes?open=NOTE-1')
      const wrapper = mountPage()
      withNotes(wrapper, [{ name: 'NOTE-1' }])
      wrapper.vm.openNoteFromURL()
      expect(window.location.search).not.toContain('open=')
    })

    it('keeps the rest of the query string', () => {
      // ?view= selects the saved view and is read all over ViewControls;
      // dropping it silently switches the user back to the default view.
      setUrl('/crm/notes?view=my-view&open=NOTE-1')
      const wrapper = mountPage()
      withNotes(wrapper, [{ name: 'NOTE-1' }])
      wrapper.vm.openNoteFromURL()
      expect(window.location.search).toContain('view=my-view')
      expect(window.location.search).not.toContain('open=')
    })
  })
})
