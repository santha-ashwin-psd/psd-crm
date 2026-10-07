import { mountComponent } from '../helpers/mount'

const LeadModalStub = {
  name: 'LeadModal',
  props: ['modelValue'],
  template: '<div class="stub-lead-modal" />',
}

import WelcomePage from '@/pages/Welcome.vue'

const mountPage = () =>
  mountComponent(WelcomePage, {
    global: { stubs: { LeadModal: LeadModalStub } },
  })

const buttonLabelled = (wrapper, label) =>
  wrapper.findAll('.stub-button').find((b) => b.text() === label)

describe('Welcome page', () => {
  describe('creating a lead manually', () => {
    it('keeps the lead modal shut until asked', () => {
      const wrapper = mountPage()
      expect(wrapper.findComponent(LeadModalStub).exists()).toBe(false)
    })

    it('opens it from the manual-entry button', async () => {
      const wrapper = mountPage()
      await buttonLabelled(wrapper, 'Or create leads manually').trigger('click')
      expect(wrapper.findComponent(LeadModalStub).exists()).toBe(true)
    })
  })

  describe('the two onboarding cards', () => {
    it('offers sample data and email sync', () => {
      const wrapper = mountPage()
      expect(buttonLabelled(wrapper, 'Add Sample Data')).toBeDefined()
      expect(buttonLabelled(wrapper, 'Connect your Email')).toBeDefined()
    })

    it('does nothing when either is pressed', async () => {
      // Documenting a gap, not endorsing it: neither card button carries a
      // @click, so both are inert. If a handler is added, this test fails and
      // should be replaced by one asserting what the handler does.
      const wrapper = mountPage()
      await buttonLabelled(wrapper, 'Add Sample Data').trigger('click')
      await buttonLabelled(wrapper, 'Connect your Email').trigger('click')
      expect(wrapper.findComponent(LeadModalStub).exists()).toBe(false)
    })
  })

  describe('the greeting', () => {
    it('is addressed to a hardcoded placeholder rather than the signed-in user', () => {
      // `name` is `ref('John Doe')` in the component — it is never read from
      // the session. Every user is greeted as John Doe. Pinned so the page
      // cannot ship in this state unnoticed.
      expect(mountPage().text()).toContain('Welcome John Doe')
    })
  })
})
