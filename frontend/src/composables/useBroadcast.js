import { onMounted, onUnmounted } from 'vue'

const STORAGE_KEY = 'app_broadcasts'
const bus = {
  send(event, payload) {
    window.dispatchEvent(new CustomEvent(event, { detail: payload }))

    const broadcasts = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    broadcasts.push({ event, payload, timestamp: Date.now() })
    localStorage.setItem(STORAGE_KEY, JSON.stringify(broadcasts))
  },
  // Returns the wrapper actually registered on window. `off` must be given
  // that wrapper, not the original handler — removeEventListener compares by
  // reference, so passing the handler removed nothing and every `on` leaked a
  // window listener that kept firing after the component was gone.
  on(event, handler) {
    const wrapped = (e) => handler(e.detail)
    window.addEventListener(event, wrapped)
    return wrapped
  },
  off(event, wrapped) {
    window.removeEventListener(event, wrapped)
  },
}

export function useBroadcast() {
  const listeners = []

  function on(event, handler) {
    const wrapped = bus.on(event, handler)
    listeners.push({ event, wrapped })

    // check localStorage for missed broadcasts on init
    onMounted(() => {
      const broadcasts = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
      const missed = broadcasts.filter((b) => b.event === event)
      if (missed.length) {
        missed.forEach((b) => handler(b.payload))
        // clear handled broadcasts
        const remaining = broadcasts.filter((b) => b.event !== event)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining))
      }
    })
  }

  onUnmounted(() => {
    listeners.forEach(({ event, wrapped }) => bus.off(event, wrapped))
  })

  return { on, send: bus.send }
}
