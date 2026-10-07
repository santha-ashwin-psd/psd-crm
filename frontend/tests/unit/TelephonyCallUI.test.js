const api = vi.hoisted(() => ({
  enabled: null,
  isAnyEnabled: null,
  defaultMedium: null,
  call: null,
  toast: null,
  setMakeCall: null,
  socket: null,
  resources: [],
  showModal: null,
  push: null,
  updateOnboardingStep: null,
  capture: null,
}))

vi.mock('@/composables/telephony', async () => {
  const { ref, computed, reactive } = await import('vue')
  api.defaultMedium = ref('')
  // Reactive, and mutated rather than replaced: `isAnyEnabled` is one shared
  // computed for the whole file, so a plain object would cache the first
  // answer and never see a later test's setup.
  api.enabled = reactive({})
  api.isAnyEnabled = computed(() => Object.values(api.enabled).some(Boolean))
  return {
    defaultCallingMedium: api.defaultMedium,
    useTelephony: () => ({
      isEnabled: (k) => Boolean(api.enabled[k]),
      isAnyEnabled: api.isAnyEnabled,
    }),
  }
})

vi.mock('@/stores/global', () => ({
  globalStore: () => ({
    setMakeCall: (...a) => api.setMakeCall(...a),
    $socket: api.socket,
    onCall: false,
    calling: false,
    activeNumber: '',
  }),
}))

vi.mock('@/stores/session', () => ({
  sessionStore: () => ({ user: 'ada@x.com' }),
}))

vi.mock('@/stores/users', () => ({
  usersStore: () => ({
    users: { data: { crmUsers: [] } },
    getUser: (e) => ({ name: e, full_name: e }),
  }),
}))

vi.mock('@/composables/doctypeModal', () => ({
  useDoctypeModal: () => ({ showModal: (...a) => api.showModal(...a) }),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: (...a) => api.push(...a) }),
  useRoute: () => ({ name: 'Deals', params: {}, query: {} }),
}))

vi.mock('frappe-ui/frappe', async () => {
  const { ref } = await import('vue')
  return {
    useOnboarding: () => ({
      updateOnboardingStep: (...a) => api.updateOnboardingStep(...a),
      isOnboardingStepsCompleted: ref(false),
      setUp: vi.fn(),
    }),
    useTelemetry: () => ({ capture: (...a) => api.capture(...a) }),
    minimize: ref(false),
  }
})

vi.mock('@twilio/voice-sdk', () => ({
  Device: class {
    constructor() {
      this.listeners = {}
    }
    on(e, fn) {
      this.listeners[e] = fn
    }
    register() {}
    updateToken() {}
    connect() {
      return Promise.resolve({ on: vi.fn(), parameters: {} })
    }
  },
}))

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

import CallUI from '@/components/Telephony/CallUI.vue'
import ExotelCallUI from '@/components/Telephony/ExotelCallUI.vue'
import TaskPanel from '@/components/Telephony/TaskPanel.vue'
import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'
import { flushPromises } from '@vue/test-utils'

const quiet = { inheritAttrs: false, template: '<div><slot /></div>' }
const STUBS = {
  Dialog: {
    name: 'DialogStub',
    inheritAttrs: false,
    props: ['open', 'modelValue', 'actions'],
    template: '<div v-if="open || modelValue"><slot /></div>',
  },
  FormControl: {
    name: 'FormControlStub',
    inheritAttrs: false,
    props: ['options', 'label', 'modelValue'],
    template: '<div />',
  },
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
  Avatar: { ...quiet, name: 'AvatarStub' },
  UserAvatar: { ...quiet, name: 'UserAvatarStub' },
  Link: { ...quiet, name: 'LinkStub' },
  TextEditor: { ...quiet, name: 'TextEditorStub' },
  Dropdown: {
    name: 'DropdownStub',
    inheritAttrs: false,
    props: ['options'],
    template: '<div><slot /></div>',
  },
  Tooltip: { ...quiet, name: 'TooltipStub' },
  DateTimePicker: { ...quiet, name: 'S1' },
  MinimizeIcon: { ...quiet, name: 'S2' },
  TaskStatusIcon: { ...quiet, name: 'S3' },
  TaskPriorityIcon: { ...quiet, name: 'S4' },
}

// Only CallUI gets these: stubbing a component by the same name as the one
// under test replaces the component itself, and the suite then tests the stub.
const integrationStub = (name) => ({
  name,
  template: '<div />',
  setup(_, { expose }) {
    expose({ makeOutgoingCall: vi.fn(), setup: vi.fn() })
    return {}
  },
})

describe('CallUI', () => {
  const mount = () =>
    mountComponent(CallUI, {
      global: {
        stubs: {
          ...STUBS,
          TwilioCallUI: integrationStub('TwilioCallUIStub'),
          ExotelCallUI: integrationStub('ExotelCallUIStub'),
        },
      },
    })

  const twilioOf = (wrapper) => wrapper.vm.twilio
  const exotelOf = (wrapper) => wrapper.vm.exotel

  beforeEach(() => {
    for (const k of Object.keys(api.enabled)) delete api.enabled[k]
    api.defaultMedium.value = ''
    api.call = vi.fn(async () => ({}))
    api.setMakeCall = vi.fn()
    api.toast.success.mockClear()
  })

  describe('which integrations it knows about', () => {
    it('lists none when none is configured', () => {
      expect(mount().vm.enabledIntegrations).toEqual([])
    })

    it('lists only the ones turned on', () => {
      Object.assign(api.enabled, { twilio: true })
      expect(mount().vm.enabledIntegrations.map((i) => i.label)).toEqual([
        'Twilio',
      ])
    })

    it('lists both when both are on', () => {
      Object.assign(api.enabled, { twilio: true, exotel: true })
      expect(mount().vm.enabledIntegrations.map((i) => i.label)).toEqual([
        'Twilio',
        'Exotel',
      ])
    })
  })

  describe('setting up', () => {
    it('registers the app-wide call handler once something is enabled', async () => {
      Object.assign(api.enabled, { twilio: true })
      mount()
      await nextTick()
      expect(api.setMakeCall).toHaveBeenCalled()
    })

    it('registers nothing when nothing is enabled', async () => {
      mount()
      await nextTick()
      expect(api.setMakeCall).not.toHaveBeenCalled()
    })

    it('starts up each enabled integration', async () => {
      Object.assign(api.enabled, { twilio: true, exotel: true })
      const wrapper = mount()
      await nextTick()
      expect(twilioOf(wrapper).setup).toHaveBeenCalled()
      expect(exotelOf(wrapper).setup).toHaveBeenCalled()
    })
  })

  describe('placing a call', () => {
    it('uses the only enabled integration without asking', () => {
      Object.assign(api.enabled, { exotel: true })
      const wrapper = mount()
      wrapper.vm.makeCall('+911234')
      expect(exotelOf(wrapper).makeOutgoingCall).toHaveBeenCalledWith('+911234')
      expect(wrapper.vm.show).toBe(false)
    })

    it('asks which to use when both are enabled and none is preferred', () => {
      Object.assign(api.enabled, { twilio: true, exotel: true })
      const wrapper = mount()
      wrapper.vm.makeCall('+911234')
      expect(wrapper.vm.show).toBe(true)
      expect(wrapper.vm.mobileNumber).toBe('+911234')
      expect(twilioOf(wrapper).makeOutgoingCall).not.toHaveBeenCalled()
    })

    it('uses the preferred one without asking', () => {
      Object.assign(api.enabled, { twilio: true, exotel: true })
      api.defaultMedium.value = 'Exotel'
      const wrapper = mount()
      wrapper.vm.makeCall('+911234')
      expect(wrapper.vm.show).toBe(false)
      expect(exotelOf(wrapper).makeOutgoingCall).toHaveBeenCalledWith('+911234')
    })

    it('ignores a preference for an integration that has been turned off', () => {
      // Regression: an admin disabling Twilio left the user's stored
      // preference pointing at it, and the call was handed to the disabled
      // integration, where nothing happened.
      Object.assign(api.enabled, { exotel: true })
      api.defaultMedium.value = 'Twilio'
      const wrapper = mount()
      wrapper.vm.makeCall('+911234')
      expect(exotelOf(wrapper).makeOutgoingCall).toHaveBeenCalledWith('+911234')
      expect(twilioOf(wrapper).makeOutgoingCall).not.toHaveBeenCalled()
    })

    it('asks again when the stored preference is no longer available', () => {
      Object.assign(api.enabled, { twilio: true, exotel: true })
      api.defaultMedium.value = 'SomethingElse'
      const wrapper = mount()
      wrapper.vm.makeCall('+911234')
      expect(wrapper.vm.show).toBe(true)
    })

    it('offers only the integrations that are enabled', () => {
      // Choosing a disabled one from the list would send the call nowhere.
      Object.assign(api.enabled, { exotel: true })
      const wrapper = mount()
      expect(wrapper.vm.enabledIntegrations.map((i) => i.label)).toEqual([
        'Exotel',
      ])
    })
  })

  describe('choosing from the dialog', () => {
    it('places the call with the chosen integration and closes', () => {
      Object.assign(api.enabled, { twilio: true, exotel: true })
      const wrapper = mount()
      wrapper.vm.makeCall('+911234')
      wrapper.vm.callMedium = 'Twilio'
      wrapper.vm.makeCallUsing()
      expect(twilioOf(wrapper).makeOutgoingCall).toHaveBeenCalledWith('+911234')
      expect(wrapper.vm.show).toBe(false)
    })

    it('remembers the choice when asked to', async () => {
      Object.assign(api.enabled, { twilio: true, exotel: true })
      const wrapper = mount()
      wrapper.vm.makeCall('+911234')
      wrapper.vm.callMedium = 'Exotel'
      wrapper.vm.isDefaultMedium = true
      wrapper.vm.makeCallUsing()
      await flushPromises()
      expect(api.call).toHaveBeenCalledWith(
        'xbr_crm.integrations.api.set_default_calling_medium',
        { medium: 'Exotel' },
      )
      expect(api.defaultMedium.value).toBe('Exotel')
      expect(api.toast.success).toHaveBeenCalled()
    })

    it('does not remember it unless asked', async () => {
      Object.assign(api.enabled, { twilio: true, exotel: true })
      const wrapper = mount()
      wrapper.vm.makeCall('+911234')
      wrapper.vm.makeCallUsing()
      await flushPromises()
      expect(api.call).not.toHaveBeenCalled()
    })
  })
})

describe('ExotelCallUI', () => {
  const mount = () => {
    api.socket = { on: vi.fn(), off: vi.fn(), emit: vi.fn() }
    return mountComponent(ExotelCallUI, { global: { stubs: STUBS } })
  }

  const socketHandler = () => api.socket.on.mock.calls.at(-1)[1]

  beforeEach(() => {
    api.resources = []
    api.call = vi.fn(async () => ({}))
    api.push = vi.fn()
    api.toast.error.mockClear()
  })

  describe('listening for call events', () => {
    it('subscribes when set up', () => {
      const wrapper = mount()
      wrapper.vm.setup()
      expect(api.socket.on).toHaveBeenCalledWith('exotel_call', expect.any(Function))
    })

    it('does not stack listeners when set up again', () => {
      // Regression: `setup()` runs again whenever the telephony settings
      // change, and every call event was then handled once per registration.
      const wrapper = mount()
      wrapper.vm.setup()
      wrapper.vm.setup()
      expect(api.socket.off).toHaveBeenCalledWith('exotel_call')
      expect(api.socket.off.mock.calls.length).toBeGreaterThanOrEqual(2)
    })

    it('unsubscribes on unmount', () => {
      const wrapper = mount()
      wrapper.vm.setup()
      api.socket.off.mockClear()
      wrapper.unmount()
      expect(api.socket.off).toHaveBeenCalledWith('exotel_call')
    })

    it('opens the popup for a call to this agent', () => {
      const wrapper = mount()
      wrapper.vm.setup()
      socketHandler()({
        AgentEmail: 'ada@x.com',
        CallFrom: '+911234',
        EventType: 'Dial',
        Direction: 'incoming',
        Status: 'busy',
      })
      expect(wrapper.vm.showCallPopup).toBe(true)
      expect(wrapper.vm.phoneNumber).toBe('+911234')
    })

    it('tracks an outgoing call without opening the popup', () => {
      const wrapper = mount()
      wrapper.vm.setup()
      socketHandler()({ To: '+915555', Direction: 'outbound-api' })
      expect(wrapper.vm.showCallPopup).toBe(false)
      expect(wrapper.vm.phoneNumber).toBe('+915555')
    })

    it('leaves an open popup alone', () => {
      const wrapper = mount()
      wrapper.vm.setup()
      wrapper.vm.showCallPopup = true
      wrapper.vm.phoneNumber = '+911111'
      socketHandler()({ To: '+915555' })
      expect(wrapper.vm.phoneNumber).toBe('+911111')
    })
  })

  describe('reading a call event', () => {
    const status = (wrapper, data) => wrapper.vm.updateStatus(data)

    it('shows an outgoing call as ringing before the other end picks up', () => {
      expect(
        status(mount(), {
          EventType: 'answered',
          Direction: 'outbound-api',
          Status: 'in-progress',
          'Legs[0][Status]': 'in-progress',
          'Legs[1][Status]': '',
        }),
      ).toBe('Ringing...')
    })

    it('shows it as connected once the second leg answers', () => {
      expect(
        status(mount(), {
          EventType: 'answered',
          Direction: 'outbound-api',
          Status: 'in-progress',
          'Legs[1][Status]': 'in-progress',
        }),
      ).toBe('In progress')
    })

    it('reports no answer', () => {
      for (const s of ['no-answer', 'busy']) {
        expect(
          status(mount(), {
            EventType: 'terminal',
            Direction: 'outbound-api',
            Status: s,
            'Legs[1][Status]': s,
          }),
          s,
        ).toBe('No answer')
      }
    })

    it('reports the end of a call, with how long it lasted', () => {
      const wrapper = mount()
      expect(
        status(wrapper, {
          EventType: 'terminal',
          Direction: 'outbound-api',
          Status: 'completed',
          'Legs[0][OnCallDuration]': '95',
        }),
      ).toBe('Call ended')
      expect(wrapper.vm.callDuration).toBe('dur:95')
    })

    it('falls back to the dialled duration', () => {
      const wrapper = mount()
      status(wrapper, {
        EventType: 'terminal',
        Direction: 'outbound-api',
        Status: 'completed',
        DialCallDuration: '42',
      })
      expect(wrapper.vm.callDuration).toBe('dur:42')
    })

    it('recognises an incoming call and takes the number from it', () => {
      const wrapper = mount()
      expect(
        status(wrapper, {
          EventType: 'Dial',
          Direction: 'incoming',
          Status: 'busy',
          From: '+919999',
        }),
      ).toBe('Incoming call')
      expect(wrapper.vm.phoneNumber).toBe('+919999')
    })

    it('reports a missed incoming call', () => {
      expect(
        status(mount(), {
          Direction: 'incoming',
          CallType: 'incomplete',
          DialCallStatus: 'no-answer',
        }),
      ).toBe('No answer')
    })

    it('reports a finished incoming call', () => {
      for (const callType of ['completed', 'client-hangup']) {
        expect(
          status(mount(), {
            Direction: 'incoming',
            CallType: callType,
            DialCallStatus: 'completed',
            DialCallDuration: '30',
          }),
          callType,
        ).toBe('Call ended')
      }
    })

    it('says nothing about an event it does not recognise', () => {
      expect(status(mount(), { EventType: 'something-else' })).toBeUndefined()
    })
  })

  describe('what the rest of the app is told', () => {
    it('reports being on a call', async () => {
      const wrapper = mount()
      wrapper.vm.callStatus = 'In progress'
      await nextTick()
      expect(wrapper.vm.store.onCall).toBe(true)
      expect(wrapper.vm.store.calling).toBe(false)
    })

    it('reports dialling for every stage before the call connects', async () => {
      for (const s of ['Ringing...', 'Calling...', 'Incoming call']) {
        const wrapper = mount()
        wrapper.vm.callStatus = s
        await nextTick()
        expect(wrapper.vm.store.calling, s).toBe(true)
        expect(wrapper.vm.store.onCall, s).toBe(false)
      }
    })

    it('reports neither once the call ends', async () => {
      const wrapper = mount()
      wrapper.vm.callStatus = 'In progress'
      await nextTick()
      wrapper.vm.callStatus = 'Call ended'
      await nextTick()
      expect(wrapper.vm.store.onCall).toBe(false)
      expect(wrapper.vm.store.calling).toBe(false)
    })

    it('shares the number being called', async () => {
      const wrapper = mount()
      wrapper.vm.phoneNumber = '+911234'
      await nextTick()
      expect(wrapper.vm.store.activeNumber).toBe('+911234')
    })
  })

  describe('placing a call', () => {
    it('asks the server to dial', () => {
      const wrapper = mount()
      wrapper.vm.makeOutgoingCall('+911234')
      expect(api.resources.at(-1).params).toEqual({ to_number: '+911234' })
    })

    it('opens the popup once the server accepts', () => {
      const wrapper = mount()
      wrapper.vm.makeOutgoingCall('+911234')
      api.resources.at(-1).onSuccess({ CallSid: 'CA1' })
      expect(wrapper.vm.showCallPopup).toBe(true)
      expect(wrapper.vm.callStatus).toBe('Calling...')
      expect(wrapper.vm.callData).toEqual({ CallSid: 'CA1' })
    })

    it('says why it could not dial', () => {
      const wrapper = mount()
      wrapper.vm.makeOutgoingCall('+911234')
      api.resources.at(-1).onError({ messages: ['No credit'] })
      expect(api.toast.error).toHaveBeenCalledWith('No credit')
      expect(wrapper.vm.callStatus).toBe('Failed')
    })

    it('falls back to a general message', () => {
      const wrapper = mount()
      wrapper.vm.makeOutgoingCall('+911234')
      api.resources.at(-1).onError({})
      expect(api.toast.error).toHaveBeenCalledWith(
        'Failed to initiate Exotel call',
      )
    })
  })

  describe('the note and task panes', () => {
    // A real element, not a stand-in: the popup header ref is handed to
    // vueuse's `useDraggable`, which registers listeners on whatever it holds.
    const withHeader = (wrapper, top) => {
      const parent = document.createElement('div')
      const header = document.createElement('div')
      parent.style.top = top
      parent.appendChild(header)
      wrapper.vm.callPopupHeader = header
      return parent
    }

    it('opens one at a time', () => {
      const wrapper = mount()
      withHeader(wrapper, '300px')
      wrapper.vm.showNoteWindow()
      expect(wrapper.vm.showNote).toBe(true)
      wrapper.vm.showTaskWindow()
      expect(wrapper.vm.showTask).toBe(true)
      expect(wrapper.vm.showNote).toBe(false)
    })

    it('moves the popup up to make room', () => {
      const wrapper = mount()
      const parent = withHeader(wrapper, '300px')
      wrapper.vm.updateWindowHeight(true)
      expect(parent.style.top).toBe('76px')
    })

    it('keeps the popup on screen', () => {
      // Near the top of the window the popup would otherwise go off it.
      const wrapper = mount()
      const parent = withHeader(wrapper, '100px')
      wrapper.vm.updateWindowHeight(true)
      expect(parent.style.top).toBe('10px')
    })

    it('puts it back when the pane closes', () => {
      const wrapper = mount()
      const parent = withHeader(wrapper, '76px')
      wrapper.vm.updateWindowHeight(false)
      expect(parent.style.top).toBe('300px')
    })
  })

  describe('closing the popup', () => {
    it('clears the note and the task, so the next call starts blank', () => {
      const wrapper = mount()
      wrapper.vm.note = { name: 'N1', content: 'said hello' }
      wrapper.vm.task = { name: 'T1', title: 'Follow up' }
      wrapper.vm.showCallPopup = true
      wrapper.vm.closeCallPopup()
      expect(wrapper.vm.showCallPopup).toBe(false)
      expect(wrapper.vm.note.content).toBe('')
      expect(wrapper.vm.task.title).toBe('')
      expect(wrapper.vm.task.status).toBe('Backlog')
    })

    it('closes the minimised popup too', () => {
      // Two popups represent one call. Closing only the large one leaves the
      // small window floating over the app with no call behind it.
      const wrapper = mount()
      wrapper.vm.showCallPopup = true
      wrapper.vm.showSmallCallPopup = true
      wrapper.vm.closeCallPopup()
      expect(wrapper.vm.showSmallCallPopup).toBe(false)
    })
  })

  describe('opening the record behind the number', () => {
    it('goes to the deal when there is one', () => {
      const wrapper = mount()
      wrapper.vm.contact = { deal: 'DEAL-1', lead: 'LEAD-1' }
      wrapper.vm.openDealOrLead()
      expect(api.push).toHaveBeenCalledWith({
        name: 'Deal',
        params: { dealId: 'DEAL-1' },
      })
    })

    it('goes to the lead when there is no deal', () => {
      const wrapper = mount()
      wrapper.vm.contact = { lead: 'LEAD-1' }
      wrapper.vm.openDealOrLead()
      expect(api.push).toHaveBeenCalledWith({
        name: 'Lead',
        params: { leadId: 'LEAD-1' },
      })
    })

    it('goes nowhere for a number with no record', () => {
      const wrapper = mount()
      wrapper.vm.contact = {}
      wrapper.vm.openDealOrLead()
      expect(api.push).not.toHaveBeenCalled()
    })
  })

  describe('looking up the caller', () => {
    it('asks for the number that is ringing', async () => {
      const wrapper = mount()
      wrapper.vm.phoneNumber = '+911234'
      await nextTick()
      const lookup = api.resources.find(
        (r) => r.url === 'xbr_crm.integrations.api.get_contact_by_phone_number',
      )
      expect(lookup.makeParams()).toEqual({ phone_number: '+911234' })
      expect(lookup.fetch).toHaveBeenCalled()
    })

    it('does not look up an empty number', async () => {
      const wrapper = mount()
      const lookup = api.resources.find(
        (r) => r.url === 'xbr_crm.integrations.api.get_contact_by_phone_number',
      )
      lookup.fetch.mockClear()
      wrapper.vm.phoneNumber = ''
      await nextTick()
      expect(lookup.fetch).not.toHaveBeenCalled()
    })

    it('shows whoever it found', () => {
      const wrapper = mount()
      const lookup = api.resources.find(
        (r) => r.url === 'xbr_crm.integrations.api.get_contact_by_phone_number',
      )
      lookup.onSuccess({ full_name: 'Ada', mobile_no: '+911234' })
      expect(wrapper.vm.contact.full_name).toBe('Ada')
    })
  })
})

describe('TaskPanel', () => {
  const mount = (task) =>
    mountComponent(TaskPanel, {
      props: task ? { task } : {},
      global: { stubs: STUBS },
    })

  it('starts a new task in the backlog at low priority', () => {
    const wrapper = mount()
    expect(wrapper.vm.task.status).toBe('Backlog')
    expect(wrapper.vm.task.priority).toBe('Low')
  })

  it('edits the task it is given, so the caller sees the changes', () => {
    // The call popup saves whatever object it handed over.
    const task = { title: 'Follow up', status: 'Backlog', priority: 'Low' }
    const wrapper = mount(task)
    wrapper.vm.updateTaskStatus('Done')
    wrapper.vm.updateTaskPriority('High')
    expect(task.status).toBe('Done')
    expect(task.priority).toBe('High')
  })

  it('shows the title it was given', () => {
    // The title is bound through FormControl's v-model, so it is the task the
    // panel is editing that carries it, not the rendered markup.
    const task = { title: 'Follow up', status: 'Backlog', priority: 'Low' }
    expect(mount(task).vm.task.title).toBe('Follow up')
  })

  it('renders every part of the form', () => {
    const wrapper = mount({ title: '', status: 'Backlog', priority: 'Low' })
    expect(wrapper.findComponent({ name: 'TextEditorStub' }).exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'LinkStub' }).exists()).toBe(true)
  })
})
