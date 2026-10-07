import ShortcutsHelpModal from '@/components/Modals/ShortcutsHelpModal.vue'
import { mountComponent } from '../helpers/mount'
import { flushPromises } from '@vue/test-utils'

const MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
const WINDOWS_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

/** The platform is read once during setup, so it must be set before mounting. */
const mountOn = (userAgent) => {
  Object.defineProperty(navigator, 'userAgent', {
    value: userAgent,
    configurable: true,
  })
  return mountComponent(ShortcutsHelpModal)
}

const allItems = (wrapper) => wrapper.vm.sections.flatMap((s) => s.items)

describe('ShortcutsHelpModal', () => {
  describe('the modifier key it shows', () => {
    it('uses the command symbol on a Mac', () => {
      const wrapper = mountOn(MAC_UA)
      const search = allItems(wrapper).find((i) => i.description === 'Open search')
      expect(search.keys).toEqual(['⌘', 'K'])
    })

    it('uses Ctrl elsewhere', () => {
      const wrapper = mountOn(WINDOWS_UA)
      const search = allItems(wrapper).find((i) => i.description === 'Open search')
      expect(search.keys).toEqual(['Ctrl', 'K'])
    })

    it('treats an iPad as a Mac', () => {
      // iPadOS reports a distinct UA but uses the same key.
      const wrapper = mountOn('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')
      expect(
        allItems(wrapper).find((i) => i.description === 'Open search').keys[0],
      ).toBe('⌘')
    })

    it('applies the same modifier everywhere it appears', () => {
      const wrapper = mountOn(WINDOWS_UA)
      const submit = allItems(wrapper).find(
        (i) => i.description === 'Confirm / Submit',
      )
      expect(submit.keys).toEqual(['Ctrl', 'Enter'])
    })
  })

  describe('the listed shortcuts', () => {
    it('groups them under the four contexts', () => {
      const wrapper = mountOn(MAC_UA)
      expect(wrapper.vm.sections.map((s) => s.title)).toEqual([
        'Global',
        'List Views',
        'Detail View',
        'Modals & Dialogs',
      ])
    })

    it('gives every entry a description and at least one key', () => {
      const wrapper = mountOn(MAC_UA)
      for (const item of allItems(wrapper)) {
        expect(item.description).toBeTruthy()
        expect(item.keys.length).toBeGreaterThan(0)
      }
    })

    it('offers the slash alternative for search', () => {
      const wrapper = mountOn(MAC_UA)
      const search = allItems(wrapper).find((i) => i.description === 'Open search')
      expect(search.altKeys).toEqual(['/'])
    })
  })

  describe('opening and closing', () => {
    it('starts closed', () => {
      expect(mountOn(MAC_UA).vm.isOpen).toBe(false)
    })

    it('opens when asked', async () => {
      // App.vue drives this through a template ref, not a prop.
      const wrapper = mountOn(MAC_UA)
      wrapper.vm.open()
      await flushPromises()
      expect(wrapper.vm.isOpen).toBe(true)
    })

    it('closes again', async () => {
      const wrapper = mountOn(MAC_UA)
      wrapper.vm.open()
      await flushPromises()
      wrapper.vm.close()
      expect(wrapper.vm.isOpen).toBe(false)
    })
  })
})
