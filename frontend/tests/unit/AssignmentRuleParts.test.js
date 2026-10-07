const api = vi.hoisted(() => ({ users: null, dialog: vi.fn() }))

vi.mock('@/stores/users', async () => {
  const { reactive } = await import('vue')
  api.users = reactive({
    data: {
      crmUsers: [
        { name: 'ada@x.com', email: 'ada@x.com', full_name: 'Ada Lovelace', user_image: '' },
        { name: 'grace@x.com', email: 'grace@x.com', full_name: 'Grace Hopper', user_image: '' },
        { name: 'Administrator', email: 'admin@x.com', full_name: 'Administrator', user_image: '' },
      ],
    },
  })
  return {
    usersStore: () => ({
      users: api.users,
      getUser: (e) => ({ name: e, email: e, full_name: e, user_image: '' }),
      isManager: () => true,
    }),
  }
})

vi.mock('@/stores/global', () => ({
  globalStore: () => ({ $dialog: api.dialog, $socket: { on: vi.fn(), off: vi.fn() } }),
}))

vi.mock('@/composables/settings', async () => {
  const { ref } = await import('vue')
  return {
    activeSettingsPage: ref(''),
    isMobileView: ref(false),
    disableSettingModalOutsideClick: ref(false),
  }
})

import AssigneeSearch from '@/components/Settings/AssignmentRules/AssigneeSearch.vue'
import AssigneeRules from '@/components/Settings/AssignmentRules/AssigneeRules.vue'
import AssignmentSchedule from '@/components/Settings/AssignmentRules/AssignmentSchedule.vue'
import AssignmentScheduleItem from '@/components/Settings/AssignmentRules/AssignmentScheduleItem.vue'
import { mountComponent } from '../helpers/mount'
import { ref, nextTick } from 'vue'

const ruleData = (over = {}) =>
  ref({
    documentType: 'CRM Lead',
    users: [],
    assignmentDays: [],
    assignmentRule: 'Round Robin',
    ...over,
  })

const STUBS = {
  Combobox: true, ComboboxInput: true, ComboboxOption: true,
  ComboboxOptions: true, Popover: true, Avatar: true, Tooltip: true,
  ErrorMessage: true, AssigneeSearch: true, AssignmentScheduleItem: true,
  Switch: { props: ['modelValue', 'size'], template: '<button class="local-switch" />' },
}

const CRM_USERS = [
  { name: 'ada@x.com', email: 'ada@x.com', full_name: 'Ada Lovelace', user_image: '' },
  { name: 'grace@x.com', email: 'grace@x.com', full_name: 'Grace Hopper', user_image: '' },
  { name: 'Administrator', email: 'admin@x.com', full_name: 'Administrator', user_image: '' },
]

describe('AssigneeSearch', () => {
  const mount = (data = ruleData()) =>
    mountComponent(AssigneeSearch, {
      global: { stubs: STUBS, provide: { assignmentRuleData: data } },
    })

  beforeEach(() => {
    // The store mock is module-level; a test that empties it would otherwise
    // leave every later test searching a list that is not there.
    api.users.data = { crmUsers: CRM_USERS.map((u) => ({ ...u })) }
    api.dialog.mockClear()
  })

  describe('who is offered', () => {
    it('lists the CRM users', () => {
      expect(mount().vm.usersList.map((u) => u.email)).toEqual([
        'ada@x.com',
        'grace@x.com',
      ])
    })

    it('never offers Administrator', () => {
      // It is a system account, not a person who takes leads.
      expect(mount().vm.usersList.map((u) => u.name)).not.toContain(
        'Administrator',
      )
    })

    it('hides anyone already assigned', () => {
      const data = ruleData({ users: [{ user: 'ada@x.com' }] })
      expect(mount(data).vm.usersList.map((u) => u.email)).toEqual([
        'grace@x.com',
      ])
    })

    it('copes with no users loaded yet', () => {
      api.users.data = null
      expect(mount().vm.usersList).toEqual([])
    })
  })

  describe('searching', () => {
    const search = (term, data = ruleData()) => {
      const wrapper = mount(data)
      wrapper.vm.query = term
      return wrapper.vm.usersList.map((u) => u.email)
    }

    it('matches a full name', () => {
      expect(search('Ada')).toEqual(['ada@x.com'])
    })

    it('matches an email', () => {
      expect(search('grace@')).toEqual(['grace@x.com'])
    })

    it('ignores case', () => {
      // Regression: the filter compared literally, so a lowercase query — what
      // people actually type — never matched a capitalised surname.
      expect(search('lovelace')).toEqual(['ada@x.com'])
      expect(search('LOVELACE')).toEqual(['ada@x.com'])
    })

    it('matches a surname, not just the first word', () => {
      expect(search('hopper')).toEqual(['grace@x.com'])
    })

    it('returns nobody when nothing matches', () => {
      expect(search('zzz')).toEqual([])
    })

    it('still excludes those already assigned', () => {
      expect(search('ada', ruleData({ users: [{ user: 'ada@x.com' }] }))).toEqual(
        [],
      )
    })
  })

  describe('adding an assignee', () => {
    it('records them against the rule', () => {
      const data = ruleData()
      const wrapper = mount(data)
      wrapper.vm.addAssignee({
        email: 'ada@x.com',
        full_name: 'Ada Lovelace',
        user_image: '',
      })
      expect(data.value.users).toEqual([
        {
          full_name: 'Ada Lovelace',
          email: 'ada@x.com',
          user_image: '',
          user: 'ada@x.com',
        },
      ])
    })

    it('keys them by email, which is what the server stores', () => {
      const data = ruleData()
      mount(data).vm.addAssignee({ email: 'ada@x.com', full_name: 'Ada' })
      expect(data.value.users[0].user).toBe('ada@x.com')
    })

    it('announces the addition', () => {
      const wrapper = mount()
      wrapper.vm.addAssignee({ email: 'ada@x.com', full_name: 'Ada' })
      expect(wrapper.emitted('addAssignee')).toHaveLength(1)
    })
  })

  describe('inviting someone new', () => {
    it('warns that unsaved changes will be lost', () => {
      // Inviting navigates away from the rule being edited.
      mount().vm.inviteAgent()
      expect(api.dialog).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Invite Agent' }),
      )
    })
  })
})

describe('AssigneeRules', () => {
  const mount = (data = ruleData()) =>
    mountComponent(AssigneeRules, {
      global: {
        stubs: STUBS,
        provide: {
          assignmentRuleData: data,
          assignmentRuleErrors: ref({ users: '' }),
          validateAssignmentRule: vi.fn(),
        },
      },
    })

  it('names the record type in the wording', () => {
    expect(mount().vm.documentType).toBe('leads')
    expect(mount(ruleData({ documentType: 'CRM Deal' })).vm.documentType).toBe(
      'deals',
    )
  })

  it('offers both distribution strategies', () => {
    expect(mount().vm.documentRoutingOptions.map((o) => o.value)).toEqual([
      'Round Robin',
      'Load Balancing',
    ])
  })

  it('resolves each assignee to a user record', () => {
    const data = ruleData({ users: [{ user: 'ada@x.com' }] })
    expect(mount(data).vm.users[0].email).toBe('ada@x.com')
  })

  it('removes an assignee', () => {
    const data = ruleData({
      users: [{ user: 'ada@x.com' }, { user: 'grace@x.com' }],
    })
    mount(data).vm.removeAssignedUser({ name: 'ada@x.com' })
    expect(data.value.users.map((u) => u.user)).toEqual(['grace@x.com'])
  })

  it('revalidates after a removal', () => {
    // Removing the last assignee makes the rule invalid, and the error has to
    // appear at that moment rather than on save.
    const validate = vi.fn()
    const data = ruleData({ users: [{ user: 'ada@x.com' }] })
    mountComponent(AssigneeRules, {
      global: {
        stubs: STUBS,
        provide: {
          assignmentRuleData: data,
          assignmentRuleErrors: ref({ users: '' }),
          validateAssignmentRule: validate,
        },
      },
    }).vm.removeAssignedUser({ name: 'ada@x.com' })
    expect(validate).toHaveBeenCalledWith('users')
  })
})

describe('AssignmentSchedule', () => {
  const mount = (data = ruleData()) =>
    mountComponent(AssignmentSchedule, {
      global: {
        stubs: STUBS,
        provide: {
          assignmentRuleData: data,
          assignmentRuleErrors: ref({ assignmentDays: '' }),
        },
      },
    })

  it('lists all seven days', () => {
    expect(mount().vm.days.map((d) => d.day)).toEqual([
      'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
    ])
  })

  it('starts every day inactive', () => {
    expect(mount().vm.days.every((d) => !d.active)).toBe(true)
  })

  it('ticks the days the rule already has', () => {
    const wrapper = mount(ruleData({ assignmentDays: ['Tuesday', 'Friday'] }))
    const active = wrapper.vm.days.filter((d) => d.active).map((d) => d.day)
    expect(active).toEqual(['Tuesday', 'Friday'])
  })

  it('ignores a stored day it does not recognise', () => {
    expect(() => mount(ruleData({ assignmentDays: ['Caturday'] }))).not.toThrow()
  })
})

describe('AssignmentScheduleItem', () => {
  const mount = (day, data) =>
    mountComponent(AssignmentScheduleItem, {
      props: { data: { day, active: false } },
      global: { stubs: STUBS, provide: { assignmentRuleData: data } },
    })

  it('adds the day when switched on', () => {
    const data = ruleData({ assignmentDays: ['Monday'] })
    mount('Tuesday', data).vm.toggleDay(true)
    expect(data.value.assignmentDays).toEqual(['Monday', 'Tuesday'])
  })

  it('removes the day when switched off', () => {
    const data = ruleData({ assignmentDays: ['Monday', 'Tuesday'] })
    mount('Monday', data).vm.toggleDay(false)
    expect(data.value.assignmentDays).toEqual(['Tuesday'])
  })

  it('does not add a day twice', () => {
    const data = ruleData({ assignmentDays: ['Monday'] })
    mount('Monday', data).vm.toggleDay(true)
    expect(data.value.assignmentDays).toEqual(['Monday'])
  })

  it('leaves the list alone when switching off a day that is not in it', () => {
    // Regression: the old `else` branch ran regardless of findIndex, and
    // `splice(-1, 1)` counts from the end — so this removed Friday instead.
    const data = ruleData({ assignmentDays: ['Monday', 'Friday'] })
    mount('Sunday', data).vm.toggleDay(false)
    expect(data.value.assignmentDays).toEqual(['Monday', 'Friday'])
  })

  it('leaves an empty list empty', () => {
    const data = ruleData({ assignmentDays: [] })
    mount('Sunday', data).vm.toggleDay(false)
    expect(data.value.assignmentDays).toEqual([])
  })
})
