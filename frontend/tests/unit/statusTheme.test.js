import { describe, it, expect } from 'vitest'
import {
  TONES,
  EXACT,
  WORDS,
  toneForStatus,
  toneClass,
} from '@/utils/statusTheme'

describe('statusTheme', () => {
  describe('the statuses the product ships', () => {
    // CRM Lead Status
    it.each([
      ['New', 'info'],
      ['Contacted', 'info'],
      ['Nurture', 'warning'],
      ['Qualified', 'success'],
      ['Unqualified', 'danger'],
      ['Junk', 'danger'],
    ])('lead status %s → %s', (status, tone) => {
      expect(toneForStatus(status)).toBe(tone)
    })

    // CRM Deal Status
    it.each([
      ['Qualification', 'info'],
      ['Demo/Making', 'info'],
      ['Proposal/Quotation', 'info'],
      ['Negotiation', 'warning'],
      ['Ready to Close', 'success'],
      ['Won', 'success'],
      ['Lost', 'danger'],
    ])('deal status %s → %s', (status, tone) => {
      expect(toneForStatus(status)).toBe(tone)
    })

    // CRM Task Status
    it.each([
      ['Backlog', 'neutral'],
      ['Todo', 'info'],
      ['In Progress', 'info'],
      ['Done', 'success'],
      ['Cancelled', 'danger'],
      ['Canceled', 'danger'],
    ])('task status %s → %s', (status, tone) => {
      expect(toneForStatus(status)).toBe(tone)
    })

    // CRM Organization
    it.each([
      ['Prospect', 'info'],
      ['Active', 'success'],
      ['Customer', 'success'],
      ['Inactive', 'neutral'],
    ])('organization status %s → %s', (status, tone) => {
      expect(toneForStatus(status)).toBe(tone)
    })

    // Contact
    it.each([
      ['Passive', 'warning'],
      ['Open', 'info'],
      ['Replied', 'success'],
    ])('contact status %s → %s', (status, tone) => {
      expect(toneForStatus(status)).toBe(tone)
    })

    // CRM Call Log (values from utils/callLog.js)
    it.each([
      ['Completed', 'success'],
      ['Initiated', 'info'],
      ['Queued', 'info'],
      ['Ringing', 'info'],
      ['Busy', 'warning'],
      ['No Answer', 'danger'],
      ['Failed', 'danger'],
    ])('call status %s → %s', (status, tone) => {
      expect(toneForStatus(status)).toBe(tone)
    })

    // SLA status (CRM Lead / CRM Deal `sla_status`)
    it.each([
      ['First Response Due', 'warning'],
      ['Rolling Response Due', 'warning'],
      ['Failed', 'danger'],
      ['Fulfilled', 'success'],
    ])('sla status %s → %s', (status, tone) => {
      expect(toneForStatus(status)).toBe(tone)
    })

    it.each([
      ['Pending', 'warning'],
      ['On Hold', 'warning'],
      ['Overdue', 'danger'],
      ['Draft', 'neutral'],
      ['Archived', 'neutral'],
    ])('generic status %s → %s', (status, tone) => {
      expect(toneForStatus(status)).toBe(tone)
    })
  })

  describe('substring collisions — the reason exact matching comes first', () => {
    it('does not read "Inactive" as "Active"', () => {
      expect(toneForStatus('Active')).toBe('success')
      expect(toneForStatus('Inactive')).toBe('neutral')
      expect(toneForStatus('Active')).not.toBe(toneForStatus('Inactive'))
    })

    it('does not read "Unqualified" as "Qualified"', () => {
      expect(toneForStatus('Qualified')).toBe('success')
      expect(toneForStatus('Unqualified')).toBe('danger')
      expect(toneForStatus('Disqualified')).toBe('danger')
      expect(toneForStatus('Not Qualified')).toBe('danger')
    })

    it('flips a positive that is negated by a standalone word', () => {
      // Word matching alone would read "Not Qualified" as qualified: both
      // contain the word, and the meaning is carried by the one before it.
      expect(toneForStatus('Not Won')).toBe('danger')
      expect(toneForStatus('Never Contacted')).toBe('info') // no positive to flip
      expect(toneForStatus('No Answer')).toBe('danger') // exact entry, unaffected
    })

    it('separates the "Qualification" stage from the "Qualified" outcome', () => {
      // Qualification is the FIRST deal stage. Colouring it green would say a
      // deal that has only just been opened is already a win.
      expect(toneForStatus('Qualification')).toBe('info')
      expect(toneForStatus('Qualified')).toBe('success')
    })

    it('resolves "Closed Won" and "Closed Lost" by their outcome', () => {
      expect(toneForStatus('Closed Won')).toBe('success')
      expect(toneForStatus('Closed Lost')).toBe('danger')
      expect(toneForStatus('Closed')).toBe('neutral')
    })

    it('keeps "Ready to Close" positive rather than neutral', () => {
      expect(toneForStatus('Ready to Close')).toBe('success')
    })

    it('never resolves a word by substring', () => {
      // "reactive" contains "active"; "wonder" contains "won"; "lostock"
      // contains "lost". None of them are statuses, and none may borrow a
      // tone from a word they merely contain.
      expect(toneForStatus('Reactivation')).toBe('neutral')
      expect(toneForStatus('Wonderful')).toBe('neutral')
      expect(toneForStatus('Lostock Branch')).toBe('neutral')
    })
  })

  describe('site-customised statuses', () => {
    it('matches on whole words, so renamed statuses still resolve', () => {
      expect(toneForStatus('Deal Won')).toBe('success')
      expect(toneForStatus('CLOSED - LOST')).toBe('danger')
      expect(toneForStatus('Pending legal review')).toBe('warning')
      expect(toneForStatus('to-do')).toBe('info')
      expect(toneForStatus('To Do')).toBe('info')
    })

    it('is case- and whitespace-insensitive', () => {
      expect(toneForStatus('  WON  ')).toBe('success')
      expect(toneForStatus('wOn')).toBe('success')
      expect(toneForStatus('ready   to   close')).toBe('success')
    })

    it('leaves an unknown status neutral rather than guessing', () => {
      expect(toneForStatus('Bespoke Stage 7')).toBe('neutral')
      expect(toneForStatus('Zeta')).toBe('neutral')
    })
  })

  describe('defensive input handling', () => {
    it.each([[null], [undefined], [''], ['   '], [42], [{}], [[]], [true]])(
      'returns neutral for %p',
      (input) => {
        expect(toneForStatus(input)).toBe('neutral')
      },
    )
  })

  describe('contract', () => {
    it('only ever returns a declared tone', () => {
      const samples = [
        'New',
        'Won',
        'Lost',
        'Nurture',
        'Backlog',
        'Qualification',
        'Active',
        'Inactive',
        'Completed',
        'Pending',
        'anything at all',
        '',
        null,
        undefined,
      ]
      for (const s of samples) expect(TONES).toContain(toneForStatus(s))
    })

    it('every exact entry maps to a declared tone', () => {
      for (const tone of Object.values(EXACT)) expect(TONES).toContain(tone)
    })

    it('every word vocabulary maps to a declared tone', () => {
      for (const tone of Object.keys(WORDS)) expect(TONES).toContain(tone)
    })

    it('no word appears in two vocabularies', () => {
      // A word in two lists is decided by precedence rather than by meaning,
      // which is exactly the ambiguity this module exists to remove.
      const seen = new Map()
      for (const [tone, words] of Object.entries(WORDS)) {
        for (const w of words) {
          expect(seen.has(w), `"${w}" in both ${seen.get(w)} and ${tone}`).toBe(
            false,
          )
          seen.set(w, tone)
        }
      }
    })

    it('toneClass returns a complete literal class name', () => {
      // Purge-safety: the class must be a whole token, never a fragment that
      // Tailwind's content scan or a CSS purge step could fail to see.
      expect(toneClass('Won')).toBe('crm-tone-success')
      expect(toneClass('Lost')).toBe('crm-tone-danger')
      expect(toneClass('Negotiation')).toBe('crm-tone-warning')
      expect(toneClass('New')).toBe('crm-tone-info')
      expect(toneClass(null)).toBe('crm-tone-neutral')
    })
  })
})
