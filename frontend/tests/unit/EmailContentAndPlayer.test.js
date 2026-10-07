const api = vi.hoisted(() => ({ showExact: null }))

vi.mock('@/composables/useTimelinePreferences', async () => {
  const { ref } = await import('vue')
  api.showExact = ref(false)
  return { useTimelinePreferences: () => ({ showExactTimestamp: api.showExact }) }
})

import EmailContent from '@/components/Activities/EmailContent.vue'
import TimelineTimestamp from '@/components/Activities/TimelineTimestamp.vue'
import AudioPlayer from '@/components/Activities/AudioPlayer.vue'
import PlaybackSpeedOption from '@/components/Activities/PlaybackSpeedOption.vue'
import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'

const STUBS = { Tooltip: true, Dropdown: true }

describe('EmailContent', () => {
  const mount = (content) =>
    mountComponent(EmailContent, {
      props: { content },
      global: { stubs: STUBS },
    })

  const parsed = (content) => mount(content).vm._content

  describe('plain messages', () => {
    it('leaves a message with no quoted history alone', () => {
      expect(parsed('<p>Hello there</p>')).toBe('<p>Hello there</p>')
    })

    it('copes with empty content', () => {
      expect(() => mount('')).not.toThrow()
    })
  })

  describe('collapsing a Gmail quote', () => {
    const gmail = `<div>Reply body</div><div class="gmail_quote">On Monday, they wrote:</div>`

    it('wraps the quote in a collapsible block', () => {
      const out = parsed(gmail)
      expect(out).toContain('replied-content')
      expect(out).toContain('replyCollapser')
    })

    it('keeps the reply body outside the collapsible', () => {
      // The new message is the point; only the history folds away.
      expect(parsed(gmail)).toContain('Reply body')
    })

    it('keeps the quoted text, just hidden', () => {
      expect(parsed(gmail)).toContain('On Monday, they wrote:')
    })

    it('drops the gmail_quote class so it is not matched again', () => {
      expect(parsed(gmail)).not.toContain('gmail_quote')
    })

    it('handles several quotes in one message', () => {
      const twice = `<div>a</div><div class="gmail_quote">q1</div><div class="gmail_quote">q2</div>`
      const out = parsed(twice)
      expect(out).not.toContain('gmail_quote')
      expect(out).toContain('q1')
      expect(out).toContain('q2')
    })
  })

  describe('collapsing an Outlook quote', () => {
    const outlook = `<div>Reply body</div><div id="appendonsend"></div><div>Old thread</div>`

    it('wraps everything after the marker', () => {
      const out = parsed(outlook)
      expect(out).toContain('replied-content')
      expect(out).toContain('Old thread')
    })

    it('keeps the reply body outside it', () => {
      expect(parsed(outlook)).toContain('Reply body')
    })
  })

  describe('collapsing the CRM reply marker', () => {
    const crm = `<div>Reply body</div><p class="reply-to-content">marker</p><div>Old thread</div>`

    it('wraps everything after the marker', () => {
      expect(parsed(crm)).toContain('replied-content')
    })
  })

  describe('a marker with nothing after it', () => {
    // Regression: replaceReplyToContent returns early when there is nothing to
    // collapse, leaving the marker in place — and handleAllInstances used to
    // recurse unconditionally, so it found the same element forever. The stack
    // overflowed during setup and took the whole email area down.
    it('does not hang on a trailing CRM marker', () => {
      expect(() =>
        mount(`<div>Reply body</div><p class="reply-to-content">marker</p>`),
      ).not.toThrow()
    })

    it('does not hang on a trailing Outlook marker', () => {
      expect(() =>
        mount(`<div>Reply body</div><div id="appendonsend"></div>`),
      ).not.toThrow()
    })

    it('does not hang when the marker is the only content', () => {
      expect(() =>
        mount(`<p class="reply-to-content">marker</p>`),
      ).not.toThrow()
    })

    it('still renders the message body', () => {
      const out = parsed(
        `<div>Reply body</div><p class="reply-to-content">marker</p>`,
      )
      expect(out).toContain('Reply body')
    })

    it('does not hang when a later marker has nothing after it', () => {
      // The first one collapses fine; the second is the trailing case.
      expect(() =>
        mount(
          `<div>a</div><p class="reply-to-content">m1</p><div>b</div><p class="reply-to-content">m2</p>`,
        ),
      ).not.toThrow()
    })
  })
})

describe('TimelineTimestamp', () => {
  const mount = (props = {}) =>
    mountComponent(TimelineTimestamp, {
      props: { date: '2026-03-15 09:00:00', ...props },
      global: { stubs: STUBS },
    })

  beforeEach(() => {
    api.showExact.value = false
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T10:00:00'))
  })

  afterEach(() => vi.useRealTimers())

  it('shows relative time by default', () => {
    expect(mount().vm.displayText).toBe(mount().vm.relative)
  })

  it('offers the exact time in the tooltip', () => {
    // Whichever form is not on screen is the one worth revealing on hover.
    const wrapper = mount()
    expect(wrapper.vm.tooltipText).toBe(wrapper.vm.exact)
  })

  it('swaps both when the preference is exact', async () => {
    api.showExact.value = true
    await nextTick()
    const wrapper = mount()
    expect(wrapper.vm.displayText).toBe(wrapper.vm.exact)
    expect(wrapper.vm.tooltipText).toBe(wrapper.vm.relative)
  })

  it('honours a caller-supplied format', () => {
    const a = mount({ format: 'YYYY-MM-DD' })
    const b = mount({ format: 'HH:mm' })
    expect(a.vm.exact).not.toBe(b.vm.exact)
  })
})

describe('AudioPlayer', () => {
  const mount = (props = {}) =>
    mountComponent(AudioPlayer, {
      props: { src: '/files/call.mp3', ...props },
      global: { stubs: STUBS },
    })

  describe('formatting a timestamp', () => {
    const fmt = (t) => mount().vm.formatTime(t)

    it('pads minutes and seconds', () => {
      expect(fmt(0)).toBe('00:00')
      expect(fmt(9)).toBe('00:09')
      expect(fmt(61)).toBe('01:01')
    })

    it('counts past an hour in minutes', () => {
      // A call recording rarely runs long enough to need an hours field.
      expect(fmt(3661)).toBe('61:01')
    })

    it('drops fractional seconds', () => {
      expect(fmt(9.87)).toBe('00:09')
    })

    it('shows zero rather than NaN before the metadata loads', () => {
      expect(fmt(NaN)).toBe('00:00')
      expect(fmt(undefined)).toBe('00:00')
    })
  })

  describe('the menu', () => {
    it('offers download and playback speed first', () => {
      // It is a two-level menu: choosing Playback Speed replaces these.
      expect(mount().vm.options.map((o) => o.label)).toEqual([
        'Download',
        'Playback Speed',
      ])
    })

    it('replaces them with eight speeds once opened', async () => {
      const wrapper = mount()
      wrapper.vm.showPlaybackSpeed = true
      await nextTick()
      expect(wrapper.vm.options).toHaveLength(8)
    })

    it('starts at normal speed', () => {
      expect(mount().vm.currentPlaybackSpeed).toBe(1)
    })

    it('downloads under the recording own filename', () => {
      const wrapper = mount({ src: '/files/calls/call-42.mp3' })
      const anchor = { href: '', download: '', click: vi.fn() }
      const create = vi
        .spyOn(document, 'createElement')
        .mockReturnValue(anchor)
      wrapper.vm.options.find((o) => o.label === 'Download').onClick()
      expect(anchor.download).toBe('call-42.mp3')
      expect(anchor.click).toHaveBeenCalled()
      create.mockRestore()
    })

    it('opens the speed submenu without closing the dropdown', async () => {
      // The click has to be swallowed, or the menu the submenu lives in shuts.
      const wrapper = mount()
      const e = { preventDefault: vi.fn(), stopPropagation: vi.fn() }
      wrapper.vm.options.find((o) => o.label === 'Playback Speed').onClick(e)
      await nextTick()
      expect(e.preventDefault).toHaveBeenCalled()
      expect(e.stopPropagation).toHaveBeenCalled()
      expect(wrapper.vm.showPlaybackSpeed).toBe(true)
    })
  })

  describe('starting state', () => {
    it('is paused', () => {
      expect(mount().vm.isPaused).toBe(true)
    })

    it('is at full volume', () => {
      const wrapper = mount()
      expect(wrapper.vm.currentVolumn).toBe(1)
      expect(wrapper.vm.volumnProgress).toBe(100)
    })

    it('has no position yet', () => {
      expect(mount().vm.currentTime).toBe(0)
    })
  })
})

describe('PlaybackSpeedOption', () => {
  // The tick lives in Button's #suffix slot, which the shared stub does not
  // forward — so both states would render identically without this.
  const ButtonStub = {
    props: ['label'],
    template:
      '<button class="local-button">{{ label }}<slot name="suffix" /></button>',
  }

  const mount = (props = {}) =>
    mountComponent(PlaybackSpeedOption, {
      props: { label: '1.5x', ...props },
      global: { stubs: { Button: ButtonStub } },
    })

  it('shows its label', () => {
    expect(mount().text()).toContain('1.5x')
  })

  it('ticks the speed in effect', () => {
    // Without it there is no indication which speed is selected.
    expect(mount({ active: true }).find('.lucide-check').exists()).toBe(true)
  })

  it('leaves the others unticked', () => {
    expect(mount().find('.lucide-check').exists()).toBe(false)
  })

  it('reports a click', async () => {
    const onClick = vi.fn()
    await mount({ onClick }).find('.local-button').trigger('click')
    expect(onClick).toHaveBeenCalled()
  })
})
