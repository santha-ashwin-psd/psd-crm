const store = vi.hoisted(() => ({ settings: null }))
vi.mock('@/stores/settings', async () => {
  const { ref } = await import('vue')
  store.settings = ref({ follow_up_stage: 'Followup' })
  return {
    getSettings: () => ({
      settings: store.settings,
      _settings: { reload: vi.fn() },
    }),
  }
})

import { dayjs } from 'frappe-ui'
import { flushPromises } from '@vue/test-utils'
import { mountComponent } from '../helpers/mount'
import FollowUpModal from '@/components/Modals/FollowUpModal.vue'
import {
  askFollowUp,
  defaultFollowUp,
  followUpPrompt,
  followUpStage,
  isFollowUpOverdue,
  isFollowUpStage,
} from '@/composables/followUp'
import { captionFor, compactConfig, hueFor } from '@/utils/dashboardCards'

describe('follow-up helpers', () => {
  it('uses the stage chosen in settings, defaulting to Followup', () => {
    expect(followUpStage()).toBe('Followup')
    store.settings.value = { follow_up_stage: 'Call Back' }
    expect(isFollowUpStage('Call Back')).toBe(true)
    expect(isFollowUpStage('Followup')).toBe(false)
    store.settings.value = {}
    expect(followUpStage()).toBe('Followup')
    store.settings.value = { follow_up_stage: 'Followup' }
  })

  it('defaults to tomorrow at 10:00, like the server', () => {
    const now = dayjs('2026-10-09 15:30:00')
    expect(defaultFollowUp(now)).toBe('2026-10-10 10:00:00')
  })

  it('is overdue only in the follow-up stage once the date has passed', () => {
    const now = dayjs('2026-10-09 12:00:00')
    expect(isFollowUpOverdue('Followup', '2026-10-09 11:59:00', now)).toBe(true)
    expect(isFollowUpOverdue('Followup', '2026-10-09 12:01:00', now)).toBe(
      false,
    )
    expect(isFollowUpOverdue('Qualification', '2026-10-01 10:00:00', now)).toBe(
      false,
    )
    expect(isFollowUpOverdue('Followup', null, now)).toBe(false)
  })
})

describe('follow-up prompt', () => {
  afterEach(() => (followUpPrompt.value = null))

  const open = (initial) => {
    const answer = askFollowUp(initial)
    const wrapper = mountComponent(FollowUpModal, {
      global: { stubs: { Dialog: true } },
    })
    return { answer, wrapper }
  }

  it('starts at tomorrow 10:00, or the date already set', () => {
    expect(open().wrapper.vm.when).toBe(defaultFollowUp())
    followUpPrompt.value = null
    expect(
      open({ next_follow_up: '2030-01-02 09:30:00' }).wrapper.vm.when,
    ).toBe('2030-01-02 09:30:00')
  })

  it('returns the date and note on save', async () => {
    const { answer, wrapper } = open()
    wrapper.vm.when = '2030-05-01 11:00:00'
    wrapper.vm.note = '  Call about fees  '
    wrapper.vm.save()
    expect(await answer).toEqual({
      next_follow_up: '2030-05-01 11:00:00',
      follow_up_note: 'Call about fees',
    })
    expect(followUpPrompt.value).toBeNull()
  })

  it('refuses a missing or past time', async () => {
    const { wrapper } = open()
    wrapper.vm.when = ''
    wrapper.vm.save()
    expect(wrapper.vm.error).toBeTruthy()
    wrapper.vm.when = '2001-01-01 10:00:00'
    wrapper.vm.save()
    expect(wrapper.vm.error).toMatch(/future/)
    expect(followUpPrompt.value).not.toBeNull()
  })

  it('cancel answers null, so the stage is not changed', async () => {
    const { answer, wrapper } = open()
    wrapper.vm.finish(null)
    expect(await answer).toBeNull()
    await flushPromises()
  })
})

describe('overdue follow-ups dashboard card', () => {
  it('has a short title, a caption and the danger tone', () => {
    const config = compactConfig({
      name: 'overdue_follow_ups',
      data: { title: 'x', value: 3 },
    })
    expect(config.title).toBe('Overdue follow-ups')
    expect(captionFor('overdue_follow_ups')).toBe('Follow-up date passed')
    expect(hueFor('overdue_follow_ups')).toBe('crm-tone-danger')
  })
})
