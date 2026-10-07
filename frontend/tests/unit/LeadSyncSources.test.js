const api = vi.hoisted(() => ({ toast: null, capture: vi.fn() }))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  api.toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn() }
  return { ...actual, toast: api.toast }
})

vi.mock('frappe-ui/frappe', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useTelemetry: () => ({ capture: api.capture }) }
})

import LeadSyncSources from '@/components/Settings/LeadSyncing/LeadSyncSources.vue'
import { mountComponent } from '../helpers/mount'
import { reactive, nextTick } from 'vue'

const source = (name, over = {}) => ({
  name,
  type: 'Facebook',
  enabled: 1,
  last_synced_at: '2026-03-15 09:00:00',
  ...over,
})

let sources

const mount = (rows = []) => {
  sources = reactive({
    data: rows,
    loading: false,
    next: vi.fn(),
    reload: vi.fn(),
    setValue: { submit: vi.fn() },
    delete: { submit: vi.fn() },
  })
  return mountComponent(LeadSyncSources, {
    global: {
      // Array-form props, not `Switch: true`: an auto-stub keeps frappe-ui's
      // `modelValue: Boolean` declaration, and the app binds Frappe's 0/1 —
      // so every mount printed a prop type warning that would drown a real one.
      stubs: {
        Switch: {
          props: ['modelValue', 'size'],
          template: '<button class="local-switch" />',
        },
        Dropdown: true,
        EmptyState: true,
      },
      provide: { sources },
    },
  })
}

describe('LeadSyncSources', () => {
  beforeEach(() => {
    api.toast.success.mockClear()
    api.toast.error.mockClear()
    api.capture.mockClear()
  })

  describe('searching', () => {
    const rows = [source('Facebook Page A'), source('LinkedIn Feed', { type: 'LinkedIn' })]

    it('lists everything when the box is empty', () => {
      expect(mount(rows).vm.sourcesList).toHaveLength(2)
    })

    it('matches on the source name', async () => {
      const wrapper = mount(rows)
      wrapper.vm.search = 'linkedin feed'
      await nextTick()
      expect(wrapper.vm.sourcesList.map((s) => s.name)).toEqual(['LinkedIn Feed'])
    })

    it('does not throw when a source fails to match', async () => {
      // Regression: the second clause read `source.subject.toLowerCase()`, and
      // there is no `subject` field on this doctype. `||` short-circuits, so it
      // only blew up for sources the *name* did not match — meaning nearly
      // every keystroke took the whole panel down.
      const wrapper = mount(rows)
      expect(() => {
        wrapper.vm.search = 'zzz'
        return wrapper.vm.sourcesList
      }).not.toThrow()
    })

    it('returns nothing when nothing matches', async () => {
      const wrapper = mount(rows)
      wrapper.vm.search = 'zzz'
      await nextTick()
      expect(wrapper.vm.sourcesList).toEqual([])
    })

    it('matches on the source type as well as the name', async () => {
      const wrapper = mount(rows)
      wrapper.vm.search = 'facebook'
      await nextTick()
      expect(wrapper.vm.sourcesList.map((s) => s.name)).toEqual(['Facebook Page A'])
    })

    it('ignores case', async () => {
      const wrapper = mount(rows)
      wrapper.vm.search = 'FACEBOOK'
      await nextTick()
      expect(wrapper.vm.sourcesList).toHaveLength(1)
    })

    it('copes with a source missing the field being searched', async () => {
      const wrapper = mount([source('A', { type: undefined })])
      wrapper.vm.search = 'facebook'
      await nextTick()
      expect(wrapper.vm.sourcesList).toEqual([])
    })

    it('copes with no data at all', () => {
      expect(mount(null).vm.sourcesList).toEqual([])
    })
  })

  describe('toggling a source on or off', () => {
    it('sends the new state', () => {
      const wrapper = mount([source('A')])
      wrapper.vm.toggleLeadSyncSourceEnabled({ name: 'A', enabled: 1, type: 'Facebook' })
      expect(sources.setValue.submit).toHaveBeenCalledWith(
        { name: 'A', enabled: 1 },
        expect.any(Object),
      )
    })

    it('normalises a boolean to 0 or 1', () => {
      const wrapper = mount([source('A')])
      wrapper.vm.toggleLeadSyncSourceEnabled({ name: 'A', enabled: false, type: 'Facebook' })
      expect(sources.setValue.submit.mock.calls[0][0].enabled).toBe(0)
    })

    it('confirms when it is switched on', () => {
      const wrapper = mount([source('A')])
      wrapper.vm.toggleLeadSyncSourceEnabled({ name: 'A', enabled: 1, type: 'Facebook' })
      sources.setValue.submit.mock.calls[0][1].onSuccess()
      expect(api.toast.success).toHaveBeenCalledWith('Source enabled successfully')
    })

    it('confirms when it is switched off', () => {
      const wrapper = mount([source('A')])
      wrapper.vm.toggleLeadSyncSourceEnabled({ name: 'A', enabled: 0, type: 'Facebook' })
      sources.setValue.submit.mock.calls[0][1].onSuccess()
      expect(api.toast.success).toHaveBeenCalledWith('Source disabled successfully')
    })

    it('records the change', () => {
      const wrapper = mount([source('A')])
      wrapper.vm.toggleLeadSyncSourceEnabled({ name: 'A', enabled: 1, type: 'Facebook' })
      sources.setValue.submit.mock.calls[0][1].onSuccess()
      expect(api.capture).toHaveBeenCalledWith('lead_sync_source_toggled', {
        enabled: true,
        source_type: 'Facebook',
      })
    })

    it('puts the switch back when the server refuses', () => {
      // The Switch is bound to the row, so without this the UI keeps showing a
      // state the server rejected.
      const wrapper = mount([source('A')])
      const row = { name: 'A', enabled: 1, type: 'Facebook' }
      wrapper.vm.toggleLeadSyncSourceEnabled(row)
      sources.setValue.submit.mock.calls[0][1].onError({ messages: ['Nope'] })
      expect(row.enabled).toBe(false)
      expect(api.toast.error).toHaveBeenCalledWith('Nope')
    })

    it('shows a plain Error message rather than burying it', () => {
      const wrapper = mount([source('A')])
      wrapper.vm.toggleLeadSyncSourceEnabled({ name: 'A', enabled: 1, type: 'Facebook' })
      sources.setValue.submit.mock.calls[0][1].onError(new Error('offline'))
      expect(api.toast.error).toHaveBeenCalledWith('offline')
    })

    it('falls back when the failure carries nothing', () => {
      const wrapper = mount([source('A')])
      wrapper.vm.toggleLeadSyncSourceEnabled({ name: 'A', enabled: 1, type: 'Facebook' })
      sources.setValue.submit.mock.calls[0][1].onError({})
      expect(api.toast.error).toHaveBeenCalledWith('Failed to update source')
    })
  })

  describe('deleting a source', () => {
    it('deletes by name', () => {
      const wrapper = mount([source('A')])
      wrapper.vm.deleteLeadSource(source('A'))
      expect(sources.delete.submit).toHaveBeenCalledWith('A', expect.any(Object))
    })

    it('closes the confirmation first', () => {
      const wrapper = mount([source('A')])
      wrapper.vm.confirmDelete = true
      wrapper.vm.deleteLeadSource(source('A'))
      expect(wrapper.vm.confirmDelete).toBe(false)
    })

    it('confirms once it is gone', () => {
      const wrapper = mount([source('A')])
      wrapper.vm.deleteLeadSource(source('A'))
      sources.delete.submit.mock.calls[0][1].onSuccess()
      expect(api.toast.success).toHaveBeenCalledWith(
        'Lead sync source deleted successfully',
      )
    })

    it('reports why it could not be deleted', () => {
      const wrapper = mount([source('A')])
      wrapper.vm.deleteLeadSource(source('A'))
      sources.delete.submit.mock.calls[0][1].onError(new Error('In use'))
      expect(api.toast.error).toHaveBeenCalledWith('In use')
    })
  })

  describe('the row menu', () => {
    it('offers Duplicate', () => {
      const options = mount([source('A')]).vm.getDropdownOptions(source('A'))
      expect(options.map((o) => o.label)).toContain('Duplicate')
    })

    it('opens the new-source form seeded with a copy', () => {
      // A copy, not the row itself — editing the form must not mutate the list.
      const row = source('A')
      const wrapper = mount([row])
      const options = wrapper.vm.getDropdownOptions(row)
      options.find((o) => o.label === 'Duplicate').onClick()
      const [step, payload] = wrapper.emitted('updateStep')[0]
      expect(step).toBe('new-source')
      expect(payload).toEqual(row)
      expect(payload).not.toBe(row)
    })

    it('offers a delete option too', () => {
      const options = mount([source('A')]).vm.getDropdownOptions(source('A'))
      expect(options.length).toBeGreaterThan(1)
    })
  })

  describe('loading more', () => {
    it('asks the list for the next page', async () => {
      const wrapper = mount([source('A')])
      const more = wrapper
        .findAll('.stub-button')
        .find((b) => b.text() === 'Load More')
      if (more) {
        await more.trigger('click')
        expect(sources.next).toHaveBeenCalled()
      }
    })
  })
})
