// The search resource is captured rather than fetched, so `transform` and
// `reload` can be driven directly.
const created = vi.hoisted(() => [])
vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    createResource: (options) => {
      const resource = {
        options,
        params: options.params,
        data: null,
        loading: false,
        fetch: vi.fn(),
        reload: vi.fn(),
        update: vi.fn(function (next) {
          Object.assign(this, next)
        }),
      }
      created.push(resource)
      return resource
    },
  }
})

import Link from '@/components/Controls/Link.vue'
import { mountComponent } from '../helpers/mount'

const STUBS = {
  Autocomplete: {
    name: 'Autocomplete',
    // Link binds with v-model, so the value arrives as `modelValue`.
    props: ['options', 'modelValue', 'placeholder'],
    template: '<div class="autocomplete" />',
  },
}

function mountLink(props = {}, attrs = {}) {
  created.length = 0
  const wrapper = mountComponent(Link, {
    props: { doctype: 'CRM Organization', ...props },
    attrs,
    global: { stubs: STUBS },
  })
  return { wrapper, resource: created[0] }
}

/** Run the search response through the component's own transform. */
const transform = (resource, rows) => resource.options.transform(rows)

describe('Link control', () => {
  beforeEach(() => {
    globalThis.window.translated_doctypes = []
  })

  describe('search results', () => {
    it('maps each result to a label and value', () => {
      const { resource } = mountLink()
      expect(
        transform(resource, [{ value: 'ACME', label: 'ACME Inc' }]),
      ).toEqual([{ label: 'ACME Inc', value: 'ACME', description: '' }])
    })

    it('falls back to the value when a result has no label', () => {
      const { resource } = mountLink()
      expect(transform(resource, [{ value: 'ACME' }])[0].label).toBe('ACME')
    })

    it('strips markup out of the description', () => {
      // Frappe returns descriptions with markup and entities in them.
      const { resource } = mountLink()
      const [row] = transform(resource, [
        {
          value: 'ACME',
          description: '<b>Tech</b>&nbsp;&nbsp;<i>Mumbai</i>',
        },
      ])
      expect(row.description).toBe('Tech Mumbai')
    })

    it('handles a missing description', () => {
      const { resource } = mountLink()
      expect(transform(resource, [{ value: 'ACME' }])[0].description).toBe('')
    })

    it('returns an empty list unchanged', () => {
      const { resource } = mountLink()
      expect(transform(resource, [])).toEqual([])
    })
  })

  describe('the @me shortcut', () => {
    it('leads the list when picking a user', () => {
      const { resource } = mountLink({ doctype: 'User' })
      const rows = transform(resource, [{ value: 'ada@example.com' }])
      expect(rows[0]).toEqual({ label: '@me', value: '@me' })
    })

    it('is withheld when the field excludes the current user', () => {
      const { resource } = mountLink({ doctype: 'User', hideMe: true })
      expect(
        transform(resource, [{ value: 'ada@example.com' }])[0].value,
      ).toBe('ada@example.com')
    })

    it('does not appear for other doctypes', () => {
      const { resource } = mountLink({ doctype: 'CRM Organization' })
      const rows = transform(resource, [{ value: 'ACME' }])
      expect(rows.map((r) => r.value)).not.toContain('@me')
    })
  })

  describe('reading the value', () => {
    it('reads modelValue by default', () => {
      const { wrapper } = mountLink({ modelValue: 'ACME' })
      expect(wrapper.findComponent({ name: 'Autocomplete' }).props('modelValue')).toBe(
        'ACME',
      )
    })

    it('prefers a `value` attribute when one is passed', () => {
      // Some call sites drive the control with `value` + `@change` instead of
      // v-model; the getter has to follow whichever was used.
      const { wrapper } = mountLink({ modelValue: 'ignored' }, { value: 'ACME' })
      expect(wrapper.findComponent({ name: 'Autocomplete' }).props('modelValue')).toBe(
        'ACME',
      )
    })

    it('translates the value for a translatable doctype', () => {
      globalThis.window.translated_doctypes = ['CRM Deal Status']
      const { wrapper } = mountLink({
        doctype: 'CRM Deal Status',
        modelValue: 'Open',
      })
      // The test translator is identity, so this asserts the path is taken
      // without mangling the value.
      expect(wrapper.findComponent({ name: 'Autocomplete' }).props('modelValue')).toBe(
        'Open',
      )
    })
  })

  describe('writing the value', () => {
    it('emits update:modelValue for a v-model binding', () => {
      const { wrapper } = mountLink({ modelValue: '' })
      wrapper.vm.value = { value: 'ACME' }
      expect(wrapper.emitted('update:modelValue')[0]).toEqual(['ACME'])
    })

    it('emits change when driven by a value attribute', () => {
      const { wrapper } = mountLink({}, { value: '' })
      wrapper.vm.value = { value: 'ACME' }
      expect(wrapper.emitted('change')[0]).toEqual(['ACME'])
      expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })

    it('ignores a selection with no value', () => {
      const { wrapper } = mountLink({ modelValue: 'ACME' })
      wrapper.vm.value = { value: '' }
      wrapper.vm.value = null
      expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })

    it('clears the field through the explicit clear path', () => {
      // Because the setter ignores empty values, clearing needs its own route.
      const { wrapper } = mountLink({ modelValue: 'ACME' })
      const close = vi.fn()
      wrapper.vm.clearValue(close)
      expect(wrapper.emitted('update:modelValue')[0]).toEqual([''])
      expect(close).toHaveBeenCalled()
    })
  })

  describe('reloading the search', () => {
    it('refetches for a new query', () => {
      const { wrapper, resource } = mountLink()
      resource.reload.mockClear()
      wrapper.vm.reload('acme')
      expect(resource.reload).toHaveBeenCalled()
      expect(resource.params.txt).toBe('acme')
    })

    it('skips a refetch when the query and doctype are unchanged', () => {
      // Avoids a round trip every time the dropdown reopens on the same text.
      const { wrapper, resource } = mountLink()
      resource.data = [{ value: 'ACME' }]
      resource.params = { txt: 'acme', doctype: 'CRM Organization' }
      resource.reload.mockClear()
      wrapper.vm.reload('acme')
      expect(resource.reload).not.toHaveBeenCalled()
    })

    it('refetches anyway when forced', () => {
      const { wrapper, resource } = mountLink()
      resource.data = [{ value: 'ACME' }]
      resource.params = { txt: 'acme', doctype: 'CRM Organization' }
      resource.reload.mockClear()
      wrapper.vm.reload('acme', true)
      expect(resource.reload).toHaveBeenCalled()
    })

    it('does nothing without a doctype', () => {
      const { wrapper, resource } = mountLink({ doctype: '' })
      resource.reload.mockClear()
      wrapper.vm.reload('acme')
      expect(resource.reload).not.toHaveBeenCalled()
    })
  })
})
