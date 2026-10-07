/**
 * The dialog chrome baseline in src/index.css restyles frappe-ui's own Dialog
 * markup from the outside — it reaches for the panel, the padded body card,
 * the header row, the icon chip and the actions bar by structure, because
 * those elements have no hooks of their own.
 *
 * That coupling is deliberate (it lets ~48 popups match Settings without
 * editing 48 files), but it is invisible: if a frappe-ui upgrade moves any of
 * these, the CSS silently stops applying and the dialogs quietly revert to
 * desk styling. This suite asserts the structure the CSS assumes, so the
 * upgrade fails here instead of in someone's screenshot.
 *
 * When one of these fails: fix the matching selector in the DIALOG CHROME
 * BASELINE block at the end of src/index.css, then update the assertion.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
// The real component, not the stub in tests/helpers/mount.js — the whole point
// is to check frappe-ui's own markup. Imported from the package root because
// its `exports` field does not expose the component path directly.
import { Dialog } from 'frappe-ui'

let wrapper

afterEach(() => {
  wrapper?.unmount()
  document.body.innerHTML = ''
})

async function openDialog(props = {}) {
  wrapper = mount(Dialog, {
    props: {
      open: true,
      title: 'Delete 3 deals',
      icon: { name: 'lucide-trash-2', theme: 'red' },
      actions: [{ label: 'Delete', variant: 'solid' }],
      ...props,
    },
    attachTo: document.body,
  })
  await nextTick()
  await nextTick()
  return document.querySelector('.dialog-content')
}

describe('frappe-ui Dialog DOM contract', () => {
  it('renders the panel with the overlay and surface classes the CSS targets', async () => {
    const panel = await openDialog()

    expect(panel, '.dialog-content panel').toBeTruthy()
    expect(panel.className).toContain('bg-surface-elevation-1')
    expect(document.querySelector('.dialog-overlay')).toBeTruthy()
  })

  it('renders the body card as a direct child of the panel', async () => {
    const panel = await openDialog()
    const card = panel.querySelector(':scope > div.bg-surface-elevation-1')

    expect(card, 'padded body card').toBeTruthy()
  })

  it('renders the actions bar as the sibling immediately after the card', async () => {
    const panel = await openDialog()
    const bar = panel.querySelector(
      ':scope > div.bg-surface-elevation-1 + div',
    )

    expect(bar, 'actions bar').toBeTruthy()
    expect(bar.textContent).toContain('Delete')
  })

  it('renders the title inside a <header>, two levels below the header row', async () => {
    const panel = await openDialog()
    const header = panel.querySelector('header')

    expect(header, 'DialogTitle rendered as <header>').toBeTruthy()

    // `.dialog-content div:has(> div > header)` — the full-bleed divider.
    const headerRow = header.parentElement.parentElement
    expect(headerRow.matches('div')).toBe(true)
    expect(headerRow.querySelector(':scope > div > header')).toBe(header)
  })

  it('renders the icon chip as the only div sibling of <header>', async () => {
    const panel = await openDialog()
    const titleWrapper = panel.querySelector('header').parentElement

    // `.dialog-content :has(> header) > div` — the chip.
    const chip = titleWrapper.querySelector(':scope > div')
    expect(chip, 'icon chip').toBeTruthy()
    expect(chip.className).toMatch(/bg-surface-red-2/)
  })

  it('renders no header row when the dialog has no title', async () => {
    const panel = await openDialog({ title: undefined, icon: undefined })

    expect(panel.querySelector('header')).toBeNull()
    // The card then keeps its own top padding — the `:has(header)` branch of
    // the baseline must not fire.
    const card = panel.querySelector(':scope > div.bg-surface-elevation-1')
    expect(card.matches(':has(header)')).toBe(false)
  })
})
