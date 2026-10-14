const api = vi.hoisted(() => ({
  toast: null,
  call: vi.fn(async () => ({ name: 'Support' })),
  capture: vi.fn(),
  addRes: null,
}))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  api.toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
  return {
    ...actual,
    toast: api.toast,
    call: (...a) => api.call(...a),
    createResource: (options = {}) => {
      api.addRes = reactive({ ...options, loading: false, submit: vi.fn() })
      return api.addRes
    },
  }
})

vi.mock('frappe-ui/frappe', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useTelemetry: () => ({ capture: api.capture }) }
})

import EmailAdd from '@/components/Settings/EmailAdd.vue'
import EmailEdit from '@/components/Settings/EmailEdit.vue'
import {
  validateInputs,
  incomingOutgoingFields,
  popularProviderFields,
  customProviderFields,
  services,
} from '@/components/Settings/emailConfig'
import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'
import { flushPromises } from '@vue/test-utils'

const STUBS = { EmailProviderIcon: true, CircleAlert: true }

const validState = (over = {}) => ({
  email_account_name: 'Support',
  email_id: 'support@example.com',
  password: 'secret',
  api_key: '',
  api_secret: '',
  ...over,
})

describe('validateInputs', () => {
  it('accepts a complete popular-provider account', () => {
    expect(validateInputs(validState(), false)).toBe('')
  })

  it('requires an account name', () => {
    expect(validateInputs(validState({ email_account_name: '' }), false)).toBe(
      'Account name is required',
    )
  })

  it('requires an email id', () => {
    expect(validateInputs(validState({ email_id: '' }), false)).toBe(
      'Email ID is required',
    )
  })

  it('rejects a malformed email id', () => {
    expect(validateInputs(validState({ email_id: 'not-an-email' }), false)).toBe(
      'Invalid email ID',
    )
  })

  it('requires a password for a popular provider', () => {
    expect(validateInputs(validState({ password: '' }), false)).toBe(
      'Password is required',
    )
  })

  describe('a custom provider', () => {
    const custom = (over = {}) =>
      validState({ password: '', api_key: 'key', api_secret: 'secret', ...over })

    it('accepts a complete account', () => {
      expect(validateInputs(custom(), true)).toBe('')
    })

    it('does not ask for a password', () => {
      expect(validateInputs(custom({ password: '' }), true)).toBe('')
    })

    it('requires an API key', () => {
      expect(validateInputs(custom({ api_key: '' }), true)).toBe(
        'API key is required',
      )
    })

    it('requires an API secret', () => {
      // Regression: this branch was a bare `return`, so it produced undefined —
      // falsy, which every caller reads as "valid". The account was submitted
      // without a secret and the server blamed the credentials.
      expect(validateInputs(custom({ api_secret: '' }), true)).toBe(
        'API secret is required',
      )
    })

    it('returns something truthy for every missing field', () => {
      for (const field of ['email_account_name', 'email_id', 'api_key', 'api_secret']) {
        expect(validateInputs(custom({ [field]: '' }), true), field).toBeTruthy()
      }
    })
  })
})

describe('the shared field definitions', () => {
  it('asks a popular provider for a password', () => {
    expect(popularProviderFields.map((f) => f.name)).toEqual([
      'email_account_name',
      'email_id',
      'password',
    ])
  })

  it('asks a custom provider for a site and API pair instead', () => {
    expect(customProviderFields.map((f) => f.name)).toEqual([
      'email_account_name',
      'email_id',
      'frappe_mail_site',
      'api_key',
      'api_secret',
    ])
  })

  it('masks both secrets', () => {
    const byName = Object.fromEntries(
      [...popularProviderFields, ...customProviderFields].map((f) => [f.name, f]),
    )
    expect(byName.password.type).toBe('password')
    expect(byName.api_secret.type).toBe('password')
  })

  it('offers the incoming and outgoing switches', () => {
    expect(incomingOutgoingFields.map((f) => f.name)).toEqual([
      'enable_incoming',
      'enable_outgoing',
      'default_incoming',
      'default_outgoing',
      'create_lead_from_incoming_email',
    ])
  })

  it('shows pipeline creation only once incoming is on', () => {
    // Creating pipelines from mail is meaningless without a mailbox being read.
    const f = incomingOutgoingFields.find(
      (x) => x.name === 'create_lead_from_incoming_email',
    )
    expect(f.condition({ enable_incoming: false })).toBe(false)
    expect(f.condition({ enable_incoming: true })).toBe(true)
  })

  it('marks exactly one provider as custom', () => {
    expect(services.filter((s) => s.custom).map((s) => s.name)).toEqual([
      'Frappe Mail',
    ])
  })

  it('gives every provider a help link', () => {
    for (const s of services) {
      expect(s.link, s.name).toMatch(/^https?:\/\//)
    }
  })
})

describe('EmailAdd', () => {
  const mount = () =>
    mountComponent(EmailAdd, { global: { stubs: STUBS } })

  const withService = (custom = false) => {
    const wrapper = mount()
    wrapper.vm.handleSelect(services.find((s) => !!s.custom === custom))
    return wrapper
  }

  beforeEach(() => {
    api.toast.success.mockClear()
    api.capture.mockClear()
    api.call.mockReset().mockResolvedValue({})
  })

  it('shows no form until a provider is chosen', () => {
    expect(mount().vm.selectedService).toBeNull()
  })

  it('records the chosen provider on the account', () => {
    const wrapper = withService(false)
    expect(wrapper.vm.state.service).toBe(wrapper.vm.selectedService.name)
  })

  it('asks for a password for a popular provider', () => {
    expect(withService(false).vm.fields.map((f) => f.name)).toContain('password')
  })

  it('asks for API credentials for a custom provider', () => {
    expect(withService(true).vm.fields.map((f) => f.name)).toContain('api_secret')
  })

  it('refuses to submit an invalid form', () => {
    const wrapper = withService(false)
    wrapper.vm.createEmailAccount()
    expect(api.addRes.submit).not.toHaveBeenCalled()
    expect(wrapper.vm.error).toBeTruthy()
  })

  it('refuses a custom provider with no API secret', () => {
    // Regression: this used to pass validation and be submitted.
    const wrapper = withService(true)
    Object.assign(wrapper.vm.state, {
      email_account_name: 'Support',
      email_id: 'support@example.com',
      api_key: 'key',
      api_secret: '',
    })
    wrapper.vm.createEmailAccount()
    expect(api.addRes.submit).not.toHaveBeenCalled()
    expect(wrapper.vm.error).toBe('API secret is required')
  })

  it('submits a valid form', () => {
    const wrapper = withService(false)
    Object.assign(wrapper.vm.state, {
      email_account_name: 'Support',
      email_id: 'support@example.com',
      password: 'secret',
    })
    wrapper.vm.createEmailAccount()
    expect(api.addRes.submit).toHaveBeenCalledWith({ data: wrapper.vm.state })
    expect(api.capture).toHaveBeenCalledWith('email_account_created')
  })

  it('returns to the list once created', () => {
    const wrapper = withService(false)
    api.addRes.onSuccess()
    expect(wrapper.emitted('update:step')[0]).toEqual(['email-list'])
    expect(api.toast.success).toHaveBeenCalledWith(
      'Email Account created successfully',
    )
  })

  it('shows the server reason when creation is refused', () => {
    const wrapper = withService(false)
    api.addRes.onError({ messages: ['Mailbox already configured'] })
    expect(wrapper.vm.error).toBe('Mailbox already configured')
  })

  it('falls back to the credentials wording', () => {
    // It is the usual cause, so it stays as the fallback.
    const wrapper = withService(false)
    api.addRes.onError({})
    expect(wrapper.vm.error).toBe(
      'Failed to create Email Account, Invalid credentials',
    )
  })
})

describe('EmailEdit', () => {
  const account = (over = {}) => ({
    email_account_name: 'Support',
    service: 'GMail',
    email_id: 'support@example.com',
    password: 'secret',
    api_key: null,
    api_secret: null,
    frappe_mail_site: '',
    enable_incoming: true,
    enable_outgoing: true,
    default_incoming: false,
    default_outgoing: false,
    create_lead_from_incoming_email: false,
    ...over,
  })

  const mount = (accountData = account()) =>
    mountComponent(EmailEdit, {
      props: { accountData },
      global: { stubs: STUBS },
    })

  beforeEach(() => {
    api.toast.success.mockClear()
    api.toast.info.mockClear()
    api.call.mockReset().mockResolvedValue({ name: 'Support' })
  })

  it('loads the account into the form', () => {
    expect(mount().vm.state.email_id).toBe('support@example.com')
  })

  it('picks the field set from the provider', () => {
    expect(mount().vm.fields.map((f) => f.name)).toContain('password')
    expect(
      mount(account({ service: 'Frappe Mail' })).vm.fields.map((f) => f.name),
    ).toContain('api_secret')
  })

  describe('detecting changes', () => {
    it('reports none on arrival', () => {
      expect(mount().vm.isDirty).toBe(false)
    })

    it('notices an email change', async () => {
      const wrapper = mount()
      wrapper.vm.state.email_id = 'sales@example.com'
      await nextTick()
      expect(wrapper.vm.isDirty).toBe(true)
    })

    it('notices the lead-creation switch', async () => {
      // Regression: this field was missing from isDirty, so toggling only it
      // left the form looking untouched and Update discarded the change.
      const wrapper = mount()
      wrapper.vm.state.create_lead_from_incoming_email = true
      await nextTick()
      expect(wrapper.vm.isDirty).toBe(true)
    })

    it('does not report a change just because the server sent 0 or 1', async () => {
      // The form initialises these to false, so a raw 0 from the server would
      // never compare equal. EmailAccountList normalises all five to booleans
      // before handing the account over; without that the account looks edited
      // the moment it is opened.
      const wrapper = mount(
        account({
          enable_incoming: true,
          enable_outgoing: true,
          create_lead_from_incoming_email: false,
        }),
      )
      await nextTick()
      expect(wrapper.vm.isDirty).toBe(false)
    })

    it('notices every other editable switch', async () => {
      for (const field of [
        'enable_incoming', 'enable_outgoing',
        'default_incoming', 'default_outgoing',
      ]) {
        const wrapper = mount()
        wrapper.vm.state[field] = !wrapper.vm.state[field]
        await nextTick()
        expect(wrapper.vm.isDirty, field).toBe(true)
      }
    })
  })

  describe('updating', () => {
    it('says so when nothing changed', async () => {
      const wrapper = mount()
      await wrapper.vm.updateAccount()
      expect(api.call).not.toHaveBeenCalled()
      expect(api.toast.info).toHaveBeenCalledWith('No changes made')
    })

    it('saves a changed field', async () => {
      const wrapper = mount()
      wrapper.vm.state.email_id = 'sales@example.com'
      await nextTick()
      await wrapper.vm.updateAccount()
      await flushPromises()
      expect(api.call).toHaveBeenCalledWith(
        'frappe.client.set_value',
        expect.objectContaining({ doctype: 'Email Account' }),
      )
      expect(api.toast.success).toHaveBeenCalledWith(
        'Email Account updated successfully',
      )
    })

    it('saves the lead-creation switch on its own', async () => {
      const wrapper = mount()
      wrapper.vm.state.create_lead_from_incoming_email = true
      await nextTick()
      await wrapper.vm.updateAccount()
      await flushPromises()
      expect(api.call).toHaveBeenCalled()
      expect(api.toast.info).not.toHaveBeenCalled()
    })

    it('renames when the account name changed', async () => {
      const wrapper = mount()
      wrapper.vm.state.email_account_name = 'Sales'
      await nextTick()
      await wrapper.vm.updateAccount()
      await flushPromises()
      expect(api.call).toHaveBeenCalledWith('frappe.client.rename_doc', {
        doctype: 'Email Account',
        old_name: 'Support',
        new_name: 'Sales',
      })
    })

    it('refuses to save an invalid form', async () => {
      const wrapper = mount()
      wrapper.vm.state.email_id = ''
      await nextTick()
      await wrapper.vm.updateAccount()
      expect(api.call).not.toHaveBeenCalled()
      expect(wrapper.vm.error).toBeTruthy()
    })

    it('shows the server reason when it refuses', async () => {
      // Regression: the catch discarded the error and always blamed the
      // credentials, whatever had actually gone wrong.
      api.call.mockRejectedValue({ messages: ['Name already taken'] })
      const wrapper = mount()
      wrapper.vm.state.email_account_name = 'Sales'
      await nextTick()
      await wrapper.vm.updateAccount()
      await flushPromises()
      expect(wrapper.vm.error).toBe('Name already taken')
    })

    it('falls back to the credentials wording', async () => {
      api.call.mockRejectedValue({})
      const wrapper = mount()
      wrapper.vm.state.email_id = 'sales@example.com'
      await nextTick()
      await wrapper.vm.updateAccount()
      await flushPromises()
      expect(wrapper.vm.error).toBe(
        'Failed to update Email Account, Invalid credentials',
      )
    })

    it('stops the spinner after a failure', async () => {
      api.call.mockRejectedValue({})
      const wrapper = mount()
      wrapper.vm.state.email_id = 'sales@example.com'
      await nextTick()
      await wrapper.vm.updateAccount()
      await flushPromises()
      expect(wrapper.vm.loading).toBe(false)
    })
  })
})
