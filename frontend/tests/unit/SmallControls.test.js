import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'

import ButtonControl, {
  getButtonTheme,
  getButtonVariant,
} from '@/components/Controls/ButtonControl.vue'
import HtmlControl from '@/components/Controls/HtmlControl.vue'
import FormattedInput from '@/components/Controls/FormattedInput.vue'
import Password from '@/components/Controls/Password.vue'

// The shared stubs in tests/helpers/mount.js are anonymous objects, so
// findComponent({ name }) cannot match them. These locals are matched by
// reference and expose the props each assertion needs.
const ButtonStub = {
  props: ['label', 'theme', 'variant', 'iconLeft', 'disabled'],
  template: '<button class="local-button">{{ label }}</button>',
}

describe('ButtonControl', () => {
  const mount = (props = {}) =>
    mountComponent(ButtonControl, {
      props: { label: 'Run', ...props },
      global: { stubs: { Button: ButtonStub } },
    })

  describe('the icon', () => {
    it('passes the configured icon through', () => {
      // Regression: this was bound to `lucide - icon`, a subtraction against an
      // undefined variable, so every Button field rendered NaN and no icon.
      const wrapper = mount({ icon: 'zap' })
      expect(wrapper.findComponent(ButtonStub).props('iconLeft')).toBe('zap')
    })

    it('never passes NaN', () => {
      for (const icon of ['zap', null, undefined]) {
        const wrapper = mount({ icon })
        const passed = wrapper.findComponent(ButtonStub).props('iconLeft')
        expect(Number.isNaN(passed)).toBe(false)
      }
    })
  })

  describe('clicking', () => {
    it('emits the click', async () => {
      const wrapper = mount()
      await wrapper.find('.local-button').trigger('click')
      expect(wrapper.emitted('click')).toHaveLength(1)
    })
  })

  describe('theme by button colour', () => {
    it.each([
      ['Primary', 'gray'],
      ['Info', 'blue'],
      ['Success', 'green'],
      ['Warning', 'gray'],
      ['Danger', 'red'],
    ])('maps %s to %s', (colour, theme) => {
      expect(getButtonTheme(colour)).toBe(theme)
    })

    it('falls back to gray for an unknown colour', () => {
      expect(getButtonTheme('Chartreuse')).toBe('gray')
      expect(getButtonTheme(undefined)).toBe('gray')
    })
  })

  describe('variant by button colour', () => {
    it.each([
      ['Primary', 'solid'],
      ['Info', 'subtle'],
      ['Success', 'solid'],
      ['Warning', 'subtle'],
      ['Danger', 'solid'],
    ])('maps %s to %s', (colour, variant) => {
      expect(getButtonVariant(colour)).toBe(variant)
    })

    it('falls back to subtle for an unknown colour', () => {
      expect(getButtonVariant('Chartreuse')).toBe('subtle')
      expect(getButtonVariant(undefined)).toBe('subtle')
    })
  })
})

describe('HtmlControl', () => {
  const mount = (html) => mountComponent(HtmlControl, { props: { html } })

  it('renders the markup it is given', () => {
    expect(mount('<b>bold</b>').html()).toContain('<b>bold</b>')
  })

  it('strips a script tag', () => {
    // This control exists to render doctype-authored HTML, so the sanitiser is
    // the only thing between a field value and script execution.
    const wrapper = mount('<p>hi</p><script>alert(1)</script>')
    expect(wrapper.html()).not.toContain('<script')
    expect(wrapper.html()).toContain('<p>hi</p>')
  })

  it('strips an inline event handler', () => {
    expect(mount('<img src=x onerror="alert(1)">').html()).not.toContain(
      'onerror',
    )
  })

  it('renders nothing for an empty value', () => {
    expect(mount('').text()).toBe('')
    expect(mount(undefined).text()).toBe('')
  })
})

const TextInputStub = {
  props: ['value'],
  emits: ['focus', 'blur'],
  template: '<input class="local-text-input" />',
}

describe('FormattedInput', () => {
  const mount = (props = {}) =>
    mountComponent(FormattedInput, {
      props: { value: '1234.5', formattedValue: '₹1,234.50', ...props },
      global: { stubs: { TextInput: TextInputStub } },
    })

  const shown = (wrapper) => wrapper.findComponent(TextInputStub).props('value')

  it('shows the formatted value at rest', () => {
    expect(shown(mount())).toBe('₹1,234.50')
  })

  it('shows the raw value while focused', async () => {
    // Editing a currency needs the plain number; the separators are display
    // only and would have to be deleted by hand otherwise.
    const wrapper = mount()
    await wrapper.findComponent(TextInputStub).vm.$emit('focus')
    await nextTick()
    expect(shown(wrapper)).toBe('1234.5')
  })

  it('returns to the formatted value on blur', async () => {
    const wrapper = mount()
    const input = wrapper.findComponent(TextInputStub)
    await input.vm.$emit('focus')
    await nextTick()
    await input.vm.$emit('blur')
    await nextTick()
    expect(shown(wrapper)).toBe('₹1,234.50')
  })

  it('falls back to the raw value when there is no formatted one', () => {
    expect(shown(mount({ formattedValue: '' }))).toBe('1234.5')
  })
})

const FormControlStub = {
  props: ['type', 'value'],
  template:
    '<div class="local-form-control"><slot name="prefix" /><slot name="suffix" /></div>',
}

// Tooltip must forward its default slot: the eye icon lives inside it, and the
// real component would not render in a headless test.
const TooltipStub = { template: '<div class="local-tooltip"><slot /></div>' }

describe('Password', () => {
  const mount = (props = {}) =>
    mountComponent(Password, {
      props,
      global: {
        stubs: { FormControl: FormControlStub, Tooltip: TooltipStub },
      },
    })

  const control = (w) => w.findComponent(FormControlStub)
  const eye = (w) => w.find('.stub-feather')

  it('masks the value by default', () => {
    expect(control(mount({ modelValue: 'hunter2' })).props('type')).toBe(
      'password',
    )
  })

  it('reveals it when the eye is clicked', async () => {
    const wrapper = mount({ modelValue: 'hunter2' })
    await eye(wrapper).trigger('click')
    expect(control(wrapper).props('type')).toBe('text')
  })

  it('hides it again on a second click', async () => {
    const wrapper = mount({ modelValue: 'hunter2' })
    await eye(wrapper).trigger('click')
    await eye(wrapper).trigger('click')
    expect(control(wrapper).props('type')).toBe('password')
  })

  describe('the reveal control', () => {
    it('is offered for a real value', () => {
      expect(mount({ modelValue: 'hunter2' }).vm.showEye).toBe(true)
    })

    it('is withheld for a masked placeholder', () => {
      // The server returns stored passwords as asterisks; revealing those shows
      // the mask, not the secret, so the control would be a lie.
      expect(mount({ modelValue: '****' }).vm.showEye).toBe(false)
    })

    it('survives a numeric value', () => {
      // Both props declare [String, Number]. `?.` only guards null, so a number
      // used to reach `.includes` and throw.
      expect(() => mount({ modelValue: 1234 })).not.toThrow()
      expect(mount({ modelValue: 1234 }).vm.showEye).toBe(true)
    })

    it('is offered when there is no value at all', () => {
      expect(mount().vm.showEye).toBe(true)
    })
  })

  it('reads the legacy `value` prop when `modelValue` is absent', () => {
    expect(mount({ value: '****' }).vm.showEye).toBe(false)
  })
})
