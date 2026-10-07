import Questionnaire from '@/components/Questionnaire.vue'
import { mountComponent } from '../helpers/mount'

const QUESTIONS = [
  {
    key: 'role',
    title: 'What is your role?',
    options: [
      { label: 'Sales', value: 'sales' },
      { label: 'Support', value: 'support' },
    ],
  },
  {
    key: 'tools',
    title: 'Which tools do you use?',
    multiple: true,
    options: [
      { label: 'Email', value: 'email' },
      { label: 'Phone', value: 'phone' },
      { label: 'WhatsApp', value: 'whatsapp' },
    ],
  },
  {
    key: 'referrer',
    title: 'How did you hear about us?',
    optional: true,
    options: [{ label: 'A friend', value: 'friend' }],
  },
]

const mountQuiz = (props = {}) =>
  mountComponent(Questionnaire, {
    props: { questions: QUESTIONS, ...props },
  })

const pick = (wrapper, value) =>
  wrapper.vm.select(
    wrapper.vm.question.options.find((o) => o.value === value),
  )

describe('Questionnaire', () => {
  describe('single-choice questions', () => {
    it('records the answer', () => {
      const wrapper = mountQuiz()
      pick(wrapper, 'sales')
      expect(wrapper.vm.answers.role).toBe('sales')
    })

    it('advances on its own, since the answer is unambiguous', () => {
      // One tap, one answer — waiting for Next would be a wasted click.
      const wrapper = mountQuiz()
      pick(wrapper, 'sales')
      expect(wrapper.vm.current).toBe(1)
    })

    it('replaces a previous answer rather than accumulating', () => {
      const wrapper = mountQuiz()
      pick(wrapper, 'sales')
      wrapper.vm.back()
      pick(wrapper, 'support')
      expect(wrapper.vm.answers.role).toBe('support')
    })

    it('does not advance past the last question', () => {
      const wrapper = mountQuiz({ questions: [QUESTIONS[0]] })
      pick(wrapper, 'sales')
      expect(wrapper.vm.current).toBe(0)
    })
  })

  describe('multiple-choice questions', () => {
    const atTools = () => {
      const wrapper = mountQuiz()
      pick(wrapper, 'sales')
      return wrapper
    }

    it('collects several answers', () => {
      const wrapper = atTools()
      pick(wrapper, 'email')
      pick(wrapper, 'phone')
      expect(wrapper.vm.answers.tools).toEqual(['email', 'phone'])
    })

    it('toggles a choice back off', () => {
      const wrapper = atTools()
      pick(wrapper, 'email')
      pick(wrapper, 'email')
      expect(wrapper.vm.answers.tools).toEqual([])
    })

    it('waits for Next rather than advancing', () => {
      // Auto-advancing would cut the user off mid-selection.
      const wrapper = atTools()
      pick(wrapper, 'email')
      expect(wrapper.vm.current).toBe(1)
    })

    it('reports selection state per option', () => {
      const wrapper = atTools()
      pick(wrapper, 'phone')
      expect(wrapper.vm.isSelected({ value: 'phone' })).toBe(true)
      expect(wrapper.vm.isSelected({ value: 'email' })).toBe(false)
    })
  })

  describe('moving between questions', () => {
    it('blocks Next until a required question is answered', () => {
      const wrapper = mountQuiz()
      wrapper.vm.next()
      expect(wrapper.vm.current).toBe(0)
    })

    it('allows Next once answered', () => {
      const wrapper = mountQuiz()
      pick(wrapper, 'sales')
      pick(wrapper, 'email')
      wrapper.vm.next()
      expect(wrapper.vm.current).toBe(2)
    })

    it('allows Next on an optional question with no answer', () => {
      const wrapper = mountQuiz()
      pick(wrapper, 'sales')
      pick(wrapper, 'email')
      wrapper.vm.next()
      expect(wrapper.vm.canProceed).toBe(true)
    })

    it('goes back', () => {
      const wrapper = mountQuiz()
      pick(wrapper, 'sales')
      wrapper.vm.back()
      expect(wrapper.vm.current).toBe(0)
    })

    it('does not go back past the first question', () => {
      const wrapper = mountQuiz()
      wrapper.vm.back()
      expect(wrapper.vm.current).toBe(0)
    })

    it('keeps answers when moving back and forth', () => {
      const wrapper = mountQuiz()
      pick(wrapper, 'sales')
      wrapper.vm.back()
      expect(wrapper.vm.answers.role).toBe('sales')
    })
  })

  describe('finishing', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('submits every answer', () => {
      const wrapper = mountQuiz()
      pick(wrapper, 'sales')
      pick(wrapper, 'email')
      wrapper.vm.next()
      wrapper.vm.finish()
      vi.advanceTimersByTime(1000)

      expect(wrapper.emitted('submit')[0][0]).toEqual({
        role: 'sales',
        tools: ['email'],
      })
    })

    it('holds briefly so the completion state is seen', () => {
      // The emit is delayed 700ms to let the "done" state register visually.
      const wrapper = mountQuiz()
      pick(wrapper, 'sales')
      pick(wrapper, 'email')
      wrapper.vm.next()
      wrapper.vm.finish()

      expect(wrapper.vm.completed).toBe(true)
      expect(wrapper.emitted('submit')).toBeUndefined()
      vi.advanceTimersByTime(700)
      expect(wrapper.emitted('submit')).toHaveLength(1)
    })

    it('cannot be submitted twice', () => {
      const wrapper = mountQuiz()
      pick(wrapper, 'sales')
      pick(wrapper, 'email')
      wrapper.vm.next()
      wrapper.vm.finish()
      wrapper.vm.finish()
      vi.advanceTimersByTime(1000)
      expect(wrapper.emitted('submit')).toHaveLength(1)
    })

    it('ignores answers once completed', () => {
      const wrapper = mountQuiz()
      pick(wrapper, 'sales')
      pick(wrapper, 'email')
      wrapper.vm.next()
      wrapper.vm.finish()
      pick(wrapper, 'friend')
      expect(wrapper.vm.answers.referrer).toBeUndefined()
    })

    it('sends a copy, not the live answers object', () => {
      const wrapper = mountQuiz()
      pick(wrapper, 'sales')
      pick(wrapper, 'email')
      wrapper.vm.next()
      wrapper.vm.finish()
      vi.advanceTimersByTime(1000)
      expect(wrapper.emitted('submit')[0][0]).not.toBe(wrapper.vm.answers)
    })
  })

  describe('labels', () => {
    it('reports progress and completion', () => {
      const { labels } = mountQuiz().vm
      expect(labels.progress(2, 3)).toBe('Step 2 of 3')
      expect(labels.complete(66)).toBe('66% complete')
    })

    it('lets the caller override any of them', () => {
      const wrapper = mountQuiz({ labels: { finish: 'All done' } })
      expect(wrapper.vm.labels.finish).toBe('All done')
      // The rest keep their defaults.
      expect(wrapper.vm.labels.skip).toBe('Skip for now')
    })
  })

  describe('skipping', () => {
    // The `showSkip` prop, the `skip` emit and `labels.skip` are all declared,
    // but the template renders no skip control and never emits it — the feature
    // is unimplemented API surface. The only consumer (pages/PersonaForm.vue)
    // passes `:show-skip="false"` and does not listen for `@skip`, so nothing
    // depends on it today. Recorded here so the gap is visible rather than
    // discovered by whoever next tries to use the prop.
    it('renders no skip control, whatever showSkip says', () => {
      expect(mountQuiz({ showSkip: true }).text()).not.toContain('Skip for now')
      expect(mountQuiz({ showSkip: false }).text()).not.toContain(
        'Skip for now',
      )
    })

    it('never emits skip', () => {
      const wrapper = mountQuiz({ showSkip: true })
      pick(wrapper, 'sales')
      expect(wrapper.emitted('skip')).toBeUndefined()
    })

    it('still exposes the label, ready for whoever implements it', () => {
      expect(mountQuiz().vm.labels.skip).toBe('Skip for now')
    })
  })
})
