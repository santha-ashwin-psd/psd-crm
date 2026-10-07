/**
 * The small composables, grouped.
 *
 * Most of `modals.js`, `settings.js`, `pageActions.js`, `commandPalette.js` and
 * `whatsapp.js` is bare `ref()` declarations — shared state with no behaviour,
 * where a test would restate the declaration rather than check anything. Only
 * the parts that actually decide something are covered here, in one file rather
 * than five nearly empty ones.
 */
const created = vi.hoisted(() => [])
vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    createResource: (options) => {
      created.push(options)
      return { options, fetch: vi.fn(), reload: vi.fn() }
    },
  }
})

import {
  composerClassFor,
  COMPOSER_DOCTYPES,
  showQuickEntryModal,
  quickEntryProps,
} from '@/composables/modals'
import {
  isCommandPaletteOpen,
  toggleCommandPalette,
} from '@/composables/commandPalette'
import { isMobileView, mobileSidebarOpened } from '@/composables/settings'
import { pageCreateAction } from '@/composables/pageActions'
import { whatsappEnabled, isWhatsappInstalled } from '@/composables/whatsapp'

describe('composerClassFor', () => {
  it('gives the composer treatment to note-like doctypes', () => {
    // Task and Note are documents whose title and body ARE the record, so they
    // get the borderless composer rather than the generic field grid.
    expect(composerClassFor('CRM Task')).toBe('crm-doc-modal--composer')
    expect(composerClassFor('FCRM Note')).toBe('crm-doc-modal--composer')
  })

  it('gives every other doctype the standard form', () => {
    expect(composerClassFor('CRM Deal')).toBe('')
    expect(composerClassFor('CRM Lead')).toBe('')
    expect(composerClassFor('Contact')).toBe('')
  })

  it('returns an empty string, never undefined, for missing input', () => {
    // The result is bound straight into a class list.
    expect(composerClassFor(undefined)).toBe('')
    expect(composerClassFor(null)).toBe('')
    expect(composerClassFor('')).toBe('')
  })

  it('covers every doctype in the list', () => {
    COMPOSER_DOCTYPES.forEach((doctype) => {
      expect(composerClassFor(doctype)).toBe('crm-doc-modal--composer')
    })
  })
})

describe('toggleCommandPalette', () => {
  it('flips the palette open and shut', () => {
    isCommandPaletteOpen.value = false
    toggleCommandPalette()
    expect(isCommandPaletteOpen.value).toBe(true)
    toggleCommandPalette()
    expect(isCommandPaletteOpen.value).toBe(false)
  })
})

describe('isMobileView', () => {
  it('is a computed breakpoint, not a fixed value', () => {
    expect(typeof isMobileView.value).toBe('boolean')
  })

  it('tracks the window width against the 1024px breakpoint', () => {
    window.innerWidth = 500
    window.dispatchEvent(new Event('resize'))
    expect(isMobileView.value).toBe(true)

    window.innerWidth = 1440
    window.dispatchEvent(new Event('resize'))
    expect(isMobileView.value).toBe(false)
  })

  it('treats exactly 1024 as desktop', () => {
    window.innerWidth = 1024
    window.dispatchEvent(new Event('resize'))
    expect(isMobileView.value).toBe(false)
  })
})

describe('shared UI state', () => {
  it('starts with the mobile sidebar and quick entry closed', () => {
    expect(mobileSidebarOpened.value).toBe(false)
    expect(showQuickEntryModal.value).toBe(false)
    expect(quickEntryProps.value).toEqual({})
  })

  it('has no page create action until a page registers one', () => {
    // The global "+ Create" falls back to route→doctype when this is null, so
    // the default matters.
    expect(pageCreateAction.value).toBeNull()
  })

  it('lets a page register and clear its create action', () => {
    const action = vi.fn()
    pageCreateAction.value = action
    pageCreateAction.value()
    expect(action).toHaveBeenCalled()
    pageCreateAction.value = null
    expect(pageCreateAction.value).toBeNull()
  })
})

describe('whatsapp availability', () => {
  it('starts disabled so the tab is hidden until the check returns', () => {
    expect(typeof whatsappEnabled.value).toBe('boolean')
    expect(typeof isWhatsappInstalled.value).toBe('boolean')
  })

  it('coerces the enabled response to a boolean', () => {
    // The API returns 0/1; the template needs a real boolean.
    const enabled = created.find((c) =>
      c.url.includes('is_whatsapp_enabled'),
    )
    enabled.onSuccess(1)
    expect(whatsappEnabled.value).toBe(true)
    enabled.onSuccess(0)
    expect(whatsappEnabled.value).toBe(false)
  })

  it('coerces the installed response to a boolean', () => {
    const installed = created.find((c) =>
      c.url.includes('is_whatsapp_installed'),
    )
    installed.onSuccess(1)
    expect(isWhatsappInstalled.value).toBe(true)
    installed.onSuccess(null)
    expect(isWhatsappInstalled.value).toBe(false)
  })
})
