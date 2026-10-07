vi.mock('@/composables/useTimelinePreferences', async () => {
  const { ref } = await import('vue')
  return { useTimelinePreferences: () => ({ showExactTimestamp: ref(false) }) }
})

import EmailArea from '@/components/Activities/EmailArea.vue'
import { mountComponent } from '../helpers/mount'

const STUBS = {
  ReplyIcon: true, ReplyAllIcon: true, AttachmentItem: true,
  EmailContent: true, TimelineTimestamp: true,
}

// A stand-in for the tiptap chain the reply builder drives.
const makeEditor = () => {
  const chain = {}
  for (const m of [
    'chain', 'clearContent', 'updateAttributes', 'insertContent',
    'focus', 'insertContentAt', 'run',
  ]) {
    chain[m] = vi.fn(() => chain)
  }
  return chain
}

const makeBox = () => ({
  show: false,
  editor: {
    fromEmail: '',
    toEmails: [],
    cc: false,
    bcc: false,
    ccEmails: [],
    bccEmails: [],
    subject: '',
    editor: makeEditor(),
  },
})

const email = (over = {}) => ({
  name: 'COMM-1',
  sender: 'them@x.com',
  recipients: 'us@x.com',
  cc: '',
  bcc: '',
  subject: 'Quarterly review',
  content: '<p>Body</p>',
  ...over,
})

// The component receives an activity wrapping the email under `data`, and the
// template reads it directly — so the nesting has to be present to mount.
const activityFor = (over = {}) => ({
  name: 'ACT-1',
  creation: '2026-03-15 09:00:00',
  data: { sender_full_name: 'Them', ...email(over) },
})

const mount = (emailBox, over = {}) =>
  mountComponent(EmailArea, {
    props: { activity: activityFor(over), emailBox },
    global: { stubs: STUBS },
  })

const replyTo = (over = {}, replyAll = false) => {
  const box = makeBox()
  const wrapper = mount(box, over)
  wrapper.vm.reply(activityFor(over).data, replyAll)
  return box.editor
}

describe('EmailArea', () => {
  describe('opening a reply', () => {
    it('shows the composer', () => {
      const box = makeBox()
      mount(box).vm.reply(activityFor().data)
      expect(box.show).toBe(true)
    })

    it('addresses it to the sender', () => {
      const editor = replyTo()
      expect(editor.toEmails).toEqual(['them@x.com'])
      expect(editor.fromEmail).toBe('them@x.com')
    })

    it('prefixes the subject', () => {
      expect(replyTo().subject).toBe('Re: Quarterly review')
    })

    it('does not prefix twice', () => {
      // Replying to a reply would otherwise read "Re: Re: …".
      expect(replyTo({ subject: 'Re: Quarterly review' }).subject).toBe(
        'Re: Quarterly review',
      )
    })

    it('copes with an email that has no subject', () => {
      // Legal, and `null.startsWith` is not.
      expect(replyTo({ subject: null }).subject).toBe('Re: ')
      expect(replyTo({ subject: '' }).subject).toBe('Re: ')
    })

    it('leaves cc and bcc off for a plain reply', () => {
      const editor = replyTo({ cc: 'other@x.com' })
      expect(editor.cc).toBe(false)
      expect(editor.bcc).toBe(false)
      expect(editor.ccEmails).toEqual([])
    })

    it('quotes the original message', () => {
      const box = makeBox()
      mount(box).vm.reply(activityFor().data)
      expect(box.editor.editor.insertContent).toHaveBeenCalledWith(
        '<blockquote><p>Body</p></blockquote>',
      )
    })

    it('marks the quote so it can be collapsed later', () => {
      // EmailContent looks for this class to fold the history away.
      const box = makeBox()
      mount(box).vm.reply(activityFor().data)
      expect(box.editor.editor.updateAttributes).toHaveBeenCalledWith(
        'paragraph',
        { class: 'reply-to-content' },
      )
    })
  })

  describe('replying to all', () => {
    it('moves the other recipients into cc', () => {
      const editor = replyTo({ recipients: 'us@x.com, third@x.com' }, true)
      expect(editor.cc).toBe(true)
      expect(editor.ccEmails).toEqual(['us@x.com', 'third@x.com'])
    })

    it('merges the original cc with the recipients', () => {
      const editor = replyTo(
        { recipients: 'us@x.com', cc: 'other@x.com' },
        true,
      )
      expect(editor.ccEmails).toEqual(['other@x.com', 'us@x.com'])
    })

    it('does not list anyone twice', () => {
      const editor = replyTo(
        { recipients: 'us@x.com, other@x.com', cc: 'other@x.com' },
        true,
      )
      expect(editor.ccEmails.filter((e) => e === 'other@x.com')).toHaveLength(1)
    })

    it('carries the bcc across', () => {
      const editor = replyTo({ bcc: 'hidden@x.com' }, true)
      expect(editor.bcc).toBe(true)
      expect(editor.bccEmails).toEqual(['hidden@x.com'])
    })

    describe('empty headers', () => {
      it('adds no blank recipient from an empty cc', () => {
        // Regression: `''.split(',')` is `['']`, so an empty header became a
        // blank chip that the server would reject on send.
        const editor = replyTo({ cc: '' }, true)
        expect(editor.ccEmails).not.toContain('')
      })

      it('leaves bcc closed when the header is empty', () => {
        // Regression: the toggle read `bcc ? true : false`, and an empty array
        // is truthy — so the Bcc field opened with nothing in it.
        const editor = replyTo({ bcc: '' }, true)
        expect(editor.bcc).toBe(false)
        expect(editor.bccEmails).toEqual([])
      })

      it('leaves bcc closed when the header is absent', () => {
        const editor = replyTo({ bcc: null }, true)
        expect(editor.bcc).toBe(false)
      })

      it('drops empty entries from a ragged list', () => {
        const editor = replyTo({ cc: 'a@x.com,,  , b@x.com' }, true)
        expect(editor.ccEmails).toEqual(
          expect.arrayContaining(['a@x.com', 'b@x.com']),
        )
        expect(editor.ccEmails).not.toContain('')
      })

      it('copes with an email that has no recipients at all', () => {
        expect(() => replyTo({ recipients: null }, true)).not.toThrow()
      })
    })
  })

  describe('delivery status', () => {
    const statusOf = (delivery_status) =>
      mountComponent(EmailArea, {
        props: {
          activity: {
            ...activityFor(),
            data: { ...activityFor().data, delivery_status },
          },
          emailBox: makeBox(),
        },
        global: { stubs: STUBS },
      }).vm.status

    it.each([
      ['Sent', 'green'],
      ['Clicked', 'green'],
      ['Sending', 'orange'],
      ['Scheduled', 'orange'],
      ['Opened', 'blue'],
      ['Read', 'blue'],
      ['Error', 'red'],
    ])('shows %s as %s', (status, colour) => {
      expect(statusOf(status)).toEqual({ label: status, color: colour })
    })

    it('treats an unknown status as a problem', () => {
      // Failing loud is right here: an unrecognised state is not a delivery.
      expect(statusOf('Bounced').color).toBe('red')
    })

    it('reports red when there is no status at all', () => {
      expect(statusOf(undefined).color).toBe('red')
    })
  })
})
