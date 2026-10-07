import CountUpTimer from '@/components/CountUpTimer.vue'
import { mountComponent } from '../helpers/mount'

/** A fresh timer; the component keeps its own counters in state. */
const newTimer = () => mountComponent(CountUpTimer).vm

describe('CountUpTimer', () => {
  describe('formatting a duration', () => {
    it('shows minutes and seconds under an hour', () => {
      // getTime() advances by one second as it formats, so 65s reads as 1:06.
      expect(newTimer().getTime(65)).toBe('1:06')
    })

    it('pads the seconds but not the minutes', () => {
      expect(newTimer().getTime(5)).toBe('0:06')
      expect(newTimer().getTime(125)).toBe('2:06')
    })

    it('adds an hours segment past sixty minutes', () => {
      expect(newTimer().getTime(3665)).toBe('1:01:06')
    })

    it('pads the minutes once an hour is showing', () => {
      // Regression: this used to render "1:00:005" — the seconds were padded to
      // a string and then re-tested against 10, which coerced '05' back to 5
      // and padded it a second time.
      expect(newTimer().getTime(3604)).toBe('1:00:05')
    })

    it('never double-pads the seconds', () => {
      for (const seconds of [3600, 3601, 3604, 3608, 7204]) {
        expect(newTimer().getTime(seconds)).toMatch(/^\d+:\d{2}:\d{2}$/)
      }
    })

    it('handles multiple hours', () => {
      expect(newTimer().getTime(7325)).toBe('2:02:06')
    })

    it('accepts a numeric string', () => {
      expect(newTimer().getTime('65')).toBe('1:06')
    })

    it('starts from zero with no argument', () => {
      expect(newTimer().getTime()).toBe('0:01')
    })
  })

  describe('counting', () => {
    it('advances a second on each tick', () => {
      const vm = newTimer()
      expect(vm.getTime()).toBe('0:01')
      expect(vm.getTime()).toBe('0:02')
      expect(vm.getTime()).toBe('0:03')
    })

    it('rolls over into the next minute', () => {
      const vm = newTimer()
      vm.getTime(58)
      expect(vm.getTime()).toBe('1:00')
    })

    it('rolls over into the next hour', () => {
      const vm = newTimer()
      vm.getTime(3598)
      expect(vm.getTime()).toBe('1:00:00')
    })
  })

  describe('stop', () => {
    // `updatedTime` is only written by the interval tick, so these run the
    // timer rather than calling getTime() directly.
    it('returns the elapsed time and resets to zero', () => {
      vi.useFakeTimers()
      const vm = newTimer()
      vm.start()
      vi.advanceTimersByTime(3000)
      expect(vm.stop()).toBe('0:03')
      expect(vm.updatedTime).toBe('0:00')
      vi.useRealTimers()
    })

    it('starts counting from zero again afterwards', () => {
      vi.useFakeTimers()
      const vm = newTimer()
      vm.start()
      vi.advanceTimersByTime(5000)
      vm.stop()
      vm.start()
      vi.advanceTimersByTime(1000)
      expect(vm.updatedTime).toBe('0:01')
      vm.stop()
      vi.useRealTimers()
    })
  })

  describe('the running timer', () => {
    it('ticks once a second while started', () => {
      vi.useFakeTimers()
      const vm = newTimer()
      vm.start()
      vi.advanceTimersByTime(3000)
      expect(vm.updatedTime).toBe('0:03')
      vm.stop()
      vi.useRealTimers()
    })

    it('stops ticking once stopped', () => {
      vi.useFakeTimers()
      const vm = newTimer()
      vm.start()
      vi.advanceTimersByTime(2000)
      vm.stop()
      const after = vm.updatedTime
      vi.advanceTimersByTime(5000)
      expect(vm.updatedTime).toBe(after)
      vi.useRealTimers()
    })
  })
})
