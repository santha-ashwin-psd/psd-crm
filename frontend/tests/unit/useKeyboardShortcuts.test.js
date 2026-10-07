const dialogs = vi.hoisted(() => ({ open: false }))
vi.mock('@/utils/dialogs', () => ({ isDialogOpen: () => dialogs.open }))

import { mount } from '@vue/test-utils'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'

/**
 * The composable registers on mount, so it needs a component. A dedicated
 * container element is passed as the target so tests can dispatch real
 * keydown events without touching window.
 */
function setup(options) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  let api
  const wrapper = mount({
    setup() {
      api = useKeyboardShortcuts({ target: container, ...options })
      return () => null
    },
  })
  return { container, wrapper, api }
}

/** Dispatch a keydown, optionally from a child element (e.g. an input). */
function press(container, key, { from = null, ...init } = {}) {
  const source = from || container
  if (from && !from.parentNode) container.appendChild(from)
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  })
  source.dispatchEvent(event)
  return event
}

describe('useKeyboardShortcuts', () => {
  beforeEach(() => {
    dialogs.open = false
    document.body.innerHTML = ''
  })

  describe('matching', () => {
    it('runs the action for a matching key', () => {
      const action = vi.fn()
      const { container } = setup({ shortcuts: [{ keys: 'Escape', action }] })
      press(container, 'Escape')
      expect(action).toHaveBeenCalled()
    })

    it('ignores a key that does not match', () => {
      const action = vi.fn()
      const { container } = setup({ shortcuts: [{ keys: 'Escape', action }] })
      press(container, 'Enter')
      expect(action).not.toHaveBeenCalled()
    })

    it('accepts a list of keys', () => {
      const action = vi.fn()
      const { container } = setup({
        shortcuts: [{ keys: ['Delete', 'Backspace'], action }],
      })
      press(container, 'Delete')
      press(container, 'Backspace')
      expect(action).toHaveBeenCalledTimes(2)
    })

    it('supports a custom match function for modifier combos', () => {
      const action = vi.fn()
      const { container } = setup({
        shortcuts: [
          {
            match: (e) => (e.metaKey || e.ctrlKey) && e.key === 'd',
            action,
          },
        ],
      })
      press(container, 'd')
      expect(action).not.toHaveBeenCalled()
      press(container, 'd', { metaKey: true })
      expect(action).toHaveBeenCalled()
    })

    it('ignores a shortcut with neither keys nor match', () => {
      const action = vi.fn()
      const { container } = setup({ shortcuts: [{ action }] })
      press(container, 'Escape')
      expect(action).not.toHaveBeenCalled()
    })

    it('skips null entries in the list', () => {
      const action = vi.fn()
      const { container } = setup({
        shortcuts: [null, { keys: 'Escape', action }],
      })
      expect(() => press(container, 'Escape')).not.toThrow()
      expect(action).toHaveBeenCalled()
    })

    it('stops at the first match', () => {
      const first = vi.fn()
      const second = vi.fn()
      const { container } = setup({
        shortcuts: [
          { keys: 'Escape', action: first },
          { keys: 'Escape', action: second },
        ],
      })
      press(container, 'Escape')
      expect(first).toHaveBeenCalled()
      expect(second).not.toHaveBeenCalled()
    })
  })

  describe('active gate', () => {
    it('does nothing when inactive', () => {
      const action = vi.fn()
      const { container } = setup({
        active: false,
        shortcuts: [{ keys: 'Escape', action }],
      })
      press(container, 'Escape')
      expect(action).not.toHaveBeenCalled()
    })

    it('accepts a function so the gate can change at runtime', () => {
      const action = vi.fn()
      let enabled = false
      const { container } = setup({
        active: () => enabled,
        shortcuts: [{ keys: 'Escape', action }],
      })
      press(container, 'Escape')
      expect(action).not.toHaveBeenCalled()
      enabled = true
      press(container, 'Escape')
      expect(action).toHaveBeenCalled()
    })
  })

  describe('typing', () => {
    it.each(['INPUT', 'TEXTAREA', 'SELECT'])(
      'ignores keys typed into a %s',
      (tag) => {
        const action = vi.fn()
        const { container } = setup({ shortcuts: [{ keys: 'Escape', action }] })
        press(container, 'Escape', { from: document.createElement(tag) })
        expect(action).not.toHaveBeenCalled()
      },
    )

    it('ignores keys typed into a contenteditable', () => {
      const action = vi.fn()
      const { container } = setup({ shortcuts: [{ keys: 'Escape', action }] })
      const editor = document.createElement('div')
      editor.setAttribute('contenteditable', 'true')
      press(container, 'Escape', { from: editor })
      expect(action).not.toHaveBeenCalled()
    })

    it('still fires when typing detection is disabled', () => {
      const action = vi.fn()
      const { container } = setup({
        ignoreTyping: false,
        shortcuts: [{ keys: 'Escape', action }],
      })
      press(container, 'Escape', { from: document.createElement('input') })
      expect(action).toHaveBeenCalled()
    })
  })

  describe('dialogs', () => {
    it('stays out of the way while a dialog is open', () => {
      // A dialog owns the keyboard; page-level shortcuts must not fire behind it.
      const action = vi.fn()
      const { container } = setup({ shortcuts: [{ keys: 'Escape', action }] })
      dialogs.open = true
      press(container, 'Escape')
      expect(action).not.toHaveBeenCalled()
    })

    it('can opt out of the dialog check', () => {
      const action = vi.fn()
      const { container } = setup({
        skipWhenDialogOpen: false,
        shortcuts: [{ keys: 'Escape', action }],
      })
      dialogs.open = true
      press(container, 'Escape')
      expect(action).toHaveBeenCalled()
    })
  })

  describe('event control', () => {
    it('prevents the default action by default', () => {
      const { container } = setup({
        shortcuts: [{ keys: 'Escape', action: () => {} }],
      })
      expect(press(container, 'Escape').defaultPrevented).toBe(true)
    })

    it('can opt out of preventDefault', () => {
      const { container } = setup({
        shortcuts: [{ keys: 'Escape', action: () => {}, preventDefault: false }],
      })
      expect(press(container, 'Escape').defaultPrevented).toBe(false)
    })

    it('passes the event to the action', () => {
      const action = vi.fn()
      const { container } = setup({ shortcuts: [{ keys: 'Escape', action }] })
      press(container, 'Escape')
      expect(action.mock.calls[0][0]).toBeInstanceOf(KeyboardEvent)
    })

    it('honours a per-shortcut guard', () => {
      const action = vi.fn()
      const { container } = setup({
        shortcuts: [{ keys: 'Escape', guard: () => false, action }],
      })
      press(container, 'Escape')
      expect(action).not.toHaveBeenCalled()
    })

    it('tolerates a shortcut with no action', () => {
      const { container } = setup({ shortcuts: [{ keys: 'Escape' }] })
      expect(() => press(container, 'Escape')).not.toThrow()
    })
  })

  describe('teardown', () => {
    it('detaches the listener on unmount', () => {
      const action = vi.fn()
      const { container, wrapper } = setup({
        shortcuts: [{ keys: 'Escape', action }],
      })
      wrapper.unmount()
      press(container, 'Escape')
      expect(action).not.toHaveBeenCalled()
    })

    it('detaches on an explicit stop()', () => {
      const action = vi.fn()
      const { container, api } = setup({
        shortcuts: [{ keys: 'Escape', action }],
      })
      api.stop()
      press(container, 'Escape')
      expect(action).not.toHaveBeenCalled()
    })
  })
})
