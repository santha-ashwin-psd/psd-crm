const api = vi.hoisted(() => ({ list: null }))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  return {
    ...actual,
    createListResource: (options = {}) => {
      api.list = reactive({ ...options, data: [], loading: false, reload: vi.fn() })
      return api.list
    },
  }
})

import EmailAccountList from '@/components/Settings/EmailAccountList.vue'
import { mountComponent } from '../helpers/mount'

const mount = () =>
  mountComponent(EmailAccountList, {
    global: {
      stubs: { SettingsLayoutBase: true, SkeletonLoader: true, EmailAccountCard: true },
    },
  })

describe('EmailAccountList', () => {
  it('hides the sample accounts Frappe ships with', () => {
    mount()
    expect(api.list.filters).toEqual({ email_id: ['Not Like', '%example%'] })
  })

  describe('normalising the server flags', () => {
    const normalised = () => {
      mount()
      const accounts = [
        {
          name: 'Support',
          enable_incoming: 1,
          enable_outgoing: 0,
          default_incoming: 1,
          default_outgoing: 0,
          create_lead_from_incoming_email: 0,
        },
      ]
      api.list.onSuccess(accounts)
      return accounts[0]
    }

    it('turns every checkbox field into a real boolean', () => {
      // The edit form initialises them to false and compares with !==, so a
      // raw 0 would make an untouched account look edited.
      const a = normalised()
      for (const key of [
        'enable_incoming', 'enable_outgoing',
        'default_incoming', 'default_outgoing',
        'create_lead_from_incoming_email',
      ]) {
        expect(typeof a[key], key).toBe('boolean')
      }
    })

    it('preserves the values', () => {
      const a = normalised()
      expect(a.enable_incoming).toBe(true)
      expect(a.enable_outgoing).toBe(false)
      expect(a.create_lead_from_incoming_email).toBe(false)
    })
  })
})
