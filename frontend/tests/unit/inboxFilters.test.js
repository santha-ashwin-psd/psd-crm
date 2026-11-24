import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

vi.mock('frappe-ui', () => ({ createResource: () => ({ reload: vi.fn() }) }))

async function load() {
  vi.resetModules()
  return (await import('@/composables/inbox')).inboxFilters
}

describe('Inbox filters', () => {
  afterEach(() => localStorage.clear())

  it('start at the defaults', async () => {
    const f = await load()
    expect([f.search.value, f.filter.value, f.channel.value, f.stage.value]).toEqual(['', 'all', '', ''])
  })

  it('are remembered after a reload', async () => {
    const f = await load()
    f.stage.value = 'Junk'
    f.filter.value = 'needs_reply'
    await nextTick()
    const again = await load()
    expect([again.stage.value, again.filter.value]).toEqual(['Junk', 'needs_reply'])
  })

  it('ignore stored values that are not valid choices', async () => {
    localStorage.setItem('crm-inbox-filters', JSON.stringify({ filter: 'bogus', channel: 'fax' }))
    const f = await load()
    expect([f.filter.value, f.channel.value]).toEqual(['all', ''])
  })

  it('survive broken storage', async () => {
    localStorage.setItem('crm-inbox-filters', '{not json')
    const f = await load()
    expect(f.filter.value).toBe('all')
  })
})
