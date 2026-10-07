const api = vi.hoisted(() => ({ isManager: vi.fn(() => true), tabs: null }))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  return {
    ...actual,
    createResource: (options = {}) => {
      api.tabs = reactive({ ...options, data: null, fetch: vi.fn(), reload: vi.fn() })
      return api.tabs
    },
  }
})

vi.mock('@/stores/users', () => ({
  usersStore: () => ({ isManager: api.isManager }),
}))

import TextEditorControl from '@/components/Controls/TextEditorControl.vue'
import ImageUploader from '@/components/Controls/ImageUploader.vue'
import GridRowModal from '@/components/Controls/GridRowModal.vue'
import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'

const TextEditorStub = {
  props: [
    'content', 'placeholder', 'editable', 'editorClass', 'fixedMenu', 'bubbleMenu',
  ],
  emits: ['change', 'blur'],
  template: '<div class="local-editor" />',
}

describe('TextEditorControl', () => {
  const mount = (props = {}) =>
    mountComponent(TextEditorControl, {
      props,
      global: { stubs: { TextEditor: TextEditorStub } },
    })

  const editor = (w) => w.findComponent(TextEditorStub)
  const classesOf = (w) => editor(w).props('editorClass').join(' ')

  describe('what it hands the editor', () => {
    it('passes the value as content', () => {
      expect(editor(mount({ value: '<p>hi</p>' })).props('content')).toBe(
        '<p>hi</p>',
      )
    })

    it('is editable unless disabled', () => {
      expect(editor(mount()).props('editable')).toBe(true)
      expect(editor(mount({ disabled: true })).props('editable')).toBe(false)
    })

    it('hides the toolbar when disabled, whatever the caller asked for', () => {
      // A fixed menu on a read-only field offers formatting buttons that do
      // nothing.
      expect(editor(mount({ fixedMenu: true })).props('fixedMenu')).toBe(true)
      expect(
        editor(mount({ fixedMenu: true, disabled: true })).props('fixedMenu'),
      ).toBe(false)
    })
  })

  describe('editor classes', () => {
    it('uses the subtle variant by default', () => {
      expect(classesOf(mount())).toContain('bg-surface-gray-2')
    })

    it('switches background for the outline variant', () => {
      expect(classesOf(mount({ variant: 'outline' }))).toContain(
        'bg-surface-base',
      )
    })

    it('drops the border entirely for ghost', () => {
      const classes = classesOf(mount({ variant: 'ghost' }))
      expect(classes).toContain('bg-transparent')
      expect(classes).not.toContain('border')
    })

    it('closes the top border when the toolbar sits above it', () => {
      // Enabled, the fixed menu draws the top edge, so the editor must not draw
      // its own or the two stack into a double line.
      expect(classesOf(mount())).toContain('border-t-0')
      expect(classesOf(mount({ disabled: true }))).toContain('border-t')
      expect(classesOf(mount({ disabled: true }))).not.toContain('border-t-0')
    })

    it.each([
      ['sm', 'prose-sm', 'min-h-[8rem]'],
      ['md', 'prose-base', 'min-h-[10rem]'],
      ['lg', 'prose-lg', 'min-h-[12rem]'],
    ])('sizes %s correctly', (size, prose, height) => {
      const classes = classesOf(mount({ size }))
      expect(classes).toContain(prose)
      expect(classes).toContain(height)
    })

    it('shrinks to a uniform height when disabled', () => {
      for (const size of ['sm', 'md', 'lg']) {
        expect(classesOf(mount({ size, disabled: true }))).toContain(
          'min-h-[4rem]',
        )
      }
    })

    it('dims a disabled editor', () => {
      expect(classesOf(mount({ disabled: true }))).toContain('opacity-60')
      expect(classesOf(mount())).not.toContain('opacity-60')
    })

    it('appends any caller-supplied classes last so they can override', () => {
      const classes = editor(mount({ editorClass: 'custom-thing' })).props(
        'editorClass',
      )
      expect(classes.at(-1)).toBe('custom-thing')
    })
  })

  describe('when the change is emitted', () => {
    const type = async (wrapper, text) => {
      await editor(wrapper).vm.$emit('change', text)
      await nextTick()
    }
    const blur = async (wrapper) => {
      await editor(wrapper).vm.$emit('blur')
      await nextTick()
    }

    it('holds back until blur rather than firing on every keystroke', async () => {
      const wrapper = mount({ value: 'a' })
      await type(wrapper, 'ab')
      await type(wrapper, 'abc')
      expect(wrapper.emitted('change')).toBeUndefined()
    })

    it('emits the latest content on blur', async () => {
      const wrapper = mount({ value: 'a' })
      await type(wrapper, 'ab')
      await type(wrapper, 'abc')
      await blur(wrapper)
      expect(wrapper.emitted('change')).toEqual([['abc']])
    })

    it('stays silent when nothing was typed', async () => {
      // Tabbing through a form must not mark every field it passes as changed.
      const wrapper = mount({ value: 'a' })
      await blur(wrapper)
      expect(wrapper.emitted('change')).toBeUndefined()
    })

    it('stays silent when the content came back identical', async () => {
      const wrapper = mount({ value: 'a' })
      await type(wrapper, 'a')
      await blur(wrapper)
      expect(wrapper.emitted('change')).toBeUndefined()
    })

    it('treats an undefined starting value as empty', async () => {
      const wrapper = mount()
      await type(wrapper, '')
      await blur(wrapper)
      expect(wrapper.emitted('change')).toBeUndefined()
    })

    it('emits only once per blur', async () => {
      const wrapper = mount({ value: 'a' })
      await type(wrapper, 'ab')
      await blur(wrapper)
      await blur(wrapper)
      expect(wrapper.emitted('change')).toHaveLength(1)
    })
  })
})

const FileUploaderStub = {
  // Named because each mount spreads this into a fresh object, so neither
  // reference nor anonymous-stub matching would find it.
  name: 'FileUploaderStub',
  props: ['fileTypes'],
  emits: ['success'],
  template:
    '<div class="local-uploader"><slot :progress="progress" :uploading="uploading" :openFileSelector="open" /></div>',
  data: () => ({ progress: 0, uploading: false }),
  methods: {
    open() {
      this.$emit('open-selector')
    },
  },
}

describe('ImageUploader', () => {
  const mount = (props = {}, uploaderData = {}) =>
    mountComponent(ImageUploader, {
      props,
      global: {
        stubs: {
          FileUploader: { ...FileUploaderStub, data: () => ({ progress: 0, uploading: false, ...uploaderData }) },
        },
      },
    })

  const buttons = (w) => w.findAll('.stub-button').map((b) => b.text())

  it('invites an upload when there is no image', () => {
    expect(buttons(mount())).toEqual(['Upload'])
  })

  it('offers Change and Remove once an image exists', () => {
    expect(buttons(mount({ image_url: '/a.png' }))).toEqual(['Change', 'Remove'])
  })

  it('shows progress while uploading', () => {
    expect(buttons(mount({}, { uploading: true, progress: 42 }))).toEqual([
      'Uploading 42%',
    ])
  })

  it('does not offer Remove with nothing to remove', () => {
    expect(buttons(mount())).not.toContain('Remove')
  })

  it('emits remove when Remove is pressed', async () => {
    const wrapper = mount({ image_url: '/a.png' })
    await wrapper.findAll('.stub-button')[1].trigger('click')
    expect(wrapper.emitted('remove')).toHaveLength(1)
  })

  it('emits the uploaded file url, not the file object', async () => {
    const wrapper = mount()
    await wrapper
      .findComponent({ name: 'FileUploaderStub' })
      .vm.$emit('success', { file_url: '/files/logo.png', name: 'FILE-1' })
    expect(wrapper.emitted('upload')).toEqual([['/files/logo.png']])
  })

  it('restricts the picker to images by default', () => {
    expect(
      mount().findComponent({ name: 'FileUploaderStub' }).props('fileTypes'),
    ).toBe('image/*')
  })
})

describe('GridRowModal', () => {
  const FieldLayoutStub = {
    props: ['tabs', 'data', 'doctype', 'isGridRow'],
    template: '<div class="local-field-layout" />',
  }

  const mount = (props = {}) =>
    mountComponent(GridRowModal, {
      props: { modelValue: true, index: 2, doctype: 'CRM Task', ...props },
      global: { stubs: { FieldLayout: FieldLayoutStub } },
    })

  beforeEach(() => {
    api.isManager.mockReturnValue(true)
  })

  it('numbers the row from one, not zero', () => {
    // `index` is the array position; a user counting rows starts at 1.
    expect(mount({ index: 2 }).text()).toContain('Editing Row 3')
  })

  it('waits for the layout before rendering fields', () => {
    const wrapper = mount()
    expect(wrapper.findComponent(FieldLayoutStub).exists()).toBe(false)
  })

  it('renders the layout once it arrives', async () => {
    const wrapper = mount()
    api.tabs.data = [{ name: 'tab', sections: [] }]
    await nextTick()
    expect(wrapper.findComponent(FieldLayoutStub).exists()).toBe(true)
  })

  it('tells the layout it is a grid row', async () => {
    const wrapper = mount()
    api.tabs.data = [{ name: 'tab', sections: [] }]
    await nextTick()
    expect(wrapper.findComponent(FieldLayoutStub).props('isGridRow')).toBe(true)
  })

  it('requests the Grid Row layout for the child doctype', () => {
    mount({ doctype: 'CRM Task', parentDoctype: 'CRM Deal' })
    expect(api.tabs.params).toEqual({
      doctype: 'CRM Task',
      type: 'Grid Row',
      parent_doctype: 'CRM Deal',
    })
  })

  it('caches per doctype pair so two grids do not share a layout', () => {
    mount({ doctype: 'CRM Task', parentDoctype: 'CRM Deal' })
    expect(api.tabs.cache).toEqual(['Grid Row', 'CRM Task', 'CRM Deal'])
  })

  describe('the layout-editor shortcut', () => {
    // Counts are of the modal's own buttons only. The close X used to be one of
    // them; it now belongs to CrmDialog, so a non-manager contributes none.
    it('is offered to a manager', () => {
      expect(mount().findAll('.stub-button')).toHaveLength(1)
    })

    it('is withheld from everyone else', () => {
      api.isManager.mockReturnValue(false)
      expect(mount().findAll('.stub-button')).toHaveLength(0)
    })

    it('opens the field editor and closes this dialog', async () => {
      // Both are dialogs; closing this one first would unmount the component
      // before it could open the other.
      const wrapper = mount()
      await wrapper.findAll('.stub-button')[0].trigger('click')
      expect(wrapper.emitted('update:showGridRowFieldsModal')).toEqual([[true]])
      await nextTick()
      expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    })
  })
})
