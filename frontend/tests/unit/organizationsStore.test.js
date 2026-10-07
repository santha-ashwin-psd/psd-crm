vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { fakeResource } = await import('../helpers/pinia.js')
  return { ...actual, createResource: (options) => fakeResource(options) }
})

const nav = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => nav }))

import { organizationsStore } from '@/stores/organizations'
import { withPinia } from '../helpers/pinia'

const ORGS = [
  { name: 'ACME Inc', organization_name: 'ACME Inc', industry: 'Technology' },
  { name: 'SNYC', organization_name: 'SNYC', industry: 'Manufacturing' },
]

describe('organizations store', () => {
  beforeEach(() => {
    withPinia()
    nav.push.mockClear()
  })

  it('indexes organizations by name', () => {
    const store = organizationsStore()
    store.organizations._seed(structuredClone(ORGS))
    expect(store.getOrganization('SNYC').industry).toBe('Manufacturing')
  })

  it('returns the rows so the resource stays populated', () => {
    const store = organizationsStore()
    store.organizations._seed(structuredClone(ORGS))
    expect(store.organizations.data).toHaveLength(2)
  })

  it('returns undefined for an unknown organization', () => {
    const store = organizationsStore()
    store.organizations._seed(structuredClone(ORGS))
    expect(store.getOrganization('Nope')).toBeUndefined()
  })

  it('survives an empty payload', () => {
    const store = organizationsStore()
    expect(() => store.organizations._seed([])).not.toThrow()
    expect(store.organizations.data).toEqual([])
  })

  it('accumulates across refetches rather than dropping the index', () => {
    // The index is never cleared, so a second page of results adds to it.
    const store = organizationsStore()
    store.organizations._seed([ORGS[0]])
    store.organizations._seed([ORGS[1]])
    expect(store.getOrganization('ACME Inc')).toBeDefined()
    expect(store.getOrganization('SNYC')).toBeDefined()
  })

  it('redirects to login on an AuthenticationError', () => {
    const store = organizationsStore()
    store.organizations.options.onError({ exc_type: 'AuthenticationError' })
    expect(nav.push).toHaveBeenCalledWith('/login')
  })

  it('ignores other errors', () => {
    const store = organizationsStore()
    store.organizations.options.onError({ exc_type: 'ValidationError' })
    store.organizations.options.onError(null)
    expect(nav.push).not.toHaveBeenCalled()
  })
})
