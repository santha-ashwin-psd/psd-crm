const api = vi.hoisted(() => ({
  toast: null,
  user: null,
  emails: null,
  logs: null,
  shortcuts: null,
  docOptions: {},
}))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  api.toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
  return {
    ...actual,
    toast: api.toast,
    createDocumentResource: (options = {}) => {
      const doc = { name: 'ada@x.com', user_emails: [] }
      api.user = reactive({
        ...options,
        doc,
        originalDoc: JSON.parse(JSON.stringify(doc)),
        save: { submit: vi.fn() },
      })
      return api.user
    },
    createListResource: (options = {}) => {
      const r = reactive({ ...options, data: null, reload: vi.fn(), fetch: vi.fn() })
      if (options.doctype === 'Email Account') api.emails = r
      if (options.doctype === 'Failed Lead Sync Log') api.logs = r
      return r
    },
  }
})

vi.mock('@/composables/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: (config) => {
    api.shortcuts = config.shortcuts
  },
}))

vi.mock('@/data/document', async () => {
  const { reactive } = await import('vue')
  return {
    useDocument: (doctype, name, options = {}) => {
      api.docOptions = options
      return {
        document: reactive({
          doc: { name },
          retrySync: { submit: vi.fn(), loading: false },
        }),
      }
    },
  }
})

import UserEmailSettings from '@/components/Settings/Profile/UserEmailSettings.vue'
import FailureLogs from '@/components/Settings/LeadSyncing/FailureLogs.vue'
import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'

const STUBS = {
  Autocomplete: true, TextEditor: true, Textarea: true, ListView: true,
  Badge: true,
}

describe('UserEmailSettings', () => {
  const mount = () =>
    mountComponent(UserEmailSettings, {
      global: { stubs: STUBS, provide: { session: { user: 'ada@x.com' } } },
    })

  beforeEach(() => {
    api.toast.success.mockClear()
  })

  const account = (name, email_id) => ({ name, email_id })

  describe('which accounts can be linked', () => {
    it('lists the outgoing accounts', () => {
      const wrapper = mount()
      api.emails.data = [account('Support', 'support@x.com')]
      expect(wrapper.vm.filteredEmails).toEqual([
        { label: 'Support', value: 'Support', email: 'support@x.com' },
      ])
    })

    it('fetches only accounts that can send', () => {
      // Linking an incoming-only account would offer a From address that
      // cannot actually send.
      mount()
      expect(api.emails.filters).toEqual({ enable_outgoing: 1 })
    })

    it('hides an account already linked', () => {
      const wrapper = mount()
      api.emails.data = [
        account('Support', 'support@x.com'),
        account('Sales', 'sales@x.com'),
      ]
      api.user.doc.user_emails = [{ email_id: 'support@x.com' }]
      expect(wrapper.vm.filteredEmails.map((e) => e.email)).toEqual([
        'sales@x.com',
      ])
    })

    it('is empty before the accounts load', () => {
      expect(mount().vm.filteredEmails).toEqual([])
    })

    it('copes with a user who has linked nothing yet', () => {
      const wrapper = mount()
      api.emails.data = [account('Support', 'support@x.com')]
      api.user.doc.user_emails = undefined
      expect(wrapper.vm.filteredEmails).toHaveLength(1)
    })
  })

  describe('linking an account', () => {
    it('records the account and its address', () => {
      const wrapper = mount()
      wrapper.vm.addEmail({ label: 'Support', email: 'support@x.com' })
      expect(api.user.doc.user_emails).toEqual([
        { email_account: 'Support', email_id: 'support@x.com' },
      ])
    })

    it('starts the list when there is none', () => {
      const wrapper = mount()
      api.user.doc.user_emails = undefined
      wrapper.vm.addEmail({ label: 'Support', email: 'support@x.com' })
      expect(api.user.doc.user_emails).toHaveLength(1)
    })

    it('keeps existing links', () => {
      const wrapper = mount()
      api.user.doc.user_emails = [{ email_account: 'Sales', email_id: 'sales@x.com' }]
      wrapper.vm.addEmail({ label: 'Support', email: 'support@x.com' })
      expect(api.user.doc.user_emails).toHaveLength(2)
    })
  })

  describe('unlinking an account', () => {
    it('removes it by address', () => {
      const wrapper = mount()
      api.user.doc.user_emails = [
        { email_account: 'Support', email_id: 'support@x.com' },
        { email_account: 'Sales', email_id: 'sales@x.com' },
      ]
      wrapper.vm.removeEmail({ email_id: 'support@x.com' })
      expect(api.user.doc.user_emails.map((e) => e.email_id)).toEqual([
        'sales@x.com',
      ])
    })

    it('puts the account back in the picker', () => {
      const wrapper = mount()
      api.emails.data = [account('Support', 'support@x.com')]
      api.user.doc.user_emails = [{ email_id: 'support@x.com' }]
      expect(wrapper.vm.filteredEmails).toEqual([])
      wrapper.vm.removeEmail({ email_id: 'support@x.com' })
      expect(wrapper.vm.filteredEmails).toHaveLength(1)
    })
  })

  describe('saving', () => {
    it('confirms when it lands', () => {
      const wrapper = mount()
      wrapper.vm.update()
      api.user.save.submit.mock.calls[0][1].onSuccess()
      expect(api.toast.success).toHaveBeenCalledWith(
        'Email settings updated successfully',
      )
    })

    it('reports nothing to save on arrival', () => {
      expect(mount().vm.isDirty).toBe(false)
    })

    it('notices a link being added', async () => {
      const wrapper = mount()
      wrapper.vm.addEmail({ label: 'Support', email: 'support@x.com' })
      await nextTick()
      expect(wrapper.vm.isDirty).toBe(true)
    })
  })

  describe('the save shortcut', () => {
    it('matches cmd+s and ctrl+s', () => {
      mount()
      const { match } = api.shortcuts[0]
      expect(match({ metaKey: true, key: 's' })).toBe(true)
      expect(match({ ctrlKey: true, key: 'S' })).toBe(true)
      expect(match({ metaKey: true, key: 'a' })).toBe(false)
    })

    it('saves only when there is something to save', async () => {
      const wrapper = mount()
      api.shortcuts[0].action()
      expect(api.user.save.submit).not.toHaveBeenCalled()

      wrapper.vm.addEmail({ label: 'Support', email: 'support@x.com' })
      await nextTick()
      api.shortcuts[0].action()
      expect(api.user.save.submit).toHaveBeenCalled()
    })
  })
})

describe('FailureLogs', () => {
  const mount = () =>
    mountComponent(FailureLogs, {
      props: { source: 'Facebook Page A' },
      global: { stubs: STUBS },
    })

  const log = (over = {}) => ({
    name: 'LOG-1',
    type: 'Validation Error',
    lead_data: '{"email":"x@x.com"}',
    traceback: 'Traceback...',
    ...over,
  })

  beforeEach(() => {
    api.toast.success.mockClear()
    api.toast.error.mockClear()
  })

  it('fetches only this source failures', () => {
    mount()
    expect(api.logs.filters).toEqual({ source: 'Facebook Page A' })
  })

  it('lists the id and the reason', () => {
    expect(mount().vm.columns.map((c) => c.key)).toEqual(['name', 'type'])
  })

  describe('opening a log', () => {
    it('shows nothing selected to begin with', () => {
      expect(mount().vm.selectedLog).toBeNull()
    })

    it('loads the document for the selected log', async () => {
      const wrapper = mount()
      wrapper.vm.selectedLog = log()
      await nextTick()
      expect(wrapper.vm.logDoc.document.doc.name).toBe('LOG-1')
    })

    it('does nothing for a log with no id', async () => {
      const wrapper = mount()
      wrapper.vm.selectedLog = { type: 'Validation Error' }
      await nextTick()
      expect(wrapper.vm.logDoc).toBeNull()
    })

    it('goes back to the list', async () => {
      const wrapper = mount()
      wrapper.vm.selectedLog = log()
      await nextTick()
      wrapper.vm.selectedLog = null
      await nextTick()
      expect(wrapper.vm.selectedLog).toBeNull()
    })
  })

  describe('retrying a sync', () => {
    const opened = async () => {
      const wrapper = mount()
      wrapper.vm.selectedLog = log()
      await nextTick()
      return wrapper
    }

    it('confirms when the retry succeeds', async () => {
      await opened()
      api.docOptions.whitelistedMethods.retrySync.onSuccess()
      expect(api.toast.success).toHaveBeenCalledWith('Sync Successful!')
    })

    it('reports a plain Error message', async () => {
      // This handler reads message, messages and exc_type in turn — the shapes
      // a Frappe failure actually arrives in.
      await opened()
      api.docOptions.whitelistedMethods.retrySync.onError(new Error('offline'))
      expect(api.toast.error).toHaveBeenCalledWith('offline')
    })

    it('reports the frappe messages array', async () => {
      await opened()
      api.docOptions.whitelistedMethods.retrySync.onError({
        messages: ['Token expired'],
      })
      expect(api.toast.error).toHaveBeenCalledWith('Token expired')
    })

    it('falls back to the exception type', async () => {
      await opened()
      api.docOptions.whitelistedMethods.retrySync.onError({
        exc_type: 'ValidationError',
      })
      expect(api.toast.error).toHaveBeenCalledWith('ValidationError')
    })

    it('falls back to a generic message when there is nothing at all', async () => {
      await opened()
      api.docOptions.whitelistedMethods.retrySync.onError({})
      expect(api.toast.error).toHaveBeenCalledWith('Error Syncing Lead')
    })
  })
})
