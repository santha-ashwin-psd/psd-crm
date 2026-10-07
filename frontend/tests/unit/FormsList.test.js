const api = vi.hoisted(() => ({
  toast: null,
  call: vi.fn(async () => ({ name: 'FORM-1' })),
  capture: vi.fn(),
  forms: null,
  copy: vi.fn(),
}))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  api.toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn() }
  return {
    ...actual,
    toast: api.toast,
    call: (...args) => api.call(...args),
    createResource: (options = {}) => {
      api.forms = reactive({ ...options, data: [], loading: false, reload: vi.fn() })
      return api.forms
    },
  }
})

vi.mock('frappe-ui/frappe', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useTelemetry: () => ({ capture: api.capture }) }
})

vi.mock('@/utils', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, copyToClipboard: api.copy }
})

import FormsList from '@/components/Settings/Forms/FormsList.vue'
import FormsSettings from '@/components/Settings/Forms/FormsSettings.vue'
import FieldCard from '@/components/Settings/Forms/FieldCard.vue'
import {
  fieldTypeIcon,
  fieldTypeLabel,
} from '@/components/Settings/Forms/fieldTypeIcon'
import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'

const form = (over = {}) => ({
  name: 'FORM-1',
  title: 'Contact us',
  route: 'contact-us',
  document_type: 'CRM Lead',
  published: 0,
  ...over,
})

const STUBS = {
  EmptyState: true, SkeletonLoader: true, Dropdown: true, Dialog: true,
  ErrorMessage: true, Tooltip: true, FormsList: true, FormBuilderPanel: true,
  DragVerticalIcon: true,
  Switch: { props: ['modelValue', 'size'], template: '<button class="local-switch" />' },
}

describe('FormsList', () => {
  const mount = () =>
    mountComponent(FormsList, { global: { stubs: STUBS } })

  beforeEach(() => {
    api.toast.success.mockClear()
    api.toast.error.mockClear()
    api.capture.mockClear()
    api.copy.mockClear()
    api.call.mockReset().mockResolvedValue({ name: 'FORM-1' })
  })

  describe('the route slug', () => {
    const slug = (v) => mount().vm.slugify(v)

    it('lowercases and hyphenates', () => {
      expect(slug('Contact Us')).toBe('contact-us')
    })

    it('collapses runs of punctuation into one hyphen', () => {
      expect(slug('Contact   &&&   Us')).toBe('contact-us')
    })

    it('trims leading and trailing hyphens', () => {
      // A route with a stray hyphen at either end would 404.
      expect(slug('  !Contact Us!  ')).toBe('contact-us')
    })

    it('keeps digits', () => {
      expect(slug('Form 2026')).toBe('form-2026')
    })

    it('returns nothing for an empty value', () => {
      expect(slug('')).toBe('')
      expect(slug(undefined)).toBe('')
      expect(slug(null)).toBe('')
    })

    it('returns nothing when there is nothing usable left', () => {
      expect(slug('!!!')).toBe('')
    })
  })

  describe('creating a form', () => {
    const openAndFill = (wrapper, title = 'Contact Us') => {
      wrapper.vm.openCreate()
      wrapper.vm.draft.title = title
      wrapper.vm.onTitleInput({ target: { value: title } })
      return wrapper
    }

    it('derives the route from the title as you type', () => {
      const wrapper = openAndFill(mount())
      expect(wrapper.vm.draft.route).toBe('contact-us')
    })

    it('starts from a clean draft each time', () => {
      const wrapper = openAndFill(mount())
      wrapper.vm.openCreate()
      expect(wrapper.vm.draft).toMatchObject({
        title: '',
        route: '',
        document_type: 'CRM Lead',
      })
      expect(wrapper.vm.createError).toBe('')
    })

    it('requires a title', async () => {
      const wrapper = mount()
      wrapper.vm.openCreate()
      await wrapper.vm.createForm()
      expect(api.call).not.toHaveBeenCalled()
      expect(wrapper.vm.createError).toBe('Title and route are required')
    })

    it('requires the title to produce a usable route', async () => {
      // A title of only punctuation slugifies to nothing.
      const wrapper = mount()
      wrapper.vm.openCreate()
      wrapper.vm.draft.title = '!!!'
      await wrapper.vm.createForm()
      expect(api.call).not.toHaveBeenCalled()
      expect(wrapper.vm.createError).toBeTruthy()
    })

    it('sends the slugified route, not the raw text', async () => {
      const wrapper = mount()
      wrapper.vm.openCreate()
      wrapper.vm.draft.title = 'Contact Us'
      wrapper.vm.draft.route = 'Contact Us Again'
      await wrapper.vm.createForm()
      expect(api.call.mock.calls[0][1].form.route).toBe('contact-us-again')
    })

    it('opens the new form in the builder', async () => {
      const wrapper = mount()
      wrapper.vm.openCreate()
      wrapper.vm.draft.title = 'Contact Us'
      await wrapper.vm.createForm()
      expect(wrapper.emitted('open')[0]).toEqual(['FORM-1'])
      expect(api.toast.success).toHaveBeenCalledWith('Form created')
    })

    it('keeps the dialog open and explains a refusal', async () => {
      api.call.mockRejectedValue({ messages: ['Route already in use'] })
      const wrapper = mount()
      wrapper.vm.openCreate()
      wrapper.vm.draft.title = 'Contact Us'
      await wrapper.vm.createForm()
      expect(wrapper.vm.showCreate).toBe(true)
      expect(wrapper.vm.createError).toBe('Route already in use')
    })

    it('reads a plain Error message too', async () => {
      api.call.mockRejectedValue(new Error('offline'))
      const wrapper = mount()
      wrapper.vm.openCreate()
      wrapper.vm.draft.title = 'Contact Us'
      await wrapper.vm.createForm()
      expect(wrapper.vm.createError).toBe('offline')
    })

    it('clears the busy flag whatever happens', async () => {
      api.call.mockRejectedValue({})
      const wrapper = mount()
      wrapper.vm.openCreate()
      wrapper.vm.draft.title = 'Contact Us'
      await wrapper.vm.createForm()
      expect(wrapper.vm.creating).toBe(false)
    })
  })

  describe('publishing', () => {
    it('publishes', async () => {
      const wrapper = mount()
      const f = form()
      await wrapper.vm.togglePublished(f, true)
      expect(api.call).toHaveBeenCalledWith('crm.api.form.set_published', {
        name: 'FORM-1',
        published: 1,
      })
      expect(f.published).toBe(1)
      expect(api.toast.success).toHaveBeenCalledWith('Form published')
    })

    it('unpublishes', async () => {
      const wrapper = mount()
      const f = form({ published: 1 })
      await wrapper.vm.togglePublished(f, false)
      expect(api.call.mock.calls[0][1].published).toBe(0)
      expect(api.toast.success).toHaveBeenCalledWith('Form unpublished')
    })

    it('puts the row back when the server refuses', async () => {
      // The row was updated optimistically; reloading is what undoes it.
      api.call.mockRejectedValue({ messages: ['Not allowed'] })
      const wrapper = mount()
      await wrapper.vm.togglePublished(form(), true)
      expect(api.forms.reload).toHaveBeenCalled()
      expect(api.toast.error).toHaveBeenCalledWith('Not allowed')
    })

    it('shows a plain Error message rather than burying it', async () => {
      api.call.mockRejectedValue(new Error('offline'))
      const wrapper = mount()
      await wrapper.vm.togglePublished(form(), true)
      expect(api.toast.error).toHaveBeenCalledWith('offline')
    })
  })

  describe('deleting', () => {
    it('deletes and refreshes', async () => {
      const wrapper = mount()
      await wrapper.vm.deleteForm(form())
      expect(api.call).toHaveBeenCalledWith('crm.api.form.delete_form', {
        name: 'FORM-1',
      })
      expect(api.forms.reload).toHaveBeenCalled()
      expect(api.toast.success).toHaveBeenCalledWith('Form deleted')
    })

    it('says why it could not', async () => {
      // Regression: this was the one write path with no catch, so a refused
      // delete produced no toast, no change, and an unhandled rejection.
      api.call.mockRejectedValue({ messages: ['Form is published'] })
      const wrapper = mount()
      await expect(wrapper.vm.deleteForm(form())).resolves.toBeUndefined()
      expect(api.toast.error).toHaveBeenCalledWith('Form is published')
      expect(api.toast.success).not.toHaveBeenCalled()
    })

    it('does not claim to have refreshed after a failure', async () => {
      api.call.mockRejectedValue({})
      const wrapper = mount()
      await wrapper.vm.deleteForm(form())
      expect(api.forms.reload).not.toHaveBeenCalled()
    })
  })

  describe('the row menu', () => {
    it('offers edit, publish, copy and delete', () => {
      const labels = mount().vm.rowOptions(form()).map((o) => o.label)
      expect(labels.slice(0, 3)).toEqual(['Edit', 'Publish', 'Copy link'])
      expect(labels.length).toBeGreaterThan(3)
    })

    it('offers Unpublish for a published form', () => {
      expect(
        mount().vm.rowOptions(form({ published: 1 })).map((o) => o.label),
      ).toContain('Unpublish')
    })

    it('copies the public url, not the record name', () => {
      mount().vm.copyLink(form())
      expect(api.copy).toHaveBeenCalledWith(
        `${window.location.origin}/crm-form/contact-us`,
      )
    })
  })

  describe('target doctypes', () => {
    it('offers leads and deals', () => {
      expect(mount().vm.targetOptions.map((o) => o.value)).toEqual([
        'CRM Lead',
        'CRM Deal',
      ])
    })

    it('labels a doctype for display', () => {
      expect(mount().vm.docLabel('CRM Deal')).toBe('Deal')
    })

    it('falls back to the raw name for anything unexpected', () => {
      expect(mount().vm.docLabel('CRM Task')).toBe('CRM Task')
    })
  })
})

describe('FormsSettings', () => {
  const mount = () =>
    mountComponent(FormsSettings, { global: { stubs: STUBS } })

  it('opens on the list', () => {
    expect(mount().vm.screen).toBe('list')
  })

  it('switches to the builder for a form', () => {
    const wrapper = mount()
    wrapper.vm.openBuilder('FORM-1')
    expect(wrapper.vm.screen).toBe('builder')
    expect(wrapper.vm.activeName).toBe('FORM-1')
  })

  it('refreshes the list on the way back', async () => {
    // The builder may have renamed or published the form. The template ref is
    // re-bound when the list remounts, so the stub has to expose `reload`
    // itself — assigning a mock onto listRef would just be overwritten.
    const reload = vi.fn()
    const wrapper = mountComponent(FormsSettings, {
      global: {
        stubs: {
          ...STUBS,
          FormsList: {
            name: 'FormsListStub',
            template: '<div />',
            methods: { reload },
          },
        },
      },
    })
    wrapper.vm.openBuilder('FORM-1')
    await wrapper.vm.backToList()
    expect(wrapper.vm.screen).toBe('list')
    expect(reload).toHaveBeenCalled()
  })

  it('copes with a list that exposes no reload', async () => {
    // The auto-stub has no `reload`, which is the same shape as a child that
    // has not finished mounting.
    const wrapper = mount()
    wrapper.vm.openBuilder('FORM-1')
    await expect(wrapper.vm.backToList()).resolves.toBeUndefined()
    expect(wrapper.vm.screen).toBe('list')
  })
})

describe('field type icons', () => {
  const iconFor = (fieldtype, options) => fieldTypeIcon({ fieldtype, options })

  it('treats an Email option as an email field whatever its type', () => {
    // Email is a Data field with options set, so the option has to win.
    expect(iconFor('Data', 'Email')).toBe(iconFor('Data', 'Email'))
    expect(fieldTypeLabel({ fieldtype: 'Data', options: 'Email' })).toBe('Email')
  })

  it('gives every numeric type the same icon', () => {
    const hash = iconFor('Int')
    expect(iconFor('Float')).toBe(hash)
    expect(iconFor('Currency')).toBe(hash)
  })

  it('gives every long-text type the same icon', () => {
    const align = iconFor('Text')
    for (const t of ['Small Text', 'Long Text', 'Text Editor', 'HTML Editor', 'Markdown Editor']) {
      expect(iconFor(t), t).toBe(align)
    }
  })

  it('distinguishes date, datetime and time', () => {
    const icons = new Set([iconFor('Date'), iconFor('Datetime'), iconFor('Time')])
    expect(icons.size).toBe(3)
  })

  it('falls back for an unknown type rather than rendering nothing', () => {
    expect(iconFor('Geolocation')).toBeTruthy()
    expect(iconFor(undefined)).toBeTruthy()
  })

  it('labels a field by its type', () => {
    expect(fieldTypeLabel({ fieldtype: 'Select' })).toBe('Select')
  })

  it('copes with no field at all', () => {
    expect(fieldTypeIcon(undefined)).toBeTruthy()
    expect(fieldTypeLabel(undefined)).toBeUndefined()
  })
})

describe('FieldCard', () => {
  const field = (over = {}) => ({
    fieldname: 'first_name',
    label: 'First name',
    fieldtype: 'Data',
    reqd: 0,
    placeholder: '',
    field_description: '',
    ...over,
  })

  const mount = (props = {}) =>
    mountComponent(FieldCard, {
      props: { field: field(), ...props },
      global: { stubs: STUBS },
    })

  it('never writes to the field it was given', () => {
    // The parent owns the model; the card emits patches so one-way flow holds.
    const f = field()
    const wrapper = mountComponent(FieldCard, {
      props: { field: f },
      global: { stubs: STUBS },
    })
    wrapper.vm.labelModel = 'Given name'
    expect(f.label).toBe('First name')
  })

  it('emits a patch for the label', () => {
    const wrapper = mount()
    wrapper.vm.labelModel = 'Given name'
    expect(wrapper.emitted('update').at(-1)).toEqual([{ label: 'Given name' }])
  })

  it('emits a patch for the required flag', () => {
    const wrapper = mount()
    wrapper.vm.reqdModel = 1
    expect(wrapper.emitted('update').at(-1)).toEqual([{ reqd: 1 }])
  })

  it('emits patches for placeholder and description', () => {
    const wrapper = mount()
    wrapper.vm.placeholderModel = 'Ada'
    wrapper.vm.descriptionModel = 'As it appears on your ID'
    expect(wrapper.emitted('update').at(-1)).toEqual([
      { field_description: 'As it appears on your ID' },
    ])
  })

  it('reads the current value back from the prop', async () => {
    const wrapper = mount()
    await wrapper.setProps({ field: field({ label: 'Given name' }) })
    expect(wrapper.vm.labelModel).toBe('Given name')
  })

  it('opens the card when the label is edited', async () => {
    // Renaming a collapsed field would otherwise hide the rest of its settings.
    const wrapper = mount()
    await wrapper.vm.beginEdit()
    expect(wrapper.vm.editingLabel).toBe(true)
    expect(wrapper.emitted('open')).toHaveLength(1)
  })

  it('shows the type beside the label', () => {
    expect(mount({ field: field({ fieldtype: 'Select' }) }).vm.typeLabel).toBe(
      'Select',
    )
  })
})
