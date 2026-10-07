const api = vi.hoisted(() => ({ call: vi.fn() }))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, call: api.call }
})

import CommandPalette from '@/components/Modals/CommandPalette.vue'
import { isCommandPaletteOpen } from '@/composables/commandPalette'
import { mountComponent } from '../helpers/mount'
import { flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

const nav = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useRouter: () => nav }
})

const LEADS = [{ name: 'LEAD-1', lead_name: 'Ada Lovelace', email: 'ada@example.com', status: 'New' }]
const DEALS = [{ name: 'DEAL-1', deal_name: 'Acme deal', stage: 'Demo', status: 'Open' }]
const CONTACTS = [{ name: 'CONTACT-1', first_name: 'Bob', last_name: 'Brown', email_id: 'bob@example.com' }]
const ORGS = [{ name: 'ORG-1', organization_name: 'Acme Ltd', industry: 'Software' }]

/** Resolves the four parallel get_list calls in the order the component makes them. */
const respondWith = ({ leads = [], deals = [], contacts = [], orgs = [] } = {}) => {
  api.call.mockImplementation(async (_method, args) => {
    switch (args.doctype) {
      case 'CRM Lead': return leads
      case 'CRM Deal': return deals
      case 'Contact': return contacts
      case 'CRM Organization': return orgs
      default: return []
    }
  })
}

const mountPalette = () =>
  mountComponent(CommandPalette, {
    global: { stubs: { Avatar: true, Badge: true } },
  })

/** Types a query and lets the 250ms debounce elapse. */
const search = async (wrapper, text) => {
  wrapper.vm.query = text
  await vi.advanceTimersByTimeAsync(300)
  await flushPromises()
}

describe('CommandPalette', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    api.call.mockReset()
    respondWith({})
    nav.push.mockClear()
    isCommandPaletteOpen.value = false
  })

  afterEach(() => vi.useRealTimers())

  describe('searching', () => {
    it('queries all four doctypes at once', async () => {
      const wrapper = mountPalette()
      await search(wrapper, 'acme')
      const doctypes = api.call.mock.calls.map((c) => c[1].doctype)
      expect(doctypes).toEqual(
        expect.arrayContaining(['CRM Lead', 'CRM Deal', 'Contact', 'CRM Organization']),
      )
    })

    it('wraps the term in wildcards', async () => {
      const wrapper = mountPalette()
      await search(wrapper, 'acme')
      const leadCall = api.call.mock.calls.find((c) => c[1].doctype === 'CRM Lead')
      expect(leadCall[1].or_filters.lead_name).toEqual(['like', '%acme%'])
    })

    it('caps each category so one cannot flood the list', async () => {
      const wrapper = mountPalette()
      await search(wrapper, 'acme')
      for (const [, args] of api.call.mock.calls) {
        expect(args.limit_page_length).toBe(5)
      }
    })

    it('does not search for whitespace', async () => {
      const wrapper = mountPalette()
      await search(wrapper, '   ')
      expect(api.call).not.toHaveBeenCalled()
    })

    it('clears results when the box is emptied', async () => {
      respondWith({ leads: LEADS })
      const wrapper = mountPalette()
      await search(wrapper, 'ada')
      expect(wrapper.vm.flatResults).toHaveLength(1)
      await search(wrapper, '')
      expect(wrapper.vm.flatResults).toEqual([])
    })

    it('debounces so typing does not fire a search per keystroke', async () => {
      const wrapper = mountPalette()
      wrapper.vm.query = 'a'
      await vi.advanceTimersByTimeAsync(50)
      wrapper.vm.query = 'ac'
      await vi.advanceTimersByTimeAsync(50)
      wrapper.vm.query = 'acme'
      expect(api.call).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(300)
      await flushPromises()
      expect(api.call).toHaveBeenCalledTimes(4)
    })

    it('clears the loading flag even when a search fails', async () => {
      // Otherwise the spinner sticks forever after one bad request.
      api.call.mockRejectedValue(new Error('offline'))
      const wrapper = mountPalette()
      await search(wrapper, 'acme')
      expect(wrapper.vm.isLoading).toBe(false)
    })
  })

  describe('shaping results', () => {
    it('labels a lead by name and routes to it', async () => {
      respondWith({ leads: LEADS })
      const wrapper = mountPalette()
      await search(wrapper, 'ada')
      expect(wrapper.vm.results.Leads[0]).toMatchObject({
        id: 'lead-LEAD-1',
        title: 'Ada Lovelace',
        subtitle: 'ada@example.com',
        badge: 'Lead',
        route: { name: 'Lead', params: { leadId: 'LEAD-1' } },
      })
    })

    it('falls back to the id when a record has no name', async () => {
      respondWith({ leads: [{ name: 'LEAD-2', status: 'New' }] })
      const wrapper = mountPalette()
      await search(wrapper, 'lead')
      expect(wrapper.vm.results.Leads[0].title).toBe('LEAD-2')
      expect(wrapper.vm.results.Leads[0].subtitle).toBe('New')
    })

    it('joins a contact’s first and last name', async () => {
      respondWith({ contacts: CONTACTS })
      const wrapper = mountPalette()
      await search(wrapper, 'bob')
      expect(wrapper.vm.results.Contacts[0].title).toBe('Bob Brown')
    })

    it('does not leave a stray space for a half-named contact', async () => {
      respondWith({ contacts: [{ name: 'CONTACT-2', first_name: 'Cher' }] })
      const wrapper = mountPalette()
      await search(wrapper, 'cher')
      expect(wrapper.vm.results.Contacts[0].title).toBe('Cher')
    })

    it('prefers a deal’s stage over its status', async () => {
      respondWith({ deals: DEALS })
      const wrapper = mountPalette()
      await search(wrapper, 'acme')
      expect(wrapper.vm.results.Deals[0].subtitle).toBe('Demo')
    })

    it('labels an organization with its industry', async () => {
      respondWith({ orgs: ORGS })
      const wrapper = mountPalette()
      await search(wrapper, 'acme')
      expect(wrapper.vm.results.Organizations[0]).toMatchObject({
        title: 'Acme Ltd',
        subtitle: 'Software',
        route: { name: 'Organization', params: { organizationId: 'ORG-1' } },
      })
    })

    it('survives a doctype returning nothing at all', async () => {
      respondWith({ leads: null, deals: DEALS })
      const wrapper = mountPalette()
      await search(wrapper, 'acme')
      expect(wrapper.vm.results.Leads).toEqual([])
      expect(wrapper.vm.results.Deals).toHaveLength(1)
    })
  })

  describe('keyboard navigation', () => {
    const populated = async () => {
      respondWith({ leads: LEADS, deals: DEALS, contacts: CONTACTS, orgs: ORGS })
      const wrapper = mountPalette()
      await search(wrapper, 'acme')
      return wrapper
    }

    it('flattens every category in display order', async () => {
      const wrapper = await populated()
      expect(wrapper.vm.flatResults.map((r) => r.badge)).toEqual([
        'Lead', 'Deal', 'Contact', 'Organization',
      ])
    })

    it('starts on the first result', async () => {
      const wrapper = await populated()
      expect(wrapper.vm.isActiveItem(wrapper.vm.flatResults[0])).toBe(true)
    })

    it('moves down through the list', async () => {
      const wrapper = await populated()
      wrapper.vm.navigateDown()
      expect(wrapper.vm.activeIndex).toBe(1)
    })

    it('wraps around at the bottom', async () => {
      const wrapper = await populated()
      wrapper.vm.activeIndex = 3
      wrapper.vm.navigateDown()
      expect(wrapper.vm.activeIndex).toBe(0)
    })

    it('wraps around at the top', async () => {
      // Arrow-up from the first item should land on the last, not go negative.
      const wrapper = await populated()
      wrapper.vm.navigateUp()
      expect(wrapper.vm.activeIndex).toBe(3)
    })

    it('does nothing with an empty list', async () => {
      const wrapper = mountPalette()
      wrapper.vm.navigateDown()
      wrapper.vm.navigateUp()
      expect(wrapper.vm.activeIndex).toBe(0)
    })

    it('follows the mouse', async () => {
      const wrapper = await populated()
      wrapper.vm.hoverItem(wrapper.vm.flatResults[2])
      expect(wrapper.vm.activeIndex).toBe(2)
    })

    it('ignores a hover over something not in the list', async () => {
      const wrapper = await populated()
      wrapper.vm.hoverItem({ id: 'ghost' })
      expect(wrapper.vm.activeIndex).toBe(0)
    })
  })

  describe('opening a result', () => {
    it('navigates and closes', async () => {
      respondWith({ leads: LEADS })
      const wrapper = mountPalette()
      await search(wrapper, 'ada')
      isCommandPaletteOpen.value = true
      wrapper.vm.selectActiveItem()
      expect(nav.push).toHaveBeenCalledWith({
        name: 'Lead',
        params: { leadId: 'LEAD-1' },
      })
      expect(isCommandPaletteOpen.value).toBe(false)
    })

    it('does nothing when there is no active result', () => {
      const wrapper = mountPalette()
      wrapper.vm.selectActiveItem()
      expect(nav.push).not.toHaveBeenCalled()
    })
  })

  describe('opening the palette', () => {
    it('starts from a clean slate each time', async () => {
      respondWith({ leads: LEADS })
      const wrapper = mountPalette()
      await search(wrapper, 'ada')
      isCommandPaletteOpen.value = true
      await nextTick()
      expect(wrapper.vm.query).toBe('')
      expect(wrapper.vm.flatResults).toEqual([])
      expect(wrapper.vm.activeIndex).toBe(0)
    })
  })
})
