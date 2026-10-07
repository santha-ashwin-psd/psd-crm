const api = vi.hoisted(() => ({ lists: [], broadcast: {} }))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  const make = (opts = {}) => {
    const r = reactive({
      ...opts,
      data: null,
      loading: false,
      fetch: vi.fn(),
      reload: vi.fn(),
      insert: { submit: vi.fn() },
      setValue: { submit: vi.fn() },
      delete: { submit: vi.fn() },
    })
    api.lists.push(r)
    return r
  }
  return {
    ...actual,
    createResource: make,
    createListResource: make,
    createDocumentResource: make,
  }
})

vi.mock('@/composables/useBroadcast', () => ({
  useBroadcast: () => ({
    on: (channel, fn) => (api.broadcast[channel] = fn),
    send: vi.fn(),
  }),
}))

vi.mock('@/composables/doctypeModal', async () => {
  const { reactive } = await import('vue')
  return {
    useDoctypeModal: () => reactive({ show: false, showModal: vi.fn() }),
  }
})

import EmailTemplatePage from '@/components/Settings/EmailTemplate/EmailTemplatePage.vue'
import LeadSyncSourcePage from '@/components/Settings/LeadSyncing/LeadSyncSourcePage.vue'
import AssignmentRulesList from '@/components/Settings/AssignmentRules/AssignmentRulesList.vue'
import ProfilePage from '@/components/Settings/Profile/ProfilePage.vue'
import WhatsAppSettings from '@/components/Settings/WhatsAppSettings.vue'
import GlobalModals from '@/components/Modals/GlobalModals.vue'
import DoctypeModals from '@/components/Modals/DoctypeModals.vue'
import Autocomplete from '@/components/frappe-ui/Autocomplete.vue'
import { mountComponent } from '../helpers/mount'
import { nextTick, reactive } from 'vue'

const quiet = { inheritAttrs: false, template: '<div><slot /></div>' }
const STUBS = {
  NewEmailTemplate: { ...quiet, name: 'NewEmailTemplateStub' },
  EditEmailTemplate: { ...quiet, name: 'EditEmailTemplateStub' },
  EmailTemplates: { ...quiet, name: 'EmailTemplatesStub' },
  LeadSyncSources: { ...quiet, name: 'LeadSyncSourcesStub' },
  LeadSyncSourceForm: { ...quiet, name: 'LeadSyncSourceFormStub' },
  ProfileSettings: { ...quiet, name: 'ProfileSettingsStub' },
  UserEmailSettings: { ...quiet, name: 'UserEmailSettingsStub' },
  AssignmentRuleListItem: { ...quiet, name: 'AssignmentRuleListItemStub' },
  EmptyState: {
    name: 'EmptyStateStub',
    inheritAttrs: false,
    props: ['title'],
    template: '<div />',
  },
  SkeletonLoader: {
    name: 'SkeletonLoaderStub',
    inheritAttrs: false,
    props: ['type'],
    template: '<div />',
  },
  SettingsPage: { ...quiet, name: 'SettingsPageStub' },
  SettingsIcon2: { ...quiet, name: 'S1' },
  FieldLayoutDialogContainer: { ...quiet, name: 'FieldLayoutDialogContainerStub' },
  ChangePasswordModal: { ...quiet, name: 'ChangePasswordModalStub' },
  CreateDocumentModal: { ...quiet, name: 'CreateDocumentModalStub' },
  QuickEntryModal: { ...quiet, name: 'QuickEntryModalStub' },
  AboutModal: { ...quiet, name: 'AboutModalStub' },
  DoctypeModal: { ...quiet, name: 'DoctypeModalStub' },
  Popover: {
    name: 'PopoverStub',
    inheritAttrs: false,
    template:
      '<div><slot name="target" :togglePopover="() => {}" :isOpen="true" /><slot name="body" :isOpen="true" /></div>',
  },
  Combobox: { ...quiet, name: 'ComboboxStub' },
  ComboboxInput: { ...quiet, name: 'ComboboxInputStub' },
  ComboboxOptions: { ...quiet, name: 'ComboboxOptionsStub' },
  ComboboxOption: { ...quiet, name: 'ComboboxOptionStub' },
}

describe('EmailTemplatePage', () => {
  const mount = () =>
    mountComponent(EmailTemplatePage, { global: { stubs: STUBS } })

  beforeEach(() => {
    api.lists = []
    api.broadcast = {}
  })

  it('starts on the list of templates', () => {
    const wrapper = mount()
    expect(wrapper.vm.step).toBe('template-list')
    expect(wrapper.findComponent({ name: 'EmailTemplatesStub' }).exists()).toBe(
      true,
    )
  })

  it('fetches only the templates the CRM can use', () => {
    // The Email Template doctype is shared with the rest of Frappe.
    mount()
    expect(api.lists[0].filters).toEqual({
      reference_doctype: ['in', ['CRM Lead', 'CRM Deal']],
    })
    expect(api.lists[0].doctype).toBe('Email Template')
    expect(api.lists[0].orderBy).toBe('modified desc')
  })

  it('asks for both the plain and the HTML body', () => {
    // A template stores one or the other depending on `use_html`.
    mount()
    expect(api.lists[0].fields).toEqual(
      expect.arrayContaining(['use_html', 'response', 'response_html']),
    )
  })

  it('moves to another step, carrying the template', async () => {
    const wrapper = mount()
    wrapper.vm.updateStep('edit-template', { name: 'T1' })
    await nextTick()
    expect(wrapper.vm.template).toEqual({ name: 'T1' })
    expect(wrapper.findComponent({ name: 'EditEmailTemplateStub' }).exists()).toBe(
      true,
    )
  })

  it('follows another tab that opens a template', async () => {
    // Composing an email in one tab can send you here in another.
    const wrapper = mount()
    api.broadcast['email_template_page']({ page: 'edit-template', name: 'T1' })
    await nextTick()
    expect(wrapper.vm.step).toBe('edit-template')
    expect(wrapper.vm.template.name).toBe('T1')
  })

  it('shows the new-template form', async () => {
    const wrapper = mount()
    wrapper.vm.updateStep('new-template')
    await nextTick()
    expect(wrapper.findComponent({ name: 'NewEmailTemplateStub' }).exists()).toBe(
      true,
    )
  })
})

describe('LeadSyncSourcePage', () => {
  const mount = () =>
    mountComponent(LeadSyncSourcePage, { global: { stubs: STUBS } })

  beforeEach(() => {
    api.lists = []
  })

  it('starts on the list of sources', () => {
    const wrapper = mount()
    expect(wrapper.vm.step).toBe('source-list')
    expect(wrapper.findComponent({ name: 'LeadSyncSourcesStub' }).exists()).toBe(
      true,
    )
  })

  it('asks for what the list needs to draw a row', () => {
    mount()
    expect(api.lists[0].doctype).toBe('Lead Sync Source')
    expect(api.lists[0].fields).toEqual(
      expect.arrayContaining(['enabled', 'type', 'last_synced_at']),
    )
  })

  it('opens the form for a source', async () => {
    const wrapper = mount()
    wrapper.vm.updateStep('edit-source', { name: 'S1' })
    await nextTick()
    expect(wrapper.vm.source).toEqual({ name: 'S1' })
    expect(
      wrapper.findComponent({ name: 'LeadSyncSourceFormStub' }).exists(),
    ).toBe(true)
  })

  it('opens a blank form for a new source', () => {
    const wrapper = mount()
    wrapper.vm.updateStep('new-source')
    expect(wrapper.vm.source).toBeUndefined()
  })
})

describe('ProfilePage', () => {
  const mount = () => mountComponent(ProfilePage, { global: { stubs: STUBS } })

  it('starts on the profile', () => {
    const wrapper = mount()
    expect(wrapper.vm.step).toBe('profile-settings')
    expect(wrapper.findComponent({ name: 'ProfileSettingsStub' }).exists()).toBe(
      true,
    )
  })

  it('switches to the email settings', async () => {
    const wrapper = mount()
    wrapper.vm.updateStep('user-email-settings')
    await nextTick()
    expect(
      wrapper.findComponent({ name: 'UserEmailSettingsStub' }).exists(),
    ).toBe(true)
  })
})

describe('AssignmentRulesList', () => {
  const mount = (list) =>
    mountComponent(AssignmentRulesList, {
      global: {
        stubs: STUBS,
        provide: { assignmentRulesList: reactive(list) },
      },
    })

  it('shows a placeholder while loading', () => {
    const wrapper = mount({ loading: true, data: null })
    expect(wrapper.findComponent({ name: 'SkeletonLoaderStub' }).exists()).toBe(
      true,
    )
  })

  it('shows a row per rule', () => {
    const wrapper = mount({
      loading: false,
      data: [{ name: 'R1' }, { name: 'R2' }],
    })
    expect(
      wrapper.findAllComponents({ name: 'AssignmentRuleListItemStub' }),
    ).toHaveLength(2)
  })

  it('says so when there are none', () => {
    const wrapper = mount({ loading: false, data: [] })
    expect(wrapper.findComponent({ name: 'EmptyStateStub' }).exists()).toBe(true)
  })

  it('does not show the empty state while still loading', () => {
    // A flash of "no rules" before the first response reads as a broken page.
    const wrapper = mount({ loading: true, data: null })
    expect(wrapper.findComponent({ name: 'EmptyStateStub' }).exists()).toBe(false)
  })
})

describe('WhatsAppSettings', () => {
  it('renders the settings shell', () => {
    const wrapper = mountComponent(WhatsAppSettings, { global: { stubs: STUBS } })
    expect(wrapper.findComponent({ name: 'SettingsPageStub' }).exists()).toBe(
      true,
    )
  })
})

describe('GlobalModals', () => {
  const mount = () =>
    mountComponent(GlobalModals, { global: { stubs: STUBS } })

  it('always mounts the ones with no open flag of their own', () => {
    // These live outside any page so they survive navigation.
    const wrapper = mount()
    for (const name of ['FieldLayoutDialogContainerStub', 'AboutModalStub']) {
      expect(wrapper.findComponent({ name }).exists(), name).toBe(true)
    }
  })

  it('leaves the on-demand modals unmounted until they are asked for', () => {
    // Mounting a quick-entry form nobody asked for would fetch its layout.
    const wrapper = mount()
    for (const name of [
      'CreateDocumentModalStub',
      'QuickEntryModalStub',
      'ChangePasswordModalStub',
    ]) {
      expect(wrapper.findComponent({ name }).exists(), name).toBe(false)
    }
  })
})

describe('DoctypeModals', () => {
  it('renders the shared doctype modal', () => {
    const wrapper = mountComponent(DoctypeModals, { global: { stubs: STUBS } })
    expect(wrapper.html()).toBeTruthy()
  })
})

describe('Autocomplete', () => {
  const mount = (props = {}, attrs = {}) =>
    mountComponent(Autocomplete, {
      props,
      attrs,
      global: { stubs: STUBS },
    })

  const option = (label, value = label) => ({ label, value })

  describe('the options it shows', () => {
    it('shows none when given none', () => {
      expect(mount().vm.groups).toEqual([])
    })

    it('puts a flat list into one unnamed group', () => {
      const wrapper = mount({ options: [option('Open'), option('Won')] })
      expect(wrapper.vm.groups).toHaveLength(1)
      expect(wrapper.vm.groups[0].group).toBe('')
      expect(wrapper.vm.groups[0].items).toHaveLength(2)
    })

    it('keeps grouped options in their groups', () => {
      const wrapper = mount({
        options: [
          { group: 'Open', items: [option('New')] },
          { group: 'Closed', items: [option('Won')] },
        ],
      })
      expect(wrapper.vm.groups.map((g) => g.group)).toEqual(['Open', 'Closed'])
    })

    it("carries a group's hidden-label flag through", () => {
      const wrapper = mount({
        options: [{ group: 'Actions', hideLabel: true, items: [option('New')] }],
      })
      expect(wrapper.vm.groups[0].hideLabel).toBe(true)
    })

    it('drops a group with nothing in it', () => {
      const wrapper = mount({
        options: [
          { group: 'Open', items: [option('New')] },
          { group: 'Closed', items: [] },
        ],
      })
      expect(wrapper.vm.groups.map((g) => g.group)).toEqual(['Open'])
    })
  })

  describe('searching', () => {
    const searched = (q, options) => {
      const wrapper = mount({ options })
      wrapper.vm.query = q
      return wrapper.vm.groups.flatMap((g) => g.items).map((o) => o.label)
    }

    it('shows everything before anything is typed', () => {
      expect(searched('', [option('Open'), option('Won')])).toEqual([
        'Open',
        'Won',
      ])
    })

    it('narrows by label', () => {
      expect(searched('wo', [option('Open'), option('Won')])).toEqual(['Won'])
    })

    it('narrows by value too', () => {
      // A saved view's label and its id can differ.
      expect(
        searched('deal', [{ label: 'Hot ones', value: 'crm-deal-view' }]),
      ).toEqual(['Hot ones'])
    })

    it('ignores case', () => {
      expect(searched('WON', [option('Won')])).toEqual(['Won'])
    })

    it('copes with an option that has no label', () => {
      expect(() => searched('x', [{ value: 'v' }])).not.toThrow()
    })

    it('drops a group once nothing in it matches', () => {
      const wrapper = mount({
        options: [
          { group: 'Open', items: [option('New')] },
          { group: 'Closed', items: [option('Won')] },
        ],
      })
      wrapper.vm.query = 'won'
      expect(wrapper.vm.groups.map((g) => g.group)).toEqual(['Closed'])
    })

    it('does not filter when the caller says not to', () => {
      // Link fields search on the server, so filtering again locally would
      // hide results the server deliberately returned.
      const wrapper = mount({ options: [option('Open')], filterable: false })
      wrapper.vm.query = 'zzz'
      expect(wrapper.vm.groups[0].items).toHaveLength(1)
    })

    it('reports what was typed, so a caller can search the server', async () => {
      const wrapper = mount({ options: [] })
      wrapper.vm.query = 'ada'
      await nextTick()
      expect(wrapper.emitted('update:query').at(-1)).toEqual(['ada'])
    })
  })

  describe('what it shows in the box', () => {
    it('shows the label of the chosen value', () => {
      const wrapper = mount({ options: [{ label: 'Won deal', value: 'won' }] })
      expect(wrapper.vm.displayValue('won')).toBe('Won deal')
    })

    it('falls back to the value when nothing matches it', () => {
      const wrapper = mount({ options: [] })
      expect(wrapper.vm.displayValue('won')).toBe('won')
    })

    it('takes the label straight off an option object', () => {
      expect(mount().vm.displayValue({ label: 'Won', value: 'won' })).toBe('Won')
    })

    it('shows nothing for no selection', () => {
      expect(mount().vm.displayValue(null)).toBeUndefined()
    })
  })

  describe('choosing', () => {
    it('reports the choice through the model', async () => {
      const wrapper = mount({ options: [option('Won')], modelValue: '' })
      wrapper.vm.selectedValue = 'Won'
      expect(wrapper.emitted('update:modelValue').at(-1)).toEqual(['Won'])
    })

    it('reports it as a change when the caller passes `value` instead', () => {
      // Half the callers bind `:value`, which is not a model.
      const wrapper = mount({ options: [option('Won')] }, { value: '' })
      wrapper.vm.selectedValue = 'Won'
      expect(wrapper.emitted('change').at(-1)).toEqual(['Won'])
      expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })

    it('reads the current selection from whichever the caller used', () => {
      expect(mount({ modelValue: 'Won' }).vm.selectedValue).toBe('Won')
      expect(mount({}, { value: 'Open' }).vm.selectedValue).toBe('Open')
    })

    it('clears the search and closes once something is chosen', () => {
      const wrapper = mount({ options: [option('Won')] })
      wrapper.vm.query = 'wo'
      wrapper.vm.showOptions = true
      wrapper.vm.selectedValue = 'Won'
      expect(wrapper.vm.query).toBe('')
      expect(wrapper.vm.showOptions).toBe(false)
    })

    it('stays open when the selection is cleared', () => {
      // Clearing is not choosing; the list should still be there to pick from.
      const wrapper = mount({ options: [option('Won')] })
      wrapper.vm.showOptions = true
      wrapper.vm.selectedValue = ''
      expect(wrapper.vm.showOptions).toBe(true)
    })

    it('can be closed outright', () => {
      const wrapper = mount()
      wrapper.vm.showOptions = true
      wrapper.vm.close()
      expect(wrapper.vm.showOptions).toBe(false)
    })
  })

  describe('opening the list', () => {
    it('does not throw when the input is not there yet', async () => {
      // The popover renders its body itself, so on the tick after opening the
      // input may not exist — and this runs inside a watcher.
      const wrapper = mount()
      wrapper.vm.search = null
      wrapper.vm.showOptions = true
      await nextTick()
      await nextTick()
      expect(wrapper.vm.showOptions).toBe(true)
    })
  })

  describe('how it is styled', () => {
    it('dims the text when disabled', () => {
      expect(mount({ disabled: true }).vm.textColor).toBe('text-ink-gray-5')
      expect(mount().vm.textColor).toBe('text-ink-gray-8')
    })

    // `inputClasses` is an array of class groups; flatten it to compare.
    const classesOf = (props) => mount(props).vm.inputClasses.flat(2).join(' ')

    it('has a height for every size', () => {
      for (const size of ['sm', 'md', 'lg', 'xl']) {
        expect(classesOf({ size }), size).toMatch(/h-\d+/)
      }
    })

    it('styles a disabled box the same whatever the variant', () => {
      expect(classesOf({ disabled: true, variant: 'outline' })).toContain(
        'bg-surface-sidebar',
      )
      expect(classesOf({ disabled: true, variant: 'subtle' })).toContain(
        'bg-surface-sidebar',
      )
    })

    it('distinguishes the two variants', () => {
      expect(classesOf({ variant: 'subtle' })).not.toBe(
        classesOf({ variant: 'outline' }),
      )
    })
  })
})
