import AttachControl from '@/components/Controls/AttachControl.vue'
import { mountComponent } from '../helpers/mount'

const STUBS = {
  Tooltip: { name: 'Tooltip', props: ['text'], template: '<div><slot /></div>' },
  FilesUploader: {
    name: 'FilesUploader',
    props: ['doctype', 'docname', 'fieldname', 'options'],
    template: '<div class="uploader" />',
  },
}

const mountAttach = (props = {}, attrs = {}) =>
  mountComponent(AttachControl, {
    props: { value: null, ...props },
    attrs,
    global: { stubs: STUBS },
  })

describe('AttachControl', () => {
  describe('showing the attached file', () => {
    it('shows nothing when the field is empty', () => {
      expect(mountAttach({ value: null }).vm.filename).toBe('')
      expect(mountAttach({ value: '' }).vm.filename).toBe('')
    })

    it('shows just the file name, not the whole path', () => {
      expect(
        mountAttach({ value: '/files/contracts/signed.pdf' }).vm.filename,
      ).toBe('signed.pdf')
    })

    it('drops a query string and fragment', () => {
      // File URLs carry cache-busting params that are not part of the name.
      expect(
        mountAttach({ value: '/files/report.pdf?v=2#page3' }).vm.filename,
      ).toBe('report.pdf')
    })

    it('decodes an escaped name so it reads normally', () => {
      expect(
        mountAttach({ value: '/files/Q3%20Report%20(final).pdf' }).vm.filename,
      ).toBe('Q3 Report (final).pdf')
    })

    it('falls back to the raw name when it cannot be decoded', () => {
      // A stray % would otherwise throw a URIError and blank the field.
      const wrapper = mountAttach({ value: '/files/100%.pdf' })
      expect(() => wrapper.vm.filename).not.toThrow()
      expect(wrapper.vm.filename).toBe('100%.pdf')
    })
  })

  describe('recognising images', () => {
    it.each([
      '/files/logo.png',
      '/files/photo.JPEG',
      '/files/icon.svg',
      '/files/scan.tiff',
      '/files/pic.webp',
      '/files/frame.avif',
    ])('treats %s as an image', (value) => {
      expect(mountAttach({ value }).vm.isImage).toBe(true)
    })

    it('still recognises an image behind a query string', () => {
      expect(mountAttach({ value: '/files/logo.png?v=2' }).vm.isImage).toBe(true)
    })

    it('does not treat documents as images', () => {
      expect(mountAttach({ value: '/files/contract.pdf' }).vm.isImage).toBe(false)
      expect(mountAttach({ value: '/files/notes.txt' }).vm.isImage).toBe(false)
    })

    it('handles an empty value', () => {
      expect(mountAttach({ value: null }).vm.isImage).toBe(false)
    })

    it('is not fooled by an extension in the middle of the path', () => {
      expect(mountAttach({ value: '/files/png/report.pdf' }).vm.isImage).toBe(
        false,
      )
    })
  })

  describe('uploader options', () => {
    it('accepts a single file', () => {
      const options = mountAttach().vm.uploaderOptions
      expect(options.allowMultiple).toBe(false)
      expect(options.restrictions.maxNumberOfFiles).toBe(1)
    })

    it('restricts to images when the field is image-only', () => {
      expect(
        mountAttach({ imageOnly: true }).vm.uploaderOptions.restrictions
          .allowedFileTypes,
      ).toEqual(['image/*'])
    })

    it('accepts any type otherwise', () => {
      expect(
        mountAttach().vm.uploaderOptions.restrictions.allowedFileTypes,
      ).toBeUndefined()
    })
  })

  describe('changing the attachment', () => {
    it('emits the uploaded file url', () => {
      const wrapper = mountAttach()
      wrapper.vm.onAfterUpload([{ file_url: '/files/new.pdf' }])
      expect(wrapper.emitted('change')[0]).toEqual(['/files/new.pdf'])
    })

    it('ignores an upload that produced nothing', () => {
      const wrapper = mountAttach()
      wrapper.vm.onAfterUpload([])
      wrapper.vm.onAfterUpload(null)
      expect(wrapper.emitted('change')).toBeUndefined()
    })

    it('emits null when the attachment is cleared', () => {
      const wrapper = mountAttach({ value: '/files/old.pdf' })
      wrapper.vm.clearAttachment()
      expect(wrapper.emitted('change')[0]).toEqual([null])
    })
  })

  describe('sizing', () => {
    it('defaults to the small size', () => {
      expect(mountAttach().vm.containerClasses).toContain('h-7')
    })

    it('follows an explicit size', () => {
      expect(mountAttach({}, { size: 'lg' }).vm.containerClasses).toContain(
        'h-10',
      )
    })

    it('carries the caller class through', () => {
      expect(
        mountAttach({}, { class: 'custom-attach' }).vm.containerClasses,
      ).toContain('custom-attach')
    })

    it('greys out when disabled', () => {
      expect(mountAttach({ disabled: true }).vm.containerClasses).toContain(
        'text-ink-gray-5',
      )
    })
  })
})
