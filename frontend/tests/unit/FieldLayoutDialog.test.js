const api = vi.hoisted(() => ({ resources: [] }))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  return {
    ...actual,
    createResource: (options) => {
      api.resources.push(options)
      return reactive({ ...options, data: null, fetch: vi.fn() })
    },
  }
})

const meta = vi.hoisted(() => ({ ref: null }))
vi.mock('@/stores/meta', async () => {
  const { ref } = await import('vue')
  meta.ref = ref(null)
  return { getMeta: () => ({ doctypeMeta: meta.ref, doctypesMeta: {} }) }
})

import FieldLayoutDialog from '@/components/Modals/FieldLayoutDialog.vue'
import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'

const field = (fieldname, extra = {}) => ({
  fieldname,
  label: fieldname,
  fieldtype: 'Data',
  ...extra,
})

const mountDialog = (props = {}) => {
  api.resources = []
  meta.ref.value = null
  return mountComponent(FieldLayoutDialog, {
    props,
    global: { stubs: { Dialog: true, FieldLayout: true, ErrorMessage: true } },
  })
}

/** Every field across the resolved layout, flattened. */
const flatFields = (wrapper) =>
  (wrapper.vm.resolvedTabs || []).flatMap((t) =>
    (t.sections || []).flatMap((s) =>
      (s.columns || []).flatMap((c) => c.fields || []),
    ),
  )

describe('FieldLayoutDialog', () => {
  describe('where the layout comes from', () => {
    it('uses an explicit tab tree as-is', () => {
      const tabs = [{ name: 't', sections: [{ columns: [{ fields: [field('a')] }] }] }]
      const wrapper = mountDialog({ tabs })
      expect(flatFields(wrapper).map((f) => f.fieldname)).toEqual(['a'])
    })

    it('wraps a bare field list into a single tab', () => {
      const wrapper = mountDialog({ fields: [field('a'), field('b')] })
      const tabs = wrapper.vm.resolvedTabs
      expect(tabs).toHaveLength(1)
      expect(tabs[0].sections).toHaveLength(1)
      expect(flatFields(wrapper).map((f) => f.fieldname)).toEqual(['a', 'b'])
    })

    it('prefers explicit tabs over a field list', () => {
      const tabs = [{ sections: [{ columns: [{ fields: [field('fromTabs')] }] }] }]
      const wrapper = mountDialog({ tabs, fields: [field('fromFields')] })
      expect(flatFields(wrapper).map((f) => f.fieldname)).toEqual(['fromTabs'])
    })

    it('picks named fields out of the doctype meta', async () => {
      const wrapper = mountDialog({
        doctype: 'CRM Lead',
        fieldnames: ['first_name', 'email'],
      })
      meta.ref.value = {
        fields: [field('first_name'), field('email'), field('unwanted')],
      }
      await nextTick()
      expect(flatFields(wrapper).map((f) => f.fieldname)).toEqual([
        'first_name',
        'email',
      ])
    })

    it('skips a requested field the doctype does not have', async () => {
      const wrapper = mountDialog({
        doctype: 'CRM Lead',
        fieldnames: ['first_name', 'ghost_field'],
      })
      meta.ref.value = { fields: [field('first_name')] }
      await nextTick()
      expect(flatFields(wrapper).map((f) => f.fieldname)).toEqual(['first_name'])
    })

    it('falls back to fetching the Quick Entry layout', () => {
      mountDialog({ doctype: 'CRM Lead' })
      const r = api.resources[0]
      expect(r.params).toEqual({ doctype: 'CRM Lead', type: 'Quick Entry' })
    })

    it('shows a message when that fetch fails', () => {
      const wrapper = mountDialog({ doctype: 'CRM Lead' })
      api.resources[0].onError()
      expect(wrapper.vm.error).toBe('Failed to load fields layout')
      expect(wrapper.vm.loading).toBe(false)
    })

    it('has no layout at all until something resolves', () => {
      expect(mountDialog({ doctype: 'CRM Lead' }).vm.resolvedTabs).toBeNull()
    })
  })

  describe('marking fields required', () => {
    it('flags the named ones', () => {
      const wrapper = mountDialog({
        fields: [field('a'), field('b')],
        required: ['b'],
      })
      const fields = flatFields(wrapper)
      expect(fields.find((f) => f.fieldname === 'b').reqd).toBe(1)
      expect(fields.find((f) => f.fieldname === 'a').reqd).toBeUndefined()
    })

    it('leaves the caller’s own array untouched', () => {
      // applyRequiredFlags rebuilds the tree rather than mutating the props.
      const original = [field('a')]
      mountDialog({ fields: original, required: ['a'] })
      expect(original[0].reqd).toBeUndefined()
    })

    it('does nothing when nothing is required', () => {
      const wrapper = mountDialog({ fields: [field('a')], required: [] })
      expect(flatFields(wrapper)[0].reqd).toBeUndefined()
    })
  })

  describe('validation', () => {
    it('passes when every required field is filled', () => {
      const wrapper = mountDialog({
        fields: [field('a', { reqd: 1 })],
        defaults: { a: 'filled' },
      })
      expect(wrapper.vm.validate()).toBe(true)
      expect(wrapper.vm.error).toBe('')
    })

    it('names what is missing', () => {
      const wrapper = mountDialog({ fields: [field('a', { reqd: 1 })] })
      expect(wrapper.vm.validate()).toBe(false)
      expect(wrapper.vm.error).toContain('a')
    })

    it('ignores a hidden required field', () => {
      // A field the user cannot see must not block submission.
      const wrapper = mountDialog({
        fields: [field('a', { reqd: 1, hidden: 1 })],
      })
      expect(wrapper.vm.validate()).toBe(true)
    })

    it('clears a previous message on the next attempt', () => {
      const wrapper = mountDialog({
        fields: [field('a', { reqd: 1 })],
      })
      wrapper.vm.validate()
      wrapper.vm.localDoc.a = 'now filled'
      expect(wrapper.vm.validate()).toBe(true)
      expect(wrapper.vm.error).toBe('')
    })
  })

  describe('the default buttons', () => {
    it('offers just Submit by default', () => {
      const wrapper = mountDialog({ fields: [], submitLabel: 'Save' })
      expect(wrapper.vm.resolvedActions.map((a) => a.label)).toEqual(['Save'])
    })

    it('adds Cancel when a label is given', () => {
      const wrapper = mountDialog({ fields: [], cancelLabel: 'Discard' })
      expect(wrapper.vm.resolvedActions.map((a) => a.label)).toContain('Discard')
    })

    it('resolves with the entered data', async () => {
      const wrapper = mountDialog({ fields: [field('a')], defaults: { a: 'x' } })
      await wrapper.vm.resolvedActions[0].onClick()
      expect(wrapper.emitted('resolve').at(-1)[0]).toEqual({ a: 'x' })
    })

    it('will not submit while a required field is empty', async () => {
      const wrapper = mountDialog({ fields: [field('a', { reqd: 1 })] })
      await wrapper.vm.resolvedActions[0].onClick()
      expect(wrapper.emitted('resolve')).toBeUndefined()
    })

    it('runs a supplied onSubmit before resolving', async () => {
      const onSubmit = vi.fn()
      const wrapper = mountDialog({ fields: [], defaults: { a: 1 }, onSubmit })
      await wrapper.vm.resolvedActions[0].onClick()
      expect(onSubmit).toHaveBeenCalledWith({ a: 1 })
      expect(wrapper.emitted('resolve')).toBeTruthy()
    })

    it('stays open and reports when onSubmit throws', async () => {
      // Losing the user's entry because the save failed would be worse.
      const onSubmit = vi.fn().mockRejectedValue(new Error('Server said no'))
      const wrapper = mountDialog({ fields: [], onSubmit })
      await wrapper.vm.resolvedActions[0].onClick()
      expect(wrapper.vm.error).toBe('Server said no')
      expect(wrapper.emitted('resolve')).toBeUndefined()
    })

    it('resolves with null on cancel', () => {
      const onCancel = vi.fn()
      const wrapper = mountDialog({ fields: [], cancelLabel: 'Discard', onCancel })
      wrapper.vm.resolvedActions[1].onClick()
      expect(onCancel).toHaveBeenCalled()
      expect(wrapper.emitted('resolve').at(-1)[0]).toBeNull()
    })
  })

  describe('custom actions', () => {
    it('replaces the default buttons entirely', () => {
      const wrapper = mountDialog({
        fields: [],
        actions: [{ label: 'Approve' }, { label: 'Reject' }],
        submitLabel: 'Save',
      })
      expect(wrapper.vm.resolvedActions.map((a) => a.label)).toEqual([
        'Approve',
        'Reject',
      ])
    })

    it('hands the action the data, a close and a validate', async () => {
      const onClick = vi.fn()
      const wrapper = mountDialog({
        fields: [],
        defaults: { a: 1 },
        actions: [{ label: 'Approve', onClick }],
      })
      await wrapper.vm.resolvedActions[0].onClick()
      expect(onClick).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { a: 1 },
          close: expect.any(Function),
          validate: expect.any(Function),
        }),
      )
    })

    it('lets the action resolve with its own result', async () => {
      const wrapper = mountDialog({
        fields: [],
        actions: [{ label: 'Approve', onClick: ({ close }) => close('approved') }],
      })
      await wrapper.vm.resolvedActions[0].onClick()
      expect(wrapper.emitted('resolve').at(-1)[0]).toBe('approved')
    })

    it('defaults to the form data when the action closes with nothing', async () => {
      const wrapper = mountDialog({
        fields: [],
        defaults: { a: 1 },
        actions: [{ label: 'Approve', onClick: ({ close }) => close() }],
      })
      await wrapper.vm.resolvedActions[0].onClick()
      expect(wrapper.emitted('resolve').at(-1)[0]).toEqual({ a: 1 })
    })

    it('validates and closes for an action with no handler', async () => {
      const wrapper = mountDialog({
        fields: [field('a', { reqd: 1 })],
        actions: [{ label: 'Approve' }],
      })
      await wrapper.vm.resolvedActions[0].onClick()
      expect(wrapper.emitted('resolve')).toBeUndefined()
      wrapper.vm.localDoc.a = 'filled'
      await wrapper.vm.resolvedActions[0].onClick()
      expect(wrapper.emitted('resolve')).toBeTruthy()
    })

    it('clears the busy flag even when the action throws', async () => {
      const wrapper = mountDialog({
        fields: [],
        actions: [{ label: 'Approve', onClick: () => Promise.reject(new Error('x')) }],
      })
      await expect(wrapper.vm.resolvedActions[0].onClick()).rejects.toThrow()
      expect(wrapper.vm.resolvedActions[0].loading).toBe(false)
    })
  })

  describe('resolving exactly once', () => {
    it('ignores a second submit', async () => {
      const wrapper = mountDialog({ fields: [] })
      await wrapper.vm.resolvedActions[0].onClick()
      await wrapper.vm.resolvedActions[0].onClick()
      expect(wrapper.emitted('resolve')).toHaveLength(1)
    })

    it('ignores a cancel after a submit', async () => {
      // Closing the dialog fires the watcher; that must not resolve twice.
      const wrapper = mountDialog({ fields: [] })
      await wrapper.vm.resolvedActions[0].onClick()
      await nextTick()
      expect(wrapper.emitted('resolve')).toHaveLength(1)
    })

    it('resolves once when dismissed by overlay or escape', async () => {
      const wrapper = mountDialog({ fields: [] })
      wrapper.vm.show = false
      await nextTick()
      expect(wrapper.emitted('resolve')).toHaveLength(1)
      expect(wrapper.emitted('resolve')[0][0]).toBeNull()
    })
  })
})
