import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { globalStore } from '@/stores/global'

/**
 * globalStore reads `$dialog` and `$socket` off the app instance via
 * getCurrentInstance(), so unlike the other stores it can only be created
 * inside a component setup. This mounts a throwaway component to get one.
 */
function setupStore(globalProperties = {}) {
  let store
  const Harness = {
    setup() {
      store = globalStore()
      return () => null
    },
  }
  const wrapper = mount(Harness, {
    global: {
      plugins: [createPinia()],
      config: { globalProperties },
    },
  })
  return { store, wrapper }
}

describe('global store', () => {
  it('exposes the app-level $dialog and $socket', () => {
    // Compared by value, not identity: pinia wraps whatever a setup store
    // returns in `reactive`, so store.$dialog is a proxy of the original.
    const open = vi.fn()
    const emit = vi.fn()
    const { store } = setupStore({ $dialog: { open }, $socket: { emit } })

    expect(store.$dialog).toEqual({ open })
    expect(store.$socket).toEqual({ emit })

    // …and the proxy still reaches the real implementation.
    store.$dialog.open('confirm')
    store.$socket.emit('ping')
    expect(open).toHaveBeenCalledWith('confirm')
    expect(emit).toHaveBeenCalledWith('ping')
  })

  it('starts with the call state idle', () => {
    const { store } = setupStore()
    expect(store.onCall).toBe(false)
    expect(store.calling).toBe(false)
    expect(store.activeNumber).toBe('')
  })

  it('routes makeCall through the registered handler', () => {
    // The telephony component registers the real implementation at runtime;
    // the store only holds the indirection.
    const { store } = setupStore()
    const handler = vi.fn()
    store.setMakeCall(handler)
    store.makeCall('+15551234567')
    expect(handler).toHaveBeenCalledWith('+15551234567')
  })

  it('does nothing when no handler has been registered', () => {
    // Telephony is optional, so calling before setup must be a quiet no-op.
    const { store } = setupStore()
    expect(() => store.makeCall('+15551234567')).not.toThrow()
  })

  it('lets a later handler replace an earlier one', () => {
    const { store } = setupStore()
    const first = vi.fn()
    const second = vi.fn()
    store.setMakeCall(first)
    store.setMakeCall(second)
    store.makeCall('123')
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledWith('123')
  })

  it('holds call state that components can drive', () => {
    const { store } = setupStore()
    store.onCall = true
    store.activeNumber = '+15551234567'
    expect(store.onCall).toBe(true)
    expect(store.activeNumber).toBe('+15551234567')
  })
})
