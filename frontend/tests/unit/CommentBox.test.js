const store = vi.hoisted(() => ({ users: null }))

vi.mock('@/stores/users', async () => {
  const { reactive } = await import('vue')
  store.users = reactive({ data: { crmUsers: [] } })
  return { usersStore: () => ({ users: store.users }) }
})

const telemetry = vi.hoisted(() => ({ capture: vi.fn() }))
vi.mock('frappe-ui/frappe', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useTelemetry: () => ({ capture: telemetry.capture }) }
})

import CommentBox from '@/components/CommentBox.vue'
import { mountComponent } from '../helpers/mount'

/** Stands in for the tiptap editor the real TextEditor exposes. */
const makeEditor = () => ({
  commands: { insertContent: vi.fn(), focus: vi.fn() },
})

const TextEditorStub = (editor) => ({
  name: 'TextEditor',
  props: ['content', 'placeholder', 'editable', 'editorClass', 'bubbleMenu'],
  setup: () => ({ editor }),
  template: '<div><slot name="top" /><slot name="bottom" /></div>',
})

// CommentBox reads `modelValue.name` unguarded for the upload target. Its only
// caller (CommunicationArea) defaults its own doc model to `{}`, so this
// mirrors what the component actually receives in the app.
const mountBox = (props = {}, editor = makeEditor()) =>
  mountComponent(CommentBox, {
    props: { modelValue: {}, ...props },
    global: {
      stubs: {
        TextEditor: TextEditorStub(editor),
        TextEditorBubbleMenu: true,
        FileUploader: true,
        IconPicker: true,
        AttachmentItem: true,
        EditorContent: true,
      },
    },
  })

describe('CommentBox', () => {
  beforeEach(() => {
    telemetry.capture.mockClear()
    store.users.data = { crmUsers: [] }
  })

  describe('the mention list', () => {
    it('offers each enabled user as label and value', () => {
      store.users.data.crmUsers = [
        { name: 'ada@example.com', full_name: 'Ada Lovelace', enabled: 1 },
      ]
      expect(mountBox().vm.users).toEqual([
        { label: 'Ada Lovelace', value: 'ada@example.com' },
      ])
    })

    it('leaves out disabled users', () => {
      // A disabled account cannot act on a mention, so offering it is a trap.
      store.users.data.crmUsers = [
        { name: 'ada@example.com', full_name: 'Ada', enabled: 1 },
        { name: 'zoe@example.com', full_name: 'Zoe', enabled: 0 },
      ]
      expect(mountBox().vm.users.map((u) => u.value)).toEqual([
        'ada@example.com',
      ])
    })

    it('falls back to the address when there is no name', () => {
      store.users.data.crmUsers = [
        { name: 'zoe@example.com', full_name: '', enabled: 1 },
        { name: 'sam@example.com', enabled: 1 },
      ]
      expect(mountBox().vm.users.map((u) => u.label)).toEqual([
        'zoe@example.com',
        'sam@example.com',
      ])
    })

    it('falls back when the name is only whitespace', () => {
      store.users.data.crmUsers = [
        { name: 'zoe@example.com', full_name: '   ', enabled: 1 },
      ]
      expect(mountBox().vm.users[0].label).toBe('zoe@example.com')
    })

    it('is empty before the users have loaded', () => {
      store.users.data = null
      expect(mountBox().vm.users).toEqual([])
    })
  })

  describe('attachments', () => {
    it('drops the one removed and keeps the others', () => {
      // Remove the item as the template does — by identity, from the list the
      // component itself is rendering, not the raw object passed in.
      const wrapper = mountBox({
        attachments: [{ file_url: '/a.png' }, { file_url: '/b.png' }],
      })
      wrapper.vm.removeAttachment(wrapper.vm.attachments[0])
      expect(wrapper.emitted('update:attachments').at(-1)[0]).toEqual([
        { file_url: '/b.png' },
      ])
    })

    it('leaves the list alone when the attachment is not in it', () => {
      const a = { file_url: '/a.png' }
      const wrapper = mountBox({ attachments: [a] })
      wrapper.vm.removeAttachment({ file_url: '/other.png' })
      expect(wrapper.emitted('update:attachments').at(-1)[0]).toEqual([a])
    })
  })

  describe('inserting an emoji', () => {
    it('puts it into the editor and returns focus', () => {
      const editor = makeEditor()
      const wrapper = mountBox({}, editor)
      wrapper.vm.emoji = '🎉'
      wrapper.vm.appendEmoji()
      expect(editor.commands.insertContent).toHaveBeenCalledWith('🎉')
      expect(editor.commands.focus).toHaveBeenCalled()
    })

    it('clears the picker so the next pick re-triggers', () => {
      const wrapper = mountBox()
      wrapper.vm.emoji = '🎉'
      wrapper.vm.appendEmoji()
      expect(wrapper.vm.emoji).toBe('')
    })

    it('reports which emoji was inserted', () => {
      // Regression: the telemetry call used to run after the ref was cleared,
      // so every event recorded an empty emoji.
      const wrapper = mountBox()
      wrapper.vm.emoji = '🎉'
      wrapper.vm.appendEmoji()
      expect(telemetry.capture).toHaveBeenCalledWith(
        'emoji_inserted_in_comment',
        { emoji: '🎉' },
      )
    })
  })
})
