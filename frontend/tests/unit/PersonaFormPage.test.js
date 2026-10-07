const api = vi.hoisted(() => ({
  call: vi.fn(),
  capture: vi.fn(),
}))

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, call: api.call, usePageMeta: vi.fn() }
})

vi.mock('frappe-ui/frappe', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useTelemetry: () => ({ capture: api.capture }) }
})

const nav = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useRouter: () => nav }
})

import PersonaForm from '@/pages/PersonaForm.vue'
import { PERSONA_DONE_KEY } from '@/router'
import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'

const QuestionnaireStub = {
  name: 'Questionnaire',
  props: ['questions', 'showSkip'],
  emits: ['submit'],
  template: '<div class="stub-questionnaire" />',
}

const mountPage = () =>
  mountComponent(PersonaForm, {
    global: { stubs: { Questionnaire: QuestionnaireStub } },
  })

const ANSWERS = { current_solution: 'spreadsheets', team_size: 'just_me' }

describe('Persona form page', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    api.call.mockReset().mockResolvedValue({})
    api.capture.mockClear()
    nav.push.mockClear()
    localStorage.removeItem(PERSONA_DONE_KEY)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('the questions', () => {
    it('asks all five', () => {
      expect(mountPage().vm.questions).toHaveLength(5)
    })

    it('gives every question a key, a title and options', () => {
      for (const q of mountPage().vm.questions) {
        expect(q.key, q.key).toBeTruthy()
        expect(q.title, q.key).toBeTruthy()
        expect(q.options.length, q.key).toBeGreaterThan(1)
      }
    })

    it('uses distinct keys so answers cannot overwrite each other', () => {
      const keys = mountPage().vm.questions.map((q) => q.key)
      expect(new Set(keys).size).toBe(keys.length)
    })

    it('allows several answers only where several make sense', () => {
      const multiple = mountPage()
        .vm.questions.filter((q) => q.multiple)
        .map((q) => q.key)
      expect(multiple).toEqual(['lead_sources', 'biggest_challenges'])
    })

    it('marks only the closing question optional', () => {
      const optional = mountPage()
        .vm.questions.filter((q) => q.optional)
        .map((q) => q.key)
      expect(optional).toEqual(['first_goal'])
    })

    it('keeps option values unique within each question', () => {
      for (const q of mountPage().vm.questions) {
        const values = q.options.map((o) => o.value)
        expect(new Set(values).size, q.key).toBe(values.length)
      }
    })

    it('does not offer to skip', () => {
      // This is the one onboarding step that has to be answered, so the
      // questionnaire's skip affordance is explicitly turned off.
      expect(
        mountPage().findComponent(QuestionnaireStub).props('showSkip'),
      ).toBe(false)
    })
  })

  describe('submitting', () => {
    const submit = async (wrapper) => {
      wrapper.findComponent(QuestionnaireStub).vm.$emit('submit', ANSWERS)
      await nextTick()
    }

    it('records the answers as a telemetry event', async () => {
      const wrapper = mountPage()
      await submit(wrapper)
      expect(api.capture).toHaveBeenCalledWith('onboarding_persona', ANSWERS)
    })

    it('persists the flag on the settings doc', async () => {
      const wrapper = mountPage()
      await submit(wrapper)
      expect(api.call).toHaveBeenCalledWith('frappe.client.set_value', {
        doctype: 'FCRM Settings',
        name: 'FCRM Settings',
        fieldname: 'persona_captured',
        value: 1,
      })
    })

    it('remembers locally before the server is asked', async () => {
      // Deliberate: if the persist fails the wizard must not re-appear on the
      // next load, so the local flag is written first and unconditionally.
      const wrapper = mountPage()
      await submit(wrapper)
      expect(localStorage.getItem(PERSONA_DONE_KEY)).toBe('1')
    })

    it('starts fading out immediately', async () => {
      const wrapper = mountPage()
      await submit(wrapper)
      expect(wrapper.vm.leaving).toBe(true)
    })

    it('waits for the fade before navigating, not just the request', async () => {
      const wrapper = mountPage()
      await submit(wrapper)
      await vi.advanceTimersByTimeAsync(0)
      expect(nav.push).not.toHaveBeenCalled()

      await vi.advanceTimersByTimeAsync(300)
      expect(nav.push).toHaveBeenCalledWith({ name: 'Dashboard' })
    })

    it('still moves on when the server refuses the persist', async () => {
      // The local flag already covers the re-loop, so a failed save must not
      // strand the user on the questionnaire.
      api.call.mockRejectedValue(new Error('nope'))
      const wrapper = mountPage()
      await submit(wrapper)
      await vi.advanceTimersByTimeAsync(300)
      expect(nav.push).toHaveBeenCalledWith({ name: 'Dashboard' })
      expect(localStorage.getItem(PERSONA_DONE_KEY)).toBe('1')
    })
  })
})
