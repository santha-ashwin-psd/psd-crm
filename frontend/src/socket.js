import { io } from 'socket.io-client'
import { getCachedListResource, getCachedResource } from 'frappe-ui'

// A no-op socket used when realtime can't be established, so callers that hold
// `$socket` never crash on `.on()/.emit()/...`.
function noopSocket() {
  const noop = () => {}
  return { on: noop, off: noop, emit: noop, disconnect: noop, connected: false }
}

export function initSocket() {
  // Frappe injects boot data (site_name, socketio_port, ...) into the served
  // HTML. Both are required to reach the realtime server. If they're missing
  // — e.g. the page was served from a stale cached/offline shell that predates
  // the boot injection — skip connecting instead of hammering a wrong default
  // port, which produced endless `net::ERR_CONNECTION_REFUSED` loops to :9000.
  let socketio_port = window.socketio_port || window.frappe?.boot?.socketio_port
  let siteName = window.site_name || window.frappe?.boot?.sitename

  if (!socketio_port || !siteName) {
    console.info(
      '[crm] Realtime disabled: socketio boot data not available on this page ' +
        '(reload from the server, or clear an old service worker/cache if this persists).',
    )
    return noopSocket()
  }

  let host = window.location.hostname
  let port = window.location.port ? `:${socketio_port}` : ''
  let protocol = port ? 'http' : 'https'
  let url = `${protocol}://${host}${port}/${siteName}`

  let socket = io(url, {
    withCredentials: true,
    reconnectionAttempts: 5,
  })
  socket.on('refetch_resource', (data) => {
    if (data.cache_key) {
      let resource =
        getCachedResource(data.cache_key) ||
        getCachedListResource(data.cache_key)
      if (resource) {
        resource.reload()
      }
    }
  })
  return socket
}
