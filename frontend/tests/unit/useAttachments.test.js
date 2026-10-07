// Captures the delete calls the composable fires instead of hitting the API.
const calls = vi.hoisted(() => [])
vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    createResource: (options) => {
      calls.push(options)
      return { options, fetch: vi.fn(), reload: vi.fn() }
    },
  }
})

import { useAttachments, isFileUrl } from '@/composables/useAttachments'

describe('isFileUrl', () => {
  it('recognises public and private file paths', () => {
    expect(isFileUrl('/files/logo.png')).toBe(true)
    expect(isFileUrl('/private/files/contract.pdf')).toBe(true)
  })

  it('rejects anything that is not a file path', () => {
    expect(isFileUrl('https://example.com/files/x.png')).toBe(false)
    expect(isFileUrl('/assets/logo.png')).toBe(false)
    expect(isFileUrl('logo.png')).toBe(false)
    expect(isFileUrl('')).toBe(false)
  })

  it('rejects non-strings', () => {
    expect(isFileUrl(null)).toBe(false)
    expect(isFileUrl(undefined)).toBe(false)
    expect(isFileUrl(42)).toBe(false)
    expect(isFileUrl({})).toBe(false)
  })
})

describe('useAttachments', () => {
  beforeEach(() => {
    calls.length = 0
  })

  it('deletes a replaced file when the change is committed', () => {
    const { trackOldFile, processPendingDeletions } = useAttachments(
      'CRM Deal',
      'DEAL-1',
    )
    trackOldFile('/files/old.png', '/files/new.png')
    processPendingDeletions()

    expect(calls).toHaveLength(1)
    expect(calls[0].params).toEqual({
      doctype: 'CRM Deal',
      docname: 'DEAL-1',
      file_url: '/files/old.png',
    })
  })

  it('does not delete anything until deletions are processed', () => {
    // The old file must survive until the document is actually saved.
    const { trackOldFile } = useAttachments('CRM Deal', 'DEAL-2')
    trackOldFile('/files/old.png', '/files/new.png')
    expect(calls).toHaveLength(0)
  })

  it('ignores a value that did not change', () => {
    const { trackOldFile, processPendingDeletions } = useAttachments(
      'CRM Deal',
      'DEAL-3',
    )
    trackOldFile('/files/same.png', '/files/same.png')
    processPendingDeletions()
    expect(calls).toHaveLength(0)
  })

  it('ignores values that are not file urls', () => {
    const { trackOldFile, processPendingDeletions } = useAttachments(
      'CRM Deal',
      'DEAL-4',
    )
    trackOldFile('Some text', 'Other text')
    trackOldFile(null, 'x')
    trackOldFile('https://example.com/a.png', 'y')
    processPendingDeletions()
    expect(calls).toHaveLength(0)
  })

  it('deletes each replaced file once, however many times it is tracked', () => {
    const { trackOldFile, processPendingDeletions } = useAttachments(
      'CRM Deal',
      'DEAL-5',
    )
    trackOldFile('/files/a.png', '/files/new.png')
    trackOldFile('/files/a.png', '/files/newer.png')
    trackOldFile('/files/b.png', '/files/new.png')
    processPendingDeletions()

    expect(calls).toHaveLength(2)
    expect(calls.map((c) => c.params.file_url).sort()).toEqual([
      '/files/a.png',
      '/files/b.png',
    ])
  })

  it('does nothing on a second process call', () => {
    const { trackOldFile, processPendingDeletions } = useAttachments(
      'CRM Deal',
      'DEAL-6',
    )
    trackOldFile('/files/old.png', '/files/new.png')
    processPendingDeletions()
    processPendingDeletions()
    expect(calls).toHaveLength(1)
  })

  it('keeps each document’s pending deletions separate', () => {
    // Two records edited in the same session must not delete each other's files.
    const first = useAttachments('CRM Deal', 'DEAL-7')
    const second = useAttachments('CRM Deal', 'DEAL-8')

    first.trackOldFile('/files/first.png', '/files/new.png')
    second.trackOldFile('/files/second.png', '/files/new.png')

    first.processPendingDeletions()
    expect(calls.map((c) => c.params.file_url)).toEqual(['/files/first.png'])

    second.processPendingDeletions()
    expect(calls.map((c) => c.params.file_url)).toEqual([
      '/files/first.png',
      '/files/second.png',
    ])
  })

  it('shares pending state between two handles on the same document', () => {
    const a = useAttachments('CRM Deal', 'DEAL-9')
    const b = useAttachments('CRM Deal', 'DEAL-9')
    a.trackOldFile('/files/old.png', '/files/new.png')
    b.processPendingDeletions()
    expect(calls).toHaveLength(1)
  })

  it('logs rather than throws when a delete fails', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { trackOldFile, processPendingDeletions } = useAttachments(
      'CRM Deal',
      'DEAL-10',
    )
    trackOldFile('/files/old.png', '/files/new.png')
    processPendingDeletions()

    expect(() => calls[0].onError(new Error('nope'))).not.toThrow()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
