import DurationInput from '@/components/Controls/DurationInput.vue'
import { mountComponent } from '../helpers/mount'

const STUBS = {
  TextInput: {
    name: 'TextInput',
    props: ['modelValue', 'value', 'placeholder'],
    template: '<input class="duration" :value="value" :placeholder="placeholder" />',
  },
  ErrorMessage: {
    name: 'ErrorMessage',
    props: ['message'],
    template: '<div class="error">{{ message }}</div>',
  },
}

const mountDuration = (props = {}) =>
  mountComponent(DurationInput, { props, global: { stubs: STUBS } })

/** parseDuration is the heart of this control; reach it through the instance. */
const parse = (input) => mountDuration().vm.parseDuration(input)

describe('parseDuration', () => {
  describe('colon notation', () => {
    it('reads hours, minutes and seconds', () => {
      expect(parse('1:30:45')).toBe(5445)
      expect(parse('0:00:30')).toBe(30)
    })

    it('reads minutes and seconds', () => {
      expect(parse('90:30')).toBe(5430)
      expect(parse('1:30')).toBe(90)
    })

    it('reads a leading colon as seconds only', () => {
      expect(parse(':45')).toBe(45)
    })
  })

  it('treats a bare number as seconds', () => {
    expect(parse('90')).toBe(90)
    expect(parse('0')).toBe(0)
  })

  describe('named units', () => {
    it('reads the compact form', () => {
      expect(parse('1h 30m 45s')).toBe(5445)
    })

    it('reads the long form', () => {
      expect(parse('1 hour 30 minutes 45 seconds')).toBe(5445)
      expect(parse('2 hours')).toBe(7200)
    })

    it('accepts the abbreviations', () => {
      expect(parse('1hr 30min 45sec')).toBe(5445)
      expect(parse('2hrs 5mins 3secs')).toBe(7503)
    })

    it('does not care about order', () => {
      // Someone typing "45s 1h" means the same thing as "1h 45s".
      expect(parse('45s 1h')).toBe(3645)
    })

    it('works without spaces', () => {
      expect(parse('1h30m')).toBe(5400)
    })

    it('ignores case', () => {
      expect(parse('1H 30M')).toBe(5400)
    })

    it('accepts a single unit on its own', () => {
      expect(parse('45s')).toBe(45)
      expect(parse('30m')).toBe(1800)
    })
  })

  describe('rejections', () => {
    it('rejects the same unit twice', () => {
      // "1h 2h" is a typo, not three hours.
      expect(parse('1h 2h')).toBeNull()
      expect(parse('30m 45m')).toBeNull()
    })

    it('rejects text between the tokens', () => {
      expect(parse('1h and 30m')).toBeNull()
    })

    it('rejects trailing junk', () => {
      expect(parse('1h 30m xyz')).toBeNull()
    })

    it('rejects a bare unit with no number', () => {
      expect(parse('h')).toBeNull()
      expect(parse('hours')).toBeNull()
    })

    it('rejects unparseable input', () => {
      expect(parse('abc')).toBeNull()
      expect(parse('--')).toBeNull()
    })

    it('rejects empty input', () => {
      expect(parse('')).toBeNull()
      expect(parse('   ')).toBeNull()
    })
  })
})

describe('DurationInput', () => {
  describe('display', () => {
    it('shows a formatted duration when not being edited', () => {
      expect(mountDuration({ value: 5445 }).vm.displayValue).toBe('1h 30m 45s')
    })

    it('shows the long form when asked', () => {
      expect(mountDuration({ value: 3661, longForm: true }).vm.displayValue).toBe(
        '1 hour 1 minute 1 second',
      )
    })

    it('shows nothing for an empty value', () => {
      expect(mountDuration({ value: null }).vm.displayValue).toBe('')
    })

    it('switches to the raw text while focused', () => {
      const wrapper = mountDuration({ value: 5445 })
      wrapper.vm.handleFocus()
      expect(wrapper.vm.displayValue).toBe('1h 30m 45s')
      wrapper.vm.editValue = '2h'
      expect(wrapper.vm.displayValue).toBe('2h')
    })
  })

  describe('committing', () => {
    it('emits the parsed number of seconds', () => {
      const wrapper = mountDuration({ value: null })
      wrapper.vm.editValue = '1h 30m'
      wrapper.vm.commit()
      expect(wrapper.emitted('change')[0]).toEqual([5400])
    })

    it('emits null when the field is cleared', () => {
      const wrapper = mountDuration({ value: 5445 })
      wrapper.vm.editValue = ''
      wrapper.vm.commit()
      expect(wrapper.emitted('change')[0]).toEqual([null])
    })

    it('explains the accepted formats when the input is unparseable', () => {
      const wrapper = mountDuration({ value: null })
      wrapper.vm.editValue = 'nonsense'
      wrapper.vm.commit()
      expect(wrapper.vm.errorMessage).toContain('Invalid format')
      expect(wrapper.emitted('change')).toBeUndefined()
    })

    it('tailors the example to the long form', () => {
      const wrapper = mountDuration({ value: null, longForm: true })
      wrapper.vm.editValue = 'nonsense'
      wrapper.vm.commit()
      expect(wrapper.vm.errorMessage).toContain('1 hour 30 minutes')
    })

    it('clears a previous error on a good value', () => {
      const wrapper = mountDuration({ value: null })
      wrapper.vm.editValue = 'nonsense'
      wrapper.vm.commit()
      expect(wrapper.vm.errorMessage).toBeTruthy()
      wrapper.vm.editValue = '30m'
      wrapper.vm.commit()
      expect(wrapper.vm.errorMessage).toBe('')
    })
  })

  describe('keyboard', () => {
    it('commits on Enter', () => {
      const wrapper = mountDuration({ value: null })
      wrapper.vm.handleFocus()
      wrapper.vm.editValue = '2h'
      wrapper.vm.handleKeydown({ key: 'Enter', preventDefault: vi.fn() })
      expect(wrapper.emitted('change')[0]).toEqual([7200])
    })

    it('abandons the edit on Escape', () => {
      // Escape should restore what was there, not save half-typed text.
      const wrapper = mountDuration({ value: 3600 })
      wrapper.vm.handleFocus()
      wrapper.vm.editValue = 'nonsense'
      wrapper.vm.handleKeydown({ key: 'Escape' })
      expect(wrapper.emitted('change')).toBeUndefined()
      expect(wrapper.vm.errorMessage).toBe('')
    })

    it('ignores the blur that Enter itself triggers', () => {
      // Pressing Enter commits and then blurs the input, which would otherwise
      // commit a second time. The component guards with `isCommitting`, held
      // true across the blur() call — asserted here directly, because the real
      // sequence depends on a DOM blur the stub has no element to fire.
      const wrapper = mountDuration({ value: null })
      wrapper.vm.editValue = '2h'
      wrapper.vm.isCommitting = true
      wrapper.vm.handleBlur()
      expect(wrapper.emitted('change')).toBeUndefined()

      wrapper.vm.isCommitting = false
      wrapper.vm.handleBlur()
      expect(wrapper.emitted('change')).toHaveLength(1)
    })
  })

  // `size` arrives as a fall-through attribute, not a declared prop, so it is
  // absent on most usages and the fallback is the live path rather than the
  // exceptional one.
  describe('the text size', () => {
    const sizeOf = (attrs) =>
      mountComponent(DurationInput, {
        props: { value: 60 },
        attrs,
        global: { stubs: STUBS },
      }).vm.sizeClass

    it('is small when no size is given', () => {
      expect(sizeOf({})).toBe('text-xs')
    })

    it('follows an explicit size', () => {
      expect(sizeOf({ size: 'md' })).toBe('text-base')
      expect(sizeOf({ size: 'sm' })).toBe('text-xs')
    })
  })
})
