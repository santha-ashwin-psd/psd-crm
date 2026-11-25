import { nextTick, reactive } from 'vue'

const api = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('frappe-ui', () => ({ call: api.call }))

import { numbersFor, prefillCallLog } from '@/composables/callLogPrefill'

const MINE = '+919000000001'
const THEIRS = '+919876543210'

async function start(values = {}) {
  const doc = reactive({ reference_doctype: 'CRM Deal', reference_docname: 'PIPE-1', ...values })
  const stop = await prefillCallLog(() => doc)
  return { doc, stop }
}

describe('call log numbers', () => {
  beforeEach(() => {
    api.call.mockReset().mockResolvedValue({ mine: MINE, theirs: THEIRS })
  })

  it('puts my number first on an outgoing call, theirs on an incoming one', () => {
    expect(numbersFor('Outgoing', MINE, THEIRS)).toEqual({ from: MINE, to: THEIRS })
    expect(numbersFor('Incoming', MINE, THEIRS)).toEqual({ from: THEIRS, to: MINE })
  })

  it('starts a new log as an outgoing, completed call with both numbers', async () => {
    const { doc } = await start()
    expect(api.call).toHaveBeenCalledWith('xbr_crm.api.call_log.get_prefill', {
      reference_doctype: 'CRM Deal',
      reference_docname: 'PIPE-1',
    })
    expect([doc.type, doc.status, doc.from, doc.to]).toEqual(['Outgoing', 'Completed', MINE, THEIRS])
  })

  it('swaps the numbers when the type changes', async () => {
    const { doc } = await start()
    doc.type = 'Incoming'
    await nextTick()
    expect([doc.from, doc.to]).toEqual([THEIRS, MINE])
  })

  it('never overwrites a number someone typed', async () => {
    const { doc } = await start()
    doc.to = '+911234567890'
    doc.type = 'Incoming'
    await nextTick()
    expect(doc.from).toBe(THEIRS)
    expect(doc.to).toBe('+911234567890')
  })

  it('keeps a type and status that were already chosen', async () => {
    const { doc } = await start({ type: 'Incoming', status: 'No Answer' })
    expect([doc.type, doc.status, doc.from, doc.to]).toEqual(['Incoming', 'No Answer', THEIRS, MINE])
  })

  it('leaves the numbers empty when they cannot be fetched', async () => {
    api.call.mockRejectedValue(new Error('offline'))
    const { doc } = await start()
    expect([doc.from, doc.to]).toEqual(['', ''])
  })

  it('stops following the type once stopped', async () => {
    const { doc, stop } = await start()
    stop()
    doc.type = 'Incoming'
    await nextTick()
    expect([doc.from, doc.to]).toEqual([MINE, THEIRS])
  })
})
