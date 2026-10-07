const api = vi.hoisted(() => ({
  toast: null,
  call: vi.fn(async () => ({})),
  dialog: vi.fn(),
  user: 'ada@x.com',
}))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  api.toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
  return { ...actual, toast: api.toast, call: (...a) => api.call(...a) }
})

vi.mock('@/stores/session', () => ({
  sessionStore: () => ({ user: api.user }),
}))

vi.mock('@/stores/global', () => ({
  globalStore: () => ({ $dialog: api.dialog, $socket: { on: vi.fn(), off: vi.fn() } }),
}))

vi.mock('@/stores/users', () => ({
  usersStore: () => ({
    getUser: (e) => ({ name: e, email: e, full_name: e, user_image: '' }),
    isManager: () => true,
    users: { data: { crmUsers: [] } },
  }),
}))

// `taskStatusOptions` / `taskPriorityOptions` call `getMeta('CRM Task')`, which
// without this reaches the real store and fires a network request for the
// doctype. That failed silently as an unhandled rejection rather than as a test
// failure — see the fetch guard in tests/setup.js.
vi.mock('@/stores/meta', () => ({
  getMeta: () => ({
    getFields: () => [
      {
        fieldname: 'status',
        options: [
          { value: 'Backlog' }, { value: 'Todo' }, { value: 'In Progress' },
          { value: 'Done' }, { value: 'Canceled' },
        ],
      },
      {
        fieldname: 'priority',
        options: [{ value: 'Low' }, { value: 'Medium' }, { value: 'High' }],
      },
    ],
    doctypeMeta: {},
    doctypesMeta: {},
  }),
}))

vi.mock('@/composables/useTimelinePreferences', async () => {
  const { ref } = await import('vue')
  return { useTimelinePreferences: () => ({ showExactTimestamp: ref(false) }) }
})

import CommentArea from '@/components/Activities/CommentArea.vue'
import AttachmentArea from '@/components/Activities/AttachmentArea.vue'
import TaskArea from '@/components/Activities/TaskArea.vue'
import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'
import { flushPromises } from '@vue/test-utils'

const STUBS = {
  UserAvatar: true, AttachmentItem: true, TextEditor: true, Dropdown: true,
  Tooltip: true, TimelineTimestamp: true, CalendarIcon: true,
  TaskStatusIcon: true, TaskPriorityIcon: true, DotIcon: true,
  FileAudioIcon: true, FileTextIcon: true, FileVideoIcon: true,
}

describe('CommentArea', () => {
  const comment = (over = {}) => ({
    name: 'COMMENT-1',
    owner: 'ada@x.com',
    content: '<p>Original</p>',
    creation: '2026-03-15 09:00:00',
    ...over,
  })

  const mount = (activity = comment()) =>
    mountComponent(CommentArea, {
      props: { activity },
      global: { stubs: STUBS },
    })

  beforeEach(() => {
    api.toast.error.mockClear()
    api.call.mockReset().mockResolvedValue({})
    api.user = 'ada@x.com'
  })

  describe('who may edit', () => {
    it('recognises the author', () => {
      expect(mount().vm.isOwner).toBe(true)
    })

    it('does not treat anyone else as the author', () => {
      expect(mount(comment({ owner: 'grace@x.com' })).vm.isOwner).toBe(false)
    })
  })

  describe('editing', () => {
    it('starts from the current content', () => {
      const wrapper = mount()
      wrapper.vm.startEdit()
      expect(wrapper.vm.editing).toBe(true)
      expect(wrapper.vm.editContent).toBe('<p>Original</p>')
    })

    it('discards the draft on cancel', () => {
      const wrapper = mount()
      wrapper.vm.startEdit()
      wrapper.vm.editContent = '<p>Changed</p>'
      wrapper.vm.cancelEdit()
      expect(wrapper.vm.editing).toBe(false)
      expect(wrapper.vm.editContent).toBe('')
    })

    it('saves a real change', async () => {
      const wrapper = mount()
      wrapper.vm.startEdit()
      wrapper.vm.editContent = '<p>Changed</p>'
      await wrapper.vm.saveEdit()
      expect(api.call).toHaveBeenCalledWith('frappe.client.set_value', {
        doctype: 'Comment',
        name: 'COMMENT-1',
        fieldname: 'content',
        value: '<p>Changed</p>',
      })
      expect(wrapper.emitted('reload')).toHaveLength(1)
    })

    it('closes without saving when nothing changed', async () => {
      // Tabbing out of an untouched editor must not write to the server.
      const wrapper = mount()
      wrapper.vm.startEdit()
      await wrapper.vm.saveEdit()
      expect(api.call).not.toHaveBeenCalled()
      expect(wrapper.vm.editing).toBe(false)
    })

    it('stays open when the save is refused', async () => {
      // The edit is unsaved; closing would lose it.
      api.call.mockRejectedValue({ messages: ['Not permitted'] })
      const wrapper = mount()
      wrapper.vm.startEdit()
      wrapper.vm.editContent = '<p>Changed</p>'
      await wrapper.vm.saveEdit()
      expect(wrapper.vm.editing).toBe(true)
      expect(wrapper.emitted('reload')).toBeUndefined()
    })

    it('shows the server reason rather than a generic sentence', async () => {
      // Regression: the error was bound and then discarded.
      api.call.mockRejectedValue({ messages: ['Not permitted'] })
      const wrapper = mount()
      wrapper.vm.startEdit()
      wrapper.vm.editContent = '<p>Changed</p>'
      await wrapper.vm.saveEdit()
      expect(api.toast.error).toHaveBeenCalledWith('Not permitted')
    })

    it('falls back when the failure carries nothing', async () => {
      api.call.mockRejectedValue({})
      const wrapper = mount()
      wrapper.vm.startEdit()
      wrapper.vm.editContent = '<p>Changed</p>'
      await wrapper.vm.saveEdit()
      expect(api.toast.error).toHaveBeenCalledWith('Failed to update comment')
    })

    it('clears the busy flag whatever happens', async () => {
      api.call.mockRejectedValue({})
      const wrapper = mount()
      wrapper.vm.startEdit()
      wrapper.vm.editContent = '<p>Changed</p>'
      await wrapper.vm.saveEdit()
      expect(wrapper.vm.saving).toBe(false)
    })
  })

  describe('deleting', () => {
    it('deletes and asks for a refresh', async () => {
      const wrapper = mount()
      await wrapper.vm.deleteComment()
      expect(api.call).toHaveBeenCalledWith('frappe.client.delete', {
        doctype: 'Comment',
        name: 'COMMENT-1',
      })
      expect(wrapper.emitted('reload')).toHaveLength(1)
    })

    it('reports the server reason', async () => {
      api.call.mockRejectedValue(new Error('offline'))
      const wrapper = mount()
      await wrapper.vm.deleteComment()
      expect(api.toast.error).toHaveBeenCalledWith('offline')
      expect(wrapper.emitted('reload')).toBeUndefined()
    })
  })

  describe('the menu', () => {
    it('offers edit and delete', () => {
      const labels = mount().vm.menuOptions.map((o) => o.label)
      expect(labels).toContain('Edit')
      expect(labels.length).toBeGreaterThan(1)
    })
  })

  // Delete is two-step: the first click swaps the row for a "Confirm Delete"
  // row, and only the second one deletes. Both rows are always in the options
  // array; which one shows is decided by a `condition()`, so the latch is the
  // whole safety mechanism.
  describe('the delete confirmation', () => {
    const rowFor = (wrapper, label) =>
      wrapper.vm.menuOptions.find((o) => o.label === label)

    it('starts by offering Delete, not Confirm Delete', () => {
      const wrapper = mount()
      expect(rowFor(wrapper, 'Delete').condition()).toBe(true)
      expect(rowFor(wrapper, 'Confirm Delete').condition()).toBe(false)
    })

    it('swaps to Confirm Delete once armed', () => {
      const wrapper = mount()
      wrapper.vm.confirmingDelete = true
      expect(rowFor(wrapper, 'Delete').condition()).toBe(false)
      expect(rowFor(wrapper, 'Confirm Delete').condition()).toBe(true)
    })

    it('deletes nothing until it is armed', () => {
      const wrapper = mount()
      expect(wrapper.vm.confirmingDelete).toBe(false)
      expect(api.call).not.toHaveBeenCalled()
    })
  })
})

describe('AttachmentArea', () => {
  const mount = (attachments = []) =>
    mountComponent(AttachmentArea, {
      props: { attachments },
      global: { stubs: STUBS },
    })

  beforeEach(() => {
    api.toast.error.mockClear()
    api.dialog.mockClear()
    api.call.mockReset().mockResolvedValue({})
  })

  describe('choosing an icon', () => {
    const icon = (type) => mount().vm.fileIcon(type)

    it('distinguishes audio, video and everything else', () => {
      const icons = new Set([icon('mp3'), icon('mp4'), icon('pdf')])
      expect(icons.size).toBe(3)
    })

    it('ignores case in the extension', () => {
      expect(icon('MP3')).toBe(icon('mp3'))
      expect(icon('MOV')).toBe(icon('mov'))
    })

    it('falls back for a file with no type at all', () => {
      expect(icon(undefined)).toBe(icon('pdf'))
      expect(icon('')).toBe(icon('pdf'))
    })
  })

  describe('opening a file', () => {
    it('opens it in a new tab', () => {
      const open = vi.spyOn(window, 'open').mockImplementation(() => {})
      mount().vm.openFile({ file_url: '/files/a.pdf' })
      expect(open).toHaveBeenCalledWith('/files/a.pdf', '_blank')
      open.mockRestore()
    })
  })

  describe('changing visibility', () => {
    it('asks first, naming the direction', () => {
      mount().vm.togglePrivate('FILE-1', true)
      expect(api.dialog).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Make attachment public' }),
      )
    })

    it('names the other direction too', () => {
      mount().vm.togglePrivate('FILE-1', false)
      expect(api.dialog).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Make attachment private' }),
      )
    })

    it('flips the flag once confirmed', async () => {
      const wrapper = mount()
      wrapper.vm.togglePrivate('FILE-1', true)
      const close = vi.fn()
      await api.dialog.mock.calls[0][0].actions[0].onClick(close)
      expect(api.call).toHaveBeenCalledWith('frappe.client.set_value', {
        doctype: 'File',
        name: 'FILE-1',
        fieldname: { is_private: false },
      })
      expect(wrapper.emitted('reload')).toHaveLength(1)
      expect(close).toHaveBeenCalled()
    })

    it('says why it could not, instead of rejecting into nothing', async () => {
      // Regression: no catch at all, so a refused change left the dialog open
      // with no message and an unhandled rejection in the console.
      api.call.mockRejectedValue({ messages: ['Not permitted'] })
      const wrapper = mount()
      wrapper.vm.togglePrivate('FILE-1', true)
      const close = vi.fn()
      await api.dialog.mock.calls[0][0].actions[0].onClick(close)
      expect(api.toast.error).toHaveBeenCalledWith('Not permitted')
      expect(close).not.toHaveBeenCalled()
      expect(wrapper.emitted('reload')).toBeUndefined()
    })
  })

  describe('deleting', () => {
    it('asks first', () => {
      mount().vm.deleteAttachment('FILE-1')
      expect(api.dialog).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Delete Attachment' }),
      )
      expect(api.call).not.toHaveBeenCalled()
    })

    it('deletes once confirmed', async () => {
      const wrapper = mount()
      wrapper.vm.deleteAttachment('FILE-1')
      const close = vi.fn()
      await api.dialog.mock.calls[0][0].actions[0].onClick(close)
      expect(api.call).toHaveBeenCalledWith('frappe.client.delete', {
        doctype: 'File',
        name: 'FILE-1',
      })
      expect(wrapper.emitted('reload')).toHaveLength(1)
    })

    it('says why it could not', async () => {
      api.call.mockRejectedValue(new Error('offline'))
      const wrapper = mount()
      wrapper.vm.deleteAttachment('FILE-1')
      const close = vi.fn()
      await api.dialog.mock.calls[0][0].actions[0].onClick(close)
      expect(api.toast.error).toHaveBeenCalledWith('offline')
      expect(close).not.toHaveBeenCalled()
    })
  })
})

describe('TaskArea', () => {
  const mount = (tasks = [], modalRef = {}) =>
    mountComponent(TaskArea, {
      props: { tasks, modalRef },
      global: { stubs: STUBS },
    })

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T10:00:00'))
  })

  afterEach(() => vi.useRealTimers())

  describe('overdue tasks', () => {
    it('flags a past due date', () => {
      expect(mount().vm.isOverdue('2026-03-14 09:00:00', 'Todo')).toBe(true)
    })

    it('does not flag a future one', () => {
      expect(mount().vm.isOverdue('2026-03-20 09:00:00', 'Todo')).toBe(false)
    })

    it('never flags a completed task', () => {
      // It was finished; whether it was late is not actionable now.
      // 'Done', not 'Completed' — CRM Task's statuses are
      // Backlog / Todo / In Progress / Done / Canceled (crm_task.json). The
      // component checked for a status the doctype never produces, so a
      // finished task was still flagged overdue and its checkbox never ticked.
      expect(mount().vm.isOverdue('2026-03-14 09:00:00', 'Done')).toBe(false)
    })

    it('does not flag a task with no due date', () => {
      expect(mount().vm.isOverdue('', 'Todo')).toBe(false)
      expect(mount().vm.isOverdue(undefined, 'Todo')).toBe(false)
    })
  })

  describe('the done checkbox', () => {
    const task = (status) => ({
      name: 'TASK-1',
      title: 'Call back',
      status,
      priority: 'Low',
    })

    it('is ticked only for a task that is actually done', () => {
      // The component compared against 'Completed', which is not one of CRM
      // Task's statuses (Backlog / Todo / In Progress / Done / Canceled), so
      // the box never ticked no matter what state the task was in.
      expect(
        mount([task('Done')]).find('input[type="checkbox"]').element.checked,
      ).toBe(true)
      expect(
        mount([task('Todo')]).find('input[type="checkbox"]').element.checked,
      ).toBe(false)
    })

    it('toggles with the arguments updateTaskStatus actually takes', async () => {
      // AllModals declares updateTaskStatus(status, task); the checkbox passed
      // (task.name, status), so `task.name` was read off a string and the write
      // never reached the server.
      const updateTaskStatus = vi.fn()
      const wrapper = mount([task('Todo')], { updateTaskStatus })
      await wrapper.find('input[type="checkbox"]').trigger('change')
      expect(updateTaskStatus).toHaveBeenCalledWith(
        'Done',
        expect.objectContaining({ name: 'TASK-1' }),
      )
    })

    it('unticks back to Todo', async () => {
      const updateTaskStatus = vi.fn()
      const wrapper = mount([task('Done')], { updateTaskStatus })
      await wrapper.find('input[type="checkbox"]').trigger('change')
      expect(updateTaskStatus).toHaveBeenCalledWith(
        'Todo',
        expect.objectContaining({ name: 'TASK-1' }),
      )
    })
  })
})
