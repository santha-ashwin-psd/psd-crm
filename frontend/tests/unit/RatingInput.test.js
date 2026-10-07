import RatingInput from '@/components/Controls/RatingInput.vue'
import FormattedInput from '@/components/Controls/FormattedInput.vue'
import { mountComponent } from '../helpers/mount'

const STUBS = {
  Tooltip: { name: 'Tooltip', props: ['text'], template: '<div><slot /></div>' },
  TextInput: {
    name: 'TextInput',
    props: ['value', 'modelValue'],
    template: '<input class="fi" :value="value" />',
  },
}

const mountRating = (props = {}) =>
  mountComponent(RatingInput, {
    props: { value: 0, ...props },
    global: { stubs: STUBS },
  })

/** A click or hover at a given horizontal position within a 20px-wide star. */
const halfEvent = (side) => ({
  clientX: side === 'left' ? 5 : 15,
  currentTarget: { getBoundingClientRect: () => ({ left: 0, width: 20 }) },
})

describe('RatingInput', () => {
  describe('reading the stored value', () => {
    it('scales a fraction up to stars', () => {
      // The document stores 0–1; the control shows it out of `max`.
      expect(mountRating({ value: 0.6 }).vm.savedStarValue).toBe(3)
      expect(mountRating({ value: 1 }).vm.savedStarValue).toBe(5)
      expect(mountRating({ value: 0 }).vm.savedStarValue).toBe(0)
    })

    it('rounds to the nearest half star', () => {
      expect(mountRating({ value: 0.7 }).vm.savedStarValue).toBe(3.5)
      expect(mountRating({ value: 0.55 }).vm.savedStarValue).toBe(3)
    })

    it('honours a custom maximum', () => {
      expect(mountRating({ value: 0.5, max: 10 }).vm.savedStarValue).toBe(5)
    })

    it('falls back to five stars for a bad maximum', () => {
      expect(mountRating({ value: 1, max: 0 }).vm.nStars).toBe(5)
      expect(mountRating({ value: 1, max: 'abc' }).vm.nStars).toBe(5)
    })

    it('treats a missing value as zero', () => {
      expect(mountRating({ value: null }).vm.savedStarValue).toBe(0)
    })
  })

  describe('setting a rating', () => {
    it('stores the right half when the right side is clicked', () => {
      const wrapper = mountRating({ value: 0 })
      wrapper.vm.onStarClick(halfEvent('right'), 3)
      expect(wrapper.emitted('change')[0]).toEqual([0.6])
    })

    it('stores a half star when the left side is clicked', () => {
      const wrapper = mountRating({ value: 0 })
      wrapper.vm.onStarClick(halfEvent('left'), 3)
      expect(wrapper.emitted('change')[0]).toEqual([0.5])
    })

    it('clears the rating when the current value is clicked again', () => {
      // Otherwise a rating could be changed but never removed.
      const wrapper = mountRating({ value: 0.6 })
      wrapper.vm.onStarClick(halfEvent('right'), 3)
      expect(wrapper.emitted('change')[0]).toEqual([0])
    })

    it('does not clear when a different star is clicked', () => {
      const wrapper = mountRating({ value: 0.6 })
      wrapper.vm.onStarClick(halfEvent('right'), 4)
      expect(wrapper.emitted('change')[0]).toEqual([0.8])
    })
  })

  describe('hover feedback', () => {
    const FILLED = 'var(--rating-filled)'
    const PREVIEW = 'var(--rating-preview)'
    const REMOVING = 'var(--rating-removing)'
    const EMPTY = 'var(--rating-empty)'

    it('fills up to the saved value when not hovering', () => {
      const vm = mountRating({ value: 0.6 }).vm
      expect(vm.getHalfColor(3)).toBe(FILLED)
      expect(vm.getHalfColor(3.5)).toBe(EMPTY)
    })

    it('previews the stars a higher hover would add', () => {
      const wrapper = mountRating({ value: 0.4 })
      wrapper.vm.hoveredStarValue = 4
      expect(wrapper.vm.getHalfColor(2)).toBe(FILLED)
      expect(wrapper.vm.getHalfColor(3)).toBe(PREVIEW)
      expect(wrapper.vm.getHalfColor(5)).toBe(EMPTY)
    })

    it('marks the stars a lower hover would remove', () => {
      // The saved rating stays readable while you consider reducing it.
      // 0.8 of 5 stars = 4 saved, so halves 2.5–4 are at risk and the fifth
      // star — never filled — stays empty.
      const wrapper = mountRating({ value: 0.8 })
      wrapper.vm.hoveredStarValue = 2
      expect(wrapper.vm.getHalfColor(2)).toBe(FILLED)
      expect(wrapper.vm.getHalfColor(2.5)).toBe(REMOVING)
      expect(wrapper.vm.getHalfColor(4)).toBe(REMOVING)
      expect(wrapper.vm.getHalfColor(5)).toBe(EMPTY)
    })

    it('tracks which half of a star the pointer is over', () => {
      const wrapper = mountRating()
      wrapper.vm.onMouseMove(halfEvent('left'), 3)
      expect(wrapper.vm.hoveredStarValue).toBe(2.5)
      wrapper.vm.onMouseMove(halfEvent('right'), 3)
      expect(wrapper.vm.hoveredStarValue).toBe(3)
    })

    it('forgets the hover on leave', () => {
      const wrapper = mountRating()
      wrapper.vm.onMouseMove(halfEvent('right'), 3)
      wrapper.vm.onMouseLeave()
      expect(wrapper.vm.hoveredStarValue).toBeNull()
    })
  })

  describe('tooltip', () => {
    it('shows the hovered value while rating', () => {
      const wrapper = mountRating({ value: 0.4 })
      wrapper.vm.hoveredStarValue = 3.5
      expect(wrapper.vm.tooltipText).toBe('3.5 / 5')
    })

    it('drops the decimal on a whole star', () => {
      const wrapper = mountRating({ value: 0.4 })
      wrapper.vm.hoveredStarValue = 3
      expect(wrapper.vm.tooltipText).toBe('3 / 5')
    })

    it('shows the saved value when the control is read-only', () => {
      expect(mountRating({ value: 0.6, disabled: true }).vm.tooltipText).toBe(
        '3 / 5',
      )
    })

    it('shows nothing when there is nothing to report', () => {
      expect(mountRating({ value: 0 }).vm.tooltipText).toBeNull()
      expect(mountRating({ value: 0, disabled: true }).vm.tooltipText).toBeNull()
    })
  })
})

describe('FormattedInput', () => {
  const mountFormatted = (props = {}) =>
    mountComponent(FormattedInput, { props, global: { stubs: STUBS } })

  it('shows the formatted value at rest', () => {
    expect(
      mountFormatted({ value: 1234.5, formattedValue: '$ 1,234.50' }).vm
        .displayValue,
    ).toBe('$ 1,234.50')
  })

  it('shows the raw value while editing', () => {
    // You cannot type into "$ 1,234.50"; editing needs the underlying number.
    const wrapper = mountFormatted({ value: 1234.5, formattedValue: '$ 1,234.50' })
    wrapper.vm.handleFocus()
    expect(wrapper.vm.displayValue).toBe(1234.5)
  })

  it('falls back to the raw value when nothing formatted it', () => {
    expect(mountFormatted({ value: 'ACME' }).vm.displayValue).toBe('ACME')
  })

  it('handles an empty value', () => {
    expect(mountFormatted({}).vm.displayValue).toBe('')
  })
})
