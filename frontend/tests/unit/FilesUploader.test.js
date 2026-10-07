const api = vi.hoisted(() => ({
  toast: null,
  resource: null,
  handlers: [],
}))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  api.toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }
  return {
    ...actual,
    toast: api.toast,
    createResource: (opts = {}) => {
      api.resource = reactive({ ...opts, data: null, fetch: vi.fn(), reload: vi.fn() })
      return api.resource
    },
  }
})

vi.mock('@/components/FilesUploader/filesUploaderHandler', () => {
  class FakeHandler {
    constructor() {
      this.listeners = {}
      api.handlers.push(this)
      this.upload = vi.fn(
        (file, args) =>
          new Promise((resolve, reject) => {
            this.resolve = resolve
            this.reject = reject
            this.args = args
          }),
      )
    }
    on(event, fn) {
      this.listeners[event] = fn
    }
    emit(event, payload) {
      this.listeners[event]?.(payload)
    }
  }
  return { default: FakeHandler }
})

import FilesUploader from '@/components/FilesUploader/FilesUploader.vue'
import FilesUploaderArea from '@/components/FilesUploader/FilesUploaderArea.vue'
import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'
import { flushPromises } from '@vue/test-utils'

const quiet = { inheritAttrs: false, template: '<div><slot /></div>' }
const STUBS = {
  FormControl: { ...quiet, name: 'FormControlStub' },
  CircularProgressBar: { ...quiet, name: 'S1' },
  FileTextIcon: { ...quiet, name: 'S2' },
  FileAudioIcon: { ...quiet, name: 'S3' },
  FileVideoIcon: { ...quiet, name: 'S4' },
  Dialog: {
    name: 'DialogStub',
    inheritAttrs: false,
    props: ['open', 'modelValue'],
    template: '<div v-if="open || modelValue"><slot /><slot name="actions" /></div>',
  },
}

// A real File: `addFiles` calls `URL.createObjectURL` on anything that looks
// like an image, and that only accepts a Blob.
const fakeFile = (name, over = {}) => {
  const { type = 'text/plain', size = 1024 } = over
  const file = new File([new Uint8Array(1)], name, { type })
  Object.defineProperty(file, 'size', { value: size })
  return file
}

describe('FilesUploaderArea', () => {
  const mount = (options = {}, files = []) =>
    mountComponent(FilesUploaderArea, {
      props: { doctype: 'CRM Deal', options, modelValue: files },
      global: { stubs: { ...STUBS, FilesUploaderArea: false } },
    })

  beforeEach(() => {
    api.toast.warning.mockClear()
    api.toast.error.mockClear()
  })

  describe('what it offers', () => {
    it('allows several files unless told not to', () => {
      expect(mount().vm.allowMultiple).toBe(true)
      expect(mount({ allowMultiple: false }).vm.allowMultiple).toBe(false)
    })

    it('offers the web link box unless told not to', () => {
      expect(mount().vm.allowWebLink).toBe(true)
      expect(mount({ allowWebLink: false }).vm.allowWebLink).toBe(false)
    })

    it('hides the file library by default', () => {
      expect(mount().vm.disableFileBrowser).toBe(true)
    })

    it('can be told to show the file library', () => {
      // Regression: `props.options.disableFileBrowser || true` is true for
      // every input, so the library could never be turned on.
      expect(mount({ disableFileBrowser: false }).vm.disableFileBrowser).toBe(
        false,
      )
    })
  })

  describe('the defaults it fetches', () => {
    it('asks for the doctype and caches per doctype', () => {
      mount()
      expect(api.resource.params).toEqual({ doctype: 'CRM Deal' })
      expect(api.resource.cache).toEqual(['file_uploader_defaults', 'CRM Deal'])
    })

    it('turns the allowed types into extensions', () => {
      const wrapper = mount()
      api.resource.transform({ allowed_file_types: 'png\npdf', max_file_size: 5 })
      expect(wrapper.vm.restrictions.allowedFileTypes).toEqual(['.png', '.pdf'])
      expect(wrapper.vm.restrictions.maxFileSize).toBe(5)
    })

    it('copes with no allowed types configured', () => {
      const wrapper = mount()
      api.resource.transform({})
      expect(wrapper.vm.restrictions.allowedFileTypes).toEqual([])
    })

    it('lets the caller override the server defaults', () => {
      const wrapper = mount({ restrictions: { maxFileSize: 99 } })
      api.resource.transform({ max_file_size: 5 })
      expect(wrapper.vm.restrictions.maxFileSize).toBe(99)
    })

    it('reads whether attachments default to public', () => {
      const wrapper = mount()
      api.resource.transform({ make_attachments_public: 1 })
      expect(wrapper.vm.makeAttachmentsPublic).toBe(true)
    })
  })

  describe('adding files', () => {
    it('stages each one', () => {
      const wrapper = mount()
      wrapper.vm.addFiles([fakeFile('a.txt'), fakeFile('b.txt')])
      expect(wrapper.vm.files.map((f) => f.name)).toEqual(['a.txt', 'b.txt'])
    })

    it('marks them private unless the site says otherwise', () => {
      const wrapper = mount()
      wrapper.vm.addFiles([fakeFile('a.txt')])
      expect(wrapper.vm.files[0].private).toBe(true)

      api.resource.transform({ make_attachments_public: 1 })
      wrapper.vm.addFiles([fakeFile('b.txt')])
      expect(wrapper.vm.files[1].private).toBe(false)
    })

    it('offers to optimise a large image', () => {
      const wrapper = mount()
      wrapper.vm.addFiles([
        fakeFile('big.png', { type: 'image/png', size: 400 * 1024 }),
        fakeFile('small.png', { type: 'image/png', size: 1024 }),
      ])
      expect(wrapper.vm.files.map((f) => f.optimize)).toEqual([true, false])
    })

    it('never offers to optimise an SVG', () => {
      // It is markup; re-encoding it as a bitmap loses the point of it.
      const wrapper = mount()
      wrapper.vm.addFiles([
        fakeFile('big.svg', { type: 'image/svg+xml', size: 400 * 1024 }),
      ])
      expect(wrapper.vm.files[0].optimize).toBe(false)
    })

    it('keeps what is already staged', () => {
      const wrapper = mount()
      wrapper.vm.addFiles([fakeFile('a.txt')])
      wrapper.vm.addFiles([fakeFile('b.txt')])
      expect(wrapper.vm.files).toHaveLength(2)
    })

    describe('restrictions', () => {
      const restricted = (r) => {
        const wrapper = mount({ restrictions: r })
        return wrapper
      }

      it('skips a type that is not allowed, and says so', () => {
        const wrapper = restricted({ allowedFileTypes: ['.png'] })
        wrapper.vm.addFiles([fakeFile('notes.txt'), fakeFile('shot.png')])
        expect(wrapper.vm.files.map((f) => f.name)).toEqual(['shot.png'])
        expect(api.toast.warning).toHaveBeenCalledWith(
          expect.stringContaining('notes.txt'),
        )
      })

      it('matches an extension case-insensitively', () => {
        const wrapper = restricted({ allowedFileTypes: ['.png'] })
        wrapper.vm.addFiles([fakeFile('SHOT.PNG')])
        expect(wrapper.vm.files).toHaveLength(1)
      })

      it('matches a mime type too', () => {
        const wrapper = restricted({ allowedFileTypes: ['image/'] })
        wrapper.vm.addFiles([
          fakeFile('shot.png', { type: 'image/png' }),
          fakeFile('notes.txt'),
        ])
        expect(wrapper.vm.files.map((f) => f.name)).toEqual(['shot.png'])
      })

      it('rejects a file with no type against a mime restriction', () => {
        const wrapper = restricted({ allowedFileTypes: ['image/'] })
        wrapper.vm.addFiles([fakeFile('mystery', { type: '' })])
        expect(wrapper.vm.files).toEqual([])
      })

      it('skips a file that is too big, and says how big is allowed', () => {
        const wrapper = restricted({ maxFileSize: 2048 })
        wrapper.vm.addFiles([fakeFile('huge.txt', { size: 4096 })])
        expect(wrapper.vm.files).toEqual([])
        expect(api.toast.warning).toHaveBeenCalledWith(
          expect.stringContaining('MB'),
        )
      })

      it('allows anything when nothing is restricted', () => {
        const wrapper = restricted({})
        wrapper.vm.addFiles([fakeFile('anything.xyz', { size: 9e9 })])
        expect(wrapper.vm.files).toHaveLength(1)
      })

      it('caps the number of files', () => {
        const wrapper = restricted({ maxNumberOfFiles: 2 })
        wrapper.vm.addFiles([fakeFile('a'), fakeFile('b'), fakeFile('c')])
        expect(wrapper.vm.files.map((f) => f.name)).toEqual(['a', 'b'])
        expect(api.toast.warning).toHaveBeenCalledWith(
          expect.stringContaining('c'),
        )
      })

      it('counts the cap across drops, not per drop', () => {
        // Regression: the limit was applied to each batch on its own, so two
        // drops of two files got past a limit of three.
        const wrapper = restricted({ maxNumberOfFiles: 3 })
        wrapper.vm.addFiles([fakeFile('a'), fakeFile('b')])
        wrapper.vm.addFiles([fakeFile('c'), fakeFile('d')])
        expect(wrapper.vm.files.map((f) => f.name)).toEqual(['a', 'b', 'c'])
      })

      it('takes none once the cap is reached', () => {
        const wrapper = restricted({ maxNumberOfFiles: 1 })
        wrapper.vm.addFiles([fakeFile('a')])
        wrapper.vm.addFiles([fakeFile('b')])
        expect(wrapper.vm.files.map((f) => f.name)).toEqual(['a'])
      })

      it('names the doctype in the cap warning', () => {
        const wrapper = restricted({ maxNumberOfFiles: 1 })
        wrapper.vm.addFiles([fakeFile('a'), fakeFile('b')])
        expect(api.toast.warning).toHaveBeenCalledWith(
          expect.stringContaining('CRM Deal'),
        )
      })
    })
  })

  describe('removing a staged file', () => {
    it('removes the one clicked', () => {
      const wrapper = mount()
      wrapper.vm.addFiles([fakeFile('a.txt'), fakeFile('b.txt')])
      wrapper.vm.removeFile(wrapper.vm.files[0])
      expect(wrapper.vm.files.map((f) => f.name)).toEqual(['b.txt'])
    })

    it('keeps a namesake picked from somewhere else', () => {
      // Regression: matched on the filename, so one click removed both.
      const wrapper = mount()
      wrapper.vm.addFiles([fakeFile('report.pdf'), fakeFile('report.pdf')])
      wrapper.vm.removeFile(wrapper.vm.files[0])
      expect(wrapper.vm.files).toHaveLength(1)
    })
  })

  describe('the camera', () => {
    let getUserMedia

    beforeEach(() => {
      getUserMedia = vi.fn(async () => ({ getTracks: () => [] }))
      Object.defineProperty(window.navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia },
      })
      // happy-dom's `srcObject` setter insists on a real MediaStream, which it
      // does not implement. The component only ever hands the stream to the
      // element, so a plain property is enough here.
      Object.defineProperty(window.HTMLMediaElement.prototype, 'srcObject', {
        configurable: true,
        writable: true,
        value: null,
      })
    })

    it('asks for the back camera first', async () => {
      const wrapper = mount()
      await wrapper.vm.startCamera()
      expect(getUserMedia).toHaveBeenCalledWith({
        video: { facingMode: 'environment' },
        audio: false,
      })
    })

    it('closes the pane and says so when access is refused', async () => {
      // Unguarded before: the rejection went nowhere and the camera pane sat
      // open and blank.
      getUserMedia.mockRejectedValue(new Error('NotAllowedError'))
      const wrapper = mount()
      await wrapper.vm.startCamera()
      expect(wrapper.vm.showCamera).toBe(false)
      expect(api.toast.error).toHaveBeenCalled()
    })

    it('switches to the front camera', async () => {
      const wrapper = mount()
      await wrapper.vm.startCamera()
      wrapper.vm.switchCamera()
      await flushPromises()
      expect(getUserMedia).toHaveBeenLastCalledWith({
        video: { facingMode: 'user' },
        audio: false,
      })
    })

    it('stops the stream when the pane closes', async () => {
      const stop = vi.fn()
      getUserMedia.mockResolvedValue({ getTracks: () => [{ stop }] })
      const wrapper = mount()
      await wrapper.vm.startCamera()
      wrapper.vm.stopStream()
      expect(stop).toHaveBeenCalled()
      expect(wrapper.vm.showCamera).toBe(false)
    })

    it('stops the stream on unmount, so the light goes out', async () => {
      const stop = vi.fn()
      getUserMedia.mockResolvedValue({ getTracks: () => [{ stop }] })
      const wrapper = mount()
      await wrapper.vm.startCamera()
      wrapper.unmount()
      expect(stop).toHaveBeenCalled()
    })

    it('copes with there being no stream to stop', () => {
      expect(() => mount().vm.stopStream()).not.toThrow()
    })

    it("captures the frame at the video's own size", () => {
      const drawImage = vi.fn()
      const wrapper = mount()
      wrapper.vm.video = { videoWidth: 640, videoHeight: 480 }
      wrapper.vm.canvas = {
        getContext: () => ({ drawImage }),
        toDataURL: () => 'data:image/png;base64,x',
      }
      wrapper.vm.captureImage()
      expect(wrapper.vm.canvas.width).toBe(640)
      expect(wrapper.vm.canvas.height).toBe(480)
      expect(wrapper.vm.cameraImage).toBe('data:image/png;base64,x')
    })
  })

  describe('the icon it shows', () => {
    it('distinguishes audio, video and everything else', () => {
      const wrapper = mount()
      const icons = new Set([
        wrapper.vm.fileIcon('audio/mp3'),
        wrapper.vm.fileIcon('video/mp4'),
        wrapper.vm.fileIcon('text/plain'),
      ])
      expect(icons.size).toBe(3)
    })

    it('copes with a file that has no type', () => {
      expect(() => mount().vm.fileIcon(undefined)).not.toThrow()
    })
  })
})

describe('FilesUploader', () => {
  const mount = (props = {}) =>
    mountComponent(FilesUploader, {
      props: { doctype: 'CRM Deal', docname: 'DEAL-1', modelValue: true, ...props },
      global: { stubs: STUBS },
    })

  // The dialog's area child is stubbed out in most tests; this stands in for
  // the parts of it the parent reads through its ref.
  const withArea = (wrapper, area) => {
    wrapper.vm.filesUploaderArea = { showCamera: false, showWebLink: false, webLink: '', ...area }
    return wrapper
  }

  const stage = (wrapper, names) => {
    wrapper.vm.files = names.map((name) => ({ name, private: true, fileObj: {} }))
  }

  beforeEach(() => {
    api.handlers = []
    api.toast.error.mockClear()
  })

  describe('the privacy switches', () => {
    it('reports whether every file is private', () => {
      const wrapper = mount()
      stage(wrapper, ['a', 'b'])
      expect(wrapper.vm.isAllPrivate).toBe(true)
      wrapper.vm.files[0].private = false
      expect(wrapper.vm.isAllPrivate).toBe(false)
    })

    it('sets them all one way or the other', () => {
      const wrapper = mount()
      stage(wrapper, ['a', 'b'])
      wrapper.vm.setAllPublic()
      expect(wrapper.vm.files.every((f) => !f.private)).toBe(true)
      wrapper.vm.setAllPrivate()
      expect(wrapper.vm.files.every((f) => f.private)).toBe(true)
    })

    it('clears the whole list', () => {
      const wrapper = mount()
      stage(wrapper, ['a', 'b'])
      wrapper.vm.removeAllFiles()
      expect(wrapper.vm.files).toEqual([])
    })
  })

  describe('whether the attach button is available', () => {
    it('is off with nothing staged', () => {
      expect(withArea(mount(), {}).vm.disableAttachButton).toBe(true)
    })

    it('is on once a file is staged', () => {
      const wrapper = withArea(mount(), {})
      stage(wrapper, ['a'])
      expect(wrapper.vm.disableAttachButton).toBe(false)
    })

    it('waits for a captured photo in camera mode', () => {
      expect(
        withArea(mount(), { showCamera: true, cameraImage: null }).vm
          .disableAttachButton,
      ).toBe(true)
      expect(
        withArea(mount(), { showCamera: true, cameraImage: 'data:x' }).vm
          .disableAttachButton,
      ).toBe(false)
    })

    it('waits for a url in link mode', () => {
      expect(
        withArea(mount(), { showWebLink: true, webLink: '' }).vm
          .disableAttachButton,
      ).toBe(true)
      expect(
        withArea(mount(), { showWebLink: true, webLink: 'http://x/y.png' }).vm
          .disableAttachButton,
      ).toBe(false)
    })
  })

  describe('uploading', () => {
    it('sends the document it should attach to', async () => {
      const wrapper = withArea(mount({ fieldname: 'image' }), {})
      stage(wrapper, ['a.txt'])
      wrapper.vm.attachFiles()
      expect(api.handlers[0].args).toMatchObject({
        doctype: 'CRM Deal',
        docname: 'DEAL-1',
        fieldname: 'image',
        folder: 'Home/Attachments',
      })
    })

    it('uses the folder the caller asked for', () => {
      const wrapper = withArea(
        mount({ options: { folder: 'Home/Deals' } }),
        {},
      )
      stage(wrapper, ['a.txt'])
      wrapper.vm.attachFiles()
      expect(api.handlers[0].args.folder).toBe('Home/Deals')
    })

    it('starts one upload per staged file', () => {
      const wrapper = withArea(mount(), {})
      stage(wrapper, ['a.txt', 'b.txt'])
      wrapper.vm.attachFiles()
      expect(api.handlers).toHaveLength(2)
    })

    it('shows a file as uploading while it runs', () => {
      const wrapper = withArea(mount(), {})
      stage(wrapper, ['a.txt'])
      wrapper.vm.attachFiles()
      api.handlers[0].emit('start')
      expect(wrapper.vm.files[0].uploading).toBe(true)
      expect(wrapper.vm.fileUploadStarted).toBe(true)
    })

    it('tracks its progress', () => {
      const wrapper = withArea(mount(), {})
      stage(wrapper, ['a.txt'])
      wrapper.vm.attachFiles()
      api.handlers[0].emit('progress', { uploaded: 30, total: 100 })
      expect(wrapper.vm.files[0].uploaded).toBe(30)
      expect(wrapper.vm.files[0].total).toBe(100)
    })

    it('shows an error against the file', () => {
      const wrapper = withArea(mount(), {})
      stage(wrapper, ['a.txt'])
      wrapper.vm.attachFiles()
      api.handlers[0].emit('error', 'Disk full')
      expect(wrapper.vm.files[0].errorMessage).toBe('Disk full')
      expect(wrapper.vm.files[0].uploading).toBe(false)
    })

    it('reports the uploaded files once, when they are all done', async () => {
      const wrapper = withArea(mount(), {})
      stage(wrapper, ['a.txt', 'b.txt'])
      wrapper.vm.attachFiles()

      api.handlers[0].resolve({ file_url: '/files/a.txt' })
      await flushPromises()
      expect(wrapper.emitted('after')).toBeUndefined()

      api.handlers[1].resolve({ file_url: '/files/b.txt' })
      await flushPromises()
      expect(wrapper.emitted('after')).toHaveLength(1)
      expect(wrapper.emitted('after')[0][0]).toHaveLength(2)
    })

    it('waits for the stragglers when the last one finishes first', async () => {
      // Regression: completion was decided by the file's *index*, so if the
      // last file came back first it emitted alone, cleared the list and shut
      // the dialog — the other uploads' results were thrown away.
      const wrapper = withArea(mount(), {})
      stage(wrapper, ['a.txt', 'b.txt', 'c.txt'])
      wrapper.vm.attachFiles()

      api.handlers[2].resolve({ file_url: '/files/c.txt' })
      await flushPromises()
      expect(wrapper.emitted('after')).toBeUndefined()
      expect(wrapper.vm.files).toHaveLength(3)

      api.handlers[0].resolve({ file_url: '/files/a.txt' })
      api.handlers[1].resolve({ file_url: '/files/b.txt' })
      await flushPromises()
      expect(wrapper.emitted('after')[0][0]).toHaveLength(3)
    })

    it('closes and clears once everything is in', async () => {
      const wrapper = withArea(mount(), {})
      stage(wrapper, ['a.txt'])
      wrapper.vm.attachFiles()
      api.handlers[0].resolve({ file_url: '/files/a.txt' })
      await flushPromises()
      expect(wrapper.vm.files).toEqual([])
      expect(wrapper.vm.fileUploadStarted).toBe(false)
      expect(wrapper.emitted('update:modelValue').at(-1)).toEqual([false])
    })

    describe('when one fails', () => {
      it('stays open so the message can be read', async () => {
        const wrapper = withArea(mount(), {})
        stage(wrapper, ['a.txt'])
        wrapper.vm.attachFiles()
        api.handlers[0].reject('Rejected by the server')
        await flushPromises()
        expect(wrapper.vm.files).toHaveLength(1)
        expect(wrapper.emitted('update:modelValue')).toBeUndefined()
      })

      it('still reports the ones that worked', async () => {
        // Regression: a failure left the completion count short, so nothing was
        // ever emitted and the successful uploads went unreported.
        const wrapper = withArea(mount(), {})
        stage(wrapper, ['a.txt', 'b.txt'])
        wrapper.vm.attachFiles()
        api.handlers[0].resolve({ file_url: '/files/a.txt' })
        api.handlers[1].reject('nope')
        await flushPromises()
        expect(wrapper.emitted('after')[0][0]).toHaveLength(1)
      })

      it('reads a Frappe server message', async () => {
        const wrapper = withArea(mount(), {})
        stage(wrapper, ['a.txt'])
        wrapper.vm.attachFiles()
        api.handlers[0].reject({
          _server_messages: JSON.stringify([
            JSON.stringify({ message: 'File too large' }),
          ]),
        })
        await flushPromises()
        expect(wrapper.vm.files[0].errorMessage).toBe('File too large')
      })

      it('reads a plain string', async () => {
        const wrapper = withArea(mount(), {})
        stage(wrapper, ['a.txt'])
        wrapper.vm.attachFiles()
        api.handlers[0].reject('Disk full')
        await flushPromises()
        expect(wrapper.vm.files[0].errorMessage).toBe('Disk full')
      })

      it('falls back when the error says nothing useful', async () => {
        const wrapper = withArea(mount(), {})
        stage(wrapper, ['a.txt'])
        wrapper.vm.attachFiles()
        api.handlers[0].reject({})
        await flushPromises()
        expect(wrapper.vm.files[0].errorMessage).toBe('Error Uploading File')
      })
    })

    describe('by web link', () => {
      it('refuses an empty url', () => {
        const wrapper = withArea(mount(), { showWebLink: true, webLink: '' })
        wrapper.vm.attachFiles()
        expect(api.toast.error).toHaveBeenCalled()
        expect(api.handlers).toHaveLength(0)
      })

      it('sends the url, decoded', () => {
        const wrapper = withArea(mount(), {
          showWebLink: true,
          webLink: 'http://x/a%20b.png',
        })
        wrapper.vm.attachFiles()
        expect(api.handlers[0].args.fileUrl).toBe('http://x/a b.png')
      })

      it('tells the parent about the file it attached', async () => {
        // Regression: the dialog closed before the upload ran and the
        // completion check could not match, so the parent never heard about
        // the file and the attachment only appeared after a reload.
        const wrapper = withArea(mount(), {
          showWebLink: true,
          webLink: 'http://x/a.png',
        })
        wrapper.vm.attachFiles()
        api.handlers[0].resolve({ file_url: 'http://x/a.png' })
        await flushPromises()
        expect(wrapper.emitted('after')[0][0]).toEqual([
          { file_url: 'http://x/a.png' },
        ])
        expect(wrapper.emitted('update:modelValue').at(-1)).toEqual([false])
      })
    })
  })
})
