const api = vi.hoisted(() => ({
  call: null,
  toast: null,
  resources: [],
  devices: [],
  showModal: null,
  updateOnboardingStep: null,
  capture: null,
}))

vi.mock('@twilio/voice-sdk', () => {
  class FakeDevice {
    constructor(token, options) {
      this.token = token
      this.options = options
      this.listeners = {}
      this.registered = false
      this.connectImpl = () =>
        Promise.resolve({ on: vi.fn(), parameters: {}, isMuted: () => false })
      api.devices.push(this)
    }
    on(event, fn) {
      this.listeners[event] = fn
    }
    emit(event, payload) {
      return this.listeners[event]?.(payload)
    }
    register() {
      this.registered = true
    }
    updateToken(t) {
      this.token = t
    }
    connect(...args) {
      return this.connectImpl(...args)
    }
  }
  return { Device: FakeDevice }
})

vi.mock('@/stores/global', () => ({
  globalStore: () => ({ onCall: false, calling: false, activeNumber: '' }),
}))

vi.mock('@/composables/doctypeModal', () => ({
  useDoctypeModal: () => ({ showModal: (...a) => api.showModal(...a) }),
}))

vi.mock('frappe-ui/frappe', async () => {
  const { ref } = await import('vue')
  return {
    useTelemetry: () => ({ capture: (...a) => api.capture(...a) }),
    useOnboarding: () => ({
      updateOnboardingStep: (...a) => api.updateOnboardingStep(...a),
      isOnboardingStepsCompleted: ref(false),
      setUp: vi.fn(),
    }),
    minimize: ref(false),
  }
})

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  const { reactive } = await import('vue')
  api.toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
  return {
    ...actual,
    toast: api.toast,
    call: (...a) => api.call(...a),
    createResource: (opts = {}) => {
      const r = reactive({ ...opts, data: null, fetch: vi.fn(), reload: vi.fn() })
      api.resources.push(r)
      return r
    },
  }
})

import TwilioCallUI from '@/components/Telephony/TwilioCallUI.vue'
import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'
import { flushPromises } from '@vue/test-utils'

const quiet = { inheritAttrs: false, template: '<div><slot /></div>' }
const STUBS = {
  Avatar: { ...quiet, name: 'AvatarStub' },
  CountUpTimer: {
    name: 'CountUpTimerStub',
    template: '<div><slot /></div>',
    setup(_, { expose }) {
      expose({
        start: vi.fn(),
        stop: vi.fn(),
        getTime: (s) => `dur:${s}`,
        updatedTime: '00:00',
      })
      return {}
    },
  },
  NoteIcon: { ...quiet, name: 'S1' },
  MinimizeIcon: { ...quiet, name: 'S2' },
  PhoneIcon: { ...quiet, name: 'S3' },
}

describe('TwilioCallUI', () => {
  const mount = () => mountComponent(TwilioCallUI, { global: { stubs: STUBS } })

  const fakeCall = (over = {}) => ({
    on: vi.fn(),
    parameters: { From: '+911234', CallSid: 'CA1' },
    isMuted: vi.fn(() => false),
    mute: vi.fn(),
    accept: vi.fn(async () => {}),
    reject: vi.fn(),
    disconnect: vi.fn(),
    ...over,
  })

  beforeEach(() => {
    api.devices = []
    api.resources = []
    api.call = vi.fn(async () => ({ token: 'tok-1' }))
    api.showModal = vi.fn()
    api.updateOnboardingStep = vi.fn()
    api.capture = vi.fn()
    api.toast.error.mockClear()
  })

  describe('connecting to Twilio', () => {
    it('asks the server for a token and registers with it', async () => {
      const wrapper = mount()
      await wrapper.vm.startupClient()
      expect(api.call).toHaveBeenCalledWith(
        'crm.integrations.twilio.api.generate_access_token',
      )
      expect(api.devices).toHaveLength(1)
      expect(api.devices[0].token).toBe('tok-1')
      expect(api.devices[0].registered).toBe(true)
    })

    it('reports a token it could not get, rather than failing silently', async () => {
      api.call.mockRejectedValue(new Error('No Twilio credentials'))
      const wrapper = mount()
      await wrapper.vm.startupClient()
      expect(wrapper.vm.log).toContain('No Twilio credentials')
      expect(api.devices).toHaveLength(0)
    })

    it('says when it is ready', async () => {
      const wrapper = mount()
      await wrapper.vm.startupClient()
      api.devices[0].emit('registered')
      expect(wrapper.vm.log).toContain('Ready')
    })

    it('says when it has logged out', async () => {
      const wrapper = mount()
      await wrapper.vm.startupClient()
      api.devices[0].emit('unregistered')
      expect(wrapper.vm.log).toBe('Logged out')
    })

    it('renews the token before it expires', async () => {
      const wrapper = mount()
      await wrapper.vm.startupClient()
      api.call.mockResolvedValue({ token: 'tok-2' })
      await api.devices[0].emit('tokenWillExpire')
      expect(api.devices[0].token).toBe('tok-2')
    })

    it('clears the call state and says so on a device error', async () => {
      const wrapper = mount()
      await wrapper.vm.startupClient()
      wrapper.vm.onCall = true
      wrapper.vm.showCallPopup = true
      api.devices[0].emit('error', { message: 'Websocket closed' })
      expect(wrapper.vm.onCall).toBe(false)
      expect(wrapper.vm.showCallPopup).toBe(false)
      expect(api.toast.error).toHaveBeenCalled()
    })
  })

  describe('an incoming call', () => {
    const incoming = async () => {
      const wrapper = mount()
      await wrapper.vm.startupClient()
      const call = fakeCall()
      wrapper.vm.handleIncomingCall(call)
      return { wrapper, call }
    }

    it('opens the popup and shows who is calling', async () => {
      const { wrapper } = await incoming()
      expect(wrapper.vm.showCallPopup).toBe(true)
      expect(wrapper.vm.phoneNumber).toBe('+911234')
    })

    it('listens for the call ending, however it ends', async () => {
      // Cancel, disconnect and reject all have to tear the popup down.
      const { call } = await incoming()
      expect(call.on.mock.calls.map(([e]) => e).sort()).toEqual([
        'cancel',
        'disconnect',
        'reject',
      ])
    })

    it('answers it', async () => {
      const { wrapper, call } = await incoming()
      await wrapper.vm.acceptIncomingCall()
      expect(call.accept).toHaveBeenCalled()
      expect(wrapper.vm.onCall).toBe(true)
    })

    it('turns it down and closes the popup', async () => {
      const { wrapper, call } = await incoming()
      wrapper.vm.rejectIncomingCall()
      expect(call.reject).toHaveBeenCalled()
      expect(wrapper.vm.showCallPopup).toBe(false)
      expect(wrapper.vm.muted).toBe(false)
    })

    it('hangs up an answered call and clears the note', async () => {
      const { wrapper, call } = await incoming()
      await wrapper.vm.acceptIncomingCall()
      wrapper.vm.note = { name: 'N1', title: 'x', content: 'said hello' }
      wrapper.vm.hangUpCall()
      expect(call.disconnect).toHaveBeenCalled()
      expect(wrapper.vm.onCall).toBe(false)
      expect(wrapper.vm.note.content).toBe('')
    })

    it('tidies up when the other end rings off', async () => {
      const { wrapper } = await incoming()
      wrapper.vm.handleDisconnectedIncomingCall()
      expect(wrapper.vm.showCallPopup).toBe(false)
      expect(wrapper.vm.showSmallCallWindow).toBe(false)
      expect(wrapper.vm.onCall).toBe(false)
    })
  })

  describe('placing a call', () => {
    const outgoing = async (connectImpl) => {
      const wrapper = mount()
      await wrapper.vm.startupClient()
      const call = fakeCall()
      api.devices[0].connectImpl = connectImpl || (async () => call)
      await wrapper.vm.makeOutgoingCall('+915555')
      return { wrapper, call }
    }

    it('dials the number', async () => {
      const wrapper = mount()
      await wrapper.vm.startupClient()
      const connect = vi.fn(async () => fakeCall())
      api.devices[0].connectImpl = connect
      await wrapper.vm.makeOutgoingCall('+915555')
      expect(connect).toHaveBeenCalledWith({ params: { To: '+915555' } })
      expect(wrapper.vm.phoneNumber).toBe('+915555')
    })

    it('opens the popup while it connects', async () => {
      const { wrapper } = await outgoing()
      expect(wrapper.vm.showCallPopup).toBe(true)
      expect(wrapper.vm.callStatus).toBe('initiating')
    })

    it('records that a call was placed', async () => {
      await outgoing()
      expect(api.capture).toHaveBeenCalledWith('make_outgoing_call')
    })

    it('refuses to dial before the device is registered', async () => {
      const wrapper = mount()
      await wrapper.vm.makeOutgoingCall('+915555')
      expect(api.toast.error).toHaveBeenCalledWith(
        'Calling device is not registered.',
      )
      expect(wrapper.vm.showCallPopup).toBe(false)
    })

    it('says why it could not connect', async () => {
      const wrapper = mount()
      await wrapper.vm.startupClient()
      api.devices[0].connectImpl = async () => {
        throw new Error('Busy')
      }
      await wrapper.vm.makeOutgoingCall('+915555')
      expect(api.toast.error).toHaveBeenCalledWith(
        expect.stringContaining('Busy'),
      )
      expect(wrapper.vm.onCall).toBe(false)
      expect(wrapper.vm.calling).toBe(false)
    })

    describe('once it is connected', () => {
      const handlerFor = (call, event) =>
        call.on.mock.calls.find(([e]) => e === event)?.[1]

      it('follows the status the carrier reports', async () => {
        const { wrapper, call } = await outgoing()
        handlerFor(call, 'messageReceived')({
          content: { CallStatus: 'ringing' },
        })
        expect(wrapper.vm.callStatus).toBe('ringing')
      })

      it('counts as on-call once it is answered', async () => {
        const { wrapper, call } = await outgoing()
        handlerFor(call, 'messageReceived')({
          content: { CallStatus: 'in-progress' },
        })
        expect(wrapper.vm.onCall).toBe(true)
        expect(wrapper.vm.calling).toBe(false)
      })

      it('shows as dialling until then', async () => {
        const { wrapper, call } = await outgoing()
        handlerFor(call, 'accept')()
        expect(wrapper.vm.calling).toBe(true)
        expect(wrapper.vm.onCall).toBe(false)
      })

      it('brings the call popup up once the carrier accepts', async () => {
        // Without this the call connects with nothing on screen to hang up.
        const { wrapper, call } = await outgoing()
        wrapper.vm.showCallPopup = false
        handlerFor(call, 'accept')()
        expect(wrapper.vm.showCallPopup).toBe(true)
      })

      it('clears everything when the call ends', async () => {
        const { wrapper, call } = await outgoing()
        wrapper.vm.note = { name: 'N1', title: 'x', content: 'notes' }
        handlerFor(call, 'disconnect')()
        expect(wrapper.vm.showCallPopup).toBe(false)
        expect(wrapper.vm.callStatus).toBe('')
        expect(wrapper.vm.note.content).toBe('')
      })

      it('reports a call that failed mid-way', async () => {
        const { wrapper, call } = await outgoing()
        handlerFor(call, 'error')({ message: 'Network lost' })
        expect(api.toast.error).toHaveBeenCalledWith(
          expect.stringContaining('Network lost'),
        )
        expect(wrapper.vm.showCallPopup).toBe(false)
      })

      it('clears up a call cancelled before it connected', async () => {
        const { wrapper, call } = await outgoing()
        handlerFor(call, 'cancel')()
        expect(wrapper.vm.calling).toBe(false)
        expect(wrapper.vm.showCallPopup).toBe(false)
      })
    })

    it('hangs up from the popup', async () => {
      const { wrapper, call } = await outgoing()
      wrapper.vm.cancelCall()
      expect(call.disconnect).toHaveBeenCalled()
      expect(wrapper.vm.showCallPopup).toBe(false)
      expect(wrapper.vm.callStatus).toBe('')
    })

    it('leaves nothing behind for the next call', async () => {
      // The popup is one long-lived component, so anything not reset here is
      // still set when the next call starts — a muted microphone most of all,
      // since nothing on the new call would tell you.
      const { wrapper } = await outgoing()
      wrapper.vm.muted = true
      wrapper.vm.note = { name: 'N-1', title: 'x', content: 'y' }
      wrapper.vm.cancelCall()
      expect(wrapper.vm.muted).toBe(false)
      expect(wrapper.vm.calling).toBe(false)
      expect(wrapper.vm.onCall).toBe(false)
      expect(wrapper.vm.showSmallCallWindow).toBe(false)
      expect(wrapper.vm.note).toEqual({ name: '', title: '', content: '' })
    })
  })

  describe('muting', () => {
    it('mutes and unmutes', async () => {
      const wrapper = mount()
      await wrapper.vm.startupClient()
      let muted = false
      const call = fakeCall({
        isMuted: () => muted,
        mute: vi.fn((v) => (muted = v !== false)),
      })
      wrapper.vm.handleIncomingCall(call)

      wrapper.vm.toggleMute()
      expect(wrapper.vm.muted).toBe(true)

      wrapper.vm.toggleMute()
      expect(call.mute).toHaveBeenLastCalledWith(false)
      expect(wrapper.vm.muted).toBe(false)
    })
  })

  describe('the small window', () => {
    it('swaps between the popup and the strip', async () => {
      const wrapper = mount()
      wrapper.vm.showCallPopup = true
      wrapper.vm.showSmallCallWindow = false
      wrapper.vm.toggleCallWindow()
      expect(wrapper.vm.showCallPopup).toBe(false)
      expect(wrapper.vm.showSmallCallWindow).toBe(true)
    })
  })

  describe('notes taken during a call', () => {
    it('opens the note form against the call log', async () => {
      const wrapper = mount()
      wrapper.vm.openNoteModal()
      expect(api.showModal).toHaveBeenCalledWith(
        expect.objectContaining({ doctype: 'CRM Call Log', name: null }),
      )
    })

    it('reopens the note already taken', async () => {
      const wrapper = mount()
      wrapper.vm.note = { name: 'N1', title: '', content: '' }
      wrapper.vm.openNoteModal()
      expect(api.showModal).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'N1' }),
      )
    })

    it('attaches a new note to the call it was taken on', async () => {
      const wrapper = mount()
      await wrapper.vm.startupClient()
      wrapper.vm.handleIncomingCall(fakeCall())
      api.call.mockClear()
      await wrapper.vm.updateNote({ name: 'N1', content: 'said hello' }, true)
      expect(api.call).toHaveBeenCalledWith(
        'crm.integrations.api.add_note_to_call_log',
        { call_sid: 'CA1', note: { name: 'N1', content: 'said hello' } },
      )
      expect(api.updateOnboardingStep).toHaveBeenCalledWith('create_first_note')
      expect(api.capture).toHaveBeenCalledWith('note_created')
    })

    it('does not re-attach a note that was only edited', async () => {
      const wrapper = mount()
      api.call.mockClear()
      await wrapper.vm.updateNote({ name: 'N1', content: 'edited' })
      expect(api.call).not.toHaveBeenCalled()
      expect(api.capture).toHaveBeenCalledWith('note_updated')
    })
  })

  describe('looking up the caller', () => {
    it('asks for whoever the number belongs to', async () => {
      const wrapper = mount()
      wrapper.vm.phoneNumber = '+911234'
      await nextTick()
      const lookup = api.resources.find(
        (r) => r.url === 'crm.integrations.api.get_contact_by_phone_number',
      )
      expect(lookup.makeParams()).toEqual({ phone_number: '+911234' })
      expect(lookup.fetch).toHaveBeenCalled()
    })

    it('shows who it found', () => {
      const wrapper = mount()
      const lookup = api.resources.find(
        (r) => r.url === 'crm.integrations.api.get_contact_by_phone_number',
      )
      lookup.onSuccess({ full_name: 'Ada', image: '', mobile_no: '+911234' })
      expect(wrapper.vm.contact.full_name).toBe('Ada')
    })

    it('does not look up an empty number', async () => {
      const wrapper = mount()
      const lookup = api.resources.find(
        (r) => r.url === 'crm.integrations.api.get_contact_by_phone_number',
      )
      lookup.fetch.mockClear()
      wrapper.vm.phoneNumber = ''
      await nextTick()
      expect(lookup.fetch).not.toHaveBeenCalled()
    })
  })

  describe('what the rest of the app is told', () => {
    it('shares whether a call is up', async () => {
      const wrapper = mount()
      wrapper.vm.onCall = true
      await nextTick()
      expect(wrapper.vm.store.onCall).toBe(true)
    })

    it('shares whether one is being dialled', async () => {
      const wrapper = mount()
      wrapper.vm.calling = true
      await nextTick()
      expect(wrapper.vm.store.calling).toBe(true)
    })

    it('shares the number', async () => {
      const wrapper = mount()
      wrapper.vm.phoneNumber = '+915555'
      await nextTick()
      expect(wrapper.vm.store.activeNumber).toBe('+915555')
    })
  })
})
