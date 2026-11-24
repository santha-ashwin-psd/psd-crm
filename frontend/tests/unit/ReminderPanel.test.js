import ReminderPanel from '@/components/Calendar/ReminderPanel.vue'
import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'

function mountPanel(rows) {
  let current = rows
  const w = mountComponent(ReminderPanel, {
    props: {
      modelValue: rows,
      'onUpdate:modelValue': (v) => {
        current = v
        w.setProps({ modelValue: v })
      },
    },
  })
  return { w, rows: () => current }
}

const emailSwitch = (w) => w.find('.crm-reminder-email button[role="switch"], .crm-reminder-email [role="switch"]')

describe('ReminderPanel', () => {
  it('sums up the reminders', () => {
    const { w } = mountPanel([
      { type: 'Email', before: 10, interval: 'minutes' },
      { type: 'Email', before: 1, interval: 'hours' },
    ])
    expect(w.text()).toContain('2 reminders · in the CRM and by email')
  })

  it('reads the email switch from saved rows', () => {
    const { w } = mountPanel([{ type: 'Notification', before: 10, interval: 'minutes' }])
    expect(w.text()).toContain('1 reminder · in the CRM only')
  })

  it('treats rows saved without a type as emailed', () => {
    const { w } = mountPanel([{ before: 10, interval: 'minutes' }])
    expect(w.text()).toContain('in the CRM and by email')
  })

  it('switching email off writes every row', async () => {
    const list = [
      { type: 'Email', before: 10, interval: 'minutes' },
      { type: 'Email', before: 1, interval: 'hours' },
    ]
    const { w } = mountPanel(list)
    await emailSwitch(w).trigger('click')
    expect(list.map((r) => r.type)).toEqual(['Notification', 'Notification'])
    expect(w.text()).toContain('in the CRM only')
  })

  it('a reminder added after switching email off is in-app only', async () => {
    const { w, rows } = mountPanel([])
    await emailSwitch(w).trigger('click')
    await w.findAll('button').find((b) => b.text().includes('10 minutes before')).trigger('click')
    await nextTick()
    expect(rows()).toHaveLength(1)
    expect(rows()[0].type).toBe('Notification')
  })

  it('collapses', async () => {
    const { w } = mountPanel([{ type: 'Email', before: 10, interval: 'minutes' }])
    await w.find('button[aria-expanded]').trigger('click')
    expect(w.find('.crm-reminder-email').exists()).toBe(false)
  })
})
