// The onboarding state is a shared frappe-ui store, driven from a fixture here.
// These must be genuine refs: a plain `{ value }` object is not unwrapped by the
// template, so the component would compare objects instead of numbers and render
// "[object Object]".
vi.mock('frappe-ui/frappe', async () => {
  const { ref } = await import('vue')
  const state = {
    stepsCompleted: ref(4),
    totalSteps: ref(9),
    completedPercentage: ref(44),
    isOnboardingStepsCompleted: ref(false),
    showHelpCenter: ref(false),
    showHelpModal: ref(false),
    minimize: ref(true),
  }
  return {
    __state: state,
    useOnboarding: () => state,
    showHelpCenter: state.showHelpCenter,
    showHelpModal: state.showHelpModal,
    minimize: state.minimize,
  }
})

import GettingStartedBanner from '@/components/GettingStartedBanner.vue'
import { mountComponent } from '../helpers/mount'
import { __state as onboarding } from 'frappe-ui/frappe'

const mountBanner = (props = {}) =>
  mountComponent(GettingStartedBanner, { props })

describe('GettingStartedBanner', () => {
  beforeEach(() => {
    onboarding.stepsCompleted.value = 4
    onboarding.totalSteps.value = 9
    onboarding.completedPercentage.value = 44
    onboarding.isOnboardingStepsCompleted.value = false
    onboarding.showHelpCenter.value = false
    onboarding.showHelpModal.value = false
    onboarding.minimize.value = true
  })

  describe('in progress', () => {
    it('states the progress in words', () => {
      // The design asks for "4 / 9 steps completed"; the stock frappe-ui
      // banner this replaced said only "4/9 steps".
      expect(mountBanner().text()).toContain('4 / 9 steps completed')
    })

    it('shows a progress bar filled to the completed percentage', () => {
      const fill = mountBanner().find('.onboarding-fill')
      expect(fill.exists()).toBe(true)
      expect(fill.attributes('style')).toContain('width: 44%')
    })

    it('renders an empty bar at the start', () => {
      onboarding.stepsCompleted.value = 0
      onboarding.completedPercentage.value = 0
      expect(
        mountBanner().find('.onboarding-fill').attributes('style'),
      ).toContain('width: 0%')
    })

    it('exposes the progress to assistive tech', () => {
      const bar = mountBanner().find('[role="progressbar"]')
      expect(bar.attributes('aria-valuenow')).toBe('44')
      expect(bar.attributes('aria-valuemin')).toBe('0')
      expect(bar.attributes('aria-valuemax')).toBe('100')
    })

    it('invites a first-time user to start', () => {
      onboarding.stepsCompleted.value = 0
      expect(mountBanner().find('.stub-button').text()).toContain('Start now')
    })

    it('invites a returning user to continue', () => {
      expect(mountBanner().find('.stub-button').text()).toContain('Continue')
    })

    it('opens the onboarding modal, un-minimised', () => {
      // minimize starts true; leaving it set would open the modal collapsed.
      mountBanner().find('.stub-button').trigger('click')
      expect(onboarding.showHelpModal.value).toBe(true)
      expect(onboarding.minimize.value).toBe(false)
    })
  })

  describe('all steps done', () => {
    beforeEach(() => {
      onboarding.stepsCompleted.value = 9
      onboarding.completedPercentage.value = 100
    })

    it('congratulates rather than showing a full bar', () => {
      const wrapper = mountBanner()
      expect(wrapper.text()).toContain('You are all set')
      expect(wrapper.find('.onboarding-fill').exists()).toBe(false)
    })

    it('drops the Continue button', () => {
      expect(mountBanner().find('.stub-button').exists()).toBe(false)
    })

    it('can be dismissed, which reveals the help centre', () => {
      const wrapper = mountBanner()
      wrapper.find('svg.feather-x').trigger('click')
      expect(onboarding.isOnboardingStepsCompleted.value).toBe(true)
      expect(onboarding.showHelpCenter.value).toBe(true)
    })
  })

  describe('collapsed rail', () => {
    it('shrinks to a single icon button', () => {
      const wrapper = mountBanner({ isSidebarCollapsed: true })
      expect(wrapper.text()).not.toContain('steps completed')
      expect(wrapper.find('.stub-button').exists()).toBe(true)
    })

    it('still opens onboarding from the rail', () => {
      const wrapper = mountBanner({ isSidebarCollapsed: true })
      wrapper.find('.stub-button').trigger('click')
      expect(onboarding.showHelpModal.value).toBe(true)
    })

    it('disappears entirely once everything is done', () => {
      // Nothing to nag about, and no room in a 56px rail to say so.
      onboarding.stepsCompleted.value = 9
      const wrapper = mountBanner({ isSidebarCollapsed: true })
      expect(wrapper.find('.stub-button').exists()).toBe(false)
    })
  })
})
