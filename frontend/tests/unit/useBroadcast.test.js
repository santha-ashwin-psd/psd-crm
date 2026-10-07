import { mount } from '@vue/test-utils'
import { useBroadcast } from '@/composables/useBroadcast'
import { useDoctypeModal } from '@/composables/doctypeModal'

const STORAGE_KEY = 'app_broadcasts'

/** Mount a component that registers the given listeners on setup. */
function setup(register = () => {}) {
  let api
  const wrapper = mount({
    setup() {
      api = useBroadcast()
      register(api)
      return () => null
    },
  })
  return { api, wrapper }
}

describe('useBroadcast', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('send and receive', () => {
    it('delivers a payload to a listener', () => {
      const handler = vi.fn()
      const { api } = setup((a) => a.on('deal:updated', handler))
      api.send('deal:updated', { name: 'DEAL-1' })
      expect(handler).toHaveBeenCalledWith({ name: 'DEAL-1' })
    })

    it('unwraps the CustomEvent so handlers see the payload directly', () => {
      const handler = vi.fn()
      const { api } = setup((a) => a.on('x', handler))
      api.send('x', 'plain string')
      expect(handler).toHaveBeenCalledWith('plain string')
      expect(handler.mock.calls[0][0]).not.toBeInstanceOf(CustomEvent)
    })

    it('does not deliver events of a different name', () => {
      const handler = vi.fn()
      const { api } = setup((a) => a.on('a', handler))
      api.send('b', {})
      expect(handler).not.toHaveBeenCalled()
    })

    it('delivers to several listeners on the same event', () => {
      const first = vi.fn()
      const second = vi.fn()
      const { api } = setup((a) => {
        a.on('x', first)
        a.on('x', second)
      })
      api.send('x', 1)
      expect(first).toHaveBeenCalled()
      expect(second).toHaveBeenCalled()
    })
  })

  describe('cross-tab replay', () => {
    it('records each send in localStorage for other tabs', () => {
      const { api } = setup()
      api.send('deal:updated', { name: 'DEAL-1' })
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY))
      expect(stored).toHaveLength(1)
      expect(stored[0]).toMatchObject({
        event: 'deal:updated',
        payload: { name: 'DEAL-1' },
      })
    })

    it('replays broadcasts that arrived before the listener mounted', () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([{ event: 'x', payload: 'missed', timestamp: 1 }]),
      )
      const handler = vi.fn()
      setup((a) => a.on('x', handler))
      expect(handler).toHaveBeenCalledWith('missed')
    })

    it('clears only the broadcasts it handled', () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify([
          { event: 'x', payload: 1, timestamp: 1 },
          { event: 'y', payload: 2, timestamp: 2 },
        ]),
      )
      setup((a) => a.on('x', vi.fn()))
      const remaining = JSON.parse(localStorage.getItem(STORAGE_KEY))
      expect(remaining.map((b) => b.event)).toEqual(['y'])
    })

    it('does nothing when there is nothing missed', () => {
      const handler = vi.fn()
      setup((a) => a.on('x', handler))
      expect(handler).not.toHaveBeenCalled()
    })

    it('tolerates an empty storage key', () => {
      expect(() => setup((a) => a.on('x', vi.fn()))).not.toThrow()
    })
  })

  describe('teardown', () => {
    it('stops delivering once the component unmounts', () => {
      // Regression: `off` was passed the original handler while `on` had
      // registered an anonymous wrapper, so removeEventListener matched
      // nothing. Every mount leaked a window listener that kept firing.
      const handler = vi.fn()
      const { api, wrapper } = setup((a) => a.on('x', handler))
      wrapper.unmount()
      api.send('x', 1)
      expect(handler).not.toHaveBeenCalled()
    })

    it('does not leak across repeated mounts', () => {
      const handler = vi.fn()
      const first = setup((a) => a.on('x', handler))
      first.wrapper.unmount()
      const second = setup((a) => a.on('x', handler))

      second.api.send('x', 1)
      // Once, from the live component — not twice.
      expect(handler).toHaveBeenCalledTimes(1)
      second.wrapper.unmount()
    })

    it('removes every listener a component registered', () => {
      const first = vi.fn()
      const second = vi.fn()
      const { api, wrapper } = setup((a) => {
        a.on('x', first)
        a.on('y', second)
      })
      wrapper.unmount()
      api.send('x', 1)
      api.send('y', 1)
      expect(first).not.toHaveBeenCalled()
      expect(second).not.toHaveBeenCalled()
    })
  })
})

describe('useDoctypeModal', () => {
  it('shares one modal state across every consumer', () => {
    expect(useDoctypeModal().show).toBe(useDoctypeModal().show)
  })

  it('opens with the supplied doctype and title', () => {
    const modal = useDoctypeModal()
    modal.showModal({ doctype: 'CRM Deal', title: 'New Deal' })
    expect(modal.show.value).toBe(true)
    expect(modal.doctype.value).toBe('CRM Deal')
    expect(modal.title.value).toBe('New Deal')
  })

  it('defaults name, title, defaults and callbacks', () => {
    const modal = useDoctypeModal()
    modal.showModal({ doctype: 'CRM Lead' })
    expect(modal.name.value).toBeNull()
    expect(modal.title.value).toBe('')
    expect(modal.defaults.value).toEqual({})
  })

  it('carries prefilled values through', () => {
    const modal = useDoctypeModal()
    modal.showModal({ doctype: 'CRM Deal', defaults: { status: 'Open' } })
    expect(modal.defaults.value).toEqual({ status: 'Open' })
  })

  it('opens in edit mode when given a name', () => {
    const modal = useDoctypeModal()
    modal.showModal({ doctype: 'CRM Deal', name: 'DEAL-1' })
    expect(modal.name.value).toBe('DEAL-1')
  })

  it('invokes a registered callback with its arguments', () => {
    const modal = useDoctypeModal()
    const onSuccess = vi.fn()
    modal.showModal({ doctype: 'CRM Deal', callbacks: { onSuccess } })
    modal.triggerCallback('onSuccess', 'DEAL-1')
    expect(onSuccess).toHaveBeenCalledWith('DEAL-1')
  })

  it('ignores a callback that was never registered', () => {
    const modal = useDoctypeModal()
    modal.showModal({ doctype: 'CRM Deal' })
    expect(() => modal.triggerCallback('onSuccess')).not.toThrow()
  })

  it('replaces the previous callbacks when reopened', () => {
    const modal = useDoctypeModal()
    const stale = vi.fn()
    modal.showModal({ doctype: 'CRM Deal', callbacks: { onSuccess: stale } })
    modal.showModal({ doctype: 'CRM Deal' })
    modal.triggerCallback('onSuccess')
    expect(stale).not.toHaveBeenCalled()
  })
})
