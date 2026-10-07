/**
 * Safely extract a human-readable error message from various error shapes
 * produced by frappe-ui createResource / createCall error callbacks.
 *
 * @param {unknown} err - The error value (string, Error, or frappe API error object)
 * @param {string} [fallback] - Fallback message if nothing is extractable
 * @returns {string} - A translated, human-readable message
 */
export function formatError(err, fallback = 'An error occurred') {
  if (!err) return __(fallback)
  if (typeof err === 'string') return err.startsWith('__') ? err : __(err)
  // frappe API error shape: { messages: [...], message: '...' }
  const msg =
    err?.messages?.[0] ||
    err?.message ||
    (typeof err?.toString === 'function' && err.toString() !== '[object Object]'
      ? err.toString()
      : null)
  return msg ? __(msg) : __(fallback)
}
