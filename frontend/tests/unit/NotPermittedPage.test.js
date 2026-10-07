const api = vi.hoisted(() => ({ logout: { submit: vi.fn() } }))

// sessionStore is a Pinia store that builds resources at module scope, so it
// has to be replaced rather than instantiated.
vi.mock('@/stores/session', () => ({
  sessionStore: () => ({ logout: api.logout }),
}))

import NotPermitted from '@/pages/NotPermitted.vue'
import { mountComponent } from '../helpers/mount'

describe('Not-permitted page', () => {
  beforeEach(() => {
    api.logout.submit.mockClear()
  })

  it('names the problem rather than showing a bare error', () => {
    const wrapper = mountComponent(NotPermitted)
    expect(wrapper.text()).toContain('Access Denied')
    expect(wrapper.text()).toContain('contact your administrator')
  })

  it('offers a way out through a different account', () => {
    // Without this the page is a dead end: the user is signed in as someone
    // who cannot use the app and has no control to sign in as anyone else.
    const wrapper = mountComponent(NotPermitted)
    const button = wrapper.find('.stub-button')
    expect(button.text()).toBe('Login with Different Account')
  })

  it('logs out when that button is pressed', async () => {
    const wrapper = mountComponent(NotPermitted)
    await wrapper.find('.stub-button').trigger('click')
    expect(api.logout.submit).toHaveBeenCalled()
  })
})
